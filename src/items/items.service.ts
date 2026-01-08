import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { ItemsTransactionsInfoDTO } from './ItemsTransactionsInfo-dto';
import { Inject } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { ItemsNameDTO } from './ItemsName-dto';
import { ItemsUseInfoDTO } from './ItemsUseInfo-dto';
import { TextColor } from 'src/gold/gold.service';
import { GoldService } from 'src/gold/gold.service';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import { EmbedBuilder } from 'discord.js';
import { createCanvas, registerFont } from 'canvas';
import { AttachmentBuilder } from 'discord.js';
import { ItemsAliasDTO } from './ItemAlias-dto';
import { ItemsTradeInfoDTO } from './ItemsTradeInfo-dto';

export enum ItemQuality {
  NORMAL = 1,
  ADVANCED = 2,
  RARE = 3,
  HEROIC = 4,
  PRECIOUS = 5,
  EPIC = 6,
  LEGENDARY = 7,
  UNIQUE = 8,
}

export const ALLOWED_QUALITY = new Set<string>([
  '일반',
  '고급',
  '희귀',
  '영웅',
  '진귀',
  '서사',
  '전설',
  '유일',
]);

export const ALLOWED_TYPE = new Set<string>([
  '장비',
  '소모품',
  '식품',
  '광물',
  '수렵품',
  '채집물',
  '기타아이템',
  '매개체',
]);

export const ALLOWED_PLAYER = new Set<string>([
  '디어릭',
  '하이든',
  '유라',
  '트릭시',
]);

export const removeWhitespace = (s: string) => s.replace(/\s+/g, '');

export class ItemTransactionResult {
  owner: string;
  itemName: string;
  amount: number;
  unit: string | null;
  type: string | null;
  quality: string | null;
  scenario: number;
}

export class ItemInfoResult {
  itemName: string;
  unit: string | null;
  type: string | null;
  quality: string | null;
  scenario: number;
}

type InventoryRow = { itemName: string; amount: number };
type ItemInfoRow = {
  name: string;
  quality: number;
  type: string;
  unit: string;
};

type ListedItem = {
  name: string;
  amount: number;
  quality: number;
  type: string;
  unit: string;
};

type ListedByType = Record<string, ListedItem[]>;

type ItemInfoPage = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  items: ItemInfoRow[];
};

type AliasRow = {
  itemName: string;
  alias: string;
  quality: number;
};

type AliasInfoPage = {
  page: number;
  pageSize: number;
  totalAlias: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  alias: AliasRow[];
};

export class GiveResult {
  itemName: string;
  from: string;
  to: string;
  moved: number;
  fromRemaining: number;
  toTotal: number;
  sourceDeleted: boolean;
  scenario: number;
  quality: string;
  unit: string;
}

export class InventorySearchResult {
  owner: string;
  itemName: string;
  amount: number;
}

const PAGE_SIZE = 20;

type Align = 'left' | 'right';

function padMono(s: string, width: number, align: Align = 'left') {
  //const raw = stringWidth(stripAnsi(s), { ambiguousIsNarrow: false });
  //const pad = Math.max(0, width - raw);
  const raw = stripAnsi(s);
  const pad = Math.max(0, width - raw.length);
  return align === 'right' ? '　'.repeat(pad) + s : s + '　'.repeat(pad);
}

export function replaceSpacesWithFullWidth(input: string): string {
  return input.replace(/ /g, '\u3000');
}

export function toFullWidthAscii(input: string): string {
  let out = '';
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x20) out += '\u3000';
    else if (cp >= 0x21 && cp <= 0x7e) out += String.fromCodePoint(cp + 0xfee0);
    else out += ch;
  }
  return out;
}

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    private goldService: GoldService,
  ) {}

  public async TryAddItem(
    payload: ItemsTransactionsInfoDTO,
  ): Promise<ItemTransactionResult> {
    /*
    들어오는 정보:
    owner: 아이템 소유주
    item_name: 아이템 이름
    amount: 수량
    item_quality: 등급 nullable
    item_type: 종류 nullable
    item_unit: 단위 nullable
    */
    const player = payload.owner.trim();
    const item = payload.item_name.trim();
    let quality = '';
    let qualityNum = 0;
    let type = '';

    if (payload.item_quality) {
      //등급 유효성 체크
      quality = payload.item_quality.trim();
      if (!ALLOWED_QUALITY.has(quality))
        throw new BadRequestException('유효하지 않은 아이템 등급');
    }

    if (payload.item_type) {
      //종류 유효성 체크
      type = payload.item_type.trim();
      if (!ALLOWED_TYPE.has(type))
        throw new BadRequestException('유효하지 않은 아이템 타입');
    }

    if (!ALLOWED_PLAYER.has(player))
      throw new BadRequestException('유효하지 않은 플레이어');

    if (item.length === 0)
      throw new BadRequestException('유효하지 않은 아이템 이름');

    if (payload.amount < 0)
      throw new BadRequestException(
        '유효하지 않은 수량: 0 이상의 값을 입력하세요.',
      );

    const result = new ItemTransactionResult();

    result.owner = player;
    result.amount = payload.amount;

    qualityNum = this.QualityStringParser(quality);

    if (await this.FindItem(item, result)) {
      //ItemsInfo에 이미 등록된 경우 - 반환값 0
      await this.AddItemInventory(player, item, payload.amount);
    } else {
      if (!(await this.FindItemNoSpace(removeWhitespace(item), result))) {
        if (!(await this.FindItemAlias(item, result))) {
          //그냥 찾아도 없고 오탈자 체크해도 없고 별칭으로도 없음 => 새 등록인 경우 - 시나리오 2
          result.scenario = 2;
        } else {
          //별칭으로 찾으면 있는 경우 - 처리해줘야 함
          await this.AddItemInventory(player, result.itemName, payload.amount);
        }
      }
    }

    //오탈자가 문제인 경우 - 시나리오 1
    //별칭으로 찾으면 있는 경우 - 시나리오 3
    return result;

    /*
    item_name으로 ItemsInfo 테이블에서 먼저 찾는다.
        만약 있다면, quality, type, unit 정보는 무시한다.
        (기능1) Inventory 테이블에서 owner와 itemName 쌍으로 찾는다.
            있다면, 갯수를 증가시킨다.
            없다면, 새로운 튜플을 만들어 삽입한다.
        
        만약 없다면, 오탈자에 의한 것인지, 새로운 아이템을 등록하는 것인지 구분해야 한다.
        item_name의 띄어쓰기 제거 버전으로 ItemsInfo의 noSpace 필드에서 찾는다.
            만약 있다면, 유저에게 이것이 맞느냐는 버튼액션을 보낸다. 예라고 답할 경우 (기능1)을 실행한다.
            만약 없다면, alias로 찾는다.
                있다면, (기능1)을 실행한다.
                없다면, 유저에게 새로운 아이템을 등록하는 것인지 묻는다.
    */
  }

  public async TryDeleteItemInfo(
    payload: ItemsNameDTO,
  ): Promise<ItemInfoResult> {
    const itemName = payload.item_name.trim();
    const result = new ItemTransactionResult();
    const res = new ItemInfoResult();

    if (await this.FindItem(itemName, result)) {
      try {
        await this.prisma.itemsInfo.delete({
          where: { name: itemName },
        });
      } catch (err: any) {
        this.logger.warn(err.message);
        throw new InternalServerErrorException(
          `알 수 없는 이유로 삭제에 실패했습니다.`,
        );
      }
      res.scenario = 0; // 원본으로 찾았을 때 있으면 지움
    } else {
      //아니면 버튼 인터랙션으로 넘어가야 함
      if (await this.FindItemNoSpace(removeWhitespace(itemName), result)) {
        res.scenario = 1;
      } else {
        //그래도 안 나오면 아예 에러 띄워야 함
        throw new NotFoundException(
          `띄어쓰기를 제거한 버전까지 찾아봤지만, [${itemName}](은)는 존재하지 않아요.`,
        );
      }
    }

    res.itemName = result.itemName;
    res.quality = result.quality;
    res.type = result.type;
    res.unit = result.unit;

    return res;
  }

  public async FindItem(
    name: string,
    result: ItemTransactionResult,
  ): Promise<boolean> {
    const row = await this.prisma.itemsInfo.findUnique({
      where: { name },
    });

    if (!row) return false;
    else {
      result.itemName = row.name;
      result.quality = this.QualityNumParser(row.quality);
      result.type = row.type;
      result.unit = row.unit;
      result.scenario = 0;
      return true;
    }
  }

  public async FindItemNoSpace(
    noSpace: string,
    result: ItemTransactionResult,
  ): Promise<boolean> {
    const row = await this.prisma.itemsInfo.findUnique({
      where: { noSpace },
    });

    if (!row) return false;
    else {
      result.itemName = row.name;
      result.quality = this.QualityNumParser(row.quality);
      result.type = row.type;
      result.unit = row.unit;
      result.scenario = 1;
      return true;
    }
  }

  public async FindItemAlias(
    alias: string,
    result: ItemTransactionResult,
  ): Promise<boolean> {
    const row = await this.prisma.itemAlias.findUnique({
      where: { alias },
    });

    if (!row) return false;
    await this.FindItem(row.itemName, result);
    result.scenario = 3;
    return true;
  }

  public async DeleteItemInfo(itemName: string) {
    try {
      await this.prisma.itemsInfo.delete({
        where: { name: itemName },
      });
    } catch (err: any) {
      throw new InternalServerErrorException(
        `알 수 없는 이유로 아이템 정보 삭제에 실패했어요.`,
      );
    }
  }

  /*
  (기능1) Inventory 테이블에서 owner와 itemName 쌍으로 찾는다.
            있다면, 갯수를 증가시킨다.
            없다면, 새로운 튜플을 만들어 삽입한다.
  */
  public async AddItemInventory(
    owner: string,
    itemName: string,
    amount: number,
  ) {
    if (amount > 0) {
      await this.prisma.inventory.upsert({
        where: { owner_itemName: { owner, itemName } },
        update: { amount: { increment: amount } },
        create: { owner, itemName, amount },
      });
    }
  }

  public async AddItemInfo(payload: ItemsTransactionsInfoDTO) {
    try {
      await this.prisma.itemsInfo.create({
        data: {
          name: payload.item_name,
          quality: this.QualityStringParser(payload.item_quality),
          unit: payload.item_unit,
          type: payload.item_type,
          noSpace: removeWhitespace(payload.item_name),
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `${payload.item_name}(은)는 이미 등록되었어요.`,
        );
      }
      this.logger.error(`Error while adding item info`);
      throw err;
    }
  }

  public async TryUseItemInventory(
    payload: ItemsUseInfoDTO,
  ): Promise<ItemTransactionResult> {
    const result = new ItemTransactionResult();
    const owner = payload.owner.trim();
    let itemName = payload.item_name.trim();
    const amount = payload.amount;
    result.owner = owner;
    result.amount = amount;

    if (!ALLOWED_PLAYER.has(owner))
      throw new BadRequestException('유효하지 않은 플레이어');

    if (itemName.length === 0)
      throw new BadRequestException('유효하지 않은 아이템 이름');

    if (payload.amount <= 0)
      throw new BadRequestException(
        '유효하지 않은 수량: 1 이상의 값을 입력하세요.',
      );

    const res = await this.prisma.inventory.updateMany({
      where: { owner, itemName, amount: { gte: amount } },
      data: { amount: { decrement: amount } },
    });

    if (res.count === 0) {
      const exists = await this.prisma.inventory.findUnique({
        where: { owner_itemName: { owner, itemName } },
        select: { amount: true },
      });

      const dbExists = await this.FindItem(itemName, result);
      if (!exists) {
        //DB에 있는 템인데 인벤토리에는 없음 -> 그 캐릭터가 안 갖고 있음
        if (dbExists) {
          throw new NotFoundException(
            `[${itemName}] (은)는 ${owner}가 가지고 있지 않은 아이템이에요.`,
          );
        }

        if (await this.FindItemNoSpace(removeWhitespace(itemName), result)) {
          //DB에 없고, no-space로 찾으면 있는 경우 - 버튼 인터랙션으로 옮겨줌
          return result;
        }

        //별칭으로 찾으면 있는 경우 - 인벤토리에 있는지 없는지는 모름
        if (await this.FindItemAlias(itemName, result)) {
          itemName = result.itemName; //별칭을 조회 결과의 itemName으로 바꿔줌

          const aliasRes = await this.prisma.inventory.updateMany({
            where: {
              owner,
              itemName,
              amount: { gte: amount },
            },
            data: { amount: { decrement: amount } },
          });

          const aliasResExists = await this.prisma.inventory.findUnique({
            where: { owner_itemName: { owner, itemName } },
            select: { amount: true },
          });

          if (aliasRes.count === 0) {
            if (aliasResExists)
              //갖고는 있는데 수량이 모자란 경우
              throw new BadRequestException(
                `보유 수량(${aliasResExists.amount})보다 많이 사용할 수 없어요.`,
              );
            else
              //안 가지고 있는 템인 경우
              throw new NotFoundException(
                `[${itemName}] (은)는 ${owner}가 가지고 있지 않은 아이템이에요.`,
              );
          } else {
            //문제 없는 경우, 감소 후 0이면 삭제
            const after = await this.prisma.inventory.findUnique({
              where: { owner_itemName: { owner, itemName } },
              select: { amount: true },
            });

            if (after && after.amount === 0) {
              await this.prisma.inventory.delete({
                where: { owner_itemName: { owner, itemName } },
              });
            }
            return result;
          }
        }

        throw new NotFoundException( //그래도 없는 경우 - 애초에 없는 템임
          `[${itemName}] (은)는 등록되지 않은 아이템이에요.`,
        );
      }
      throw new BadRequestException( //모자라서 못 쓰는 경우
        `보유 수량(${exists.amount})보다 많이 사용할 수 없어요.`,
      );
    }

    //감소 후 0이면 삭제
    const after = await this.prisma.inventory.findUnique({
      where: { owner_itemName: { owner, itemName } },
      select: { amount: true },
    });

    if (after && after.amount === 0) {
      await this.prisma.inventory.delete({
        where: { owner_itemName: { owner, itemName } },
      });
    }

    await this.FindItem(itemName, result);

    return result;
  }

  public async UseItemInventory(
    //DB에 존재하는 게 확정된 분기
    owner: string,
    itemName: string,
    amount: number,
  ): Promise<ItemTransactionResult> {
    const result = new ItemTransactionResult();
    result.owner = owner;
    result.amount = amount;

    const res = await this.prisma.inventory.updateMany({
      where: { owner, itemName, amount: { gte: amount } },
      data: { amount: { decrement: amount } },
    });

    if (res.count === 0) {
      //영향 받은 행이 없는데
      const exists = await this.prisma.inventory.findUnique({
        where: { owner_itemName: { owner, itemName } },
        select: { amount: true },
      });
      if (!exists) {
        //애초에 인벤토리에 없는 경우
        throw new NotFoundException(
          `[${itemName}] (은)는 ${owner}(이)가 가지고 있지 않은 아이템이에요.`,
        );
      }
      throw new BadRequestException( //모자라서 못 쓰는 경우
        `보유 수량(${exists.amount})보다 많이 사용할 수 없어요.`,
      );
    }

    await this.FindItem(itemName, result);

    //감소 후 0이면 삭제
    const after = await this.prisma.inventory.findUnique({
      where: { owner_itemName: { owner, itemName } },
      select: { amount: true },
    });

    if (after && after.amount === 0) {
      await this.prisma.inventory.delete({
        where: { owner_itemName: { owner, itemName } },
      });
    }
    return result;
  }

  public async purgeDummyInventory(): Promise<number> {
    //등록된 아이템 이름 전부 수집
    const names = (
      await this.prisma.itemsInfo.findMany({
        select: { name: true },
      })
    ).map((r) => r.name);

    //목록에 없는 itemName만 삭제
    const { count } = await this.prisma.inventory.deleteMany({
      where: { itemName: { notIn: names } },
    });

    return count;
  }

  public async ListPlayerItems(owner: string): Promise<ListedByType> {
    //인벤토리 가져옴
    owner = owner.trim();

    if (!ALLOWED_PLAYER.has(owner))
      throw new BadRequestException('유효하지 않은 플레이어');

    const inv: InventoryRow[] = await this.prisma.inventory.findMany({
      where: { owner },
      select: { itemName: true, amount: true },
    });
    if (inv.length === 0) return {};

    //아이템 정보 한 방에 가져옴
    const names = [...new Set(inv.map((i) => i.itemName))];
    const infos = await this.prisma.itemsInfo.findMany({
      where: { name: { in: names } },
      select: { name: true, quality: true, type: true, unit: true },
    });

    //아이템이름 - 아이템정보 맞춤
    const infoMap = new Map<string, ItemInfoRow>(
      infos.map((i) => [i.name, i as ItemInfoRow]),
    );

    //정보 취합
    const combined: ListedItem[] = inv
      .map(({ itemName, amount }) => {
        const info = infoMap.get(itemName);
        if (!info) return null;
        return {
          name: info.name,
          amount,
          quality: info.quality as number,
          type: info.type as string,
          unit: info.unit as string,
        };
      })
      .filter((v): v is ListedItem => v !== null);

    //종류별로 묶음
    const grouped: ListedByType = {};
    for (const item of combined) {
      (grouped[item.type] ??= []).push(item);
    }

    //같은 종류일 경우 -> 등급 순 정렬, 같은 등급 -> 이름 순 정렬
    for (const list of Object.values(grouped)) {
      list.sort(
        (a, b) => b.quality - a.quality || a.name.localeCompare(b.name, 'ko'),
      );
    }

    return grouped;
  }

  public async GetItemInfoPage(page: number): Promise<ItemInfoPage> {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('페이지 수는 1 이상의 정수여야 해요.');
    }

    const skip = (page - 1) * PAGE_SIZE;

    //총 개수, 현재 페이지 병렬조회
    const [totalItems, items] = await this.prisma.$transaction([
      this.prisma.itemsInfo.count(),
      this.prisma.itemsInfo.findMany({
        select: { name: true, quality: true, unit: true, type: true },
        orderBy: { name: 'asc' },
        skip,
        take: PAGE_SIZE,
      }),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

    /*
    const [countRows, items] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "ItemsInfo"
  `,
      this.prisma.$queryRaw<ItemInfoRow[]>`
    SELECT name, quality, unit, type
    FROM "ItemsInfo"
    ORDER BY name COLLATE "ko_kr" ASC, id ASC
    OFFSET ${skip} LIMIT ${PAGE_SIZE}
  `,
    ]);

    const totalItems = countRows[0].count;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    */

    return {
      page,
      pageSize: PAGE_SIZE,
      totalItems,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      items,
    };
  }

  public async GetItemAliasPage(page: number): Promise<AliasInfoPage> {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('페이지 수는 1 이상의 정수여야 해요.');
    }

    const skip = (page - 1) * PAGE_SIZE;

    // 총 개수 + 현재 페이지 alias 목록
    const [totalAlias, aliasRows] = await this.prisma.$transaction([
      this.prisma.itemAlias.count(),
      this.prisma.itemAlias.findMany({
        select: { itemName: true, alias: true },
        orderBy: [{ itemName: 'asc' }, { alias: 'asc' }],
        skip,
        take: PAGE_SIZE,
      }),
    ]);

    // 해당 페이지에 필요한 아이템들의 quality 한 번에 조회
    const names = [...new Set(aliasRows.map((a) => a.itemName))];
    const infos = await this.prisma.itemsInfo.findMany({
      where: { name: { in: names } },
      select: { name: true, quality: true },
    });
    const qmap = new Map(infos.map((i) => [i.name, i.quality]));

    const alias: AliasRow[] = aliasRows.map((a) => {
      const q = qmap.get(a.itemName);
      if (q == null) {
        throw new NotFoundException(
          `ItemsInfo에 '${a.itemName}'이(가) 없습니다.`,
        );
      }
      return { itemName: a.itemName, alias: a.alias, quality: q };
    });

    const totalPages = Math.max(1, Math.ceil(totalAlias / PAGE_SIZE));

    return {
      page,
      pageSize: PAGE_SIZE,
      totalAlias,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      alias,
    };
  }

  public async AddAlias(payload: ItemsAliasDTO, result: ItemTransactionResult) {
    let itemName = payload.item_name.trim();
    const alias = payload.alias.trim();

    const itemExists = await this.FindItem(itemName, result);

    if (!itemExists) {
      const noSpaceItemExists = await this.FindItemNoSpace(
        removeWhitespace(itemName),
        result,
      );
      if (!noSpaceItemExists)
        throw new NotFoundException(
          `띄어쓰기를 제거한 버전까지 찾아 보았지만, ${itemName}(은)는 등록되지 않은 아이템이에요.`,
        );

      itemName = result.itemName;
    }

    try {
      await this.prisma.itemAlias.create({
        data: {
          alias,
          itemName,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `${alias}(은)는 이미 존재하는 아이템 별칭이에요.`,
        );
      }
      this.logger.error(
        `Failed to add alias "${alias}": ${err?.message ?? err}`,
      );
      throw err;
    }
  }

  public async DeleteAlias(
    payload: ItemsNameDTO,
    result: ItemTransactionResult,
  ) {
    const alias = payload.item_name.trim();
    try {
      await this.FindItemAlias(alias, result);
      await this.prisma.itemAlias.delete({
        where: { alias },
      });
    } catch (err: any) {
      if (err?.code === 'P2025')
        throw new NotFoundException(
          `${alias}(은)는 존재하지 않는 아이템 별칭이에요.`,
        );
      throw new InternalServerErrorException(
        `알 수 없는 이유로 아이템 정보 삭제에 실패했어요.`,
      );
    }
  }

  public async TryGiveItem(payload: ItemsTradeInfoDTO, result: GiveResult) {
    const fromName = payload.fromName.trim();
    const toName = payload.toName.trim();

    if (payload.fromName === payload.toName) {
      throw new BadRequestException(`같은 소유자에게는 전달할 수 없어요.`);
    }

    if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
      throw new BadRequestException(`amount는 1 이상의 정수여야 해요.`);
    }

    if (!ALLOWED_PLAYER.has(fromName) || !ALLOWED_PLAYER.has(toName)) {
      throw new BadRequestException(`유효하지 않은 플레이어 이름이에요.`);
    }

    const itemName = payload.itemName.trim();
    const itemResult = new ItemTransactionResult();

    //일단 DB에 있는 아이템인지 체크
    if (await this.FindItem(itemName, itemResult)) {
      //아이템 이름이 정확하게 들어왔을 경우
      const inventoryExists = await this.prisma.inventory.findUnique({
        where: { owner_itemName: { owner: fromName, itemName } },
        select: { amount: true },
      });

      //있는 아이템이긴 한데 캐릭터가 가지고있진 않은 경우
      if (!inventoryExists) {
        throw new BadRequestException(
          `[${itemName}](은)는 「${fromName}」(이)가 가지고 있지 않은 아이템이에요.`,
        );
      }

      //console.log(`TryGiveItem(): GiveItem 직전까지`);
      //여기까지 왔으면 거래 가능
      await this.GiveItem(fromName, toName, itemName, payload.amount, result);
      result.scenario = 0; //처리 없이 한 방에 성공하는 경우
      return;
    } else {
      //no-space로 찾으면 있는 경우 - 정보 저장하고, 버튼 인터랙션으로 옮김
      if (await this.FindItemNoSpace(removeWhitespace(itemName), itemResult)) {
        result.from = fromName;
        result.to = toName;
        result.moved = payload.amount;
        result.itemName = itemResult.itemName;
        result.quality = itemResult.quality as string;
        result.unit = itemResult.unit as string;
        result.scenario = 1;
        return;
      }
      //alias로 찾으면 있는 경우 - 그대로 진행해줌
      if (await this.FindItemAlias(itemName, itemResult)) {
        const inventoryAliasExists = await this.prisma.inventory.findUnique({
          where: {
            owner_itemName: { owner: fromName, itemName: itemResult.itemName },
          },
          select: { amount: true },
        });

        //있는 아이템이긴 한데 캐릭터가 가지고있진 않은 경우
        if (!inventoryAliasExists) {
          throw new BadRequestException(
            `[${itemName}](은)는 「${fromName}」(이)가 가지고 있지 않은 아이템이에요.`,
          );
        }

        //여기까지 왔으면 거래 가능 - Alias로 찾은 정보는 itemResult에 있음
        await this.GiveItem(
          fromName,
          toName,
          itemResult.itemName,
          payload.amount,
          result,
        );

        result.scenario = 3; //alias로 찾은 경우
        return;
      }

      //여기까지 왔으면 그냥 없는 아이템이라는 얘기임
      throw new BadRequestException(
        `${itemName}은 등록되지 않은 아이템이에요.`,
      );
    }
  }

  public async PlayerHasItem(player: InventorySearchResult) {
    const exists = await this.prisma.inventory.findUnique({
      where: {
        owner_itemName: { owner: player.owner, itemName: player.itemName },
      },
      select: { amount: true },
    });

    if (exists) {
      player.amount = exists.amount;
      return true;
    } else return false;
  }

  public async PlayerHasEnoughItem(
    player: string,
    itemName: string,
    amount: number,
  ) {
    const exists = await this.prisma.inventory.findUnique({
      where: {
        owner_itemName: { owner: player, itemName },
        amount: { gte: amount },
      },
      select: { amount: true },
    });

    if (exists) return true;
    else return false;
  }

  //존재가 확정되었을 때 호출하는 함수
  public async GiveItem(
    from: string,
    to: string,
    itemName: string,
    amount: number,
    result: GiveResult,
  ) {
    //이런건 TryGiveItem에서 처리
    /*
    if (!from || !to || !itemName) {
      throw new BadRequestException('from, to, itemName은 필수입니다.');
    }
    if (from === to) {
      throw new BadRequestException('같은 소유자에게는 전달할 수 없습니다.');
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('amount는 1 이상의 정수여야 합니다.');
    }
      추가로, 존재하지 않거나 noSpace, 앨리어싱도 그쪽에서 처리
      */

    //console.log(`GiveItem() 호출됨`);
    await this.prisma.$transaction(async (tx) => {
      //from에서 amount만큼 차감 => 부족하면 실패
      const dec = await tx.inventory.updateMany({
        where: { owner: from, itemName, amount: { gte: amount } },
        data: { amount: { decrement: amount } },
      });

      if (dec.count === 0) {
        //console.log(`GiveItem(): 탐색 호출전`);
        const errRow = await this.prisma.inventory.findUniqueOrThrow({
          where: { owner_itemName: { owner: from, itemName } },
          select: { amount: true },
        });
        //console.log(`GiveItem(): 탐색 호출됨`);
        throw new BadRequestException(
          `보유 수량(${errRow.amount})보다 많이 전달할 수 없어요.`,
        );
      }

      //남은 수량 0이면 from 행 삭제
      const delRes = await tx.inventory.deleteMany({
        where: { owner: from, itemName, amount: 0 },
      });
      const sourceDeleted = delRes.count > 0;

      //to에게 amount만큼 증가 - 없으면 생성, 거래 후 잔량 가져옴
      const toRow = await tx.inventory.upsert({
        where: { owner_itemName: { owner: to, itemName } },
        update: { amount: { increment: amount } },
        create: { owner: to, itemName, amount },
        select: { amount: true },
      });

      //전송 후 from 잔량 조회(삭제되었으면 0)
      const fromAfter = sourceDeleted
        ? 0
        : (await tx.inventory.findUnique({
            where: { owner_itemName: { owner: from, itemName } },
            select: { amount: true },
          }))!.amount;

      //여기까지 왔으면 제대로 처리된 것
      //console.log(`GiveItem(): 정보 처리중`);
      result.itemName = itemName;
      result.from = from;
      result.to = to;
      result.moved = amount;
      result.fromRemaining = fromAfter;
      result.toTotal = toRow.amount;
      result.sourceDeleted = sourceDeleted;

      //포맷팅에 필요한 정보까지 찾아서 넘겨줌
      const itemInfo = await this.prisma.itemsInfo.findUniqueOrThrow({
        where: { name: itemName },
        select: { quality: true, unit: true },
      });
      result.quality = this.QualityNumParser(itemInfo.quality);
      result.unit = itemInfo.unit;
      //console.log(`GiveItem(): 아이템 정보 처리중`);
    });
  }

  public InfoPageStringBuilder(page: ItemInfoPage) {
    const W = { name: 20, quality: 4, type: 6, unit: 4 };

    let result = '';

    result += this.goldService.StringFormatter(
      `📦📋 등록 아이템 현황: 총 (${page.totalItems})개의 아이템, 총 (${page.totalPages})페이지`,
      TextColor.BOLD_WHITE,
      true,
      true,
    );

    result += '\n```ansi\n';
    result += this.goldService.StringFormatter(
      `　현재 (${page.page}/${page.totalPages}) 페이지\n` +
        ` 　=============\n`,
      TextColor.BOLD_WHITE,
      false,
      false,
    );

    result +=
      [
        padMono('　이름', W.name, 'left'),
        padMono('　등급', W.quality, 'left'),
        padMono('　종류', W.type, 'left'),
        padMono('단위', W.unit, 'right'),
      ].join('　') + '\n';

    result += '　';
    result +=
      [
        'ㅡ'.repeat(W.name),
        'ㅡ'.repeat(W.quality),
        'ㅡ'.repeat(W.type),
        'ㅡ'.repeat(W.unit),
      ].join('ㅣ') + '\n';

    for (const r of page.items) {
      let qualityString = this.QualityNumParser(r.quality);
      let color = this.ColorParser(qualityString);
      let colorString = this.goldService.StringFormatter(
        '',
        color,
        false,
        false,
      );
      colorString = replaceSpacesWithFullWidth(colorString);
      result += colorString;
      result +=
        [
          padMono(toFullWidthAscii(r.name), W.name, 'left'),
          padMono(qualityString, W.quality, 'left'),
          padMono(r.type, W.type, 'left'),
          padMono(toFullWidthAscii(r.unit), W.unit, 'right'),
        ].join('　') + '\n';
    }

    result += '```';
    return result;
  }

  public AliasPageStringBuilder(page: AliasInfoPage) {
    const W = { name: 20, alias: 20 };

    let result = '';

    result += this.goldService.StringFormatter(
      `🌟📋 등록 별칭 현황: 총 (${page.totalAlias})개의 별칭, 총 (${page.totalPages})페이지`,
      TextColor.BOLD_WHITE,
      true,
      true,
    );

    result += '\n```ansi\n';
    result += this.goldService.StringFormatter(
      `　현재 (${page.page}/${page.totalPages}) 페이지\n` +
        ` 　=============\n`,
      TextColor.BOLD_WHITE,
      false,
      false,
    );

    result +=
      [
        padMono('　이름', W.name, 'left'),
        padMono('　별칭', W.alias, 'left'),
      ].join('　') + '\n';

    result += '　';
    result += ['ㅡ'.repeat(W.name), 'ㅡ'.repeat(W.alias)].join('ㅣ') + '\n';

    for (const r of page.alias) {
      let qualityString = this.QualityNumParser(r.quality);
      let color = this.ColorParser(qualityString);
      let colorString = this.goldService.StringFormatter(
        '',
        color,
        false,
        false,
      );
      colorString = replaceSpacesWithFullWidth(colorString);
      result += colorString;
      result +=
        [
          padMono(toFullWidthAscii(r.itemName), W.name, 'left'),
          padMono(toFullWidthAscii(r.alias), W.alias, 'left'),
        ].join('　') + '\n';
    }

    result += '```';
    return result;
  }

  public InventoryStringBuilder(
    owner: string,
    inventory: ListedByType,
    gold: number,
  ): string {
    let result = '';
    let ownerColor: TextColor = TextColor.BOLD_GRAY;

    //색깔부터 정함
    switch (owner) {
      case '디어릭':
        ownerColor = TextColor.BOLD_RED;
        break;

      case '하이든':
        ownerColor = TextColor.BOLD_GREEN;
        break;

      case '유라':
        ownerColor = TextColor.BOLD_PINK;
        break;

      case '트릭시':
        ownerColor = TextColor.BOLD_WHITE;
        break;
    }

    //이름 부분
    result += this.goldService.StringFormatter(
      `${owner}`,
      ownerColor,
      true,
      true,
    );
    result += '\n';

    //골드 부분
    result += this.goldService.StringFormatter(
      `${this.goldService.numberFormatter(gold)}G`,
      TextColor.BOLD_YELLOW,
      true,
      true,
    );
    result += '\n';

    //장비 부분 시작점
    result += this.goldService.StringFormatter(
      `장비`,
      TextColor.BOLD_WHITE,
      true,
      false,
    );

    result += this.CategoryStringBuilder(inventory, '장비');

    //끝에 닫아주기
    result += '```\n';

    //소모품 부분
    result += this.goldService.StringFormatter(
      `소모품`,
      TextColor.BOLD_GREEN,
      true,
      false,
    );

    result += this.CategoryStringBuilder(inventory, '소모품');

    result += '```\n';

    //식품 부분
    result += this.goldService.StringFormatter(
      `식품`,
      TextColor.BOLD_WHITE,
      true,
      false,
    );

    result += this.CategoryStringBuilder(inventory, '식품');

    result += '```\n';

    //광물 부분
    result += this.goldService.StringFormatter(
      `광물`,
      TextColor.BOLD_YELLOW,
      true,
      false,
    );

    result += this.CategoryStringBuilder(inventory, '광물');

    result += '```\n';

    //수렵품 부분
    result += this.goldService.StringFormatter(
      `수렵품`,
      TextColor.BOLD_RED,
      true,
      false,
    );

    result += this.CategoryStringBuilder(inventory, '수렵품');

    result += '```\n';

    //채집물 부분
    result += this.goldService.StringFormatter(
      `채집물`,
      TextColor.BOLD_LIME,
      true,
      false,
    );

    result += this.CategoryStringBuilder(inventory, '채집물');

    result += '```\n';

    //기타아이템 부분
    result += this.goldService.StringFormatter(
      `기타아이템`,
      TextColor.BOLD_WHITE,
      true,
      false,
    );

    result += this.CategoryStringBuilder(inventory, '기타아이템');

    result += '```\n';

    //매개체 부분
    result += this.goldService.StringFormatter(
      `매개체`,
      TextColor.BOLD_RED,
      true,
      false,
    );

    result += this.CategoryStringBuilder(inventory, '매개체');

    result += '```\n';

    //그 외, 서버에서 잡진 않지만 출력만 해주는 것들
    result +=
      '```ansi\n[1;34m 동물\n[0;37m \n```\n```ansi\n[1;30m 제작툴\n[0;37m \n```\n```ansi\n[1;37m 보유 시설\n[0;37m ```';

    return result;
  }

  public CategoryStringBuilder(category: ListedByType, key: string): string {
    let result = '\n';
    const categoryList = category[key];

    let prevQuality = '없음';
    let color = TextColor.NONE;

    if (categoryList && categoryList.length > 0) {
      //값이 있는 경우에만 이어붙여줌, 없으면 그냥 빈 문자열 반환
      categoryList.forEach((element) => {
        //새 등급 정렬이 시작되는 경우 => prevQuality에 저장된 값이랑 다른 경우, 색깔 텍스트 적용
        if (prevQuality !== this.QualityNumParser(element.quality))
          color = this.ColorParser(this.QualityNumParser(element.quality));
        else color = TextColor.NONE;

        //문자열 연결
        result += this.goldService.StringFormatter(
          `${element.name} ${element.amount}${element.unit},`,
          color,
          false,
          false,
        );
      });
    } else result = '\n[0;37m \n';

    return result;
  }

  public QualityStringParser(quality: string | null): number {
    if (!quality) return 0;

    let qualityNum = 0;
    switch (quality) {
      case '일반':
        qualityNum = 1;
        break;
      case '고급':
        qualityNum = 2;
        break;
      case '희귀':
        qualityNum = 3;
        break;
      case '영웅':
        qualityNum = 4;
        break;
      case '진귀':
        qualityNum = 5;
        break;
      case '서사':
        qualityNum = 6;
        break;
      case '전설':
        qualityNum = 7;
        break;
      case '유일':
        qualityNum = 8;
        break;
    }
    return qualityNum;
  }

  public QualityNumParser(qualityNum: number | null): string {
    if (!qualityNum) return '';

    let quality = '';
    switch (qualityNum) {
      case 1:
        quality = '일반';
        break;
      case 2:
        quality = '고급';
        break;
      case 3:
        quality = '희귀';
        break;
      case 4:
        quality = '영웅';
        break;
      case 5:
        quality = '진귀';
        break;
      case 6:
        quality = '서사';
        break;
      case 7:
        quality = '전설';
        break;
      case 8:
        quality = '유일';
        break;
    }
    return quality;
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
        return TextColor.BOLD_RED;
      case '전설':
        return TextColor.BOLD_YELLOW;
      case '유일':
        return TextColor.BOLD_GREEN;
      default:
        return TextColor.BOLD_WHITE;
    }
  }

  public extractAnsiBlocks(full: string): string[] {
    // ```ansi ... ``` 블록만 추출 (펜스 포함). 없으면 전체를 하나의 ansi 블록으로 감싼다.
    const re = /```ansi\b([\s\S]*?)```/gi;
    const blocks: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(full)) !== null) {
      const inner = m[1]; // 앞뒤 공백은 보존 (블록 그대로 내보내기 위함)
      blocks.push(this.wrapAnsi(inner));
    }
    if (blocks.length === 0) {
      blocks.push(this.wrapAnsi(full));
    }
    return blocks;
  }

  public wrapAnsi(content: string) {
    return `\`\`\`ansi\n${content}\n\`\`\``;
  }

  public packAnsiBlocks(blocks: string[], maxLen = 2000): string[] {
    const res: string[] = [];
    let buf = '';

    const pushBuf = () => {
      if (buf.length > 0) {
        res.push(buf);
        buf = '';
      }
    };

    for (const b of blocks) {
      if (b.length > maxLen) {
        const preview = b.slice(0, 60).replace(/\n/g, ' ');
        throw new Error(
          `단일 ANSI 블록이 ${b.length}자로 2000자 제한을 초과해요. (미리보기: ${preview}...)`,
        );
      }

      if (buf.length === 0) {
        buf = b;
        continue;
      }

      const sep = '\n';
      const candidateLen = buf.length + sep.length + b.length;

      if (candidateLen <= maxLen) {
        buf += sep + b;
      } else {
        pushBuf();
        buf = b;
      }
    }

    pushBuf();
    return res;
  }
}
