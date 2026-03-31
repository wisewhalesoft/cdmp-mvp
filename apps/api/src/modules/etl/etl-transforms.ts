/**
 * F036 v2.0: ETL Transform Functions
 * 電話合併、DECIMAL 轉換、客戶類型對應、代碼描述轉換
 */

/**
 * Check if a value is a placeholder (all zeros)
 */
function isAllZeros(value: string): boolean {
  return /^0+$/.test(value);
}

/**
 * Merge area code, tel number and optional extension into phone string.
 * Format: "{areaCode}-{telNo}" or "{areaCode}-{telNo}#{exten}" when extension exists.
 * Returns null if areaCode or telNo is null/empty/all-zeros.
 */
export function mergePhone(areaCode: string | null, telNo: string | null, exten?: string | null): string | null {
  if (!areaCode || !telNo) return null;

  if (isAllZeros(areaCode) || isAllZeros(telNo)) return null;

  const base = `${areaCode}-${telNo}`;
  if (exten && !isAllZeros(exten)) {
    return `${base}#${exten}`;
  }
  return base;
}

/**
 * Convert varchar to decimal number.
 * Returns null for non-numeric, empty, or null values.
 */
export function toDecimal(value: string | null): number | null {
  if (value === null || value === '') return null;

  const num = parseFloat(value);
  if (isNaN(num)) return null;

  return num;
}

/**
 * Map customer type between different source systems.
 * ZZIP: already 2-digit format, return as-is.
 * MLMC: single digit, pad to 2 digits.
 */
export function mapCustomerType(source: 'ZZIP' | 'MLMC', value: string): string {
  if (source === 'ZZIP') return value;

  // MLMC: pad to 2 digits (1 -> 01, 2 -> 02)
  return value.padStart(2, '0');
}

/**
 * Look up code description from a code lookup table.
 * Code is always preserved; desc is null if not found.
 */
export function lookupCodeDescription(
  _codeType: string,
  codeValue: string,
  codeLookupTable: Map<string, string>,
): { code: string; desc: string | null } {
  const desc = codeLookupTable.get(codeValue) ?? null;
  return { code: codeValue, desc };
}
