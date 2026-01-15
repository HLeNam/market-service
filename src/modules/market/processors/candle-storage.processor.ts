import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { type Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CandleEntity } from '../entities/candle.entity';
import { CacheService } from '../../cache/cache.service';

interface CandleStorageJob {
  symbol: string;
  interval: string;
  candle: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
}

@Processor('candle-storage')
export class CandleStorageProcessor {
  private readonly logger = new Logger(CandleStorageProcessor.name);

  constructor(
    @InjectRepository(CandleEntity)
    private candleRepo: Repository<CandleEntity>,
    private readonly cacheService: CacheService,
  ) {}

  @Process('store-candle')
  async handleStorageCandle(job: Job<CandleStorageJob>) {
    const { symbol, interval, candle } = job.data;

    try {
      // Store in Redis cache (sorted set)
      await this.cacheService.addSingleCandle(symbol, interval, candle);

      // Store in database for long-term analysis
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

      await this.candleRepo
        .createQueryBuilder()
        .insert()
        .into(CandleEntity)
        .values(entity)
        .orIgnore()
        .execute();

      this.logger.debug(
        `Stored candle for ${symbol}:${interval} at ${new Date(candle.time).toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to store candle for ${symbol}:${interval}: ${error.message}`,
      );
      throw error; // Let Bull retry
    }
  }
}
