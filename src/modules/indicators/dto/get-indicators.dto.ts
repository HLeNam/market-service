import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsArray,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Valid timeframe intervals supported by Binance
 */
export const VALID_INTERVALS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
] as const;

export type ValidInterval = (typeof VALID_INTERVALS)[number];

/**
 * DTO for getting a single indicator
 */
export class GetIndicatorDto {
  @ApiProperty({
    description: 'Timeframe interval',
    enum: VALID_INTERVALS,
    example: '1h',
  })
  @IsIn(VALID_INTERVALS, {
    message: `interval must be one of: ${VALID_INTERVALS.join(', ')}`,
  })
  interval: ValidInterval;

  @ApiPropertyOptional({
    description: 'Period for the indicator calculation',
    minimum: 2,
    maximum: 200,
    default: 14,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(200)
  period?: number = 14;

  @ApiPropertyOptional({
    description: 'Number of candles to fetch',
    minimum: 10,
    maximum: 1000,
    default: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(1000)
  limit?: number = 500;
}

/**
 * DTO for getting MA/SMA indicator
 */
export class GetMADto extends GetIndicatorDto {
  @ApiPropertyOptional({
    description: 'MA Period (default: 20)',
    minimum: 2,
    maximum: 200,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(200)
  period?: number = 20;
}

/**
 * DTO for getting EMA indicator
 */
export class GetEMADto extends GetIndicatorDto {
  @ApiPropertyOptional({
    description: 'EMA Period (default: 12)',
    minimum: 2,
    maximum: 200,
    default: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(200)
  period?: number = 12;
}

/**
 * DTO for getting RSI indicator
 */
export class GetRSIDto extends GetIndicatorDto {
  @ApiPropertyOptional({
    description: 'RSI Period (default: 14)',
    minimum: 2,
    maximum: 100,
    default: 14,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(100)
  period?: number = 14;
}

/**
 * DTO for getting MACD indicator
 */
export class GetMACDDto {
  @ApiProperty({
    description: 'Timeframe interval',
    enum: VALID_INTERVALS,
    example: '1h',
  })
  @IsIn(VALID_INTERVALS)
  interval: ValidInterval;

  @ApiPropertyOptional({
    description: 'Fast EMA period (default: 12)',
    minimum: 2,
    maximum: 100,
    default: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(100)
  fastPeriod?: number = 12;

  @ApiPropertyOptional({
    description: 'Slow EMA period (default: 26)',
    minimum: 2,
    maximum: 100,
    default: 26,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(100)
  slowPeriod?: number = 26;

  @ApiPropertyOptional({
    description: 'Signal line period (default: 9)',
    minimum: 2,
    maximum: 50,
    default: 9,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(50)
  signalPeriod?: number = 9;

  @ApiPropertyOptional({
    description: 'Number of candles to fetch',
    minimum: 50,
    maximum: 1000,
    default: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(1000)
  limit?: number = 500;
}

/**
 * DTO for getting Bollinger Bands
 */
export class GetBollingerDto extends GetIndicatorDto {
  @ApiPropertyOptional({
    description: 'Period for middle band SMA (default: 20)',
    minimum: 2,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(100)
  period?: number = 20;

  @ApiPropertyOptional({
    description: 'Standard deviation multiplier (default: 2)',
    minimum: 0.5,
    maximum: 5,
    default: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(5)
  stdDev?: number = 2;
}

/**
 * DTO for getting Stochastic Oscillator
 */
export class GetStochasticDto {
  @ApiProperty({
    description: 'Timeframe interval',
    enum: VALID_INTERVALS,
    example: '1h',
  })
  @IsIn(VALID_INTERVALS)
  interval: ValidInterval;

  @ApiPropertyOptional({
    description: '%K period (default: 14)',
    minimum: 2,
    maximum: 100,
    default: 14,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(100)
  kPeriod?: number = 14;

  @ApiPropertyOptional({
    description: '%D period - smoothing (default: 3)',
    minimum: 1,
    maximum: 50,
    default: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  dPeriod?: number = 3;

  @ApiPropertyOptional({
    description: 'Number of candles to fetch',
    minimum: 20,
    maximum: 1000,
    default: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(1000)
  limit?: number = 500;
}

/**
 * DTO for getting multiple indicators at once
 */
export class GetMultiIndicatorsDto {
  @ApiProperty({
    description: 'Timeframe interval',
    enum: VALID_INTERVALS,
    example: '1h',
  })
  @IsIn(VALID_INTERVALS)
  interval: ValidInterval;

  @ApiProperty({
    description: 'List of indicators to calculate',
    example: ['ma', 'ema', 'rsi'],
    type: [String],
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim().toLowerCase());
    }
    return value;
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['ma', 'sma', 'ema', 'rsi', 'macd', 'bollinger', 'stochastic', 'atr'], {
    each: true,
  })
  indicators: string[];

  @ApiPropertyOptional({
    description: 'Period for MA/EMA/RSI (default: 14)',
    default: 14,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(200)
  period?: number = 14;

  @ApiPropertyOptional({
    description: 'Number of candles to fetch',
    minimum: 50,
    maximum: 1000,
    default: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(1000)
  limit?: number = 500;
}
