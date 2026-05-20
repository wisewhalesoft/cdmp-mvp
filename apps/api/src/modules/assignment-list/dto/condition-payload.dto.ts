import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ConditionItemDto } from './condition-item.dto';

/**
 * F050 v2.1 / F051 v2.1：condition_payload JSON Schema（§F050 §5.4）
 *
 * - conditions：至少 1 個元素
 * - logic：固定 'AND'（MVP only）
 * - 容許 _backfill_empty: true metadata（m282 backfill 寫入時設置）
 *
 * 對應 spec：
 *   - F050 §5.4 / §AC-10 / §BR-6
 *   - AD-E07-18 §18.2.9 / §18.5.2（空 conditions skip 規則由 service / Stage 1 處理，非 DTO）
 */
export class ConditionPayloadDto {
  @IsArray({ message: 'conditions 必須為陣列' })
  @ArrayMinSize(1, { message: '篩選條件不得為空，請至少設定一個欄位' })
  @ValidateNested({ each: true })
  @Type(() => ConditionItemDto)
  conditions!: ConditionItemDto[];

  @IsIn(['AND'], { message: 'logic 目前僅支援 "AND"' })
  logic!: 'AND';

  // m282 backfill metadata；不阻擋 DTO 驗證
  @IsOptional()
  _backfill_empty?: boolean;

  // 兼容 entity ObListDefinitionConditionPayload interface 之 index signature
  [key: string]: unknown;
}
