import { StringOption } from 'necord';

export class CharacterNameDTO {
  @StringOption({
    name: 'character',
    description: 'character name',
    required: true,
  })
  character: string;
}
