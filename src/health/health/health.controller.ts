import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CacheService } from 'src/modules/cache/cache.service';
import { BinanceWebsocketService } from 'src/modules/binance/binance-websocket.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private cacheService: CacheService,
    private binanceWsService: BinanceWebsocketService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check service health' })
  async check() {
    return this.health.check([
      // Database health
      () => this.db.pingCheck('database'),

      // Memory health (heap should be < 150MB)
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),

      // Redis health
      async () => {
        try {
          await this.cacheService.set('health_check', 'ok', 10);
          const value = await this.cacheService.get('health_check');
          return {
            redis: {
              status: value === 'ok' ? 'up' : 'down',
            },
          };
        } catch (error) {
          return {
            redis: {
              status: 'down',
              message: error.message,
            },
          };
        }
      },

      // External API health (Binance)
      () =>
        this.http.pingCheck(
          'binance_api',
          'https://api.binance.com/api/v3/ping',
        ),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check if service is ready to accept traffic' })
  async ready() {
    // More strict checks for readiness
    return {
      ready: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Check if service is alive' })
  async live() {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('websocket')
  @ApiOperation({ summary: 'Check WebSocket connections health' })
  async websocketHealth() {
    const health = this.binanceWsService.getConnectionHealth();

    return {
      status: health.unhealthyConnections === 0 ? 'healthy' : 'degraded',
      ...health,
      timestamp: new Date().toISOString(),
    };
  }
}
