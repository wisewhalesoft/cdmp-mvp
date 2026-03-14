import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  user_id: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  token: string;

  @Column()
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  used_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
