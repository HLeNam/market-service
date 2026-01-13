import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        // Application
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test', 'staging')
          .default('development'),
        PORT: Joi.number().default(3001),

        // Database
        DATABASE_TYPE: Joi.string().default('postgres'),
        DATABASE_HOST: Joi.string().default('localhost'),
        DATABASE_PORT: Joi.number().default(5432),
        DATABASE_USERNAME: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        DATABASE_SYNC: Joi.boolean().default(false),
        DATABASE_LOGGING: Joi.boolean().default(false),

        // Redis
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').optional(),
        REDIS_URL: Joi.string().optional(),

        // External Services
        NEWS_SERVICE_URL: Joi.string().uri().optional(),
        AI_SERVICE_URL: Joi.string().uri().optional(),
        AUTH_SERVICE_URL: Joi.string().uri().optional(),

        // Binance API
        BINANCE_API_URL: Joi.string()
          .uri()
          .default('https://api.binance.com/api/v3'),
        BINANCE_WS_URL: Joi.string().default('wss://stream.binance.com:9443'),

        // Rate Limiting
        THROTTLE_TTL: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(100),

        // JWT (optional)
        JWT_SECRET: Joi.string().optional(),
        JWT_EXPIRATION: Joi.string().default('1d'),

        // Logging
        LOG_LEVEL: Joi.string()
          .valid('error', 'warn', 'info', 'debug', 'verbose')
          .default('info'),
      }),
      validationOptions: {
        abortEarly: false,
      },
    }),
  ],
})
export class ConfigModule {}
