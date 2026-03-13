import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('token_blocklist')
export class TokenBlocklist {
  @PrimaryColumn({ length: 2048 })
  token: string;

  @Column({ type: 'varchar', length: 36 })
  user_id: string;

  @CreateDateColumn()
  revoked_at: Date;

  @Column({ type: 'datetime' })
  expires_at: Date;
}
