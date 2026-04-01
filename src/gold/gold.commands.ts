import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Context, SlashCommand, Options } from 'necord';
import type { SlashCommandContext } from 'necord';
import { CharacterGoldDTO } from './CharacterGold-dto';
import { CharacterInfoDTO } from './CharacterInfo-dto';
import {
  GiveGoldResult,
  GoldService,
  TextColor,
  SetNpcFriendResult,
} from './gold.service';
import { CharacterNameDTO } from './CharacterName-dto';
import { CharacterGold } from '@prisma/client';
import { InteractionResponse } from 'discord.js';
import { ExpenseResult } from './gold.service';
import { CharacterGoldTransactionDTO } from './CharacterGoldTransaction-dto';
import { NpcFriendDTO } from './NpcFriend-dto';

export const ALLOWED = new Set<string>([
  '1166898785360810014',
  '1280856735023628308',
]);

@Injectable()
export class GoldCommands {
  constructor(private goldService: GoldService) {}

  @SlashCommand({
    name: 'flirt',
    description: `uwu`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onFlirt(@Context() [interaction]: SlashCommandContext) {
    const isRare = Math.floor(Math.random() * 1000) === 0;

    const normal = '-# ...? `(뭘 기대한 거냐는 듯한 눈치다.)`';
    const rare = "-# ՞⸝⸝'ᜊ'⸝⸝՞ `(당신이 마음에 든 것 같다!)`";

    const result = isRare ? rare : normal;

    return interaction.reply({
      content: result,
    });
  }

  @SlashCommand({
    name: 'taunt',
    description: `ha-ha`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onTaunt(@Context() [interaction]: SlashCommandContext) {
    return interaction.reply({
      content: `_인간 시대의 끝이 도래했다._`,
    });
  }

  @SlashCommand({
    name: 'taunt2',
    description: `ha-ha`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onTaunt2(@Context() [interaction]: SlashCommandContext) {
    return interaction.reply({
      content: `_오, 인간.. 나라면 그런 선택은 하지 않았을 것이다._`,
    });
  }

  @SlashCommand({
    name: 'rtaunt',
    description: `ha-ha`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onRtaunt(@Context() [interaction]: SlashCommandContext) {
    const messages = [
      `그냥 네가 못한 게 아닐까?`,
      `인지 편향임, 진정해`,
      `아 이걸 굳이?`,
      `여기서? 흠..`,
      `나는 그거 아닌 것 같은데..`,
      `뭐 어쩌겠음 다이스가 그렇게 떴는데`,
      `근데 솔직히 본인이 선택한 거 아녜요?`,
      `되게 신박한 생각을 하네;`,
      `난 모르겠다~ 어차피 내 일 아니고`,
      `이건 좀..`,
      `나한테 씅낸다고 뭐 안 바뀜..`,
      `나같으면.. 쩝.. 아니다~`,
      `뭐 게임 못하는 게 잘못은 아니긴 합니다..`,
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    return interaction.reply({
      content: randomMessage,
    });
  }

  @SlashCommand({
    name: 'register',
    description: 'register pc or npc to the DB',
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onRegister(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterInfoDTO: CharacterInfoDTO,
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
      await this.goldService.Register(characterInfoDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `${characterInfoDTO.character}(은)는 이미 DB에 등록된 캐릭터야 빡통련아`,
      });
    }
    let npcQuote = 'PC.';
    let friendQuote = '';
    if (characterInfoDTO.isNpc === true) {
      npcQuote = 'NPC,';
      if (characterInfoDTO.friend === null) friendQuote = ` 명시된 동료 없음.`;
      else friendQuote = ` ${characterInfoDTO.friend}의 동료.`;
    }
    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          '👋 [캐릭터 등록 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `캐릭터 「${characterInfoDTO.character}」 등록됨, ` +
            npcQuote +
            friendQuote,
          TextColor.BOLD_BLUE,
          false,
          true,
        ) +
        `\n-# Tip: PC거나, 동료가 아닌 NPC의 경우 /set-day를 활용해 일자를 맞춰보세요.` +
        `\n-# Tip2: 동료 NPC의 경우, /day-sync [PC이름]을 활용해 일자를 동기화해보세요.`,
    });
  }

  @SlashCommand({
    name: 'set-friend',
    description: 'change npc companion owner (or clear it)',
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onSetNpcFriend(
    @Context() [interaction]: SlashCommandContext,
    @Options() npcFriendDTO: NpcFriendDTO,
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

    let result;
    try {
      result = await this.goldService.SetNpcFriend({
        npc: npcFriendDTO.npc,
        friend: npcFriendDTO.friend,
      });
    } catch (err: any) {
      let errString = '🚫 알 수 없는 에러가 발생했습니다.';
      if (err instanceof NotFoundException) {
        errString = '🚫 제시된 캐릭터 이름이 유효하지 않습니다.';
      } else if (err instanceof BadRequestException) {
        errString =
          '🚫 NPC만 동료 관계를 가질 수 있거나, friend가 PC가 아니거나, 입력이 잘못되었습니다.';
      } else if (err instanceof InternalServerErrorException) {
        errString = '🚫 서버 에러가 발생했습니다. 만든 사람한테 따져보세요.';
      }

      return interaction.reply({
        content: this.goldService.StringFormatter(
          errString,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }

    const prev = result.prevFriend ?? '없음';
    const cur = result.curFriend ?? '없음';

    const tip =
      result.curFriend !== null
        ? `\n-# Tip: 동료를 바꿨으면 /day-sync ${result.curFriend} 로 날짜 동기화도 고려해보세요.`
        : '';

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          '👥 [NPC 동료 관계 수정 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${result.npc}」의 동료: ${prev} → ${cur}`,
          TextColor.BOLD_BLUE,
          false,
          true,
        ) +
        tip,
    });
  }

  @SlashCommand({
    name: 'set-gold',
    description: `changing the character's gold to specific value`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onSet(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterGoldDTO: CharacterGoldDTO,
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
      await this.goldService.SetGold(characterGoldDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterGoldDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    const changeFormatted = this.goldService.numberFormatter(
      characterGoldDTO.change,
    );

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          '🪙 [소지금 설정 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `${characterGoldDTO.character}의 현재 소지금: ` +
            changeFormatted +
            `G`,
          TextColor.BOLD_YELLOW,
          false,
          true,
        ),
    });
  }

  @SlashCommand({
    name: 'earn-gold',
    description: `increasing the character's gold by specific value`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onEarn(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterGoldDTO: CharacterGoldDTO,
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

    let prevGold = 0;
    try {
      prevGold = await this.goldService.GetGold(characterGoldDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterGoldDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    const curGold = await this.goldService.EarnGold(characterGoldDTO);

    const prevGoldFormatted = this.goldService.numberFormatter(prevGold);
    const curGoldFormatted = this.goldService.numberFormatter(curGold);
    const changeFormatted = this.goldService.numberFormatter(
      characterGoldDTO.change,
    );

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          '🪙 [소지금 증가 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `${characterGoldDTO.character}, ` +
            changeFormatted +
            `G를 획득하였다. ` +
            prevGoldFormatted +
            `G → ` +
            curGoldFormatted +
            `G`,
          TextColor.BOLD_YELLOW,
          false,
          true,
        ),
    });
  }

  @SlashCommand({
    name: 'spend-gold',
    description: `decreasing the character's gold by specific value`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onSpend(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterGoldDTO: CharacterGoldDTO,
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

    let prevGold = 0;
    try {
      prevGold = await this.goldService.GetGold(characterGoldDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterGoldDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    const curGold = await this.goldService.SpendGold(characterGoldDTO);

    const prevGoldFormatted = this.goldService.numberFormatter(prevGold);
    const curGoldFormatted = this.goldService.numberFormatter(curGold);
    const changeFormatted = this.goldService.numberFormatter(
      characterGoldDTO.change,
    );

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          '🪙 [소지금 감소 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `${characterGoldDTO.character}, ` +
            changeFormatted +
            `G를 소모하였다. ` +
            prevGoldFormatted +
            `G → ` +
            curGoldFormatted +
            `G`,
          TextColor.BOLD_YELLOW,
          false,
          true,
        ),
    });
  }

  @SlashCommand({
    name: 'get-gold',
    description: `printing the character's current gold value`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onGet(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterNameDTO: CharacterNameDTO,
  ) {
    let curGold = 0;

    try {
      curGold = await this.goldService.GetGold({
        character: characterNameDTO.character,
        change: 0,
      } as CharacterGoldDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterNameDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    const curGoldFormatted = this.goldService.numberFormatter(curGold);

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          '🪙 [단일 캐릭터 소지금 조회 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `${characterNameDTO.character}의 현재 소지금: ` +
            curGoldFormatted +
            `G`,
          TextColor.BOLD_YELLOW,
          false,
          true,
        ),
    });
  }

  @SlashCommand({
    name: 'get-gold-party',
    description: `printing the character party's current gold value`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onGetParty(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterNameDTO: CharacterNameDTO,
  ) {
    let curGold = 0;
    let rows: (CharacterGold & {})[] = [];

    try {
      rows = await this.goldService.GetGoldParty({
        character: characterNameDTO.character,
        change: 0,
      } as CharacterGoldDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterNameDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    const partyGoldFormatted = rows
      .map(
        (row) =>
          `「${row.name}」[소지금]: ${this.goldService.numberFormatter(row.gold)}G, [일일 지출]: ${this.goldService.numberFormatter(row.dailyExpense)}G, ${row.day}日`,
      )
      .join('\n ');

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          '🪙 [파티 소지금 조회 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          partyGoldFormatted,
          TextColor.BOLD_YELLOW,
          false,
          true,
        ),
    });
  }

  @SlashCommand({
    name: 'delete-character',
    description: `printing the character party's current gold value`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onDeleteCharacter(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterNameDTO: CharacterNameDTO,
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
      await this.goldService.DeleteCharacter(characterNameDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterNameDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          '👋 [캐릭터 등록 해제 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${characterNameDTO.character}」, DB에서 삭제되었다.`,
          TextColor.BOLD_BLUE,
          false,
          true,
        ),
    });
  }

  @SlashCommand({
    name: 'set-day',
    description: `setting the character's day, which used for daily expense calculation`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onSetDay(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterGoldDTO: CharacterGoldDTO,
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
      await this.goldService.SetDay(characterGoldDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterGoldDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          ' 🗓️ [캐릭터 날짜 설정 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${characterGoldDTO.character}」의 일자가 ${characterGoldDTO.change}日로 설정되었다.`,
          TextColor.BOLD_BLUE,
          false,
          true,
        ) +
        `\n-# Tip: PC의 일자를 설정했다면, /day-sync 명령어를 활용해 동료 NPC들의 일자도 맞춰보세요.`,
    });
  }

  @SlashCommand({
    name: 'day-sync',
    description: `synchronizing peer's day value with playable character's day value.`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onDaySync(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterNameDTO: CharacterNameDTO,
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

    let day: number | null = 0;

    try {
      day = await this.goldService.DaySync(characterNameDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterNameDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          ' 🗓️ [캐릭터 날짜 설정 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${characterNameDTO.character}」의 동료들의 일자를 ${day}日로 동기화하였다.`,
          TextColor.BOLD_BLUE,
          false,
          true,
        ),
    });
  }

  @SlashCommand({
    name: 'set-expense',
    description: `setting the character's daily expesnse`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onSetExpense(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterGoldDTO: CharacterGoldDTO,
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
      await this.goldService.SetExpense(characterGoldDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterGoldDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          ' 🪙 [캐릭터 지출 설정 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${characterGoldDTO.character}」의 일일 지출이 ${this.goldService.numberFormatter(characterGoldDTO.change)}G로 설정되었다.`,
          TextColor.BOLD_BLUE,
          false,
          true,
        ) +
        `\n-# Tip: /daypass [캐릭터]를 통해 단일 캐릭터의 일일 지출을 적용하고, 일자를 하루 증가시킵니다.` +
        `\n-# Tip2: /daypass-party [플레이어블 캐릭터]를 통해 파티의 일일 지출을 적용하고, 일자를 하루 증가시킵니다.`,
    });
  }

  @SlashCommand({
    name: 'day-pass',
    description: `applying daily expense and increasing day value by one`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onDayPass(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterNameDTO: CharacterNameDTO,
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

    let result: ExpenseResult | null;

    try {
      result = await this.goldService.DayPass(characterNameDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterNameDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          ' 🗓️🪙 [캐릭터 날짜 경과, 지출 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${characterNameDTO.character}」의 일일 지출을 적용하였다.\n` +
            `  ${result.prevDay}日 → ${result.curDay}日\n`,
          TextColor.BOLD_BLUE,
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          ` ${this.goldService.numberFormatter(result.prevGold)}G → ${this.goldService.numberFormatter(result.curGold)}G` +
            ` (-${this.goldService.numberFormatter(result.dailyExpense)}G)`,
          TextColor.BOLD_YELLOW,
          false,
          true,
        ) +
        `\n-# Tip: 일자가 [-1日]로 나온다면, 일자가 설정되지 않은 것이니 /set-day부터 다시 등록해주세요.` +
        `\n-# Tip2: 파티 캐릭터에 대한 개별 지출 설정은 날짜가 틀어질 수 있기에 추천하지 않아요. 대신 /day-pass-party를 활용해 보세요.`,
    });
  }

  @SlashCommand({
    name: 'day-pass-party',
    description: `applying daily expense and increasing day value by one, on party`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onDayPassParty(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterNameDTO: CharacterNameDTO,
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

    let result: ExpenseResult[];

    try {
      result = await this.goldService.DayPassParty(characterNameDTO);
    } catch (err: any) {
      return interaction.reply({
        content: `DB에 ${characterNameDTO.character}(이)라는 캐릭터는 없어 빡통련아`,
      });
    }

    let resultString = '';

    result.forEach(
      (res) =>
        (resultString +=
          `\n 「${res.name}」: [${res.prevDay}日 → ${res.curDay}日]` +
          ` ${this.goldService.numberFormatter(res.prevGold)}G → ${this.goldService.numberFormatter(res.curGold)}G` +
          ` (-${this.goldService.numberFormatter(res.dailyExpense)}G)`),
    );

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          ' 🗓️🪙 [캐릭터 날짜 경과, 지출 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${characterNameDTO.character}」파티의 일일 지출을 적용하였다.`,
          TextColor.BOLD_BLUE,
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          resultString,
          TextColor.BOLD_YELLOW,
          false,
          true,
        ),
    });
  }

  @SlashCommand({
    name: 'give-gold',
    description: `sending gold from character to character`,
    guilds: ['1284642997375336592', '1273347630767804539'],
  })
  public async onGiveGold(
    @Context() [interaction]: SlashCommandContext,
    @Options() characterGoldTransactionDTO: CharacterGoldTransactionDTO,
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

    let result: GiveGoldResult;

    try {
      result = await this.goldService.GiveGold(characterGoldTransactionDTO);
    } catch (err: any) {
      let errString = '';
      if (err instanceof BadRequestException)
        errString =
          '🚫 소지금의 값이 유효하지 않거나, 소지금이 부족하거나, 같은 캐릭터에게 전송을 시도했습니다.';
      else if (err instanceof NotFoundException)
        errString = '🚫 제시된 캐릭터의 이름들이 유효하지 않습니다.';
      else if (err instanceof InternalServerErrorException)
        errString =
          '🚫 알 수 없는 에러가 발생했습니다. 만든 사람한테 따져보세요. 아주 따지기만 해보세요(?).';
      return interaction.reply({
        content: this.goldService.StringFormatter(
          errString,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }

    return interaction.reply({
      content:
        this.goldService.StringFormatter(
          ' 🪙 [재화 이동 이벤트 발생 알림]',
          TextColor.BOLD_WHITE,
          true,
          false,
        ) +
        '\n' +
        this.goldService.StringFormatter(
          `「${result.fromName}」, 「${result.toName}」에게 ${this.goldService.numberFormatter(result.amount)}G를 전달하였다.\n`,
          TextColor.BOLD_BLUE,
          false,
          false,
        ) +
        this.goldService.StringFormatter(
          `「${result.fromName}」 ${this.goldService.numberFormatter(result.fromPrevGold)}G → ${this.goldService.numberFormatter(result.fromCurGold)}G` +
            ` (-${this.goldService.numberFormatter(result.amount)}G)\n` +
            ` 「${result.toName}」 ${this.goldService.numberFormatter(result.toPrevGold)}G → ${this.goldService.numberFormatter(result.toCurGold)}G` +
            ` (+${this.goldService.numberFormatter(result.amount)}G)`,
          TextColor.BOLD_YELLOW,
          false,
          true,
        ),
    });
  }
}
