import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * F051 v2.0 PUT /api/v1/assignment/lists/:listNo
 *
 * 與 CreateListDto 同欄位（不含 copyFromListNo），覆寫式更新。
 * `case_status` 必填（不允許清空，spec AC-6b / BR-6）。
 */
export class UpdateListDto {
  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  @MaxLength(45)
  listNm: string;

  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  prodKind: string;

  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  caseYear: string;

  @IsString()
  @IsNotEmpty({ message: '此欄位為必填' })
  specTp: string;

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
   * F051 v2.0 / F050 v2.0 一致：動態篩選條件（data-model.md L850）。
   * 接受 DTO 並用於 WHITELIST_OPTION_INACTIVE warning 計算（不持久化於本批次）。
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
