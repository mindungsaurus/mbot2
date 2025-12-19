import { Module } from '@nestjs/common';
import { DiceService } from './dice.service';
import { DiceCommands } from './dice.commands';
import { GoldService } from 'src/gold/gold.service';
import { GoldModule } from 'src/gold/gold.module';

@Module({
  imports: [GoldModule],
  providers: [DiceService, DiceCommands],
  exports: [DiceService, DiceCommands],
})
export class DiceModule {}
