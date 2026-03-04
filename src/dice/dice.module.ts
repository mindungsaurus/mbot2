import { Module } from '@nestjs/common';
import { DiceService } from './dice.service';
import { DiceCommands } from './dice.commands';
import { GoldService } from 'src/gold/gold.service';
import { GoldModule } from 'src/gold/gold.module';
import { DiceSearchService } from './dice.search.service';

@Module({
  imports: [GoldModule],
  providers: [DiceService, DiceCommands, DiceSearchService],
  exports: [DiceService, DiceCommands, DiceSearchService],
})
export class DiceModule {}
