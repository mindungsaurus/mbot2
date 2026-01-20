import { Module } from '@nestjs/common';
import { ItemsService } from './items.service';
import { PrismaClient } from '@prisma/client';
import { ItemsCommands } from './items.commands';
import { GoldService } from 'src/gold/gold.service';
import { ItemsComponents } from './items.components';
import { ItemsController } from './items.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ItemsController],
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
