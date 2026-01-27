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

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

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
    body: { itemName?: string; quality?: string; type?: string; unit?: string },
  ) {
    const itemName = (body?.itemName ?? '').trim();
    const quality = (body?.quality ?? '').trim();
    const type = (body?.type ?? '').trim();
    const unit = (body?.unit ?? '').trim();
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
    return { ok: true };
  }

  @Post('inventory/add')
  @UseGuards(AuthGuard, AdminGuard)
  async addInventory(
    @Body()
    body: { owner?: string; itemName?: string; amount?: number },
  ) {
    const owner = (body?.owner ?? '').trim();
    const itemName = (body?.itemName ?? '').trim();
    const amount = Math.trunc(Number(body?.amount ?? 0));
    if (!owner) throw new BadRequestException('owner required');
    if (!itemName) throw new BadRequestException('item name required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }
    await this.items.AddItemInventory(owner, itemName, amount);
    return { ok: true };
  }

  @Post('inventory/use')
  @UseGuards(AuthGuard, AdminGuard)
  async useInventory(
    @Body()
    body: { owner?: string; itemName?: string; amount?: number },
  ) {
    const owner = (body?.owner ?? '').trim();
    const itemName = (body?.itemName ?? '').trim();
    const amount = Math.trunc(Number(body?.amount ?? 0));
    if (!owner) throw new BadRequestException('owner required');
    if (!itemName) throw new BadRequestException('item name required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }
    await this.items.RemoveItemInventory(owner, itemName, amount);
    return { ok: true };
  }
}

