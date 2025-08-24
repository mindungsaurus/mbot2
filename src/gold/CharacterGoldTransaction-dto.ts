import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class CharacterGoldTransactionDTO {
  @StringOption({
    name: 'from',
    description: 'character name (from)',
    required: true,
  })
  from: string;

  @StringOption({
    name: 'to',
    description: 'character name (to)',
    required: true,
  })
  to: string;

  @IntegerOption({
    name: 'amount',
    description: `the amount of gold`,
    required: true,
  })
  amount: number;
}
