import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsString,
  Matches,
  Min,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * F050 v2.1 / F051 v2.1：condition_payload.conditions[] 單一項目 schema
 *
 * 對應：
 *   - F050 §5.4 condition_payload JSON Schema
 *   - F050 §BR-11 lowercase snake_case
 *   - AD-E07-18 §18.4 validateConditionPayload service 層補：whitelist active / reserved 等
 *
 * 依 fieldType 分流欄位：
 *   - categorical：values: string[]（至少 1 元素）
 *   - numeric：min / max（max >= min）
 *   - date：dateStart / dateEnd ISO8601（dateEnd >= dateStart）
 */

/**
 * 確保 max >= min；max 缺值或 min 缺值時不阻擋（由 IsNumber 處理）。
 */
function MaxGteMinConstraint(otherField: 'min', validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxGteMin',
      target: object.constructor,
      propertyName,
      constraints: [otherField],
      options: validationOptions ?? { message: 'max 必須 >= min' },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[otherField];
          if (typeof value !== 'number' || typeof other !== 'number') return true;
          return value >= other;
        },
      },
    });
  };
}

/**
 * 確保 dateEnd >= dateStart（依字串字典序比較對 ISO8601 安全）；任一缺值不阻擋。
 */
function DateEndGteStartConstraint(
  otherField: 'dateStart',
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'dateEndGteStart',
      target: object.constructor,
      propertyName,
      constraints: [otherField],
      options: validationOptions ?? { message: 'dateEnd 必須 >= dateStart' },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[otherField];
          if (typeof value !== 'string' || typeof other !== 'string') return true;
          return value >= other;
        },
      },
    });
  };
}

export class ConditionItemDto {
  /**
   * 篩選欄位名稱（POOLDATA 欄位名）。
   * - 強制 lowercase snake_case（對齊 ob_pool_data 與 F075 v1.4.3 BR-14）
   * - service 層另驗：必在 F075 active whitelist；不可為 list_period_* 保留欄位
   */
  @IsString({ message: 'columnName 必須為字串' })
  @Matches(/^[a-z][a-z0-9_]{0,63}$/, {
    message: 'columnName 必須為 lowercase snake_case（regex /^[a-z][a-z0-9_]{0,63}$/）',
  })
  columnName!: string;

  @IsIn(['categorical', 'numeric', 'date'], {
    message: 'fieldType 必須為 categorical / numeric / date 之一',
  })
  fieldType!: 'categorical' | 'numeric' | 'date';

  // ---- categorical ----
  @ValidateIf((o: ConditionItemDto) => o.fieldType === 'categorical')
  @IsArray({ message: 'values 必須為字串陣列' })
  @ArrayMinSize(1, { message: 'categorical 條件 values 至少需 1 個元素' })
  @IsString({ each: true })
  values?: string[];

  // ---- numeric ----
  @ValidateIf((o: ConditionItemDto) => o.fieldType === 'numeric')
  @IsNumber({}, { message: 'numeric 條件 min 必填且為數字' })
  min?: number;

  @ValidateIf((o: ConditionItemDto) => o.fieldType === 'numeric')
  @IsNumber({}, { message: 'numeric 條件 max 必填且為數字' })
  @MaxGteMinConstraint('min', { message: 'numeric 條件 max 必須 >= min' })
  max?: number;

  // ---- date ----
  @ValidateIf((o: ConditionItemDto) => o.fieldType === 'date')
  @IsDateString({}, { message: 'date 條件 dateStart 必填且為 ISO8601 日期字串' })
  dateStart?: string;

  @ValidateIf((o: ConditionItemDto) => o.fieldType === 'date')
  @IsDateString({}, { message: 'date 條件 dateEnd 必填且為 ISO8601 日期字串' })
  @DateEndGteStartConstraint('dateStart', { message: 'date 條件 dateEnd 必須 >= dateStart' })
  dateEnd?: string;

  // 兼容 entity ObListDefinitionConditionItem interface 之 index signature
  [key: string]: unknown;
}
