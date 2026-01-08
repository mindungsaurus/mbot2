// import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PublishEncounterDTO {
  // @IsOptional()
  // @IsString()
  channelId?: string; // 숫자 ID 또는 <#123...> 형태도 들어올 수 있음

  // @IsOptional()
  // @IsBoolean()
  saveAsDefault?: boolean;
}
