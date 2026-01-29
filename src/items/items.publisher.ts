import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, Client, TextChannel } from 'discord.js';

@Injectable()
export class ItemsPublisher {
  private readonly logger = new Logger(ItemsPublisher.name);
  constructor(private readonly client: Client) {}

  async sendAnsiToChannel(channelId: string, ansiText: string) {
    if (!channelId) return;

    const channel = await this.client.channels.fetch(channelId);
    if (!channel) throw new Error(`channel not found: ${channelId}`);
    if (channel.type !== ChannelType.GuildText)
      throw new Error(`not a guild text channel: ${channelId}`);

    const text = channel as TextChannel;

    for (const part of chunkByLines(ansiText, 1800)) {
      await text.send(wrapAnsi(part));
    }
  }

  async sendAnsiToChannels(channelIds: string[], ansiText: string) {
    const uniq = [...new Set(channelIds.filter((id) => !!id))];
    for (const id of uniq) {
      try {
        await this.sendAnsiToChannel(id, ansiText);
      } catch (err: any) {
        this.logger.warn(
          `Failed to send item event to ${id}: ${err?.message ?? err}`,
        );
      }
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
