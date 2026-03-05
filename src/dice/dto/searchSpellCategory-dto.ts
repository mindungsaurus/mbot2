import { StringOption } from 'necord';

export class SearchSpellCategoryDTO {
  @StringOption({
    name: 'level',
    description: '주문 레벨 (예: 소마법, 1, 2레벨)',
    required: true,
  })
  level!: string;

  @StringOption({
    name: 'school',
    description: '학파 이름 키워드 (예: 변환술)',
    required: true,
  })
  school!: string;

  @StringOption({
    name: 'learn',
    description: '습득 키워드 (예: 위저드, 바드)',
    required: false,
  })
  learn?: string;
}
