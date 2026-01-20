import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { catchError, firstValueFrom, map } from 'rxjs';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class BinanceService {
  private readonly logger = new Logger(BinanceService.name);
  private readonly baseUrl: string;
  private readonly iconsDir: string;
  private readonly quoteAssets: string[];

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('BINANCE_API_URL') ||
      'https://api.binance.com/api/v3';

    // Parse quote assets from ENV (default to USDT for backward compatibility)
    const quoteAssetsConfig =
      this.configService.get<string>('QUOTE_ASSETS') || 'USDT';
    this.quoteAssets = quoteAssetsConfig
      .split(',')
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    this.logger.log(`Quote assets configured: ${this.quoteAssets.join(', ')}`);

    // Directory to cache icons
    this.iconsDir = join(process.cwd(), 'public', 'icons');
    this.ensureIconsDirectory();
  }

  private async ensureIconsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.iconsDir, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create icons directory: ${error.message}`);
    }
  }

  // e.g., BTCUSDT -> BTC, ETHBTC -> ETH
  private getBaseAsset(symbol: string): string {
    for (const quote of this.quoteAssets) {
      if (symbol.endsWith(quote)) {
        return symbol.slice(0, -quote.length);
      }
    }
    // Fallback: return symbol as-is if no quote matched
    return symbol;
  }

  async getSymbols(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/exchangeInfo`).pipe(
          map((res) => res.data),
          catchError((err) => {
            this.logger.error(`Error fetching symbols: ${err.message}`);
            throw new HttpException(
              'Failed to fetch symbols from Binance',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        ),
      );

      return response.symbols
        .filter(
          (s: any) =>
            s.status === 'TRADING' &&
            this.quoteAssets.some((q) => s.symbol.endsWith(q)),
        )
        .map((s: any) => s.symbol)
        .sort();
    } catch (error) {
      this.logger.error(`getSymbols error: ${error.message}`);
      throw error;
    }
  }

  async getAllTickers(): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/ticker/24hr`).pipe(
          map((res) => res.data),
          catchError((err) => {
            this.logger.error(`Error fetching all tickers: ${err.message}`);
            throw new HttpException(
              'Failed to fetch tickers from Binance',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        ),
      );

      return response
        .filter((t: any) => this.quoteAssets.some((q) => t.symbol.endsWith(q)))
        .map((t: any) => ({
          symbol: t.symbol,
          priceChangePercent: t.priceChangePercent,
          lastPrice: t.lastPrice,
          highPrice: t.highPrice,
          lowPrice: t.lowPrice,
          quoteVolume: t.quoteVolume,
          baseAsset: this.getBaseAsset(t.symbol),
        }));
    } catch (error) {
      this.logger.error(`getAllTickers error: ${error.message}`);
      throw error;
    }
  }

  async get24hrTicker(symbol: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get(`${this.baseUrl}/ticker/24hr?symbol=${symbol}`)
          .pipe(
            map((res) => res.data),
            catchError((err) => {
              this.logger.error(
                `Error fetching ticker for ${symbol}: ${err.message}`,
              );
              throw new HttpException(
                `Failed to fetch ticker for ${symbol}`,
                HttpStatus.SERVICE_UNAVAILABLE,
              );
            }),
          ),
      );

      return {
        symbol: response.symbol,
        priceChangePercent: response.priceChangePercent,
        lastPrice: response.lastPrice,
        highPrice: response.highPrice,
        lowPrice: response.lowPrice,
        quoteVolume: response.quoteVolume,
      };
    } catch (error) {
      this.logger.error(`get24hrTicker error: ${error.message}`);
      throw error;
    }
  }

  async getHistoricalCandles(
    symbol: string,
    interval: string,
    limit: number = 1000,
  ): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get(
            `${this.baseUrl}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
          )
          .pipe(
            map((res) => res.data),
            catchError((err) => {
              this.logger.error(`Error fetching candles: ${err.message}`);
              throw new HttpException(
                'Failed to fetch historical candles',
                HttpStatus.SERVICE_UNAVAILABLE,
              );
            }),
          ),
      );

      return response.map((d: any) => ({
        time: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
        isFinal: true,
      }));
    } catch (error) {
      this.logger.error(`getHistoricalCandles error: ${error.message}`);
      throw error;
    }
  }

  async fetchIcon(
    symbol: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const asset = this.getBaseAsset(symbol).toUpperCase();
    const fileName = `${asset}.png`;
    const filePath = join(this.iconsDir, fileName);

    try {
      // Check if icon exists in cache
      try {
        const cachedBuffer = await fs.readFile(filePath);
        this.logger.debug(`Serving cached icon for ${asset}`);
        return {
          buffer: cachedBuffer,
          contentType: 'image/png',
        };
      } catch (error) {
        // File doesn't exist, fetch from Binance
        this.logger.debug(`Cache miss for ${asset}, fetching from Binance`);
      }

      // Fetch from Binance CDN
      const binanceUrl = `https://bin.bnbstatic.com/static/assets/logos/${asset}.png`;
      const response = await firstValueFrom(
        this.httpService
          .get(binanceUrl, {
            responseType: 'arraybuffer',
          })
          .pipe(
            catchError((err) => {
              this.logger.error(
                `Error fetching icon for ${symbol}: ${err.message}`,
              );
              throw new HttpException('Icon not found', HttpStatus.NOT_FOUND);
            }),
          ),
      );

      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/png';

      // Save to cache (fire and forget)
      fs.writeFile(filePath, buffer).catch((err) =>
        this.logger.error(`Failed to cache icon for ${asset}: ${err.message}`),
      );

      return { buffer, contentType };
    } catch (error) {
      this.logger.error(`fetchIcon error: ${error.message}`);
      throw error;
    }
  }
}
