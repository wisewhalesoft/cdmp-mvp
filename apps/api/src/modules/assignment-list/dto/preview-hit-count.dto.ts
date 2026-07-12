import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsIn,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ConditionItemDto } from './condition-item.dto';

/**
 * F050 v2.4 §6.3：POST /assignment/list-definitions/preview-hit-count 之 conditionPayload。
 *
 * 與 ConditionPayloadDto（建立名單用）差異：**不**強制 ArrayMinSize（AC-10 最低條件數為儲存時規則，
 * 本預覽端點不強制，TS-F050-S07）；conditions=[] 合法（後端仍會注入 best_case 系統固定條件）。
 */
export class PreviewHitCountConditionPayloadDto {
  @IsArray({ message: 'conditions 必須為陣列' })
  @ValidateNested({ each: true })
  @Type(() => ConditionItemDto)
  conditions!: ConditionItemDto[];

  @IsOptional()
  @IsIn(['AND'], { message: 'logic 目前僅支援 "AND"' })
  logic?: 'AND';

  // 兼容 entity ObListDefinitionConditionPayload interface 之 index signature
  [key: string]: unknown;
}

/**
 * F050 v2.4 §6.3 request body（草稿階段抽樣估算，無 listNo）。
 */
export class PreviewHitCountDto {
  @IsDefined({ message: 'conditionPayload 為必填' })
  @IsObject({ message: 'conditionPayload 必須為物件' })
  @ValidateNested()
  @Type(() => PreviewHitCountConditionPayloadDto)
  conditionPayload!: PreviewHitCountConditionPayloadDto;
}
