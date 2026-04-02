import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Files Assistant API')
    .setDescription(
      'AI-powered files assistant -- upload, search, and chat with your documents',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('BACKEND_PORT', 3000);
  const grpcPort = configService.get<number>('GRPC_PORT', 5050);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isDevelopment = nodeEnv === 'development';
  const allowedOriginsRaw = configService.get<string>(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:4300,http://localhost:4200',
  );
  const configuredOrigins = allowedOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localhostDevOrigins = isDevelopment
    ? [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
    : [];

  app.enableCors({
    origin: [...configuredOrigins, ...localhostDevOrigins],
    credentials: true,
  });
  logger.log(
    `CORS enabled for configured origins: ${configuredOrigins.join(', ')}`,
  );
  if (isDevelopment) {
    logger.log('CORS development mode: allowing localhost and 127.0.0.1 ports');
  }

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'chatstream',
      protoPath: join(__dirname, '../../../libs/proto/chat-stream.proto'),
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  await app.startAllMicroservices();
  await app.listen(port);
  logger.log(`Backend HTTP listening on :${port}`);
  logger.log(`Backend gRPC listening on :${grpcPort}`);
}

bootstrap();
