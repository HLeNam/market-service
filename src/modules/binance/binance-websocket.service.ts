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
  private readonly wsBase: string;
  private readonly quoteAssets: string[];

  // Connection management
  private connections = new Map<string, ConnectionState>();
  private subscriptions = new Map<string, Map<string, SubscriptionCallback>>();
  private allTickersSubscribers = new Map<string, (tickers: any[]) => void>(); // clientId -> callback

  // Configuration
  private readonly MAX_RETRY_ATTEMPTS: number;
  private readonly INITIAL_RETRY_DELAY: number;
  private readonly MAX_RETRY_DELAY: number;
  private readonly PING_INTERVAL: number;
  private readonly PONG_TIMEOUT: number;

  constructor(
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => MarketService))
    private readonly marketService: MarketService,
    private readonly configService: ConfigService,
  ) {
    // Initialize WebSocket base URL
    this.wsBase =
      this.configService.get<string>('BINANCE_WS_URL') ||
      'wss://stream.binance.com:9443';

    // Initialize WebSocket configuration
    this.MAX_RETRY_ATTEMPTS =
      this.configService.get<number>('WS_MAX_RETRY_ATTEMPTS') || 10;
    this.INITIAL_RETRY_DELAY =
      this.configService.get<number>('WS_INITIAL_RETRY_DELAY') || 1000;
    this.MAX_RETRY_DELAY =
      this.configService.get<number>('WS_MAX_RETRY_DELAY') || 60000;
    this.PING_INTERVAL =
      this.configService.get<number>('WS_PING_INTERVAL') || 30000;
    this.PONG_TIMEOUT =
      this.configService.get<number>('WS_PONG_TIMEOUT') || 10000;

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
    this.allTickersSubscribers.clear();

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
    clientId: string,
    onCandle: (data: any) => void,
    onTicker?: (data: any) => void,
  ): Promise<void> {
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
  }

  async unsubscribe(
    symbol: string,
    clientId: string,
    interval?: string,
  ): Promise<void> {
    this.subscriptions.forEach((clients, key) => {
      // If interval is specified, only unsubscribe from that specific symbol:interval
      // Otherwise, unsubscribe from all subscriptions for this symbol
      const shouldUnsubscribe = interval
        ? key === `${symbol}:${interval}`
        : key.startsWith(`${symbol}:`);

      if (shouldUnsubscribe) {
        clients.delete(clientId);

        // Close connection if no more subscribers
        if (clients.size === 0) {
          const state = this.connections.get(key);
          if (state) {
            this.cleanupConnection(key, state);
            this.connections.delete(key);
            this.subscriptions.delete(key);
            this.logger.log(
              `Closed WebSocket for ${key} (no more subscribers)`,
            );
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
      this.logger.log(`WebSocket connected for ${key}`);
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
        this.logger.error(
          `WebSocket message parse error for ${key}: ${err.message}`,
        );
      }
    });

    ws.on('pong', () => {
      state.lastPongTime = Date.now();
    });

    ws.on('error', (error) => {
      this.logger.error(`WebSocket error for ${key}: ${error.message}`);

      // Cleanup and attempt reconnection
      this.handleConnectionFailure(symbol, interval, key, state);
    });

    ws.on('close', (code, reason) => {
      this.logger.warn(
        `WebSocket closed for ${key} - Code: ${code}, Reason: ${reason || 'Unknown'}`,
      );

      // Cleanup timers
      if (state.pingInterval) {
        clearInterval(state.pingInterval);
        state.pingInterval = undefined;
      }

      // Attempt reconnection if there are still subscribers
      const callbacks = this.subscriptions.get(key);
      if (
        callbacks &&
        callbacks.size > 0 &&
        state.retryCount < this.MAX_RETRY_ATTEMPTS
      ) {
        this.scheduleReconnection(symbol, interval, key, state);
      } else {
        this.connections.delete(key);
        if (state.retryCount >= this.MAX_RETRY_ATTEMPTS) {
          this.logger.error(`Max retry attempts reached for ${key}, giving up`);
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
    if (
      state.ws.readyState === WebSocket.OPEN ||
      state.ws.readyState === WebSocket.CONNECTING
    ) {
      state.ws.removeAllListeners();
      state.ws.terminate(); // Force close
    }

    // Check if we should reconnect
    const callbacks = this.subscriptions.get(key);
    if (
      callbacks &&
      callbacks.size > 0 &&
      state.retryCount < this.MAX_RETRY_ATTEMPTS
    ) {
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
      `Scheduling reconnection for ${key} (attempt ${state.retryCount}/${this.MAX_RETRY_ATTEMPTS}) in ${delay}ms`,
    );

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = undefined;

      // Check if still have subscribers before reconnecting
      const callbacks = this.subscriptions.get(key);
      if (callbacks && callbacks.size > 0) {
        this.createConnection(symbol, interval, key);
      } else {
        this.logger.log(
          `No subscribers left for ${key}, skipping reconnection`,
        );
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
          this.logger.warn(
            `No pong received for ${key}, connection might be dead`,
          );
          state.ws.terminate(); // This will trigger 'close' event
          return;
        }

        // Send ping
        state.ws.ping();
      }
    }, this.PING_INTERVAL);
  }

  async subscribeAllTickers(
    clientId: string,
    callback: (tickers: any[]) => void,
  ): Promise<void> {
    const key = 'all-tickers';

    // Add this client to all tickers subscribers
    this.allTickersSubscribers.set(clientId, callback);

    // If connection already exists and is healthy, just return
    const existingState = this.connections.get(key);
    if (
      existingState &&
      existingState.ws.readyState === WebSocket.OPEN &&
      !existingState.isReconnecting
    ) {
      this.logger.log(
        `Client ${clientId} added to existing all tickers stream`,
      );
      return;
    }

    // If already reconnecting, don't create duplicate
    if (existingState?.isReconnecting) {
      this.logger.log(
        `All tickers stream is reconnecting, added client ${clientId}`,
      );
      return;
    }

    // Create new connection
    await this.createAllTickersConnection();
  }

  private async createAllTickersConnection(): Promise<void> {
    const key = 'all-tickers';

    const ws = new WebSocket(`${this.wsBase}/ws/!ticker@arr`);

    const state: ConnectionState = {
      ws,
      retryCount: 0,
      isReconnecting: false,
      lastPongTime: Date.now(),
    };

    this.connections.set(key, state);

    ws.on('open', () => {
      this.logger.log('Connected to all tickers stream');
      state.retryCount = 0;
      state.isReconnecting = false;

      // Start heartbeat
      this.startHeartbeat(key, state);
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

        // Broadcast to all subscribed clients
        this.allTickersSubscribers.forEach((callback) => {
          callback(filteredTickers);
        });
      } catch (err) {
        this.logger.error(`All tickers parse error: ${err.message}`);
      }
    });

    ws.on('pong', () => {
      state.lastPongTime = Date.now();
    });

    ws.on('error', (error) => {
      this.logger.error(`All tickers WebSocket error: ${error.message}`);

      // Cleanup and reconnect
      if (state.pingInterval) {
        clearInterval(state.pingInterval);
        state.pingInterval = undefined;
      }

      if (
        state.ws.readyState === WebSocket.OPEN ||
        state.ws.readyState === WebSocket.CONNECTING
      ) {
        state.ws.removeAllListeners();
        state.ws.terminate();
      }

      // Reconnect if there are still subscribers
      if (
        this.allTickersSubscribers.size > 0 &&
        state.retryCount < this.MAX_RETRY_ATTEMPTS
      ) {
        this.scheduleAllTickersReconnection(state);
      } else {
        this.connections.delete(key);
      }
    });

    ws.on('close', (code, reason) => {
      this.logger.warn(
        `All tickers WebSocket closed - Code: ${code}, Reason: ${reason || 'Unknown'}`,
      );

      if (state.pingInterval) {
        clearInterval(state.pingInterval);
        state.pingInterval = undefined;
      }

      // Reconnect if there are still subscribers
      if (
        this.allTickersSubscribers.size > 0 &&
        state.retryCount < this.MAX_RETRY_ATTEMPTS
      ) {
        this.scheduleAllTickersReconnection(state);
      } else {
        this.connections.delete(key);
      }
    });
  }

  /**
   * Schedule reconnection for all tickers stream
   */
  private scheduleAllTickersReconnection(state: ConnectionState): void {
    if (state.isReconnecting) {
      return;
    }

    state.isReconnecting = true;
    state.retryCount++;

    const delay = Math.min(
      this.INITIAL_RETRY_DELAY * Math.pow(2, state.retryCount - 1),
      this.MAX_RETRY_DELAY,
    );

    this.logger.log(
      `Reconnecting all tickers stream (attempt ${state.retryCount}/${this.MAX_RETRY_ATTEMPTS}) in ${delay}ms`,
    );

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = undefined;

      // Only reconnect if there are still subscribers
      if (this.allTickersSubscribers.size > 0) {
        this.connections.delete('all-tickers');
        this.createAllTickersConnection();
      }
    }, delay);
  }

  /**
   * Unsubscribe client from all tickers
   */
  async unsubscribeAllTickers(clientId: string): Promise<void> {
    this.allTickersSubscribers.delete(clientId);

    // If no more subscribers, close connection
    if (this.allTickersSubscribers.size === 0) {
      const state = this.connections.get('all-tickers');
      if (state) {
        this.cleanupConnection('all-tickers', state);
        this.connections.delete('all-tickers');
        this.logger.log('Closed all tickers WebSocket (no more subscribers)');
      }
    }
  }

  /**
   * Get connection health status
   */
  getConnectionHealth(): {
    totalConnections: number;
    healthyConnections: number;
    unhealthyConnections: number;
    connections: Array<{
      key: string;
      retryCount: number;
      isReconnecting: boolean;
      lastPongAge: number;
      subscriberCount: number;
    }>;
  } {
    const connections: Array<any> = [];
    let healthyCount = 0;
    let unhealthyCount = 0;

    this.connections.forEach((state, key) => {
      const timeSinceLastPong = Date.now() - state.lastPongTime;
      const isHealthy =
        state.ws.readyState === WebSocket.OPEN &&
        !state.isReconnecting &&
        timeSinceLastPong < this.PING_INTERVAL + this.PONG_TIMEOUT;

      if (isHealthy) {
        healthyCount++;
      } else {
        unhealthyCount++;
      }

      connections.push({
        key,
        retryCount: state.retryCount,
        isReconnecting: state.isReconnecting,
        lastPongAge: timeSinceLastPong,
        subscriberCount: this.subscriptions.get(key)?.size || 0,
      });
    });

    return {
      totalConnections: this.connections.size,
      healthyConnections: healthyCount,
      unhealthyConnections: unhealthyCount,
      connections,
    };
  }
}
