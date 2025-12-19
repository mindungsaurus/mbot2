import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NecordModule } from 'necord';
import { IntentsBitField } from 'discord.js';
import { GoldModule } from './gold/gold.module';
import { ItemsModule } from './items/items.module';
import { DiceModule } from './dice/dice.module';

@Module({
  imports: [
    NecordModule.forRoot({
      token: process.env.DISCORD_TOKEN ?? '',
      intents: [IntentsBitField.Flags.Guilds],
      development: ['1284642997375336592', '1273347630767804539'],
    }),
    GoldModule,
    ItemsModule,
    DiceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
