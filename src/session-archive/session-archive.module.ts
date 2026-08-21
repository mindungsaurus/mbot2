import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { SessionArchiveAiService } from './session-archive-ai.service';
import { SessionArchiveCollectionService } from './session-archive-collection.service';
import { SessionArchiveController } from './session-archive.controller';
import { SessionArchiveService } from './session-archive.service';

@Module({
  imports: [AuthModule],
  controllers: [SessionArchiveController],
  providers: [
    SessionArchiveService,
    SessionArchiveAiService,
    SessionArchiveCollectionService,
    PrismaClient,
  ],
  exports: [SessionArchiveService],
})
export class SessionArchiveModule {}
