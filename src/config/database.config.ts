import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isProduction = configService.get('NODE_ENV') === 'production';

  return {
    type: 'postgres',
    host: configService.get('DATABASE_HOST'),
    port: configService.get<number>('DATABASE_PORT'),
    username: configService.get('DATABASE_USERNAME'),
    password: configService.get('DATABASE_PASSWORD'),
    database: configService.get('DATABASE_NAME'),

    // Entities
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],

    // Migrations
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsTableName: 'migrations',
    migrationsRun: false, // Run manually for safety

    // Synchronization (only in development)
    synchronize: configService.get<boolean>('DATABASE_SYNC') && !isProduction,

    // Logging
    logging: configService.get<boolean>('DATABASE_LOGGING'),
    logger: 'advanced-console',

    // Connection pool settings
    extra: {
      max: 20, // Maximum pool size
      min: 5, // Minimum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },

    // Retry connection
    retryAttempts: 10,
    retryDelay: 3000,

    // Auto load entities
    autoLoadEntities: true,

    // SSL for production
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  };
};
