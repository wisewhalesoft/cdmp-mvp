import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import {
  dateColumnType,
  hashColumnType,
  hashColumnLength,
} from '@/common/database/column-types';

/**
 * token_blocklist — 已撤銷 JWT 名單（logout / 強制失效）。
 *
 * B1 / AD-E07-39 §3：PK 由明文 `token`（nvarchar(2048)，於 MSSQL 超過 900-byte 索引鍵上限）
 * 改為 `token_hash`（sha256(token) 之 32-byte 定長雜湊）。欄位刻意改名（非沿用 `token`）以 fail-loud：
 * 任何殘留誤用明文欄位的程式碼會於編譯期直接失敗。寫入 / 查詢一律先經 `hashToken()`（AuthService / AuthGuard）。
 */
@Entity('token_blocklist')
export class TokenBlocklist {
  @PrimaryColumn({ name: 'token_hash', type: hashColumnType, length: hashColumnLength })
  token_hash: Buffer;

  @Column({ type: 'varchar', length: 36 })
  user_id: string;

  @CreateDateColumn()
  revoked_at: Date;

  @Column({ type: dateColumnType })
  expires_at: Date;
}
