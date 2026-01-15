import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { MarketService } from './market.service';
import { type Response } from 'express';
import { BinanceService } from 'src/modules/binance/binance.service';

@ApiTags('market')
@Controller('market')
@UseGuards(ThrottlerGuard)
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly binanceService: BinanceService,
  ) {}

  @Get('symbols')
  @ApiOperation({ summary: 'Get all available trading symbols' })
  @HttpCode(HttpStatus.OK)
  async getSymbols() {
    const symbols = await this.marketService.getSymbols();
    return {
      success: true,
      data: symbols,
      count: symbols.length,
    };
  }

  @Get('tickers')
  @ApiOperation({ summary: 'Get all 24hr tickers' })
  @HttpCode(HttpStatus.OK)
  async getAllTickers() {
    const tickers = await this.marketService.getAllTickers();
    return {
      success: true,
      data: tickers,
      count: tickers.length,
    };
  }

  @Get('ticker/:symbol')
  @ApiOperation({ summary: 'Get 24hr ticker for specific symbol' })
  @HttpCode(HttpStatus.OK)
  async getTicker(@Param('symbol') symbol: string) {
    const ticker = await this.marketService.get24hrTicker(symbol);
    return {
      success: true,
      data: ticker,
    };
  }

  @Get('candles/:symbol')
  @ApiOperation({ summary: 'Get historical candles' })
  @ApiQuery({ name: 'interval', required: false, example: '1h' })
  @ApiQuery({ name: 'limit', required: false, example: 1000 })
  @HttpCode(HttpStatus.OK)
  async getCandles(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string = '1h',
    @Query('limit') limit: number = 1000,
  ) {
    const candles = await this.marketService.getHistoricalCandles(
      symbol,
      interval,
      limit,
    );
    return {
      success: true,
      data: candles,
      count: candles.length,
    };
  }

  @Get('candles/:symbol/history')
  @ApiOperation({
    summary: 'Get historical candles from database for AI analysis',
    description:
      'Query candles directly from database with date range filtering. This endpoint is optimized for AI services that need historical data for trend analysis.',
  })
  @ApiQuery({
    name: 'interval',
    required: false,
    example: '1h',
    description: 'Candle interval (1m, 5m, 15m, 1h, 4h, 1d)',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    example: '2024-01-01',
    description: 'Start date (YYYY-MM-DD or ISO 8601 format)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    example: '2024-01-31',
    description: 'End date (YYYY-MM-DD or ISO 8601 format)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 1000,
    description: 'Maximum number of candles to return',
  })
  @HttpCode(HttpStatus.OK)
  async getCandlesHistory(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string = '1h',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit: number = 1000,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const candles = await this.marketService.getCandlesFromDB(
      symbol,
      interval,
      fromDate,
      toDate,
      limit,
    );

    return {
      success: true,
      data: candles,
      count: candles.length,
      query: {
        symbol,
        interval,
        from: fromDate?.toISOString(),
        to: toDate?.toISOString(),
        limit,
      },
    };
  }

  //   @Get('overview/:symbol')
  //   @ApiOperation({ summary: 'Get market overview with news' })
  //   @ApiQuery({ name: 'interval', required: false, example: '1h' })
  //   @HttpCode(HttpStatus.OK)
  //   async getMarketOverview(
  //     @Param('symbol') symbol: string,
  //     @Query('interval') interval: string = '1h',
  //   ) {
  //     const data = await this.marketService.getMarketDataWithNews(
  //       symbol,
  //       interval,
  //     );
  //     return {
  //       success: true,
  //       data,
  //     };
  //   }

  //   @Post('analyze/:symbol')
  //   @ApiOperation({ summary: 'Perform AI analysis on symbol' })
  //   @ApiQuery({ name: 'interval', required: false, example: '1h' })
  //   @ApiBearerAuth()
  //   @HttpCode(HttpStatus.OK)
  //   async analyzeMarket(
  //     @Param('symbol') symbol: string,
  //     @Query('interval') interval: string = '1h',
  //   ) {
  //     const analysis = await this.marketService.performAIAnalysis(
  //       symbol,
  //       interval,
  //     );
  //     return {
  //       success: true,
  //       data: analysis,
  //     };
  //   }

  @Get('icon/:symbol')
  @ApiOperation({ summary: 'Get coin icon/logo' })
  async getIcon(@Param('symbol') symbol: string, @Res() res: Response) {
    try {
      const { buffer, contentType } =
        await this.binanceService.fetchIcon(symbol);

      // Set cache headers for 30 days (icons rarely change)
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
      res.set('ETag', `"${symbol.replace('USDT', '').toUpperCase()}"`);

      res.send(buffer);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).send('Icon not found');
    }
  }
}
