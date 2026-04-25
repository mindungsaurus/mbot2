import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NecordModule } from 'necord';
import { IntentsBitField } from 'discord.js';
import { GoldModule } from './gold/gold.module';
import { ItemsModule } from './items/items.module';
import { DiceModule } from './dice/dice.module';
import { EncounterModule } from './encounter/encounter.module';
import { AuthModule } from './auth/auth.module';
import { UnitPresetsModule } from './unit-presets/unit-presets.module';
import { TagPresetsModule } from './tag-presets/tag-presets.module';
import { WorldMapsModule } from './world-maps/world-maps.module';

function isDiscordBotEnabled() {
  const raw = String(process.env.DISCORD_BOT_ENABLED ?? 'true')
    .trim()
    .toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'no';
}

@Module({
  imports: [
    ...(isDiscordBotEnabled()
      ? [
          NecordModule.forRoot({
            token: process.env.DISCORD_TOKEN ?? '',
            intents: [
              IntentsBitField.Flags.Guilds,
              IntentsBitField.Flags.GuildMessages,
              IntentsBitField.Flags.MessageContent,
            ],
            development: ['1284642997375336592', '1273347630767804539'],
          }),
        ]
      : []),
    GoldModule,
    ItemsModule,
    DiceModule,
    AuthModule,
    EncounterModule,
    UnitPresetsModule,
    TagPresetsModule,
    WorldMapsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
