// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBTIER.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index, PrimaryGeneratedColumn } from 'typeorm';

// AD-E07-13：UNIQUE (card_type, COALESCE(card_level, '')) 由 migration 用 raw SQL 建立
// （TypeORM @Index 不支援 COALESCE 表達式，dev synchronize 不會建此索引；prod 用 migration）
@Entity('ob_tier')
export class ObTier {
  // surrogate PK（原表無 PK；UNIQUE INDEX 在 migration 補 raw SQL）
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'list_nm', type: 'varchar', length: 30, nullable: true })
  list_nm: string | null;

  // 遷移時補 NOT NULL（依 SP join 邏輯，與 migration 一致）
  @Column({ name: 'card_type', type: 'varchar', length: 5 })
  card_type: string;

  // CARD_LEVEL 維持 NULL（M5 fallback：dump 觀察 1 筆 CARD_LEVEL=空字串）
  @Column({ name: 'card_level', type: 'varchar', length: 5, nullable: true })
  card_level: string | null;

  @Column({ name: 'tier_level', type: 'varchar', length: 5 })
  tier_level: string;
}
