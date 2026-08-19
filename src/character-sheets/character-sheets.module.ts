import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { CharacterSheetsController } from './character-sheets.controller';
import { CharacterSheetsService } from './character-sheets.service';

@Module({
  imports: [AuthModule],
  controllers: [CharacterSheetsController],
  providers: [CharacterSheetsService, PrismaClient],
  exports: [CharacterSheetsService],
})
export class CharacterSheetsModule {}
