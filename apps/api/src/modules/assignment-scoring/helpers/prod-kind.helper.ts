import { UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';

/**
 * F070 AC-5 / F071 AC-6 v2.1：驗證 prod_kind 必須存在於 `pooldata_field_option`
 *   `column_name='prod_kind'` 且 `is_active=true` 之 active 紀錄。
 *
 * v2.1 變更（AD-E07-18 §18.2.7 / §18.7 / §18.10 R7）：
 *   - 原讀 `ob_code_df WHERE tbl_id='PROD_KIND'` + `stadt/enddt` 期間判定，
 *     已遷移至 `pooldata_field_option WHERE column_name='prod_kind' AND is_active=true`，
 *     與 M5 migration（刪 ob_code_df 三組 tbl_id 紀錄）為同 commit deployment gate。
 *   - 啟用期間語意改為 `is_active` 布林旗標（pooldata_field_option 表無 stadt/enddt 欄位）。
 *
 * 違反 → 422 VALIDATION_ERROR，details 標明 prodKind 欄位。
 *
 * @param optionRepo PooldataFieldOption repository
 * @param prodKind   待驗證的 PROD_KIND code
 */
export async function assertProdKindActive(
  optionRepo: Repository<PooldataFieldOption>,
  prodKind: string,
): Promise<void> {
  const row = await optionRepo.findOne({
    where: {
      column_name: 'prod_kind' as any,
      option_value: prodKind as any,
      is_active: true as any,
    },
  });

  if (!row) {
    throw new UnprocessableEntityException({
      error: 'VALIDATION_ERROR',
      message: `prodKind '${prodKind}' 不存在於 pooldata_field_option (column_name='prod_kind') 啟用紀錄`,
      details: { field: 'prodKind', value: prodKind },
    });
  }
}

/**
 * @deprecated v2.1（F050 v2.1 重構）— pooldata_field_option 採 is_active 布林旗標，
 * 無需 stadt/enddt 期間判定。保留此函式供既有 service 引用點過渡（如 F069
 * listCardTypes 之 active 判定改為 row.is_active 直接判定）。
 */
export function isWithinActivePeriod(
  stadt: string | null | undefined,
  enddt: string | null | undefined,
  today: string,
): boolean {
  if (stadt && today < stadt) return false;
  if (enddt && today > enddt) return false;
  return true;
}

/** 取得今日 YYYYMMDD（F070 BR-3：ob_levelcard_version.sdate 初值用） */
export function todayYyyymmdd(): string {
  const d = new Date();
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${dd}`;
}

/**
 * 取得 ob_levelcard_version.sdate 初值（F070 BR-3：今日 YYYYMMDD）。
 * 等同 todayYyyymmdd()，但語意明確便於閱讀。
 */
export const sdateToday = todayYyyymmdd;
