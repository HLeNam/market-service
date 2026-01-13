import { BullModuleOptions } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

export const redisConfig = (
  configService: ConfigService,
): BullModuleOptions => {
  const redisUrl = configService.get('REDIS_URL') as string;

  if (redisUrl) {
    return {
      url: redisUrl,
      redis: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    };
  }

  return {
    redis: {
      host: (configService.get('REDIS_HOST') as string) || 'localhost',
      port: configService.get<number>('REDIS_PORT') || 6379,
      password: (configService.get('REDIS_PASSWORD') as string) || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    },
  };
};
