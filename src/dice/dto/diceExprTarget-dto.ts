import { IntegerOption, NumberOption, StringOption } from 'necord';

export class DiceExprTargetDTO {
  @StringOption({
    name: 'expr',
    description: 'Dice expression (e.g. (((2d12)*2+3+2)*1.6+1d8)*2)',
    required: true,
  })
  expr!: string;

  @NumberOption({
    name: 'target',
    description: 'Target value to compare against',
    required: true,
  })
  target!: number;

  @StringOption({
    name: 'cmp',
    description: 'Comparator: >=, >, <=, <, ==, != (default: >=)',
    required: false,
  })
  cmp?: string;

  @IntegerOption({
    name: 'samples',
    description:
      'Monte Carlo samples when exact calc is too big (default: auto)',
    required: false,
  })
  samples?: number;
}
