import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandleEntity } from 'src/modules/market/entities/candle.entity';
import { TickerEntity } from 'src/modules/market/entities/ticker.entity';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { BinanceModule } from 'src/modules/binance/binance.module';
import { CacheModule } from 'src/modules/cache/cache.module';
import { MarketGateway } from 'src/modules/market/market.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([CandleEntity, TickerEntity]),
    BullModule.registerQueue({
      name: 'market-data',
    }),
    BinanceModule,
    CacheModule,
  ],
  providers: [MarketService, MarketGateway],
  controllers: [MarketController],
  exports: [MarketService],
})
export class MarketModule {}
