import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { static as serveStatic } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadRoot = join(process.cwd(), 'data', 'world-maps', 'assets');
  if (!existsSync(uploadRoot)) {
    mkdirSync(uploadRoot, { recursive: true });
  }
  app.use('/uploads/world-maps', serveStatic(uploadRoot));
  app.enableCors({
    origin: ['http://localhost:5173', 'https://mbot-gui.vercel.app'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
