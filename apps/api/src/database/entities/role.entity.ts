import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryColumn({ type: 'varchar', length: 30 })
  role_code: string;

  @Column({ type: 'varchar', length: 50 })
  display_name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  alias: string | null;

  @Column({ type: 'varchar', length: 10 })
  type: 'system' | 'business';

  @CreateDateColumn()
  created_at: Date;
}
