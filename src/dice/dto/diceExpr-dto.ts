import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class DiceExprDTO {
  @StringOption({
    name: 'expr',
    description: 'dice expression',
    required: true,
  })
  expr: string;

  @BooleanOption({
    name: 'sort',
    description: 'sort individual dice rolls in the output',
    required: false,
  })
  sort?: boolean;
}
