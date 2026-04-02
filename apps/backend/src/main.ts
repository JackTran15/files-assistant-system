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
  const allowedOriginsRaw = configService.get<string>(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:4300,http://localhost:4200',
  );
  const allowedOrigins = allowedOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  logger.log(`CORS enabled for origins: ${allowedOrigins.join(', ')}`);

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
