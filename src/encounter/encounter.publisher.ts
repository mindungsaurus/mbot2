import { Injectable } from '@nestjs/common';
import { ChannelType, Client, TextChannel } from 'discord.js';

@Injectable()
export class EncounterPublisher {
  constructor(private readonly client: Client) {} // ✅ Necord가 제공하는 Client Provider :contentReference[oaicite:1]{index=1}

  async sendAnsiToChannel(channelId: string, ansiText: string) {
    if (!channelId) throw new Error('COMBAT_DISCORD_CHANNEL_ID is required');

    const channel = await this.client.channels.fetch(channelId);
    if (!channel) throw new Error(`channel not found: ${channelId}`);
    if (channel.type !== ChannelType.GuildText)
      throw new Error(`not a guild text channel: ${channelId}`);

    const text = channel as TextChannel;

    // Discord 2000자 제한 대응: 줄 기준으로 쪼개서 여러 메시지로 보내기
    for (const part of chunkByLines(ansiText, 1800)) {
      await text.send(wrapAnsi(part)); // ✅ 항상 "새 메시지"
    }
  }
}

function wrapAnsi(s: string) {
  return `\`\`\`ansi\n${s}\n\`\`\``;
}

function chunkByLines(s: string, maxLen: number): string[] {
  if (s.length <= maxLen) return [s];

  const lines = s.split('\n');
  const out: string[] = [];
  let cur = '';

  for (const line of lines) {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length > maxLen) {
      if (cur) out.push(cur);
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}
