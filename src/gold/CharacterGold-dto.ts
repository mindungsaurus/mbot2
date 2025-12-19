import { IntegerOption, StringOption } from 'necord';

export class CharacterGoldDTO {
  @StringOption({
    name: 'character',
    description: 'character name',
    required: true,
  })
  character: string;

  @IntegerOption({
    name: 'change',
    description: 'integer value of the command',
    required: true,
  })
  change: number;
}
