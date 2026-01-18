import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { UnitPresetsController } from './unit-presets.controller';
import { UnitPresetsService } from './unit-presets.service';

@Module({
  imports: [AuthModule],
  controllers: [UnitPresetsController],
  providers: [UnitPresetsService, PrismaClient],
})
export class UnitPresetsModule {}
