import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { CustomValidationPipe } from 'src/common/pipes/validation.pipe';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { AllExceptionsFilter } from 'src/common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { ValidationExceptionFilter } from 'src/common/filters/validation-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedisIoAdapter } from 'src/adapters/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  const configService = app.get(ConfigService);

  // Redis adapter for WebSocket scaling
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Global pipes
  app.useGlobalPipes(new CustomValidationPipe());

  // Global interceptors
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global filters (order matters!)
  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new HttpExceptionFilter(),
    new ValidationExceptionFilter(),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('Market Service API')
    .setDescription('Real-time crypto market data service')
    .setVersion('1.0')
    .addTag('market')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/api/docs', app, documentFactory, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customCssUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-bundle.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-standalone-preset.min.js',
    ],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  const port = configService.get('PORT') || 3001;
  await app.listen(port);

  console.log(`Market Service running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
