import { Module } from '@nestjs/common';
import { EncounterController } from './encounter.controller';
import { EncounterService } from './encounter.service';
import { EncounterPublisher } from './encounter.publisher';
import { EncounterStore } from './encounter.store';

@Module({
  controllers: [EncounterController],
  providers: [EncounterService, EncounterPublisher, EncounterStore],
  exports: [EncounterService],
})
export class EncounterModule {}
