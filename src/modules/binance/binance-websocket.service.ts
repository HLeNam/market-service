import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import WebSocket from 'ws';
import { CacheService } from '../cache/cache.service';
import { MarketService } from '../market/market.service';

interface SubscriptionCallback {
  onCandle?: (data: any) => void;
  onTicker?: (data: any) => void;
}

@Injectable()
export class BinanceWebsocketService implements OnModuleDestroy {
  private readonly logger = new Logger(BinanceWebsocketService.name);
  private readonly wsBase = 'wss://stream.binance.com:9443';

  // Map: symbol -> WebSocket connection
  private connections = new Map<string, WebSocket>();

  // Map: symbol -> Set of client IDs subscribed
  private subscriptions = new Map<string, Map<string, SubscriptionCallback>>();

  constructor(
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => MarketService))
    private readonly marketService: MarketService,
  ) {}

  onModuleDestroy() {
    // Cleanup all connections
    this.connections.forEach((ws) => ws.close());
    this.connections.clear();
    this.subscriptions.clear();
  }

  async subscribe(
    symbol: string,
    interval: string,
    onCandle: (data: any) => void,
    onTicker?: (data: any) => void,
  ): Promise<string> {
    const clientId = this.generateClientId();
    const key = `${symbol}:${interval}`;

    // Add callback to subscriptions
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Map());
    }
    this.subscriptions.get(key)!.set(clientId, { onCandle, onTicker });

    // Create WebSocket connection if not exists
    if (!this.connections.has(key)) {
      await this.createConnection(symbol, interval, key);
    }

    return clientId;
  }

  async unsubscribe(symbol: string, clientId: string): Promise<void> {
    this.subscriptions.forEach((clients, key) => {
      if (key.startsWith(symbol)) {
        clients.delete(clientId);

        // Close connection if no more subscribers
        if (clients.size === 0) {
          const ws = this.connections.get(key);
          if (ws) {
            ws.close();
            this.connections.delete(key);
            this.subscriptions.delete(key);
            this.logger.log(`Closed WebSocket for ${key}`);
          }
        }
      }
    });
  }

  private async createConnection(
    symbol: string,
    interval: string,
    key: string,
  ): Promise<void> {
    const streams = [
      `${symbol.toLowerCase()}@kline_${interval}`,
      `${symbol.toLowerCase()}@ticker`,
    ];

    const wsUrl = `${this.wsBase}/stream?streams=${streams.join('/')}`;
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      this.logger.log(`WebSocket connected for ${key}`);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const { stream, data: streamData } = parsed;

        const callbacks = this.subscriptions.get(key);
        if (!callbacks) return;

        // Broadcast to all subscribed clients
        callbacks.forEach((callback) => {
          if (stream.includes('@kline') && callback.onCandle) {
            const { k } = streamData;
            const candleData = {
              time: k.t,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
              isFinal: k.x,
            };

            callback.onCandle(candleData);

            // Store final candles in cache and database for historical data
            if (k.x) {
              const [symbol, interval] = key.split(':');
              const symbolUpper = symbol.toUpperCase();

              // Store in Redis cache
              this.cacheService
                .addSingleCandle(symbolUpper, interval, candleData)
                .catch((err) =>
                  this.logger.error(`Failed to cache candle: ${err.message}`),
                );

              // Store in database for long-term analysis
              this.marketService
                .storeSingleCandleInDB(symbolUpper, interval, candleData)
                .catch((err) =>
                  this.logger.error(
                    `Failed to store candle in DB: ${err.message}`,
                  ),
                );
            }
          } else if (stream.includes('@ticker') && callback.onTicker) {
            callback.onTicker({
              symbol: streamData.s,
              priceChangePercent: streamData.P,
              lastPrice: streamData.c,
              highPrice: streamData.h,
              lowPrice: streamData.l,
              quoteVolume: streamData.q,
            });
          }
        });
      } catch (err) {
        this.logger.error(`WebSocket message parse error: ${err.message}`);
      }
    });

    ws.on('error', (error) => {
      this.logger.error(`WebSocket error for ${key}: ${error.message}`);
    });

    ws.on('close', () => {
      this.logger.log(`WebSocket closed for ${key}`);
      this.connections.delete(key);

      // Attempt reconnection if there are still subscribers
      const callbacks = this.subscriptions.get(key);
      if (callbacks && callbacks.size > 0) {
        this.logger.log(`Reconnecting WebSocket for ${key}...`);
        setTimeout(() => this.createConnection(symbol, interval, key), 5000);
      }
    });

    this.connections.set(key, ws);
  }

  async subscribeAllTickers(callback: (tickers: any[]) => void): Promise<void> {
    const key = 'all-tickers';

    if (this.connections.has(key)) {
      return; // Already connected
    }

    const ws = new WebSocket(`${this.wsBase}/ws/!ticker@arr`);

    ws.on('open', () => {
      this.logger.log('Connected to all tickers stream');
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const usdtTickers = parsed
          .filter((t: any) => t.s.endsWith('USDT'))
          .map((t: any) => ({
            symbol: t.s,
            priceChangePercent: t.P,
            lastPrice: t.c,
            highPrice: t.h,
            lowPrice: t.l,
            quoteVolume: t.q,
            baseAsset: t.s.replace('USDT', ''),
          }));

        callback(usdtTickers);
      } catch (err) {
        this.logger.error(`All tickers parse error: ${err.message}`);
      }
    });

    ws.on('error', (error) => {
      this.logger.error(`All tickers WebSocket error: ${error.message}`);
    });

    ws.on('close', () => {
      this.logger.log('All tickers WebSocket closed');
      this.connections.delete(key);
    });

    this.connections.set(key, ws);
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
