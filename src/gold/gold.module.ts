import { Module } from '@nestjs/common';
import { GoldController } from './gold.controller';
import { GoldService } from './gold.service';
import { GoldCommands } from './gold.commands';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [GoldController],
  providers: [GoldService, GoldCommands, PrismaClient],
  exports: [GoldService, GoldCommands],
})
export class GoldModule {}
