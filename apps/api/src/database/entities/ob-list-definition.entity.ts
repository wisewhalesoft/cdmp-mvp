// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBMLISTDF.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';

@Entity('ob_list_definition')
export class ObListDefinition {
  @Column({ name: 'created_by_prog', type: 'varchar', length: 20 })
  created_by_prog: string; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 20 })
  created_by: string; // A_USERID

  // E2E sqlite 相容：採 dateColumnType（postgres=timestamp / sqlite=datetime）
  // 依 memory feedback_typeorm_timestamp 規則；遷移到 ob_card_type 模組（F069~F072 Iter 2）
  // 需要在 SQLite e2e 註冊本 entity，故統一改用 helper。
  @Column({ name: 'created_at', type: dateColumnType })
  created_at: Date; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 20 })
  updated_by_prog: string; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 20 })
  updated_by: string; // U_USERID

  @Column({ name: 'updated_at', type: dateColumnType })
  updated_at: Date; // U_SYSDT

  @PrimaryColumn({ name: 'list_no', type: 'varchar', length: 11 })
  list_no: string;

  @Column({ name: 'list_nm', type: 'varchar', length: 45 })
  list_nm: string;

  @Column({ name: 'prod_kind', type: 'varchar', length: 255 })
  prod_kind: string;

  @Column({ name: 'prod_best', type: 'varchar', length: 5 })
  prod_best: string;

  @Column({ name: 'spec_tp', type: 'varchar', length: 255, nullable: true })
  spec_tp: string | null;

  @Column({ name: 'list_type', type: 'varchar', length: 255 })
  list_type: string;

  @Column({ name: 'list_period_start', type: 'varchar', length: 3 })
  list_period_start: string;

  @Column({ name: 'list_period_end', type: 'varchar', length: 3 })
  list_period_end: string;

  @Column({ name: 'list_interval', type: 'varchar', length: 3 })
  list_interval: string;

  @Column({ name: 'assigned_date', type: dateColumnType, nullable: true })
  assigned_date: Date | null;

  @Column({ name: 'total_amount', type: 'integer', nullable: true })
  total_amount: number | null;

  @Column({ name: 'reserved_amount', type: 'integer', nullable: true })
  reserved_amount: number | null;

  @Column({ name: 'is_assigned', type: 'varchar', length: 1, nullable: true })
  is_assigned: string | null;

  @Column({ name: 'project_workym', type: 'varchar', length: 6, nullable: true })
  project_workym: string | null;

  @Column({ name: 'casenumber', type: 'varchar', length: 50, nullable: true })
  casenumber: string | null;

  @Column({ name: 'name', type: 'varchar', length: 50, nullable: true })
  name: string | null;

  @Column({ name: 'caseyear', type: 'varchar', length: 255, nullable: true })
  caseyear: string | null;

  @Column({ name: 'caseyearnm', type: 'varchar', length: 10, nullable: true })
  caseyearnm: string | null;

  @Column({ name: 'settle_src', type: 'varchar', length: 6, nullable: true })
  settle_src: string | null;

  // dump 觀察含 3 字元值（SEC / SEB），spec L845 原寫 VARCHAR(2) 錯誤；改 VARCHAR(5) 對齊 ob_levelcard_*
  @Column({ name: 'card_type', type: 'varchar', length: 5, nullable: true })
  card_type: string | null;

  // E07 名單啟用旗標（migration M1 補建）
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'active' })
  status: string;

  // E07 五階段流程欄位（data-model.md L848 / F077 v1.0 / E07 重構批次 2 / 2026-05-15 引入）
  // 值列舉：'draft' / 'dept_ratio' / 'personnel_ratio' / 'approval' / 'ready'
  // 對應 migration：(後續 E07 重構批次 m05~m13 中之 stage 欄位 migration)
  @Column({ name: 'stage', type: 'varchar', length: 20, default: 'draft' })
  stage: 'draft' | 'dept_ratio' | 'personnel_ratio' | 'approval' | 'ready';

  // E07 重構 P1 B2 補完（2026-05-16）— F050 / F051 v2.0 DTO 必填，多值 `$$` 分隔
  // 對應 migration m17：1711360000181-AddObListDefinitionCaseStatus
  @Column({ name: 'case_status', type: 'varchar', length: 14, nullable: true })
  case_status: string | null;

  // E07 重構 P1 B2 補完（2026-05-16）— per-LIST CR 回分開關，取代 F059 全域 OBASSIGNSET
  // 對應 migration m18：1711360000182-AddObListDefinitionCrEnabled
  @Column({ name: 'cr_enabled', type: 'boolean', default: false })
  cr_enabled: boolean;
}
