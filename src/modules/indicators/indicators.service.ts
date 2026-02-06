import { Injectable, Logger } from '@nestjs/common';
import {
  CandleData,
  MAResult,
  EMAResult,
  RSIResult,
  MACDResult,
  BollingerBandsResult,
  StochasticResult,
  ATRResult,
} from './interfaces/indicator.interface';

/**
 * Technical Indicators Service
 * Provides calculation methods for various technical analysis indicators
 */
@Injectable()
export class IndicatorsService {
  private readonly logger = new Logger(IndicatorsService.name);

  /**
   * Calculate Simple Moving Average (SMA)
   * SMA = Sum of closing prices over N periods / N
   */
  calculateSMA(candles: CandleData[], period: number): MAResult[] {
    if (candles.length < period) {
      this.logger.warn(
        `Not enough data for SMA calculation. Need ${period}, got ${candles.length}`,
      );
      return candles.map((c) => ({ time: c.time, value: null }));
    }

    const results: MAResult[] = [];

    for (let i = 0; i < candles.length; i++) {
      if (i < period - 1) {
        // Not enough data points yet
        results.push({ time: candles[i].time, value: null });
      } else {
        // Calculate SMA for the window
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
          sum += candles[j].close;
        }
        results.push({
          time: candles[i].time,
          value: Number((sum / period).toFixed(8)),
        });
      }
    }

    return results;
  }

  /**
   * Alias for SMA - Moving Average
   */
  calculateMA(candles: CandleData[], period: number): MAResult[] {
    return this.calculateSMA(candles, period);
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   * EMA = (Close - Previous EMA) × Multiplier + Previous EMA
   * Multiplier = 2 / (Period + 1)
   */
  calculateEMA(candles: CandleData[], period: number): EMAResult[] {
    if (candles.length < period) {
      this.logger.warn(
        `Not enough data for EMA calculation. Need ${period}, got ${candles.length}`,
      );
      return candles.map((c) => ({ time: c.time, value: null }));
    }

    const results: EMAResult[] = [];
    const multiplier = 2 / (period + 1);

    // Calculate initial SMA for the first EMA value
    let sum = 0;
    for (let i = 0; i < period; i++) {
      results.push({ time: candles[i].time, value: null });
      sum += candles[i].close;
    }

    // First EMA is SMA
    let ema = sum / period;
    results[period - 1] = {
      time: candles[period - 1].time,
      value: Number(ema.toFixed(8)),
    };

    // Calculate subsequent EMAs
    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close - ema) * multiplier + ema;
      results.push({
        time: candles[i].time,
        value: Number(ema.toFixed(8)),
      });
    }

    return results;
  }

  /**
   * Calculate Relative Strength Index (RSI)
   * RSI = 100 - (100 / (1 + RS))
   * RS = Average Gain / Average Loss
   */
  calculateRSI(candles: CandleData[], period: number = 14): RSIResult[] {
    if (candles.length < period + 1) {
      this.logger.warn(
        `Not enough data for RSI calculation. Need ${period + 1}, got ${candles.length}`,
      );
      return candles.map((c) => ({ time: c.time, value: null }));
    }

    const results: RSIResult[] = [];
    const gains: number[] = [];
    const losses: number[] = [];

    // First candle has no RSI
    results.push({ time: candles[0].time, value: null });

    // Calculate price changes
    for (let i = 1; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // Not enough data for first (period) candles
    for (let i = 1; i < period; i++) {
      results.push({ time: candles[i].time, value: null });
    }

    // Calculate first average gain and loss
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // First RSI value
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let rsi = 100 - 100 / (1 + rs);
    results.push({
      time: candles[period].time,
      value: Number(rsi.toFixed(2)),
    });

    // Calculate subsequent RSI values using smoothed averages
    for (let i = period + 1; i < candles.length; i++) {
      const gainIndex = i - 1;
      avgGain = (avgGain * (period - 1) + gains[gainIndex]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[gainIndex]) / period;

      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);

      results.push({
        time: candles[i].time,
        value: Number(rsi.toFixed(2)),
      });
    }

    return results;
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   * MACD Line = Fast EMA - Slow EMA
   * Signal Line = EMA of MACD Line
   * Histogram = MACD Line - Signal Line
   */
  calculateMACD(
    candles: CandleData[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
  ): MACDResult[] {
    const minRequired = slowPeriod + signalPeriod;

    if (candles.length < minRequired) {
      this.logger.warn(
        `Not enough data for MACD calculation. Need ${minRequired}, got ${candles.length}`,
      );
      return candles.map((c) => ({
        time: c.time,
        macd: null,
        signal: null,
        histogram: null,
      }));
    }

    // Calculate fast and slow EMAs
    const fastEMA = this.calculateEMA(candles, fastPeriod);
    const slowEMA = this.calculateEMA(candles, slowPeriod);

    // Calculate MACD line
    const macdLine: number[] = [];
    const macdWithTime: { time: number; macd: number | null }[] = [];

    for (let i = 0; i < candles.length; i++) {
      if (fastEMA[i].value !== null && slowEMA[i].value !== null) {
        const macdValue = fastEMA[i].value! - slowEMA[i].value!;
        macdLine.push(macdValue);
        macdWithTime.push({ time: candles[i].time, macd: macdValue });
      } else {
        macdWithTime.push({ time: candles[i].time, macd: null });
      }
    }

    // Calculate Signal line (EMA of MACD line)
    const signalMultiplier = 2 / (signalPeriod + 1);
    const results: MACDResult[] = [];

    // Initialize with nulls until we have enough MACD values
    const macdStartIndex = slowPeriod - 1;
    for (let i = 0; i < macdStartIndex + signalPeriod - 1; i++) {
      results.push({
        time: candles[i].time,
        macd: macdWithTime[i].macd,
        signal: null,
        histogram: null,
      });
    }

    // Calculate first signal value (SMA of first signalPeriod MACD values)
    let signalSum = 0;
    for (let i = 0; i < signalPeriod; i++) {
      signalSum += macdLine[i];
    }
    let signal = signalSum / signalPeriod;

    const signalStartIndex = macdStartIndex + signalPeriod - 1;
    results.push({
      time: candles[signalStartIndex].time,
      macd: Number(macdWithTime[signalStartIndex].macd!.toFixed(8)),
      signal: Number(signal.toFixed(8)),
      histogram: Number(
        (macdWithTime[signalStartIndex].macd! - signal).toFixed(8),
      ),
    });

    // Calculate subsequent signal values
    for (let i = signalStartIndex + 1; i < candles.length; i++) {
      const macdIndex = i - macdStartIndex;
      if (macdIndex < macdLine.length) {
        signal = (macdLine[macdIndex] - signal) * signalMultiplier + signal;
        const macdValue = macdWithTime[i].macd!;

        results.push({
          time: candles[i].time,
          macd: Number(macdValue.toFixed(8)),
          signal: Number(signal.toFixed(8)),
          histogram: Number((macdValue - signal).toFixed(8)),
        });
      }
    }

    return results;
  }

  /**
   * Calculate Bollinger Bands
   * Middle Band = SMA
   * Upper Band = Middle Band + (Standard Deviation × Multiplier)
   * Lower Band = Middle Band - (Standard Deviation × Multiplier)
   */
  calculateBollingerBands(
    candles: CandleData[],
    period: number = 20,
    stdDevMultiplier: number = 2,
  ): BollingerBandsResult[] {
    if (candles.length < period) {
      this.logger.warn(
        `Not enough data for Bollinger Bands. Need ${period}, got ${candles.length}`,
      );
      return candles.map((c) => ({
        time: c.time,
        upper: null,
        middle: null,
        lower: null,
      }));
    }

    const results: BollingerBandsResult[] = [];
    const sma = this.calculateSMA(candles, period);

    for (let i = 0; i < candles.length; i++) {
      if (i < period - 1) {
        results.push({
          time: candles[i].time,
          upper: null,
          middle: null,
          lower: null,
        });
      } else {
        // Calculate standard deviation for the window
        const windowPrices: number[] = [];
        for (let j = i - period + 1; j <= i; j++) {
          windowPrices.push(candles[j].close);
        }

        const mean = sma[i].value!;
        const squaredDiffs = windowPrices.map((price) =>
          Math.pow(price - mean, 2),
        );
        const variance =
          squaredDiffs.reduce((a, b) => a + b, 0) / windowPrices.length;
        const stdDev = Math.sqrt(variance);

        results.push({
          time: candles[i].time,
          upper: Number((mean + stdDev * stdDevMultiplier).toFixed(8)),
          middle: Number(mean.toFixed(8)),
          lower: Number((mean - stdDev * stdDevMultiplier).toFixed(8)),
        });
      }
    }

    return results;
  }

  /**
   * Calculate Stochastic Oscillator
   * %K = (Current Close - Lowest Low) / (Highest High - Lowest Low) × 100
   * %D = SMA of %K
   */
  calculateStochastic(
    candles: CandleData[],
    kPeriod: number = 14,
    dPeriod: number = 3,
  ): StochasticResult[] {
    const minRequired = kPeriod + dPeriod - 1;

    if (candles.length < minRequired) {
      this.logger.warn(
        `Not enough data for Stochastic. Need ${minRequired}, got ${candles.length}`,
      );
      return candles.map((c) => ({ time: c.time, k: null, d: null }));
    }

    const results: StochasticResult[] = [];
    const kValues: number[] = [];

    // Calculate %K values
    for (let i = 0; i < candles.length; i++) {
      if (i < kPeriod - 1) {
        results.push({ time: candles[i].time, k: null, d: null });
      } else {
        // Find highest high and lowest low in the period
        let highestHigh = -Infinity;
        let lowestLow = Infinity;

        for (let j = i - kPeriod + 1; j <= i; j++) {
          if (candles[j].high > highestHigh) highestHigh = candles[j].high;
          if (candles[j].low < lowestLow) lowestLow = candles[j].low;
        }

        const range = highestHigh - lowestLow;
        const k =
          range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100;

        kValues.push(k);
        results.push({
          time: candles[i].time,
          k: Number(k.toFixed(2)),
          d: null,
        });
      }
    }

    // Calculate %D (SMA of %K)
    for (let i = kPeriod - 1; i < candles.length; i++) {
      const kIndex = i - (kPeriod - 1);

      if (kIndex >= dPeriod - 1) {
        let sum = 0;
        for (let j = kIndex - dPeriod + 1; j <= kIndex; j++) {
          sum += kValues[j];
        }
        results[i].d = Number((sum / dPeriod).toFixed(2));
      }
    }

    return results;
  }

  /**
   * Calculate Average True Range (ATR)
   * TR = Max(High - Low, |High - Previous Close|, |Low - Previous Close|)
   * ATR = SMA of TR
   */
  calculateATR(candles: CandleData[], period: number = 14): ATRResult[] {
    if (candles.length < period + 1) {
      this.logger.warn(
        `Not enough data for ATR calculation. Need ${period + 1}, got ${candles.length}`,
      );
      return candles.map((c) => ({ time: c.time, value: null }));
    }

    const results: ATRResult[] = [];
    const trueRanges: number[] = [];

    // First candle - TR is just High - Low
    results.push({ time: candles[0].time, value: null });
    trueRanges.push(candles[0].high - candles[0].low);

    // Calculate True Range for each candle
    for (let i = 1; i < candles.length; i++) {
      const highLow = candles[i].high - candles[i].low;
      const highPrevClose = Math.abs(candles[i].high - candles[i - 1].close);
      const lowPrevClose = Math.abs(candles[i].low - candles[i - 1].close);

      const tr = Math.max(highLow, highPrevClose, lowPrevClose);
      trueRanges.push(tr);

      if (i < period) {
        results.push({ time: candles[i].time, value: null });
      }
    }

    // Calculate first ATR (SMA of first period TRs)
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    results.push({
      time: candles[period].time,
      value: Number(atr.toFixed(8)),
    });

    // Calculate subsequent ATRs using smoothed method
    for (let i = period + 1; i < candles.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      results.push({
        time: candles[i].time,
        value: Number(atr.toFixed(8)),
      });
    }

    return results;
  }

  /**
   * Calculate multiple indicators at once
   * Returns an object with all requested indicators
   */
  calculateMultipleIndicators(
    candles: CandleData[],
    indicators: string[],
    period: number = 14,
  ): Record<string, any[]> {
    const results: Record<string, any[]> = {};

    for (const indicator of indicators) {
      switch (indicator.toLowerCase()) {
        case 'ma':
        case 'sma':
          results.ma = this.calculateSMA(candles, period);
          break;
        case 'ema':
          results.ema = this.calculateEMA(candles, period);
          break;
        case 'rsi':
          results.rsi = this.calculateRSI(candles, period);
          break;
        case 'macd':
          results.macd = this.calculateMACD(candles);
          break;
        case 'bollinger':
          results.bollingerBands = this.calculateBollingerBands(candles, period);
          break;
        case 'stochastic':
          results.stochastic = this.calculateStochastic(candles);
          break;
        case 'atr':
          results.atr = this.calculateATR(candles, period);
          break;
        default:
          this.logger.warn(`Unknown indicator: ${indicator}`);
      }
    }

    return results;
  }
}
