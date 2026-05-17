import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * F050 v2.0 POST /api/v1/assignment/lists
 *
 * 必填欄位（spec §5.1）：list_nm / prod_kind / caseyear / spec_tp /
 *   case_status / list_period_start / list_period_end / list_interval / settle_src
 *
 * 多值欄位以 `$$` 分隔字串儲存（spec BR-3 / data-model.md L844）。
 *
 * 系統管理欄位（list_no / list_type / project_workym / status / audit）
 *   不在表單中，由 service 端產生。
 */
export class CreateListDto {
  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  @MaxLength(45)
  listNm: string;

  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  prodKind: string;

  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  caseYear: string; // 多選 `$$` 分隔（例：'1$$2'）

  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  specTp: string; // 多選 `$$` 分隔

  /**
   * case_status：必填多選（spec AC-7b / BR-6）。
   * 多值以 `$$` 分隔（例：'01$$02'），可選代碼來源 `ob_code_df` tbl_id='CASE_STATUS'。
   * 422 `CASE_STATUS_REQUIRED` 由 service 額外驗證（spec API §6.1）。
   */
  @IsString({ message: '案件結清期別為必填，請至少選取一項' })
  @IsNotEmpty({ message: '案件結清期別為必填，請至少選取一項' })
  caseStatus: string;

  @IsInt()
  @Min(0)
  @Max(999)
  listPeriodStart: number;

  @IsInt()
  @Min(0)
  @Max(999)
  listPeriodEnd: number;

  @IsInt()
  @Min(0)
  @Max(999)
  listInterval: number;

  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  settleSrc: string;

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

  // spec §6.1：選填，用於稽核紀錄來源
  @IsOptional()
  @IsString()
  copyFromListNo?: string | null;

  /**
   * F050 v2.0 動態篩選條件（data-model.md L850）
   *
   * schema: `{ conditions: [{ columnName, fieldType, values?, ... }], logic: 'AND' | 'OR' }`
   *
   * 本 MVP 批次（P2 補完）：尚未持久化至 ob_list_definition.condition_payload 欄位
   * （該欄位 migration 未實作），但接受 DTO 並用於 WHITELIST_OPTION_INACTIVE warning 計算。
   *
   * 後續批次將補 entity column + migration + 月跑 Stage 1 動態 SQL 組成。
   */
  @IsOptional()
  conditionPayload?: {
    conditions?: Array<{
      columnName: string;
      fieldType?: string;
      values?: string[];
      [k: string]: unknown;
    }>;
    logic?: 'AND' | 'OR';
    [k: string]: unknown;
  };
}
