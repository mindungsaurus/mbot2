import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class CharacterInfoDTO {
  @StringOption({
    name: 'character',
    description: 'character name',
    required: true,
  })
  character: string;

  @BooleanOption({
    name: 'isnpc',
    description: 'Is the character NPC?',
    required: true,
  })
  isNpc: boolean;

  @StringOption({
    name: 'friend',
    description: `If NPC, who is this NPC's friend?`,
    required: false,
  })
  friend: string;
}
