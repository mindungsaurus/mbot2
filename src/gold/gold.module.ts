import { Module } from '@nestjs/common';
import { GoldController } from './gold.controller';
import { GoldService } from './gold.service';
import { GoldCommands } from './gold.commands';
import { PrismaClient } from '@prisma/client';

@Module({
  providers: [GoldService, GoldCommands, PrismaClient],
  exports: [GoldService, GoldCommands],
})
export class GoldModule {}
