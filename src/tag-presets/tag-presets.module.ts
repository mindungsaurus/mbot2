import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { TagPresetsController } from './tag-presets.controller';
import { TagPresetsService } from './tag-presets.service';

@Module({
  imports: [AuthModule],
  controllers: [TagPresetsController],
  providers: [TagPresetsService, PrismaClient],
})
export class TagPresetsModule {}
