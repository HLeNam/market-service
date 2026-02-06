/**
 * Technical Indicator Interfaces
 * Defines the data structures for various technical indicators
 */

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MAResult {
  time: number;
  value: number | null;
}

export interface EMAResult {
  time: number;
  value: number | null;
}

export interface RSIResult {
  time: number;
  value: number | null;
}

export interface MACDResult {
  time: number;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export interface BollingerBandsResult {
  time: number;
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface StochasticResult {
  time: number;
  k: number | null;
  d: number | null;
}

export interface ATRResult {
  time: number;
  value: number | null;
}

export interface IndicatorResponse<T> {
  symbol: string;
  interval: string;
  indicator: string;
  period?: number;
  data: T[];
}

export interface MultiIndicatorResponse {
  symbol: string;
  interval: string;
  candles: CandleData[];
  indicators: {
    ma?: MAResult[];
    ema?: EMAResult[];
    rsi?: RSIResult[];
    macd?: MACDResult[];
    bollingerBands?: BollingerBandsResult[];
    stochastic?: StochasticResult[];
    atr?: ATRResult[];
  };
}

export type IndicatorType =
  | 'ma'
  | 'sma'
  | 'ema'
  | 'rsi'
  | 'macd'
  | 'bollinger'
  | 'stochastic'
  | 'atr';
