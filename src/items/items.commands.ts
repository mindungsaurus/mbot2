import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Context, SlashCommand, Options } from 'necord';
import type { SlashCommandContext } from 'necord';
import { CharacterGold } from '@prisma/client';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  InteractionResponse,
  ModalBuilder,
  TextInputBuilder,
} from 'discord.js';
import {
  ItemsService,
  ItemTransactionResult,
  GiveResult,
} from './items.service';
import { ItemsTransactionsInfoDTO } from './ItemsTransactionsInfo-dto';
import { ALLOWED } from 'src/gold/gold.commands';
import { GoldService } from 'src/gold/gold.service';
import { TextColor } from 'src/gold/gold.service';
import { ButtonStyle, TextInputStyle } from 'discord-api-types/v10';
import { ItemsNameDTO } from './ItemsName-dto';
import { ItemsUseInfoDTO } from './ItemsUseInfo-dto';
import { CharacterNameDTO } from 'src/gold/CharacterName-dto';
import { CharacterGoldDTO } from 'src/gold/CharacterGold-dto';
import { ItemsPageDTO } from './ItemsPage-dto';
import { ItemsAliasDTO } from './ItemAlias-dto';
import { ItemsTradeInfoDTO } from './ItemsTradeInfo-dto';

@Injectable()
export class ItemsCommands {
  constructor(
    private itemsService: ItemsService,
    private goldService: GoldService,
  ) {}

  @SlashCommand({
    name: 'item-add',
    description: `add item`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onAcqItem(
    @Context() [interaction]: SlashCommandContext,
    @Options() itemsTransactionsInfoDTO: ItemsTransactionsInfoDTO,
  ) {
    if (!ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 관리자가 아닐 경우, 데이터 읽기만 가능합니다.\n` +
            ` 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      const result = await this.itemsService.TryAddItem(
        itemsTransactionsInfoDTO,
      );
      if (result.scenario === 0) {
        return interaction.reply({
          content:
            this.goldService.StringFormatter(
              '📦 [아이템 획득 이벤트 발생 알림]',
              TextColor.BOLD_WHITE,
              true,
              false,
            ) +
            '\n' +
            this.goldService.StringFormatter(
              `「${result.owner}」, `,
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
              `을(를) ${result.amount}${result.unit}만큼 획득하였다.`,
              TextColor.BOLD_WHITE,
              false,
              true,
            ),
        });
      } else if (result.scenario === 1) {
        return interaction.reply({
          content:
            `-# ${result.itemName}, ${result.owner}, ${result.amount}, ${result.quality}, ${result.unit}\n` +
            this.goldService.StringFormatter(
              `[${result.itemName}]`,
              this.ColorParser(result.quality),
              true,
              false,
            ) +
            this.goldService.StringFormatter(
              `(을)를 의도하신 것 같아요. 맞나요?`,
              TextColor.BOLD_WHITE,
              false,
              true,
            ),
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('YES_BUTTON')
                .setLabel('네')
                .setStyle(ButtonStyle.Primary),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('NO_BUTTON')
                .setLabel('아니오')
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      } else if (result.scenario === 3) {
        //별칭으로 찾은 경우
        return interaction.reply({
          content:
            this.goldService.StringFormatter(
              '📦 [아이템 획득 이벤트 발생 알림]',
              TextColor.BOLD_WHITE,
              true,
              false,
            ) +
            '\n' +
            this.goldService.StringFormatter(
              `「${result.owner}」, `,
              TextColor.BOLD_WHITE,
              false,
              false,
            ) +
            this.goldService.StringFormatter(
              `[${itemsTransactionsInfoDTO.item_name} (${result.itemName})]`,
              this.ColorParser(result.quality),
              false,
              false,
            ) +
            this.goldService.StringFormatter(
              `을(를) ${result.amount}${result.unit}만큼 획득하였다.`,
              TextColor.BOLD_WHITE,
              false,
              true,
            ),
        });
      } else {
        if (
          !(
            itemsTransactionsInfoDTO.item_type &&
            itemsTransactionsInfoDTO.item_quality &&
            itemsTransactionsInfoDTO.item_unit
          )
        ) {
          return interaction.reply({
            content: this.goldService.StringFormatter(
              `🚫 [${itemsTransactionsInfoDTO.item_name}]은 DB에 등록되지 않았어요.\n` +
                ` 등록되지 않은 아이템의 경우, (등급/종류/단위)를 모두 입력해 주세요.`,
              TextColor.BOLD_RED,
              true,
              true,
            ),
          });
        }
        await this.itemsService.AddItemInfo(itemsTransactionsInfoDTO);
        await this.itemsService.AddItemInventory(
          itemsTransactionsInfoDTO.owner,
          itemsTransactionsInfoDTO.item_name,
          itemsTransactionsInfoDTO.amount,
        );
        let resultString =
          this.goldService.StringFormatter(
            '📦📋 [아이템 정보 등록 이벤트 발생 알림]',
            TextColor.BOLD_WHITE,
            true,
            false,
          ) +
          '\n' +
          this.goldService.StringFormatter(
            `${itemsTransactionsInfoDTO.item_type}`,
            TextColor.BOLD_BLUE,
            false,
            false,
          ) +
          this.goldService.StringFormatter(
            `[${itemsTransactionsInfoDTO.item_name}]`,
            this.ColorParser(itemsTransactionsInfoDTO.item_quality),
            false,
            false,
          ) +
          this.goldService.StringFormatter(
            `의 정보가 DB에 등록되었다.`,
            TextColor.BOLD_BLUE,
            false,
            true,
          );
        if (itemsTransactionsInfoDTO.amount > 0)
          resultString +=
            this.goldService.StringFormatter(
              '📦 [아이템 획득 이벤트 발생 알림]',
              TextColor.BOLD_WHITE,
              true,
              false,
            ) +
            '\n' +
            this.goldService.StringFormatter(
              `「${itemsTransactionsInfoDTO.owner}」, `,
              TextColor.BOLD_WHITE,
              false,
              false,
            ) +
            this.goldService.StringFormatter(
              `[${itemsTransactionsInfoDTO.item_name}]`,
              this.ColorParser(itemsTransactionsInfoDTO.item_quality),
              false,
              false,
            ) +
            this.goldService.StringFormatter(
              `을(를) ${itemsTransactionsInfoDTO.amount}${itemsTransactionsInfoDTO.item_unit}만큼 획득하였다.`,
              TextColor.BOLD_WHITE,
              false,
              true,
            );
        return interaction.reply({
          content: resultString,
        });
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        return interaction.reply({
          content: this.goldService.StringFormatter(
            `🚫 잘못된 요청 형식: ` + err.message,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }
    }
  }

  @SlashCommand({
    name: 'item-delete',
    description: `deleting info of an item`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onItemDelete(
    @Context() [interaction]: SlashCommandContext,
    @Options() itemsNameDTO: ItemsNameDTO,
  ) {
    if (!ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 관리자가 아닐 경우, 데이터 읽기만 가능합니다.\n` +
            ` 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      const result = await this.itemsService.TryDeleteItemInfo(itemsNameDTO);
      if (result.scenario === 0) {
        return interaction.reply({
          content:
            this.goldService.StringFormatter(
              '📦📋 [아이템 정보 삭제 이벤트 발생 알림]',
              TextColor.BOLD_WHITE,
              true,
              false,
            ) +
            '\n' +
            this.goldService.StringFormatter(
              `${result.type} `,
              TextColor.BOLD_BLUE,
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
              `의 정보가 DB에서 삭제되었다.`,
              TextColor.BOLD_BLUE,
              false,
              true,
            ) +
            `\n-# Tip: 인벤토리에 이미 존재하는 아이템까지 자동으로 제거되진 않아요. 새로운 정보를 등록하거나, 인벤토리의 아이템도 제거해주세요.`,
        });
      } else if (result.scenario === 1) {
        return interaction.reply({
          content:
            `-# ${result.itemName}, ${result.quality}, ${result.type}\n` +
            this.goldService.StringFormatter(
              `[${result.itemName}]`,
              this.ColorParser(result.quality),
              true,
              false,
            ) +
            this.goldService.StringFormatter(
              `(을)를 의도하신 것 같아요. 맞나요?`,
              TextColor.BOLD_WHITE,
              false,
              true,
            ),
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('YES_BUTTON_INFO_DELETE')
                .setLabel('네')
                .setStyle(ButtonStyle.Primary),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('NO_BUTTON')
                .setLabel('아니오')
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      }
    } catch (err: any) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        return interaction.reply({
          content: this.goldService.StringFormatter(
            `🚫 잘못된 요청 형식: ` + err.message,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }
    }
  }

  @SlashCommand({
    name: 'item-use',
    description: `using item from a character's inventory`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onItemUse(
    @Context() [interaction]: SlashCommandContext,
    @Options() itemsUseInfoDTO: ItemsUseInfoDTO,
  ) {
    if (!ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 관리자가 아닐 경우, 데이터 읽기만 가능합니다.\n` +
            ` 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      const result =
        await this.itemsService.TryUseItemInventory(itemsUseInfoDTO);
      if (result.scenario === 0) {
        // console.log(`시나리오 0번`);
        return interaction.reply({
          content:
            this.goldService.StringFormatter(
              '📦 [아이템 소모 이벤트 발생 알림]',
              TextColor.BOLD_WHITE,
              true,
              false,
            ) +
            '\n' +
            this.goldService.StringFormatter(
              `「${result.owner}」, `,
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
              `(을)를 ${result.amount}${result.unit}만큼 소모하였다.`,
              TextColor.BOLD_WHITE,
              false,
              true,
            ),
        });
      } else if (result.scenario === 1) {
        // console.log(`시나리오 1번`);
        return interaction.reply({
          content:
            `-# ${result.itemName}, ${result.owner}, ${result.amount}, ${result.quality}, ${result.unit}\n` +
            this.goldService.StringFormatter(
              `[${result.itemName}]`,
              this.ColorParser(result.quality),
              true,
              false,
            ) +
            this.goldService.StringFormatter(
              `(을)를 의도하신 것 같아요. 맞나요?`,
              TextColor.BOLD_WHITE,
              false,
              true,
            ),
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('YES_BUTTON_ITEM_USE')
                .setLabel('네')
                .setStyle(ButtonStyle.Primary),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('NO_BUTTON')
                .setLabel('아니오')
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      } else if (result.scenario === 3) {
        //별칭으로 찾은 경우
        return interaction.reply({
          content:
            this.goldService.StringFormatter(
              '📦 [아이템 소모 이벤트 발생 알림]',
              TextColor.BOLD_WHITE,
              true,
              false,
            ) +
            '\n' +
            this.goldService.StringFormatter(
              `「${result.owner}」, `,
              TextColor.BOLD_WHITE,
              false,
              false,
            ) +
            this.goldService.StringFormatter(
              `[${itemsUseInfoDTO.item_name} (${result.itemName})]`,
              this.ColorParser(result.quality),
              false,
              false,
            ) +
            this.goldService.StringFormatter(
              `을(를) ${result.amount}${result.unit}만큼 소모하였다.`,
              TextColor.BOLD_WHITE,
              false,
              true,
            ),
        });
      }
    } catch (err: any) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        return interaction.reply({
          content: this.goldService.StringFormatter(
            `🚫 잘못된 요청 형식: ` + err.message,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }
    }
  }

  @SlashCommand({
    name: 'get-inventory',
    description: `printing the character's current inventory`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onGet(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterNameDTO: CharacterNameDTO,
  ) {
    let inventory: any;
    try {
      inventory = await this.itemsService.ListPlayerItems(
        characterNameDTO.character,
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

    let gold = 0;

    try {
      gold = await this.goldService.GetGold({
        character: characterNameDTO.character,
        change: 0,
      } as CharacterGoldDTO);
    } catch (err: any) {
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 아직 [${characterNameDTO.character}] 캐릭터가 등록되지 않았어요.` +
            `\n  먼저 /register를 통해 캐릭터를 등록해야 해요.`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }

    //플레이어, 아이템목록, 골드가 순서대로 들어가야 함
    const result = await this.itemsService.InventoryStringBuilder(
      characterNameDTO.character,
      inventory,
      gold,
    );

    return interaction.reply({
      content: result,
    });
  }

  @SlashCommand({
    name: 'item-info',
    description: `printing currently registered items, based on page index`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onItemInfo(
    @Context() [interaction]: SlashCommandContext,
    @Options() itemsPageDTO: ItemsPageDTO,
  ) {
    try {
      const page = await this.itemsService.GetItemInfoPage(itemsPageDTO.page);

      if (itemsPageDTO.page > page.totalPages)
        throw new BadRequestException(
          `총 페이지 수(${page.totalPages})보다 큰 값을 입력할 수 없어요.`,
        );

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

  @SlashCommand({
    name: 'alias-add',
    description: 'add new alias for an item',
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onAddAlias(
    @Context() [interaction]: SlashCommandContext,
    @Options() itemsAliasDTO: ItemsAliasDTO,
  ) {
    if (!ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 관리자가 아닐 경우, 데이터 읽기만 가능합니다.\n` +
            ` 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      let result = new ItemTransactionResult();
      await this.itemsService.AddAlias(itemsAliasDTO, result);

      return interaction.reply({
        content:
          this.goldService.StringFormatter(
            '📦🌟 [아이템 별칭 등록 이벤트 발생 알림]',
            TextColor.BOLD_WHITE,
            true,
            false,
          ) +
          '\n' +
          this.goldService.StringFormatter(
            `[${result.itemName}]`,
            this.ColorParser(result.quality),
            false,
            false,
          ) +
          this.goldService.StringFormatter(
            `의 별칭`,
            TextColor.BOLD_WHITE,
            false,
            false,
          ) +
          this.goldService.StringFormatter(
            `[${itemsAliasDTO.alias}]`,
            this.ColorParser(result.quality),
            false,
            false,
          ) +
          this.goldService.StringFormatter(
            `(이)가 등록되었다.`,
            TextColor.BOLD_WHITE,
            false,
            true,
          ),
      });
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
  }

  @SlashCommand({
    name: 'alias-delete',
    description: 'delete existing alias for an item',
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onAliasDelete(
    @Context() [interaction]: SlashCommandContext,
    @Options() ItemsNameDTO: ItemsNameDTO,
  ) {
    if (!ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 관리자가 아닐 경우, 데이터 읽기만 가능합니다.\n` +
            ` 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      let result = new ItemTransactionResult();
      await this.itemsService.DeleteAlias(ItemsNameDTO, result);

      return interaction.reply({
        content:
          this.goldService.StringFormatter(
            '📦🌟 [아이템 별칭 삭제 이벤트 발생 알림]',
            TextColor.BOLD_WHITE,
            true,
            false,
          ) +
          '\n' +
          this.goldService.StringFormatter(
            `[${result.itemName}]`,
            this.ColorParser(result.quality),
            false,
            false,
          ) +
          this.goldService.StringFormatter(
            `의 별칭`,
            TextColor.BOLD_WHITE,
            false,
            false,
          ) +
          this.goldService.StringFormatter(
            `[${ItemsNameDTO.item_name.trim()}]`,
            this.ColorParser(result.quality),
            false,
            false,
          ) +
          this.goldService.StringFormatter(
            `(이)가 등록 해제되었다.`,
            TextColor.BOLD_WHITE,
            false,
            true,
          ),
      });
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
  }

  @SlashCommand({
    name: 'alias-info',
    description: `printing currently registered alias`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onAliasInfo(
    @Context() [interaction]: SlashCommandContext,
    @Options() itemsPageDTO: ItemsPageDTO,
  ) {
    try {
      const page = await this.itemsService.GetItemAliasPage(itemsPageDTO.page);

      if (itemsPageDTO.page > page.totalPages)
        throw new BadRequestException(
          `총 페이지 수(${page.totalPages})보다 큰 값을 입력할 수 없어요.`,
        );

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

  @SlashCommand({
    name: 'clean-dummy',
    description: `cleaning dummy items, which is not registered but in player's inventory`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onCleanDummy(@Context() [interaction]: SlashCommandContext) {
    if (!ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 관리자가 아닐 경우, 데이터 읽기만 가능합니다.\n` +
            ` 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      const result = await this.itemsService.purgeDummyInventory();
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `${result}개의 더미 아이템을 제거했어요.`,
          TextColor.BOLD_GRAY,
          true,
          true,
        ),
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

  @SlashCommand({
    name: 'item-give',
    description: `transferring item from a character to character`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onGiveItem(
    @Context() [interaction]: SlashCommandContext,
    @Options() itemsTradeInfoDTO: ItemsTradeInfoDTO,
  ) {
    if (!ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 관리자가 아닐 경우, 데이터 읽기만 가능합니다.\n` +
            ` 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      const result = new GiveResult();
      await this.itemsService.TryGiveItem(itemsTradeInfoDTO, result);

      if (result.scenario === 0) {
        // 정상 입력
        // console.log(`시나리오 0`);
        return interaction.reply({
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
      } else if (result.scenario === 1) {
        return interaction.reply({
          content:
            `-# ${result.from}, ${result.to}, ${result.itemName}, ${result.moved}, ${result.quality}, ${result.unit}\n` +
            this.goldService.StringFormatter(
              `[${result.itemName}]`,
              this.ColorParser(result.quality),
              true,
              false,
            ) +
            this.goldService.StringFormatter(
              `(을)를 의도하신 것 같아요. 맞나요?`,
              TextColor.BOLD_WHITE,
              false,
              true,
            ),
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('YES_BUTTON_ITEM_TRANSFER')
                .setLabel('네')
                .setStyle(ButtonStyle.Primary),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('NO_BUTTON')
                .setLabel('아니오')
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      } else if (result.scenario === 3) {
        // 앨리어싱
        return interaction.reply({
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
              `[${itemsTradeInfoDTO.itemName} (${result.itemName})]`,
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

  public ColorParser(quality: String | null): TextColor {
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
        return TextColor.BOLD_YELLOW;
      case '전설':
        return TextColor.BOLD_RED;
      case '유일':
        return TextColor.BOLD_GREEN;
      default:
        return TextColor.BOLD_WHITE;
    }
  }
}
