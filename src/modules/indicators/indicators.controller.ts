import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IndicatorsService } from './indicators.service';
import { MarketService } from '../market/market.service';
import {
  GetMADto,
  GetEMADto,
  GetRSIDto,
  GetMACDDto,
  GetBollingerDto,
  GetStochasticDto,
  GetMultiIndicatorsDto,
} from './dto/get-indicators.dto';
import { CandleData } from './interfaces/indicator.interface';

@ApiTags('indicators')
@Controller('indicators')
@UseGuards(ThrottlerGuard)
export class IndicatorsController {
  constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly marketService: MarketService,
  ) {}

  /**
   * Helper method to fetch candles and convert to CandleData format
   */
  private async getCandles(
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<CandleData[]> {
    const candles = await this.marketService.getHistoricalCandles(
      symbol.toUpperCase(),
      interval,
      limit,
    );

    return candles.map((c: any) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  @Get(':symbol/ma')
  @ApiOperation({
    summary: 'Get Simple Moving Average (SMA)',
    description:
      'Calculate Simple Moving Average for a trading pair. SMA is the average of closing prices over a specified period.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'SMA data calculated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid parameters' })
  @HttpCode(HttpStatus.OK)
  async getMA(@Param('symbol') symbol: string, @Query() query: GetMADto) {
    const candles = await this.getCandles(symbol, query.interval, query.limit!);
    const data = this.indicatorsService.calculateMA(candles, query.period!);

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval: query.interval,
        indicator: 'SMA',
        period: query.period,
        values: data,
      },
    };
  }

  @Get(':symbol/ema')
  @ApiOperation({
    summary: 'Get Exponential Moving Average (EMA)',
    description:
      'Calculate Exponential Moving Average for a trading pair. EMA gives more weight to recent prices.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'EMA data calculated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid parameters' })
  @HttpCode(HttpStatus.OK)
  async getEMA(@Param('symbol') symbol: string, @Query() query: GetEMADto) {
    const candles = await this.getCandles(symbol, query.interval, query.limit!);
    const data = this.indicatorsService.calculateEMA(candles, query.period!);

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval: query.interval,
        indicator: 'EMA',
        period: query.period,
        values: data,
      },
    };
  }

  @Get(':symbol/rsi')
  @ApiOperation({
    summary: 'Get Relative Strength Index (RSI)',
    description:
      'Calculate RSI for a trading pair. RSI measures the speed and magnitude of recent price changes (0-100 scale).',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'RSI data calculated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid parameters' })
  @HttpCode(HttpStatus.OK)
  async getRSI(@Param('symbol') symbol: string, @Query() query: GetRSIDto) {
    const candles = await this.getCandles(symbol, query.interval, query.limit!);
    const data = this.indicatorsService.calculateRSI(candles, query.period!);

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval: query.interval,
        indicator: 'RSI',
        period: query.period,
        values: data,
      },
    };
  }

  @Get(':symbol/macd')
  @ApiOperation({
    summary: 'Get MACD (Moving Average Convergence Divergence)',
    description:
      'Calculate MACD for a trading pair. Returns MACD line, signal line, and histogram.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'MACD data calculated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid parameters' })
  @HttpCode(HttpStatus.OK)
  async getMACD(@Param('symbol') symbol: string, @Query() query: GetMACDDto) {
    const candles = await this.getCandles(symbol, query.interval, query.limit!);
    const data = this.indicatorsService.calculateMACD(
      candles,
      query.fastPeriod!,
      query.slowPeriod!,
      query.signalPeriod!,
    );

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval: query.interval,
        indicator: 'MACD',
        params: {
          fastPeriod: query.fastPeriod,
          slowPeriod: query.slowPeriod,
          signalPeriod: query.signalPeriod,
        },
        values: data,
      },
    };
  }

  @Get(':symbol/bollinger')
  @ApiOperation({
    summary: 'Get Bollinger Bands',
    description:
      'Calculate Bollinger Bands for a trading pair. Returns upper, middle (SMA), and lower bands.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'Bollinger Bands data calculated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid parameters' })
  @HttpCode(HttpStatus.OK)
  async getBollingerBands(
    @Param('symbol') symbol: string,
    @Query() query: GetBollingerDto,
  ) {
    const candles = await this.getCandles(symbol, query.interval, query.limit!);
    const data = this.indicatorsService.calculateBollingerBands(
      candles,
      query.period!,
      query.stdDev!,
    );

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval: query.interval,
        indicator: 'Bollinger Bands',
        params: {
          period: query.period,
          stdDev: query.stdDev,
        },
        values: data,
      },
    };
  }

  @Get(':symbol/stochastic')
  @ApiOperation({
    summary: 'Get Stochastic Oscillator',
    description:
      'Calculate Stochastic Oscillator for a trading pair. Returns %K and %D lines (0-100 scale).',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'Stochastic data calculated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid parameters' })
  @HttpCode(HttpStatus.OK)
  async getStochastic(
    @Param('symbol') symbol: string,
    @Query() query: GetStochasticDto,
  ) {
    const candles = await this.getCandles(symbol, query.interval, query.limit!);
    const data = this.indicatorsService.calculateStochastic(
      candles,
      query.kPeriod!,
      query.dPeriod!,
    );

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval: query.interval,
        indicator: 'Stochastic',
        params: {
          kPeriod: query.kPeriod,
          dPeriod: query.dPeriod,
        },
        values: data,
      },
    };
  }

  @Get(':symbol/atr')
  @ApiOperation({
    summary: 'Get Average True Range (ATR)',
    description:
      'Calculate ATR for a trading pair. ATR measures market volatility.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'ATR data calculated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid parameters' })
  @HttpCode(HttpStatus.OK)
  async getATR(@Param('symbol') symbol: string, @Query() query: GetMADto) {
    const candles = await this.getCandles(symbol, query.interval, query.limit!);
    const data = this.indicatorsService.calculateATR(candles, query.period!);

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval: query.interval,
        indicator: 'ATR',
        period: query.period,
        values: data,
      },
    };
  }

  @Get(':symbol/multi')
  @ApiOperation({
    summary: 'Get Multiple Indicators at Once',
    description:
      'Calculate multiple technical indicators in a single request. Useful for dashboard views.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'Multiple indicators calculated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid parameters' })
  @HttpCode(HttpStatus.OK)
  async getMultipleIndicators(
    @Param('symbol') symbol: string,
    @Query() query: GetMultiIndicatorsDto,
  ) {
    const candles = await this.getCandles(symbol, query.interval, query.limit!);
    const indicators = this.indicatorsService.calculateMultipleIndicators(
      candles,
      query.indicators,
      query.period!,
    );

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval: query.interval,
        period: query.period,
        requestedIndicators: query.indicators,
        candles: candles,
        indicators: indicators,
      },
    };
  }

  @Get(':symbol/summary')
  @ApiOperation({
    summary: 'Get Technical Analysis Summary',
    description:
      'Get a comprehensive technical analysis summary including multiple timeframe analysis and signal strength.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'Trading pair symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'Technical analysis summary generated successfully',
  })
  @HttpCode(HttpStatus.OK)
  async getTASummary(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string = '1h',
  ) {
    const candles = await this.getCandles(symbol, interval, 500);

    // Calculate all major indicators
    const rsi = this.indicatorsService.calculateRSI(candles, 14);
    const macd = this.indicatorsService.calculateMACD(candles);
    const stochastic = this.indicatorsService.calculateStochastic(candles);
    const ma20 = this.indicatorsService.calculateSMA(candles, 20);
    const ma50 = this.indicatorsService.calculateSMA(candles, 50);
    const ema12 = this.indicatorsService.calculateEMA(candles, 12);
    const ema26 = this.indicatorsService.calculateEMA(candles, 26);

    // Get latest values
    const latestCandle = candles[candles.length - 1];
    const latestRSI = rsi[rsi.length - 1]?.value;
    const latestMACD = macd[macd.length - 1];
    const latestStoch = stochastic[stochastic.length - 1];
    const latestMA20 = ma20[ma20.length - 1]?.value;
    const latestMA50 = ma50[ma50.length - 1]?.value;
    const latestEMA12 = ema12[ema12.length - 1]?.value;
    const latestEMA26 = ema26[ema26.length - 1]?.value;

    // Generate signals
    const signals: string[] = [];
    let bullishCount = 0;
    let bearishCount = 0;

    // RSI Signal
    if (latestRSI !== null) {
      if (latestRSI < 30) {
        signals.push('RSI: Oversold (Bullish)');
        bullishCount++;
      } else if (latestRSI > 70) {
        signals.push('RSI: Overbought (Bearish)');
        bearishCount++;
      } else {
        signals.push('RSI: Neutral');
      }
    }

    // MACD Signal
    if (latestMACD?.macd !== null && latestMACD?.signal !== null) {
      if (latestMACD.macd > latestMACD.signal) {
        signals.push('MACD: Bullish Crossover');
        bullishCount++;
      } else {
        signals.push('MACD: Bearish Crossover');
        bearishCount++;
      }
    }

    // MA Crossover
    if (latestMA20 !== null && latestMA50 !== null) {
      if (latestMA20 > latestMA50) {
        signals.push('MA(20/50): Golden Cross (Bullish)');
        bullishCount++;
      } else {
        signals.push('MA(20/50): Death Cross (Bearish)');
        bearishCount++;
      }
    }

    // Price vs MA
    if (latestMA20 !== null) {
      if (latestCandle.close > latestMA20) {
        signals.push('Price above MA20 (Bullish)');
        bullishCount++;
      } else {
        signals.push('Price below MA20 (Bearish)');
        bearishCount++;
      }
    }

    // Stochastic Signal
    if (latestStoch?.k !== null) {
      if (latestStoch.k < 20) {
        signals.push('Stochastic: Oversold (Bullish)');
        bullishCount++;
      } else if (latestStoch.k > 80) {
        signals.push('Stochastic: Overbought (Bearish)');
        bearishCount++;
      }
    }

    // Overall sentiment
    let sentiment = 'NEUTRAL';
    if (bullishCount > bearishCount + 1) sentiment = 'BULLISH';
    else if (bearishCount > bullishCount + 1) sentiment = 'BEARISH';

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        interval,
        timestamp: Date.now(),
        price: {
          current: latestCandle.close,
          change24h: null, // Would need 24h data
        },
        indicators: {
          rsi: latestRSI,
          macd: latestMACD,
          stochastic: latestStoch,
          ma20: latestMA20,
          ma50: latestMA50,
          ema12: latestEMA12,
          ema26: latestEMA26,
        },
        signals,
        summary: {
          sentiment,
          bullishSignals: bullishCount,
          bearishSignals: bearishCount,
          totalSignals: bullishCount + bearishCount,
        },
      },
    };
  }
}
