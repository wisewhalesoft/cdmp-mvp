// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBMLISTDF.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { dateColumnType, jsonColumnType } from '@/common/database/column-types';

/**
 * condition_payload JSONB schema（F050 v2.1 / AD-E07-18 §18.4）。
 *
 * source of truth for 名單篩選條件（取代 v2.0 之 5 個 entity column 必填語意）；
 * 5 個 entity column（prod_kind / caseyear / spec_tp / case_status / settle_src）降為
 * 後端依本 payload 衍生填入之 backward-compat 欄位（§18.6 衍生規則）。
 *
 * `_backfill_empty: true` 為 m282 backfill 對「5 個欄位全空」名單之 metadata 標記；
 * Stage 1 路徑 A 解析後若 `conditions.length === 0` 即 skip（§18.5.2 / OQ-TEST-002）。
 */
export interface ObListDefinitionConditionItem {
  columnName: string;
  fieldType: 'categorical' | 'numeric' | 'date';
  values?: string[];
  min?: number;
  max?: number;
  dateStart?: string;
  dateEnd?: string;
  /**
   * F109 / US-172 / AD-E07-37 §OQ-F109-01：condition 之資料來源（寫入時固化）。
   *
   * createList / updateList 之 `stampConditionDataSource` 於寫入時依當下白名單蓋章
   * （'ob_pool_data' | 'customer_core'）；Stage 1 讀取路徑以 `resolveConditionDataSource`
   * 決定性解析（固化值優先，缺漏時以 CUSTOMER_CORE_COLUMN_NAMES 靜態 Set fallback）。
   *
   * F109 上線前既有 condition_payload 無此 key（fallback 天然覆蓋，不需 backfill migration）。
   */
  dataSource?: 'ob_pool_data' | 'customer_core';
}

export interface ObListDefinitionConditionPayload {
  conditions: ObListDefinitionConditionItem[];
  logic: 'AND';
  _backfill_empty?: boolean;
  [k: string]: unknown;
}

@Entity('ob_list_definition')
export class ObListDefinition {
  @Column({ name: 'created_by_prog', type: 'varchar', length: 20 })
  created_by_prog: string; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 50 })
  created_by: string; // A_USERID（length:50 對齊 users.id UUID 36 字元，與 ob-card-type / ob-levelcard-version 等 E07 新表一致；2026-05-21 hotfix）

  // E2E sqlite 相容：採 dateColumnType（postgres=timestamp / sqlite=datetime）
  // 依 memory feedback_typeorm_timestamp 規則；遷移到 ob_card_type 模組（F069~F072 Iter 2）
  // 需要在 SQLite e2e 註冊本 entity，故統一改用 helper。
  @Column({ name: 'created_at', type: dateColumnType })
  created_at: Date; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 20 })
  updated_by_prog: string; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 50 })
  updated_by: string; // U_USERID（length:50 對齊 users.id UUID 36 字元；2026-05-21 hotfix）

  @Column({ name: 'updated_at', type: dateColumnType })
  updated_at: Date; // U_SYSDT

  @PrimaryColumn({ name: 'list_no', type: 'varchar', length: 11 })
  list_no: string;

  @Column({ name: 'list_nm', type: 'varchar', length: 45 })
  list_nm: string;

  @Column({ name: 'prod_kind', type: 'varchar', length: 255 })
  prod_kind: string;

  // v2.1.1 (2026-05-20 / US-128 / Q-B B3 / architecture-spec §18.11.4)：
  //   prod_best 一級欄位 DEPRECATED；業務語意改由 condition_payload.conditions[columnName='best_case'] 承接。
  //   NOT NULL → NULL 由 migration m287 放寬；本 entity 同步改為 nullable。
  //   完全 DROP COLUMN 屬 v2.2+ 後續決策。
  @Column({ name: 'prod_best', type: 'varchar', length: 5, nullable: true })
  prod_best: string | null;

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

  // F050 v2.1（2026-05-20 / AD-E07-18 §18.4）— 名單篩選條件 source of truth
  //   - PG：JSONB；SQLite：simple-json（TEXT，內建序列化）
  //   - nullable=true：舊名單（m100~m280 既有資料）保持 NULL，由 m282 backfill 轉換
  //   - 對應 migration m281：1711360000281-AddObListDefinitionConditionPayload
  //   - 對應 migration m282：1711360000282-BackfillListDefinitionConditionPayload
  @Column({ name: 'condition_payload', type: jsonColumnType, nullable: true })
  condition_payload: ObListDefinitionConditionPayload | null;

  // F088 v1.3 / AD-E07-20（2026-05-26）— 物化 Stage 0 估算快取
  //   - approve→ready（F086）成功後 best-effort 計算並寫入；清單頁直接讀存值（避免逐筆 COUNT 百萬列 ob_pool_data）
  //   - nullable：舊名單 / 尚未 approve / 計算失敗皆為 NULL，前端顯示「—」
  //   - 對應 migration m289：1711360000289-AddObListDefinitionStage0EstimateCache
  @Column({ name: 'stage0_estimate_count', type: 'int', nullable: true })
  stage0_estimate_count: number | null;

  @Column({ name: 'stage0_estimated_at', type: dateColumnType, nullable: true })
  stage0_estimated_at: Date | null;
}
