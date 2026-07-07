import { createHash } from 'crypto';

/**
 * B1 / AD-E07-39 §3.3 — token_blocklist 之 hash PK 產生函式。
 *
 * 決定性 SHA-256 摘要（I-MSSQL-HASH-DETERMINISM-01）：相同輸入永遠產生相同 32-byte Buffer，
 * 跨呼叫 / 跨程序 / 跨 driver 一致。作為 `token_blocklist.token_hash`（binary(32)/blob/bytea）之鍵值。
 *
 * blocklist 語意純為「成員存在性檢查」（WHERE token_hash = ?），不需範圍查詢 / 排序 / 子字串比對，
 * 故 hash 化對業務邏輯零損失，並附帶消除明文 JWT 落庫之疑慮（AD §3.2）。
 */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
