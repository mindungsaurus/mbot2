import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class ItemsUseInfoDTO {
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
}
