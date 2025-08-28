import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class ItemsAliasDTO {
  @StringOption({
    name: 'item_name',
    description: 'name of the item',
    required: true,
  })
  item_name: string;

  @StringOption({
    name: 'alias',
    description: 'alias of the item',
    required: true,
  })
  alias: string;
}
