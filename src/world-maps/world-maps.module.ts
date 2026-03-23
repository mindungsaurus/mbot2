import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { WorldMapsController } from './world-maps.controller';
import { WorldMapsService } from './world-maps.service';

@Module({
  imports: [AuthModule],
  controllers: [WorldMapsController],
  providers: [WorldMapsService, PrismaClient],
  exports: [WorldMapsService],
})
export class WorldMapsModule {}
