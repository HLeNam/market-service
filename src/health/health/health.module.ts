import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { CacheModule } from 'src/modules/cache/cache.module';
import { BinanceModule } from 'src/modules/binance/binance.module';

@Module({
  imports: [TerminusModule, HttpModule, CacheModule, BinanceModule],
  controllers: [HealthController],
})
export class HealthModule {}
