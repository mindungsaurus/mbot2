import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ItemsTransactionsInfoDTO } from './ItemsTransactionsInfo-dto';
import { ItemsPublisher } from './items.publisher';
import { TextColor } from 'src/gold/gold.service';

@Controller('items')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly publisher: ItemsPublisher,
  ) {}

  private getNotifyChannels(channelId?: string) {
    const out = new Set<string>();
    const trimmed = (channelId ?? '').trim();
    if (trimmed) out.add(trimmed);
    const log = (process.env.ITEMS_LOG_CHANNEL_ID ?? '').trim();
    if (log) out.add(log);
    return [...out];
  }

  private async sendItemEvent(channelId: string | undefined, ansi: string) {
    const channels = this.getNotifyChannels(channelId);
    if (!channels.length) return;
    await this.publisher.sendAnsiToChannels(channels, ansi);
  }

  private buildRegisterAnsi(
    itemName: string,
    qualityLabel: string,
    type: string,
  ) {
    const white = this.items.ansiColor(TextColor.BOLD_WHITE);
    const blue = this.items.ansiColor(TextColor.BOLD_BLUE);
    const itemAnsi = this.items.formatItemNameAnsi(itemName, qualityLabel, blue);
    return [
      `${white} \u{1F4E6}\u{1F4CB} [\uc544\uc774\ud15c \uc815\ubcf4 \ub4f1\ub85d \uc774\ubca4\ud2b8 \ubc1c\uc0dd \uc54c\ub9bc]`,
      `${blue} ${type}${itemAnsi}${blue} \uc758 \uc815\ubcf4\uac00 DB\uc5d0 \ub4f1\ub85d\ub418\uc5c8\ub2e4.`,
    ].join('\n');
  }

  private buildAcquireAnsi(
    owner: string,
    itemName: string,
    qualityLabel: string,
    amount: number,
    unit: string,
  ) {
    const white = this.items.ansiColor(TextColor.BOLD_WHITE);
    const itemAnsi = this.items.formatItemNameAnsi(itemName, qualityLabel, white);
    return [
      `${white} \u{1F4E6} [\uc544\uc774\ud15c \ud68d\ub4dd \uc774\ubca4\ud2b8 \ubc1c\uc0dd \uc54c\ub9bc]`,
      `${white} \u300c${owner}\u300d, ${itemAnsi}${white} \uc744(\ub97c) ${amount}${unit}\ub9cc\ud07c \ud68d\ub4dd\ud558\uc600\ub2e4.`,
    ].join('\n');
  }

  private buildConsumeAnsi(
    owner: string,
    itemName: string,
    qualityLabel: string,
    amount: number,
    unit: string,
    remaining: number,
  ) {
    const white = this.items.ansiColor(TextColor.BOLD_WHITE);
    const gray = this.items.ansiColor(TextColor.BOLD_GRAY);
    const itemAnsi = this.items.formatItemNameAnsi(itemName, qualityLabel, white);
    const itemAnsiGray = this.items.formatItemNameAnsi(
      itemName,
      qualityLabel,
      gray,
    );
    return [
      `${white} \u{1F4E6} [\uc544\uc774\ud15c \uc18c\ubaa8 \uc774\ubca4\ud2b8 \ubc1c\uc0dd \uc54c\ub9bc]`,
      `${white} \u300c${owner}\u300d, ${itemAnsi}${white} (\uc744)\ub97c ${amount}${unit}\ub9cc\ud07c \uc18c\ubaa8\ud558\uc600\ub2e4.`,
      `${gray} \u300c${owner}\u300d, ${itemAnsiGray}${gray}\uc758 \ub0a8\uc740 \uc218\ub7c9: ${remaining}${unit}`,
    ].join('\n');
  }

  @Get('inventory/:owner')
  @UseGuards(AuthGuard)
  async listInventory(@Param('owner') owner: string) {
    const name = (owner ?? '').trim();
    if (!name) {
      throw new BadRequestException('owner required');
    }
    return this.items.ListInventory(name);
  }

  @Get('catalog')
  @UseGuards(AuthGuard)
  async listCatalog() {
    return this.items.ListItemCatalog();
  }

  @Post('catalog/add')
  @UseGuards(AuthGuard, AdminGuard)
  async addCatalog(
    @Body()
    body: {
      itemName?: string;
      quality?: string;
      type?: string;
      unit?: string;
      channelId?: string;
    },
  ) {
    const itemName = (body?.itemName ?? '').trim();
    const quality = (body?.quality ?? '').trim();
    const type = (body?.type ?? '').trim();
    const unit = (body?.unit ?? '').trim();
    const channelId = (body?.channelId ?? '').trim();
    if (!itemName) throw new BadRequestException('item name required');
    if (!quality) throw new BadRequestException('item quality required');
    if (!type) throw new BadRequestException('item type required');
    if (!unit) throw new BadRequestException('item unit required');

    const payload: ItemsTransactionsInfoDTO = {
      owner: 'system',
      amount: 1,
      item_name: itemName,
      item_quality: quality,
      item_type: type,
      item_unit: unit,
    };
    await this.items.AddItemInfo(payload);
    const ansi = this.buildRegisterAnsi(itemName, quality, type);
    await this.sendItemEvent(channelId, ansi);
    return { ok: true };
  }

  @Post('inventory/add')
  @UseGuards(AuthGuard, AdminGuard)
  async addInventory(
    @Body()
    body: {
      owner?: string;
      itemName?: string;
      amount?: number;
      channelId?: string;
    },
  ) {
    const owner = (body?.owner ?? '').trim();
    const itemName = (body?.itemName ?? '').trim();
    const amount = Math.trunc(Number(body?.amount ?? 0));
    const channelId = (body?.channelId ?? '').trim();
    if (!owner) throw new BadRequestException('owner required');
    if (!itemName) throw new BadRequestException('item name required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }
    await this.items.AddItemInventory(owner, itemName, amount);
    const meta = await this.items.getItemMeta(itemName);
    const ansi = this.buildAcquireAnsi(
      owner,
      itemName,
      meta.qualityLabel || '',
      amount,
      meta.unit || '',
    );
    await this.sendItemEvent(channelId, ansi);
    return { ok: true };
  }

  @Post('inventory/use')
  @UseGuards(AuthGuard, AdminGuard)
  async useInventory(
    @Body()
    body: {
      owner?: string;
      itemName?: string;
      amount?: number;
      channelId?: string;
    },
  ) {
    const owner = (body?.owner ?? '').trim();
    const itemName = (body?.itemName ?? '').trim();
    const amount = Math.trunc(Number(body?.amount ?? 0));
    const channelId = (body?.channelId ?? '').trim();
    if (!owner) throw new BadRequestException('owner required');
    if (!itemName) throw new BadRequestException('item name required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }
    const res = await this.items.RemoveItemInventory(owner, itemName, amount);
    const meta = await this.items.getItemMeta(itemName);
    const ansi = this.buildConsumeAnsi(
      owner,
      itemName,
      meta.qualityLabel || '',
      amount,
      meta.unit || '',
      res.remaining ?? 0,
    );
    await this.sendItemEvent(channelId, ansi);
    return { ok: true };
  }
}

