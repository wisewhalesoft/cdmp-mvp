import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';

@Entity('token_blocklist')
export class TokenBlocklist {
  @PrimaryColumn({ length: 2048 })
  token: string;

  @Column({ type: 'varchar', length: 36 })
  user_id: string;

  @CreateDateColumn()
  revoked_at: Date;

  @Column({ type: dateColumnType })
  expires_at: Date;
}
