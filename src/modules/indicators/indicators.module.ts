import { Module } from '@nestjs/common';
import { IndicatorsController } from './indicators.controller';
import { IndicatorsService } from './indicators.service';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [MarketModule],
  controllers: [IndicatorsController],
  providers: [IndicatorsService],
  exports: [IndicatorsService],
})
export class IndicatorsModule {}
