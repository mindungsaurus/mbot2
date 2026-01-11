// NpcFriend-dto.ts
import { StringOption } from 'necord';

export class NpcFriendDTO {
  @StringOption({
    name: 'npc',
    description: '대상 NPC 이름',
    required: true,
  })
  npc: string;

  @StringOption({
    name: 'friend',
    description: '누구의 동료인지(PC 이름). 비우면 동료 해제',
    required: false,
  })
  friend: string | null;
}
