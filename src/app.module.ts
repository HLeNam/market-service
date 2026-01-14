import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from 'src/config/database.config';
import { BullModule } from '@nestjs/bull';
import { redisConfig } from 'src/config/redis.config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from './modules/cache/cache.module';
import { HealthModule } from './health/health/health.module';
import { BinanceModule } from './modules/binance/binance.module';
import { MarketModule } from './modules/market/market.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: redisConfig,
    }),

    ScheduleModule.forRoot(),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    CacheModule,

    HealthModule,

    BinanceModule,

    MarketModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
