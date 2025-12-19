import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class ItemsNameDTO {
  @StringOption({
    name: 'item_name',
    description: 'name of the item',
    required: true,
  })
  item_name: string;
}
