import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * F082 §5.2 PUT /api/v1/assignment/ratios/personnel/{listNo} Request Body
 *
 * 覆寫式寫入：先 DELETE 該 (list_no, deptid_m) 之既有，再 INSERT。
 * F083 §5.2：可附 appliedTemplate 供後端二次校驗。
 */
export class PersonnelRatioEmployeeDto {
  @IsString()
  @MaxLength(6)
  empId: string;

  @IsString()
  @MaxLength(50)
  empName: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  ration: number;
}

export class AppliedTemplateDto {
  @IsIn(['+10%', '+20%', '-10%', '-20%'])
  template: '+10%' | '+20%' | '-10%' | '-20%';

  @IsString()
  @MaxLength(6)
  targetEmpId: string;
}

export class SetPersonnelRatioDto {
  @IsString()
  @MaxLength(6)
  deptCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  deptName?: string;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PersonnelRatioEmployeeDto)
  employees: PersonnelRatioEmployeeDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AppliedTemplateDto)
  appliedTemplate?: AppliedTemplateDto;
}
