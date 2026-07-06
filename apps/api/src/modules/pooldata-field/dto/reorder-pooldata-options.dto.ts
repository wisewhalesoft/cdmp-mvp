import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/**
 * F076：PATCH /api/v1/pooldata-fields/:columnName/options/reorder 請求體
 * orderedValues：欲套用的 option_value 完整排序陣列（display_order = 陣列索引）。
 */
export class ReorderPooldataOptionsDto {
  @IsArray({ message: 'orderedValues 必須為陣列' })
  @ArrayNotEmpty({ message: 'orderedValues 不得為空' })
  @IsString({ each: true, message: 'orderedValues 每個元素必須為字串' })
  orderedValues: string[];
}
