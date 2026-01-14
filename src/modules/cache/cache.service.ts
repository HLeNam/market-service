import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly defaultTTL = 300; // 5 minutes

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST') || 'localhost',
      port: this.configService.get('REDIS_PORT') || 6379,
      password: this.configService.get('REDIS_PASSWORD'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(
    key: string,
    value: string,
    ttl: number = this.defaultTTL,
  ): Promise<void> {
    try {
      await this.redis.setex(key, ttl, value);
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}: ${error.message}`);
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}: ${error.message}`);
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      this.logger.error(
        `Cache delete pattern error for ${pattern}: ${error.message}`,
      );
    }
  }

  /**
   * Store candle history with sorted set for time-based queries
   */
  async storeCandleHistory(
    symbol: string,
    interval: string,
    candles: any[],
  ): Promise<void> {
    try {
      const key = `candles:${symbol}:${interval}`;
      const pipeline = this.redis.pipeline();

      // Store as sorted set with timestamp as score
      candles.forEach((candle) => {
        pipeline.zadd(key, candle.time, JSON.stringify(candle));
      });

      // Set expiry
      pipeline.expire(key, 3600); // 1 hour

      await pipeline.exec();
    } catch (error) {
      this.logger.error(`Error storing candle history: ${error.message}`);
    }
  }

  /**
   * Get candle history from cache
   */
  async getCandleHistory(
    symbol: string,
    interval: string,
    limit: number = 1000,
  ): Promise<any[]> {
    try {
      const key = `candles:${symbol}:${interval}`;

      // Get latest N candles
      const data = await this.redis.zrevrange(key, 0, limit - 1);

      return data.map((item) => JSON.parse(item)).reverse();
    } catch (error) {
      this.logger.error(`Error getting candle history: ${error.message}`);
      return [];
    }
  }

  /**
   * Add or update a single candle to the sorted set
   * Only store final candles to avoid duplicates
   */
  async addSingleCandle(
    symbol: string,
    interval: string,
    candle: any,
    maxCandles: number = 1000,
  ): Promise<void> {
    try {
      const key = `candles:${symbol}:${interval}`;
      const pipeline = this.redis.pipeline();

      // Add candle to sorted set (will update if timestamp exists)
      pipeline.zadd(key, candle.time, JSON.stringify(candle));

      // Keep only the latest N candles (remove old ones)
      // Keep maxCandles + 100 to avoid too frequent trimming
      const trimThreshold = maxCandles + 100;
      pipeline.zremrangebyrank(key, 0, -(trimThreshold + 1));

      // Refresh expiry
      pipeline.expire(key, 3600); // 1 hour

      await pipeline.exec();
    } catch (error) {
      this.logger.error(
        `Error adding single candle for ${symbol}:${interval}: ${error.message}`,
      );
    }
  }

  /**
   * Publish message to channel (for pub/sub)
   */
  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.redis.publish(channel, message);
    } catch (error) {
      this.logger.error(`Error publishing to ${channel}: ${error.message}`);
    }
  }

  /**
   * Subscribe to channel (for pub/sub)
   */
  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void> {
    try {
      const subscriber = this.redis.duplicate();
      await subscriber.subscribe(channel);

      subscriber.on('message', (ch, msg) => {
        if (ch === channel) {
          callback(msg);
        }
      });
    } catch (error) {
      this.logger.error(`Error subscribing to ${channel}: ${error.message}`);
    }
  }

  /**
   * Increment counter (for rate limiting, metrics)
   */
  async increment(key: string, ttl?: number): Promise<number> {
    try {
      const value = await this.redis.incr(key);
      if (ttl && value === 1) {
        await this.redis.expire(key, ttl);
      }
      return value;
    } catch (error) {
      this.logger.error(`Error incrementing ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    try {
      return await this.redis.mget(...keys);
    } catch (error) {
      this.logger.error(`Error getting multiple keys: ${error.message}`);
      return [];
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset(data: Record<string, string>): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      Object.entries(data).forEach(([key, value]) => {
        pipeline.set(key, value);
      });
      await pipeline.exec();
    } catch (error) {
      this.logger.error(`Error setting multiple keys: ${error.message}`);
    }
  }
}
