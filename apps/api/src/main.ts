import compression = require('compression');
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // 10 MB covers the largest real session snapshots (~1500 invoices × 20 lines); must be before NestJS bodyParser
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));
  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('API_PREFIX', 'api');
  const webOrigins = config
    .get<string>('WEB_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix(apiPrefix);
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: webOrigins,
    credentials: false
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  );
  app.enableShutdownHooks();

  await app.listen(config.get<number>('PORT', 4010));
}

void bootstrap();
