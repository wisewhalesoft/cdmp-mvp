/**
 * Masking utility for sensitive customer data.
 * Used by C360 service layer to mask data for User role.
 */

/**
 * Mask ID number: keep first 3 + last 2, fill middle with '*'
 * Example: A123456789 -> A12****89
 */
export function maskIdNumber(value: string | null | undefined): string | null {
  if (value == null) return null;
  const prefixLen = 3;
  const suffixLen = 2;
  if (value.length <= prefixLen + suffixLen) return value;
  const middle = '*'.repeat(value.length - prefixLen - suffixLen);
  return value.slice(0, prefixLen) + middle + value.slice(-suffixLen);
}

/**
 * Mask phone number: keep first 4 + last 2, fill middle with '*'
 * Example: 0912345678 -> 0912***78
 */
export function maskPhone(value: string | null | undefined): string | null {
  if (value == null) return null;
  const prefixLen = 4;
  const suffixLen = 2;
  if (value.length <= prefixLen + suffixLen) return value;
  const middle = '*'.repeat(value.length - prefixLen - suffixLen);
  return value.slice(0, prefixLen) + middle + value.slice(-suffixLen);
}

/**
 * Mask email: keep first 2 chars before @, replace rest with '****', keep domain
 * Example: wang@example.com -> wa****@example.com
 */
export function maskEmail(value: string | null | undefined): string | null {
  if (value == null) return null;
  const atIndex = value.indexOf('@');
  if (atIndex === -1) {
    // No @ found: just keep first 2 chars + ****
    return value.slice(0, 2) + '****';
  }
  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex); // includes @
  const keep = Math.min(2, localPart.length);
  return localPart.slice(0, keep) + '****' + domain;
}
