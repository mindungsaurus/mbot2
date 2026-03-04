import { StringOption } from 'necord';

export class SearchTitleDTO {
  @StringOption({
    name: 'keyword',
    description: '검색할 제목 일부 또는 전체',
    required: true,
  })
  keyword!: string;
}

