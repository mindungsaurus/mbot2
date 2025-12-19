import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class ItemsTransactionsInfoDTO {
  @StringOption({
    name: 'owner',
    description: 'owner of the item',
    required: true,
  })
  owner: string;

  @StringOption({
    name: 'item_name',
    description: 'name of the item',
    required: true,
  })
  item_name: string;

  @IntegerOption({
    name: 'amount',
    description: 'integer quantity',
    required: true,
  })
  amount: number;

  @StringOption({
    name: 'quality',
    description: 'quality of the item, should be specific values.',
    required: false,
  })
  item_quality: string;

  @StringOption({
    name: 'type',
    description: 'type of the item, should be specific values.',
    required: false,
  })
  item_type: string;

  @StringOption({
    name: 'unit',
    description: `unit of the item, such as 'oz, ml, ...'`,
    required: false,
  })
  item_unit: string;
}
