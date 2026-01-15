import { Module } from '@nestjs/common';
import { EncounterController } from './encounter.controller';
import { EncounterService } from './encounter.service';
import { EncounterPublisher } from './encounter.publisher';
import { AuthModule } from '../auth/auth.module';
import { PrismaClient } from '@prisma/client';

@Module({
  imports: [AuthModule],
  controllers: [EncounterController],
  providers: [EncounterService, EncounterPublisher, PrismaClient],
  exports: [EncounterService],
})
export class EncounterModule {}
