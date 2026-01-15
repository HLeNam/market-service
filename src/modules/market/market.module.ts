import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandleEntity } from 'src/modules/market/entities/candle.entity';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { BinanceModule } from 'src/modules/binance/binance.module';
import { CacheModule } from 'src/modules/cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CandleEntity]),
    BullModule.registerQueue({
      name: 'candle-storage',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    forwardRef(() => BinanceModule),
    CacheModule,
  ],
  providers: [MarketService],
  controllers: [MarketController],
  exports: [MarketService],
})
export class MarketModule {}
