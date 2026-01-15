import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BinanceService } from 'src/modules/binance/binance.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  providers: [BinanceService],
  exports: [BinanceService],
})
export class BinanceModule {}
