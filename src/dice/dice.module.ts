import { Module } from '@nestjs/common';
import { DiceService } from './dice.service';
import { DiceCommands } from './dice.commands';
import { GoldService } from 'src/gold/gold.service';
import { GoldModule } from 'src/gold/gold.module';
import { DiceSearchService } from './dice.search.service';
import { PrismaClient } from '@prisma/client';

@Module({
  imports: [GoldModule],
  providers: [
    DiceService,
    DiceCommands,
    DiceSearchService,
    {
      provide: PrismaClient,
      useFactory: () => new PrismaClient(),
    },
  ],
  exports: [DiceService, DiceCommands, DiceSearchService],
})
export class DiceModule {}
