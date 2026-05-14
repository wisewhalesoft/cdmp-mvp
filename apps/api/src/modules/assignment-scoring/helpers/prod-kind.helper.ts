import { UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';

/**
 * F070 AC-5 / F071 AC-6：驗證 prod_kind 必須存在於 `ob_code_df` 啟用期間內紀錄。
 *
 * 啟用期間判定（與 F068 一致）：
 *   stadt <= today <= enddt（VARCHAR(8) YYYYMMDD 字串比較）
 *   stadt / enddt 任一為 null 視為「無限制」邊界。
 *
 * 違反 → 422 VALIDATION_ERROR，details 標明 prodKind 欄位。
 *
 * @param codeDfRepo ObCodeDf repository
 * @param prodKind   待驗證的 PROD_KIND code
 */
export async function assertProdKindActive(
  codeDfRepo: Repository<ObCodeDf>,
  prodKind: string,
): Promise<void> {
  const row = await codeDfRepo.findOne({
    where: {
      system_id: 'OB' as any,
      tbl_id: 'PROD_KIND' as any,
      tbl_cd: prodKind as any,
    },
  });

  const isActive = row
    ? isWithinActivePeriod(row.stadt, row.enddt, todayYyyymmdd())
    : false;

  if (!isActive) {
    throw new UnprocessableEntityException({
      error: 'VALIDATION_ERROR',
      message: `prodKind '${prodKind}' 不存在於 ob_code_df PROD_KIND 啟用期間內紀錄`,
      details: { field: 'prodKind', value: prodKind },
    });
  }
}

/** 啟用期間判定（純函式，供測試覆蓋） */
export function isWithinActivePeriod(
  stadt: string | null | undefined,
  enddt: string | null | undefined,
  today: string,
): boolean {
  if (stadt && today < stadt) return false;
  if (enddt && today > enddt) return false;
  return true;
}

/** 取得今日 YYYYMMDD（與 ob_code_df stadt/enddt 格式一致） */
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
