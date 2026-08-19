import { Injectable } from '@nestjs/common';
import { Button, ComponentParam, Context } from 'necord';
import type { ButtonContext } from 'necord';
import {
  GiveResult,
  InventorySearchResult,
  ItemsService,
} from './items.service';
import { Inject } from '@nestjs/common';
import { GoldService, TextColor } from 'src/gold/gold.service';
import { Logger } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Ctx, Modal } from 'necord';
import type { ModalContext } from 'necord';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

type Parsed = {
  itemName: string;
  owner: string;
  amount: number;
  quality: string;
  unit: string;
};

type ParsedInfo = {
  itemName: string;
  quality: string;
  type: string;
};

export function parseFirstLine(content: string): Parsed {
  const nl = content.indexOf('\n');
  let line = nl === -1 ? content : content.slice(0, nl);
  if (line.endsWith('\r')) line = line.slice(0, -1);
  line = line.trim();

  const m =
    /^-#\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([-+]?\d+)\s*,\s*([^,]+?)\s*,\s*([^,]+?)\s*$/u.exec(
      line,
    );
  if (!m) throw new BadRequestException('파싱 형식이 올바르지 않습니다.');

  let [, itemName, owner, amountStr, quality, unit] = m;
  itemName = itemName.trim();
  owner = owner.trim();
  quality = quality.trim();
  unit = unit.trim();

  const amount = Number(amountStr);

  return { itemName, owner, amount, quality, unit };
}

export function parseInfoFirstLine(content: string): ParsedInfo | null {
  const nl = content.indexOf('\n');
  let line = nl === -1 ? content : content.slice(0, nl);
  if (line.endsWith('\r')) line = line.slice(0, -1);
  line = line.trim();

  const m = /^-#\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^,]+?)\s*$/u.exec(line);
  if (!m) return null;

  const [, itemName, quality, type] = m;
  return {
    itemName: itemName.trim(),
    quality: quality.trim(),
    type: type.trim(),
  };
}

type ParsedItemTransfer = {
  from: string;
  to: string;
  itemName: string;
  moved: number;
  quality: string;
  unit: string;
};

export function parseFirstTransferLine(input: string): ParsedItemTransfer {
  const line = input.split('\n', 1)[0];

  const re =
    /^-#\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*,\s*([-+]?\d+)\s*,\s*(.+?)\s*,\s*(.+?)\s*$/u;

  const m = re.exec(line);
  if (!m) {
    throw new Error('헤더 형식이 올바르지 않습니다.');
  }

  const [, from, to, itemName, movedStr, quality, unit] = m;
  const moved = Number(movedStr);

  return { from, to, itemName, moved, quality, unit };
}

@Injectable()
export class ItemsComponents {
  constructor(
    private goldService: GoldService,
    @Inject(ItemsService)
    private itemsService: ItemsService,
  ) {}

  private readonly logger = new Logger(ItemsComponents.name);

  @Button('YES_BUTTON')
  public async onYesButton(@Context() [interaction]: ButtonContext) {
    const info = parseFirstLine(interaction.message.content);
    await interaction.message.delete();
    if (!info) {
      console.warn(`OnYesButton: 메세지 파싱 실패`);
      return;
    }
    if (info.amount === 0) {
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `이미 등록된 아이템의 획득 수량으로 0으로 입력되어, 아무 일도 일어나지 않았어요.`,
          TextColor.BOLD_GRAY,
          true,
          true,
        ),
      });
    }
    interaction.reply({
      content:
        this.goldService.StringFormatter(
          '📦 [아이템 획득 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${info.owner}」, `,
          TextColor.BOLD_WHITE,
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          `[${info.itemName}]`,
          this.ColorParser(info.quality),
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          `을(를) ${info.amount}${info.unit}만큼 획득하였다.`,
          TextColor.BOLD_WHITE,
          false,
          true,
        ),
    });
    // 여기에서 DB작업
    await this.itemsService.AddItemInventory(
      info.owner,
      info.itemName,
      info.amount,
    );
    return;
  }

  @Button('NO_BUTTON')
  public async onNoButton(@Context() [interaction]: ButtonContext) {
    await interaction.message.delete();
    // 여기에서 DB작업
    return interaction.reply({
      content: this.goldService.StringFormatter(
        `입력 취소됨.`,
        TextColor.BOLD_GRAY,
        true,
        true,
      ),
    });
  }

  @Button('YES_BUTTON_INFO_DELETE')
  public async onYesButtonInfoDelete(@Context() [interaction]: ButtonContext) {
    const info = parseInfoFirstLine(interaction.message.content);
    await interaction.message.delete();
    if (!info) {
      console.warn(`OnYesButtonInfoDelete: 메세지 파싱 실패`);
      return;
    }
    interaction.reply({
      content:
        this.goldService.StringFormatter(
          '📦📋 [아이템 정보 삭제 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `${info.type} `,
          TextColor.BOLD_BLUE,
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          `[${info.itemName}]`,
          this.ColorParser(info.quality),
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          `의 정보가 DB에서 삭제되었다.`,
          TextColor.BOLD_BLUE,
          false,
          true,
        ) +
        `\n-# Tip: 인벤토리에 이미 존재하는 아이템까지 자동으로 제거되진 않아요. 새로운 정보를 등록하거나, 인벤토리의 아이템도 제거해주세요.`,
    });
    // 여기에서 DB작업
    try {
      await this.itemsService.DeleteItemInfo(info.itemName);
    } catch (err: any) {
      console.log(err.message);
    }
    return;
  }

  @Button('YES_BUTTON_ITEM_USE')
  public async onYesButtonItemUse(@Context() [interaction]: ButtonContext) {
    const info = parseFirstLine(interaction.message.content);
    await interaction.message.delete();
    if (!info) {
      console.warn(`OnYesButtonItemUse: 메세지 파싱 실패`);
      return;
    }
    try {
      await this.itemsService.UseItemInventory(
        info.owner,
        info.itemName,
        info.amount,
      );
    } catch (err: any) {
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 잘못된 요청 형식: ` + err.message,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
    interaction.reply({
      content:
        this.goldService.StringFormatter(
          '📦 [아이템 소모 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${info.owner}」, `,
          TextColor.BOLD_WHITE,
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          `[${info.itemName}]`,
          this.ColorParser(info.quality),
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          `(을)를 ${info.amount}${info.unit}만큼 소모하였다.`,
          TextColor.BOLD_WHITE,
          false,
          true,
        ),
    });
    return;
  }

  @Button('INFO_BUTTON/:page')
  public async onInfoButton(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('page') pageNumString: string,
  ) {
    await interaction.message.delete();
    try {
      const pageNum = parseInt(pageNumString);
      const page = await this.itemsService.GetItemInfoPage(pageNum);

      const showPrev = page.page > 1;
      const showNext = page.page < page.totalPages;

      const row = new ActionRowBuilder<ButtonBuilder>();
      if (showPrev) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`INFO_BUTTON/${page.page - 1}`)
            .setLabel(`${page.page - 1} 페이지`)
            .setStyle(ButtonStyle.Primary),
        );
      }
      if (showNext) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`INFO_BUTTON/${page.page + 1}`)
            .setLabel(`${page.page + 1} 페이지`)
            .setStyle(ButtonStyle.Primary),
        );
      }
      return interaction.reply({
        content: this.itemsService.InfoPageStringBuilder(page),
        components: row.components.length ? [row] : [],
      });
    } catch (err: any) {
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 에러 발생: ` + err.message,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
  }

  @Button('ALIAS_BUTTON/:page')
  public async onAliasButton(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('page') pageNumString: string,
  ) {
    await interaction.message.delete();
    try {
      const pageNum = parseInt(pageNumString);
      const page = await this.itemsService.GetItemAliasPage(pageNum);

      const showPrev = page.page > 1;
      const showNext = page.page < page.totalPages;

      const row = new ActionRowBuilder<ButtonBuilder>();
      if (showPrev) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ALIAS_BUTTON/${page.page - 1}`)
            .setLabel(`${page.page - 1} 페이지`)
            .setStyle(ButtonStyle.Primary),
        );
      }
      if (showNext) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ALIAS_BUTTON/${page.page + 1}`)
            .setLabel(`${page.page + 1} 페이지`)
            .setStyle(ButtonStyle.Primary),
        );
      }
      return interaction.reply({
        content: this.itemsService.AliasPageStringBuilder(page),
        components: row.components.length ? [row] : [],
      });
    } catch (err: any) {
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 에러 발생: ` + err.message,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
  }

  @Button('YES_BUTTON_ITEM_TRANSFER')
  public async onYesButtonItemTransfer(
    @Context() [interaction]: ButtonContext,
  ) {
    const info = parseFirstTransferLine(interaction.message.content);
    await interaction.message.delete();
    if (!info) {
      console.warn(`OnYesButtonItemTransfer: 메세지 파싱 실패`);
      return;
    }

    const result = new GiveResult();
    const player = new InventorySearchResult();

    player.owner = info.from;
    player.itemName = info.itemName;
    player.amount = -1;

    try {
      if (await this.itemsService.PlayerHasItem(player)) {
        if (
          await this.itemsService.PlayerHasEnoughItem(
            info.from,
            info.itemName,
            info.moved,
          )
        ) {
          await this.itemsService.GiveItem(
            info.from,
            info.to,
            info.itemName,
            info.moved,
            result,
          );

          interaction.reply({
            content:
              this.goldService.StringFormatter(
                `📦 [아이템 전달 이벤트 발생 알림]`,
                TextColor.BOLD_WHITE,
                true,
                false,
              ) +
              '\n' +
              this.goldService.StringFormatter(
                `「${result.from}」, 「${result.to}」에게 `,
                TextColor.BOLD_WHITE,
                false,
                false,
              ) +
              this.goldService.StringFormatter(
                `[${result.itemName}]`,
                this.ColorParser(result.quality),
                false,
                false,
              ) +
              this.goldService.StringFormatter(
                `를 ${result.moved}${result.unit}만큼 전달하였다.\n`,
                TextColor.BOLD_WHITE,
                false,
                false,
              ) +
              this.goldService.StringFormatter(
                `「${result.from}」, [${result.itemName}]의 남은 수량: ${result.fromRemaining}${result.unit}\n`,
                TextColor.BOLD_GRAY,
                false,
                false,
              ) +
              this.goldService.StringFormatter(
                `「${result.to}」, [${result.itemName}]의 남은 수량: ${result.toTotal}${result.unit}`,
                TextColor.BOLD_GRAY,
                false,
                true,
              ),
          });
        } else {
          throw new BadRequestException(
            `보유 수량(${player.amount})보다 많이 전달할 수 없어요.`,
          );
        }
      } else {
        throw new BadRequestException(
          `[${info.itemName}](은)는 「${info.from}」(이)가 가지고 있지 않은 아이템이에요.`,
        );
      }
    } catch (err: any) {
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 에러 발생: ` + err.message,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
  }

  private ColorParser(quality: string | null): TextColor {
    switch (quality) {
      case '고급':
        return TextColor.BOLD_LIME;
      case '희귀':
        return TextColor.BOLD_BLUE;
      case '영웅':
        return TextColor.BOLD_PINK;
      case '진귀':
        return TextColor.BOLD_GRAY;
      case '서사':
        return TextColor.BOLD_WHITE;
      case '전설':
        return TextColor.BOLD_RED;
      case '유일':
        return TextColor.BOLD_GREEN;
      default:
        return TextColor.BOLD_WHITE;
    }
  }
}
