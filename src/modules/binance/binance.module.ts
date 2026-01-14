import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BinanceService } from './binance.service';
import { BinanceWebsocketService } from './binance-websocket.service';
import { CacheModule } from '../cache/cache.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    CacheModule,
    forwardRef(() => MarketModule),
  ],
  providers: [BinanceService, BinanceWebsocketService],
  exports: [BinanceService, BinanceWebsocketService],
})
export class BinanceModule {}
