import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { CacheService } from '../cache/cache.service';
import { MarketService } from '../market/market.service';

interface SubscriptionCallback {
  onCandle?: (data: any) => void;
  onTicker?: (data: any) => void;
}

interface ConnectionState {
  ws: WebSocket;
  retryCount: number;
  reconnectTimer?: NodeJS.Timeout;
  pingInterval?: NodeJS.Timeout;
  isReconnecting: boolean;
  lastPongTime: number;
}

@Injectable()
export class BinanceWebsocketService implements OnModuleDestroy {
  private readonly logger = new Logger(BinanceWebsocketService.name);
  private readonly wsBase = 'wss://stream.binance.com:9443';
  private readonly quoteAssets: string[];

  // Connection management
  private connections = new Map<string, ConnectionState>();
  private subscriptions = new Map<string, Map<string, SubscriptionCallback>>();

  // Configuration
  private readonly MAX_RETRY_ATTEMPTS = 10;
  private readonly INITIAL_RETRY_DELAY = 1000; // 1 second
  private readonly MAX_RETRY_DELAY = 60000; // 1 minute
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PONG_TIMEOUT = 10000; // 10 seconds

  constructor(
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => MarketService))
    private readonly marketService: MarketService,
    private readonly configService: ConfigService,
  ) {
    // Parse quote assets from ENV (default to USDT for backward compatibility)
    const quoteAssetsConfig =
      this.configService.get<string>('QUOTE_ASSETS') || 'USDT';
    this.quoteAssets = quoteAssetsConfig
      .split(',')
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    this.logger.log(`Quote assets configured: ${this.quoteAssets.join(', ')}`);
  }

  onModuleDestroy() {
    this.logger.log('Shutting down all WebSocket connections...');
    
    // Cleanup all connections
    this.connections.forEach((state, key) => {
      this.cleanupConnection(key, state);
    });
    
    this.connections.clear();
    this.subscriptions.clear();
    
    this.logger.log('All WebSocket connections closed');
  }

  /**
   * Cleanup a single connection and its timers
   */
  private cleanupConnection(key: string, state: ConnectionState): void {
    // Clear timers
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }
    
    if (state.pingInterval) {
      clearInterval(state.pingInterval);
      state.pingInterval = undefined;
    }

    // Close WebSocket
    if (state.ws) {
      state.ws.removeAllListeners();
      if (state.ws.readyState === WebSocket.OPEN) {
        state.ws.close(1000, 'Normal closure');
      }
    }

    this.logger.log(`Cleaned up connection for ${key}`);
  }

  /**
   * Extract base asset from symbol by removing quote asset suffix
   * e.g., BTCUSDT -> BTC, ETHBTC -> ETH
   */
  private getBaseAsset(symbol: string): string {
    for (const quote of this.quoteAssets) {
      if (symbol.endsWith(quote)) {
        return symbol.slice(0, -quote.length);
      }
    }
    // Fallback: return symbol as-is if no quote matched
    return symbol;
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
          const state = this.connections.get(key);
          if (state) {
            this.cleanupConnection(key, state);
            this.connections.delete(key);
            this.subscriptions.delete(key);
            this.logger.log(`Closed WebSocket for ${key} (no more subscribers)`);
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
    // Prevent duplicate connection attempts
    const existingState = this.connections.get(key);
    if (existingState?.isReconnecting) {
      this.logger.warn(`Already reconnecting for ${key}, skipping...`);
      return;
    }

    const streams = [
      `${symbol.toLowerCase()}@kline_${interval}`,
      `${symbol.toLowerCase()}@ticker`,
    ];

    const wsUrl = `${this.wsBase}/stream?streams=${streams.join('/')}`;
    const ws = new WebSocket(wsUrl);

    const state: ConnectionState = {
      ws,
      retryCount: existingState?.retryCount || 0,
      isReconnecting: false,
      lastPongTime: Date.now(),
    };

    this.connections.set(key, state);

    ws.on('open', () => {
      this.logger.log(`✅ WebSocket connected for ${key}`);
      state.retryCount = 0; // Reset on successful connection
      state.isReconnecting = false;
      
      // Start ping/pong heartbeat
      this.startHeartbeat(key, state);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const { stream, data: streamData } = parsed;

        const callbacks = this.subscriptions.get(key);
        if (!callbacks || callbacks.size === 0) {
          return;
        }

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

            // Store final candles
            if (k.x) {
              const [symbol, interval] = key.split(':');
              const symbolUpper = symbol.toUpperCase();

              this.marketService
                .storeFinalCandle(symbolUpper, interval, candleData)
                .catch((err) =>
                  this.logger.error(
                    `Failed to store final candle: ${err.message}`,
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
        this.logger.error(`WebSocket message parse error for ${key}: ${err.message}`);
      }
    });

    ws.on('pong', () => {
      state.lastPongTime = Date.now();
    });

    ws.on('error', (error) => {
      this.logger.error(`❌ WebSocket error for ${key}: ${error.message}`);
      
      // Cleanup and attempt reconnection
      this.handleConnectionFailure(symbol, interval, key, state);
    });

    ws.on('close', (code, reason) => {
      this.logger.warn(`WebSocket closed for ${key} - Code: ${code}, Reason: ${reason || 'Unknown'}`);
      
      // Cleanup timers
      if (state.pingInterval) {
        clearInterval(state.pingInterval);
        state.pingInterval = undefined;
      }

      // Attempt reconnection if there are still subscribers
      const callbacks = this.subscriptions.get(key);
      if (callbacks && callbacks.size > 0 && state.retryCount < this.MAX_RETRY_ATTEMPTS) {
        this.scheduleReconnection(symbol, interval, key, state);
      } else {
        this.connections.delete(key);
        if (state.retryCount >= this.MAX_RETRY_ATTEMPTS) {
          this.logger.error(`❌ Max retry attempts reached for ${key}, giving up`);
          this.subscriptions.delete(key); // Remove dead subscriptions
        }
      }
    });
  }

  /**
   * Handle connection failure with cleanup
   */
  private handleConnectionFailure(
    symbol: string,
    interval: string,
    key: string,
    state: ConnectionState,
  ): void {
    // Stop heartbeat
    if (state.pingInterval) {
      clearInterval(state.pingInterval);
      state.pingInterval = undefined;
    }

    // Close connection if still open
    if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
      state.ws.removeAllListeners();
      state.ws.terminate(); // Force close
    }

    // Check if we should reconnect
    const callbacks = this.subscriptions.get(key);
    if (callbacks && callbacks.size > 0 && state.retryCount < this.MAX_RETRY_ATTEMPTS) {
      this.scheduleReconnection(symbol, interval, key, state);
    } else {
      this.connections.delete(key);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnection(
    symbol: string,
    interval: string,
    key: string,
    state: ConnectionState,
  ): void {
    if (state.isReconnecting) {
      return; // Already scheduled
    }

    state.isReconnecting = true;
    state.retryCount++;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (max)
    const delay = Math.min(
      this.INITIAL_RETRY_DELAY * Math.pow(2, state.retryCount - 1),
      this.MAX_RETRY_DELAY,
    );

    this.logger.log(
      `🔄 Scheduling reconnection for ${key} (attempt ${state.retryCount}/${this.MAX_RETRY_ATTEMPTS}) in ${delay}ms`,
    );

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = undefined;
      
      // Check if still have subscribers before reconnecting
      const callbacks = this.subscriptions.get(key);
      if (callbacks && callbacks.size > 0) {
        this.createConnection(symbol, interval, key);
      } else {
        this.logger.log(`No subscribers left for ${key}, skipping reconnection`);
        this.connections.delete(key);
      }
    }, delay);
  }

  /**
   * Start ping/pong heartbeat to detect dead connections
   */
  private startHeartbeat(key: string, state: ConnectionState): void {
    // Clear existing interval if any
    if (state.pingInterval) {
      clearInterval(state.pingInterval);
    }

    state.pingInterval = setInterval(() => {
      if (state.ws.readyState === WebSocket.OPEN) {
        // Check if last pong was too long ago
        const timeSinceLastPong = Date.now() - state.lastPongTime;
        
        if (timeSinceLastPong > this.PING_INTERVAL + this.PONG_TIMEOUT) {
          this.logger.warn(`⚠️ No pong received for ${key}, connection might be dead`);
          state.ws.terminate(); // This will trigger 'close' event
          return;
        }

        // Send ping
        state.ws.ping();
      }
    }, this.PING_INTERVAL);
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
        const filteredTickers = parsed
          .filter((t: any) => this.quoteAssets.some((q) => t.s.endsWith(q)))
          .map((t: any) => ({
            symbol: t.s,
            priceChangePercent: t.P,
            lastPrice: t.c,
            highPrice: t.h,
            lowPrice: t.l,
            quoteVolume: t.q,
            baseAsset: this.getBaseAsset(t.s),
          }));

        callback(filteredTickers);
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
