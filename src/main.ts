import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { static as serveStatic } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((req: any, res: any, next: any) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs < 1000) return;
      const path = String(req.originalUrl ?? req.url ?? '');
      console.log(
        `[http-slow] ${req.method} ${path} -> ${res.statusCode} (${elapsedMs}ms)`,
      );
    });
    next();
  });
  const uploadRoot = join(process.cwd(), 'data', 'world-maps', 'assets');
  if (!existsSync(uploadRoot)) {
    mkdirSync(uploadRoot, { recursive: true });
  }
  app.use('/uploads/world-maps', serveStatic(uploadRoot));
  app.enableCors({
    origin: ['http://localhost:5173', 'https://mbot-gui.vercel.app'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
bootstrap();
