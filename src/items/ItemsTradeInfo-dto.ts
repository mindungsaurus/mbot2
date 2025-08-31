import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class ItemsTradeInfoDTO {
  @StringOption({
    name: 'from',
    description: 'owner of the item',
    required: true,
  })
  fromName: string;

  @StringOption({
    name: 'to',
    description: 'addressee of the item',
    required: true,
  })
  toName: string;

  @StringOption({
    name: 'item_name',
    description: 'name of the item',
    required: true,
  })
  itemName: string;

  @IntegerOption({
    name: 'amount',
    description: 'amount of the item',
    required: true,
  })
  amount: number;
}
