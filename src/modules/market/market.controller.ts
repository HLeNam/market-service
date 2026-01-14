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
  async getIcon(@Param('symbol') symbol: string, @Res() res: Response) {
    try {
      const { buffer, contentType } =
        await this.binanceService.fetchIcon(symbol);

      // Set header để trình duyệt hiểu đây là ảnh
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=86400'); // Cache 1 ngày để giảm tải server

      // Gửi dữ liệu ảnh
      res.send(buffer);
    } catch (error) {
      // Nếu lỗi, có thể trả về 1 ảnh placeholder mặc định
      res.status(HttpStatus.NOT_FOUND).send('Icon not found');
    }
  }
}
