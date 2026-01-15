import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { type Queue } from 'bull';
import { Cron } from '@nestjs/schedule';

import { CandleEntity } from './entities/candle.entity';
import { BinanceService } from '../binance/binance.service';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    @InjectRepository(CandleEntity)
    private candleRepo: Repository<CandleEntity>,
    @InjectQueue('candle-storage')
    private readonly candleStorageQueue: Queue,
    private readonly binanceService: BinanceService,
    private readonly cacheService: CacheService,
    // private readonly newsClient: NewsClientService,
    // private readonly aiClient: AiAnalysisClientService,
  ) {}

  // ============ REST API Methods ============

  async getSymbols(): Promise<string[]> {
    const cacheKey = 'symbols:all';

    // Try cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Fetch from Binance
    const symbols = await this.binanceService.getSymbols();

    // Cache for 1 hour
    await this.cacheService.set(cacheKey, JSON.stringify(symbols), 3600);

    return symbols;
  }

  async getAllTickers() {
    const cacheKey = 'tickers:all';

    // Try cache first (5 second cache)
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Fetch from Binance
    const tickers = await this.binanceService.getAllTickers();

    // Cache for 5 seconds
    await this.cacheService.set(cacheKey, JSON.stringify(tickers), 5);

    return tickers;
  }

  async get24hrTicker(symbol: string) {
    const cacheKey = `ticker:${symbol}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const ticker = await this.binanceService.get24hrTicker(symbol);
    await this.cacheService.set(cacheKey, JSON.stringify(ticker), 5);

    return ticker;
  }

  async getHistoricalCandles(
    symbol: string,
    interval: string,
    limit: number = 1000,
  ) {
    // Try cache first using sorted set
    const cached = await this.cacheService.getCandleHistory(
      symbol,
      interval,
      limit,
    );

    if (cached && cached.length > 0) return cached;

    // Fetch from Binance
    const candles = await this.binanceService.getHistoricalCandles(
      symbol,
      interval,
      limit,
    );

    // Store using sorted set for time-based queries
    await this.cacheService.storeCandleHistory(symbol, interval, candles);

    // Also store in database for historical analysis
    await this.storeCandlesInDB(symbol, interval, candles);

    return candles;
  }

  // ============ Integration with Other Services ============

  // async getMarketDataWithNews(symbol: string, interval: string) {
  //   try {
  //     // Fetch market data
  //     const [candles, ticker] = await Promise.all([
  //       this.getHistoricalCandles(symbol, interval, 100),
  //       this.get24hrTicker(symbol),
  //     ]);

  //     // Fetch news from News Service
  //     const news = await this.newsClient.getNewsBySymbol(symbol, 10);

  //     return {
  //       candles,
  //       ticker,
  //       news,
  //     };
  //   } catch (error) {
  //     this.logger.error(
  //       `Error fetching market data with news: ${error.message}`,
  //     );
  //     throw error;
  //   }
  // }

  // async performAIAnalysis(symbol: string, interval: string) {
  //   try {
  //     // Get recent candles
  //     const candles = await this.getHistoricalCandles(symbol, interval, 100);

  //     // Get related news
  //     const news = await this.newsClient.getNewsBySymbol(symbol, 10);

  //     // Determine price trend
  //     const trend = this.calculateTrend(candles);

  //     // Call AI Analysis Service
  //     const analysis = await this.aiClient.analyzeMarket({
  //       symbol,
  //       candles: candles.slice(-20), // Last 20 candles
  //       news,
  //       trend,
  //     });

  //     // Cache the analysis result
  //     const cacheKey = `analysis:${symbol}:${interval}`;
  //     await this.cacheService.set(
  //       cacheKey,
  //       JSON.stringify(analysis),
  //       300, // 5 minutes
  //     );

  //     return analysis;
  //   } catch (error) {
  //     this.logger.error(`Error performing AI analysis: ${error.message}`);
  //     throw error;
  //   }
  // }

  // ============ Background Jobs ============

  /**
   * Cleanup old candles from database to prevent disk space issues
   * Runs daily at 3 AM
   */
  @Cron('0 3 * * *')
  async cleanupOldCandles() {
    this.logger.log('Running candle cleanup job...');

    try {
      const retentionDays = 90; // Keep 90 days of data
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.candleRepo
        .createQueryBuilder()
        .delete()
        .from(CandleEntity)
        .where('time < :cutoffDate', { cutoffDate })
        .execute();

      this.logger.log(
        `Cleaned up ${result.affected} candles older than ${retentionDays} days`,
      );
    } catch (error) {
      this.logger.error(`Candle cleanup error: ${error.message}`);
    }
  }

  // ============ Helper Methods ============

  /**
   * Store final candle from WebSocket (called by BinanceWebsocketService)
   * Adds job to queue for non-blocking storage with retry
   */
  async storeFinalCandle(
    symbol: string,
    interval: string,
    candle: any,
  ): Promise<void> {
    try {
      await this.candleStorageQueue.add('store-candle', {
        symbol,
        interval,
        candle,
      });
    } catch (error) {
      this.logger.error(
        `Failed to queue candle storage for ${symbol}:${interval}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Store a single candle in database (called from WebSocket)
   * Public method to be used by BinanceWebsocketService
   */
  async storeSingleCandleInDB(
    symbol: string,
    interval: string,
    candle: any,
  ): Promise<void> {
    try {
      const entity = {
        symbol,
        interval,
        time: new Date(candle.time),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };

      // Insert with conflict handling (update if exists)
      await this.candleRepo
        .createQueryBuilder()
        .insert()
        .into(CandleEntity)
        .values(entity)
        .orIgnore()
        .execute();
    } catch (error) {
      this.logger.error(
        `Error storing single candle for ${symbol}:${interval}: ${error.message}`,
      );
    }
  }

  /**
   * Query candles from database for AI analysis
   * This queries directly from DB, not cache, to get historical data
   */
  async getCandlesFromDB(
    symbol: string,
    interval: string,
    from?: Date,
    to?: Date,
    limit: number = 1000,
  ): Promise<any[]> {
    try {
      const query = this.candleRepo
        .createQueryBuilder('candle')
        .where('candle.symbol = :symbol', { symbol })
        .andWhere('candle.interval = :interval', { interval })
        .orderBy('candle.time', 'DESC')
        .take(limit);

      // Add date range filters if provided
      if (from) {
        query.andWhere('candle.time >= :from', { from });
      }
      if (to) {
        query.andWhere('candle.time <= :to', { to });
      }

      const results = await query.getMany();

      // Convert to API format and reverse to chronological order
      return results
        .map((c) => ({
          time: c.time.getTime(),
          open: parseFloat(c.open.toString()),
          high: parseFloat(c.high.toString()),
          low: parseFloat(c.low.toString()),
          close: parseFloat(c.close.toString()),
          volume: c.volume ? parseFloat(c.volume.toString()) : undefined,
        }))
        .reverse();
    } catch (error) {
      this.logger.error(
        `Error querying candles from DB for ${symbol}:${interval}: ${error.message}`,
      );
      return [];
    }
  }

  private async storeCandlesInDB(
    symbol: string,
    interval: string,
    candles: any[],
  ) {
    try {
      const entities = candles.map((c) => ({
        symbol,
        interval,
        time: new Date(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      // Bulk insert with conflict handling
      await this.candleRepo
        .createQueryBuilder()
        .insert()
        .into(CandleEntity)
        .values(entities)
        .orIgnore()
        .execute();
    } catch (error) {
      this.logger.error(`Error storing candles: ${error.message}`);
    }
  }

  private calculateTrend(candles: any[]): 'UPWARD' | 'DOWNWARD' | 'SIDEWAYS' {
    if (candles.length < 10) return 'SIDEWAYS';

    const recent = candles[candles.length - 1].close;
    const old = candles[candles.length - 10].close;
    const change = ((recent - old) / old) * 100;

    if (change > 2) return 'UPWARD';
    if (change < -2) return 'DOWNWARD';
    return 'SIDEWAYS';
  }
}
