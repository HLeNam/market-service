import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { catchError, firstValueFrom, map } from 'rxjs';

@Injectable()
export class BinanceService {
  private readonly logger = new Logger(BinanceService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('BINANCE_API_URL') ||
      'https://api.binance.com/api/v3';
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
        .filter((s: any) => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
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
        .filter((t: any) => t.symbol.endsWith('USDT'))
        .map((t: any) => ({
          symbol: t.symbol,
          priceChangePercent: t.priceChangePercent,
          lastPrice: t.lastPrice,
          highPrice: t.highPrice,
          lowPrice: t.lowPrice,
          quoteVolume: t.quoteVolume,
          baseAsset: t.symbol.replace('USDT', ''),
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

  getIconUrl(symbol: string): string {
    const asset = symbol.replace('USDT', '').toUpperCase();
    return `https://bin.bnbstatic.com/static/assets/logos/${asset}.png`;
  }

  async fetchIcon(
    symbol: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const asset = symbol.replace('USDT', '').toUpperCase();
    const binanceUrl = `https://bin.bnbstatic.com/static/assets/logos/${asset}.png`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .get(binanceUrl, {
            responseType: 'arraybuffer', // CỰC KỲ QUAN TRỌNG: Để nhận dữ liệu nhị phân (ảnh)
          })
          .pipe(
            catchError((err) => {
              this.logger.error(
                `Error fetching icon for ${symbol}: ${err.message}`,
              );
              // Nếu không tìm thấy ảnh, có thể throw lỗi hoặc trả về ảnh mặc định
              throw new HttpException('Icon not found', HttpStatus.NOT_FOUND);
            }),
          ),
      );

      return {
        buffer: Buffer.from(response.data),
        contentType: response.headers['content-type'] || 'image/png',
      };
    } catch (error) {
      // Xử lý fallback: Nếu lỗi thì trả về ảnh default hoặc throw tiếp
      this.logger.error(`fetchIcon error: ${error.message}`);
      throw error;
    }
  }
}
