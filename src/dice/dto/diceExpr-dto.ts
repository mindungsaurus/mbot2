import { IntegerOption, StringOption } from 'necord';

export class DiceExprDTO {
  @StringOption({
    name: 'expr',
    description: 'dice expression',
    required: true,
  })
  expr: string;
}
