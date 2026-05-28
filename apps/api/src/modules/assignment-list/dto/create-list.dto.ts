import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
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
 * F050 v2.1 POST /api/v1/assignment/lists（路由 v1：/lists；spec 標 list-definitions，本階段沿用實作）
 *
 * v2.1 重寫（2026-05-20 / AD-E07-18）：
 *   - 移除 v2.0 之 prodKind / caseYear / specTp / caseStatus / settleSrc 5 個一級欄位
 *     （改由後端依 conditionPayload 衍生填入 entity column，BR-10 / §18.6）
 *   - conditionPayload 升為必填 source of truth（§F050 §5.4）
 *
 * 必填欄位（spec §5.1 v2.1）：list_nm / list_period_start / list_period_end /
 *   list_interval / conditionPayload（至少 1 個 conditions）
 *
 * 系統管理欄位（list_no / list_type / project_workym / status / stage / audit）
 *   不在表單中，由 service 端產生。
 */
export class CreateListDto {
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

  // 選填欄位
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

  // spec §6.1：選填，用於稽核紀錄來源（前端 copy 模式，service 校驗 source legacy）
  @IsOptional()
  @IsString()
  copyFromListNo?: string | null;

  /**
   * F097 fix：分派作業月份 target_work_ym（YYYYMM）。前端帶共享 AssignmentWorkYmContext
   * 的作業月；後端據此寫 project_workym、LIST_NO 前綴與同月唯一性範圍。缺省時 controller
   * fallback 為 current_work_ym。格式（MM 01-12）/ ±12 範圍 / 歷史月 guard 於 controller 驗證。
   */
  @IsOptional()
  @IsString()
  workYm?: string;

  /**
   * F050 v2.1 動態篩選條件（必填；§F050 §5.4 JSON Schema）。
   *
   * Service 層另校驗：
   *   - 每 columnName ∈ F075 active whitelist（CONDITION_COLUMN_NOT_IN_WHITELIST）
   *   - columnName ∉ {list_period_start, list_period_end, list_interval}（RESERVED_FIELD_IN_CONDITIONS）
   *   - 同 columnName 不重複（VALIDATION_ERROR）
   */
  @IsDefined({ message: 'conditionPayload 為必填' })
  @IsObject({ message: 'conditionPayload 必須為物件' })
  @ValidateNested()
  @Type(() => ConditionPayloadDto)
  conditionPayload!: ConditionPayloadDto;
}
