import { IsBoolean, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * F068 §5.1: GET /api/v1/assignment/codes 查詢參數
 *
 * tblId 限定值由 Service 層驗證（拋 CODE_TYPE_INVALID 422）；
 * 此處 DTO 僅做型別 / 必填驗證。
 */
export class ListCodesQueryDto {
  @IsString({ message: 'tblId 必須為字串' })
  @IsNotEmpty({ message: '請提供 tblId' })
  tblId: string;

  // includeInactive 預設 false。允許 query string 'true'/'false' → boolean 轉型
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
  })
  @IsBoolean({ message: 'includeInactive 必須為布林值' })
  includeInactive?: boolean = false;
}
