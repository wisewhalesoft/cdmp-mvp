import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * F079 §5.2 PUT /api/v1/assignment/ratios/dept/{listNo} Request Body
 *
 * 覆寫式寫入：先 DELETE 既有，再 INSERT payload。
 */
export class DeptRatioItemDto {
  @IsString()
  @MaxLength(6)
  obdeptId: string;

  @IsString()
  @MaxLength(10)
  obdeptNm: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  ration: number;
}

export class SetDeptRatioDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeptRatioItemDto)
  deptRatios: DeptRatioItemDto[];
}
