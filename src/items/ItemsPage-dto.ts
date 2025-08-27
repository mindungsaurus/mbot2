import { BooleanOption, IntegerOption, StringOption } from 'necord';

export class ItemsPageDTO {
  @IntegerOption({
    name: 'page',
    description: 'number of page',
    required: true,
  })
  page: number;
}
