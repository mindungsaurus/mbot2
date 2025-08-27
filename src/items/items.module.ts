import { Module } from '@nestjs/common';
import { ItemsService } from './items.service';
import { PrismaClient } from '@prisma/client';
import { ItemsCommands } from './items.commands';
import { GoldService } from 'src/gold/gold.service';
import { ItemsComponents } from './items.components';

@Module({
  providers: [
    ItemsService,
    ItemsCommands,
    {
      provide: PrismaClient,
      useFactory: () => new PrismaClient(),
    },
    GoldService,
    ItemsComponents,
  ],
  exports: [ItemsService, ItemsCommands, GoldService, ItemsComponents],
})
export class ItemsModule {}
