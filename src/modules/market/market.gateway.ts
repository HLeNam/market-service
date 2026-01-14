import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { BinanceWebsocketService } from '../binance/binance-websocket.service';
import { CacheService } from '../cache/cache.service';

interface SubscriptionData {
  symbol: string;
  interval: string;
}

@WebSocketGateway({
  namespace: '/market',
  cors: { origin: '*' },
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MarketGateway.name);
  private clientSubscriptions = new Map<string, Set<string>>(); // clientId -> Set of symbols

  constructor(
    private readonly binanceWs: BinanceWebsocketService,
    private readonly cacheService: CacheService,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());

    // Send connection confirmation
    client.emit('connected', {
      clientId: client.id,
      timestamp: Date.now(),
    });
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Cleanup subscriptions
    const subscriptions = this.clientSubscriptions.get(client.id);
    if (subscriptions) {
      for (const symbol of subscriptions) {
        await this.binanceWs.unsubscribe(symbol, client.id);
      }
      this.clientSubscriptions.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SubscriptionData,
  ) {
    const { symbol, interval } = data;

    try {
      // Add to client's subscription list
      const subscriptions = this.clientSubscriptions.get(client.id);
      subscriptions?.add(symbol);

      // Subscribe to Binance WebSocket
      await this.binanceWs.subscribe(
        symbol,
        interval,
        (candle) => {
          // Emit candle update to this specific client
          client.emit('candle-update', {
            symbol,
            interval,
            data: candle,
          });
        },
        (ticker) => {
          // Emit ticker update to this specific client
          client.emit('ticker-update', {
            symbol,
            data: ticker,
          });
        },
      );

      // Send historical data from cache
      const historicalData = await this.cacheService.getCandleHistory(
        symbol,
        interval,
      );

      client.emit('historical-data', {
        symbol,
        interval,
        data: historicalData,
      });

      this.logger.log(
        `Client ${client.id} subscribed to ${symbol}/${interval}`,
      );
    } catch (error) {
      this.logger.error(`Subscription error: ${error.message}`);
      client.emit('error', {
        message: 'Failed to subscribe',
        error: error.message,
      });
    }
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string },
  ) {
    const { symbol } = data;

    try {
      const subscriptions = this.clientSubscriptions.get(client.id);
      subscriptions?.delete(symbol);

      await this.binanceWs.unsubscribe(symbol, client.id);

      this.logger.log(`Client ${client.id} unsubscribed from ${symbol}`);
    } catch (error) {
      this.logger.error(`Unsubscription error: ${error.message}`);
    }
  }

  @SubscribeMessage('subscribe-all-tickers')
  async handleSubscribeAllTickers(@ConnectedSocket() client: Socket) {
    try {
      await this.binanceWs.subscribeAllTickers((tickers) => {
        client.emit('all-tickers-update', { data: tickers });
      });

      this.logger.log(`Client ${client.id} subscribed to all tickers`);
    } catch (error) {
      this.logger.error(`All tickers subscription error: ${error.message}`);
      client.emit('error', {
        message: 'Failed to subscribe to all tickers',
        error: error.message,
      });
    }
  }

  // Broadcast to all clients in a room
  broadcastToSymbol(symbol: string, event: string, data: any) {
    this.server.to(symbol).emit(event, data);
  }

  // Broadcast to all connected clients
  broadcastToAll(event: string, data: any) {
    this.server.emit(event, data);
  }
}
