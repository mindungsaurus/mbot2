// NpcFriend-dto.ts
import { StringOption } from 'necord';

export class NpcFriendDTO {
  @StringOption({
    name: 'npc',
    description: 'target NPC name',
    required: true,
  })
  npc: string;

  @StringOption({
    name: 'friend',
    description: 'Who is the friend (PC name). Leave blank to remove friend',
    required: false,
  })
  friend: string | null;
}
