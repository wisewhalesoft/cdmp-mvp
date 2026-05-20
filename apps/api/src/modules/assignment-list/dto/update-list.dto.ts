import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ConditionPayloadDto } from './condition-payload.dto';

/**
 * F051 v2.1 PUT /api/v1/assignment/lists/:listNo
 *
 * v2.1 重寫（2026-05-20 / AD-E07-18）：
 *   - 移除 v2.0 之 prodKind / caseYear / specTp / caseStatus / settleSrc 5 個一級欄位
 *     （後端依 conditionPayload 衍生填入 entity column）
 *   - conditionPayload 為 OPTIONAL（舊名單 condition_payload IS NULL 可只送 listNm 等非篩選欄位）；
 *     service 層判斷 4-state（new + provided / new + omitted / legacy + provided / legacy + omitted）
 *
 * 不接受 copyFromListNo（屬 Create 專屬）。
 */
export class UpdateListDto {
  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  @MaxLength(45)
  listNm!: string;

  @IsInt()
  @Min(0)
  @Max(999)
  listPeriodStart!: number;

  @IsInt()
  @Min(0)
  @Max(999)
  listPeriodEnd!: number;

  @IsInt()
  @Min(0)
  @Max(999)
  listInterval!: number;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  cardType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  prodBest?: string | null;

  @IsOptional()
  @IsBoolean()
  crEnabled?: boolean;

  /**
   * F051 v2.1 動態篩選條件（OPTIONAL；§F050 §5.4 JSON Schema）。
   *
   * 4-state semantics（service 層處理）：
   *   - existing.condition_payload IS NULL + dto.conditionPayload provided → 422 LEGACY_LIST_CONDITION_READONLY
   *   - existing.condition_payload IS NULL + dto.conditionPayload undefined → OK（PUT 非篩選欄位）
   *   - existing.condition_payload NOT NULL + dto.conditionPayload undefined → 422 VALIDATION_ERROR
   *   - existing.condition_payload NOT NULL + dto.conditionPayload provided + stage='draft' → 正常覆寫
   */
  @IsOptional()
  @IsObject({ message: 'conditionPayload 必須為物件' })
  @ValidateNested()
  @Type(() => ConditionPayloadDto)
  conditionPayload?: ConditionPayloadDto;
}
