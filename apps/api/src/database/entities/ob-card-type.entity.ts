// F069~F072 / architecture-spec §E07-G AD-E07-16：CARD_TYPE 計分卡類型主檔
// 對應 migration：1711360000160-CreateObCardType.ts
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn } from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';

/**
 * ob_card_type — CARD_TYPE 計分卡類型主檔
 *
 * 為 M02 計分設定 5-Tab 結構之父表；Tab 2~5（F053/F054/F055/F056）依此表
 * card_type 篩選下游 ob_levelcard_* / ob_tier 紀錄。
 *
 * 關鍵設計：
 *   - Natural PK：card_type VARCHAR(5)，格式 `^[A-Z0-9]{1,5}$`（PostgreSQL CHECK；
 *     SQLite 由應用層保證）
 *   - PROD_KIND 1:1 必填綁定，不建 FK 至 ob_code_df（AD-E07-G）；應用層維持業務一致性
 *   - status：'active' / 'inactive'（PostgreSQL CHECK，SQLite 應用層保證）
 *   - 級聯刪除（F072）為應用層 transaction，不採 ON DELETE CASCADE（AD-E07-16）
 *
 * 日期欄位採 `dateColumnType` helper（PostgreSQL timestamp / SQLite datetime）
 * — 依 memory feedback_typeorm_timestamp 強制要求。
 */
@Entity('ob_card_type')
export class ObCardType {
  @PrimaryColumn({ name: 'card_type', type: 'varchar', length: 5 })
  card_type: string;

  @Column({ name: 'card_name', type: 'varchar', length: 20 })
  card_name: string;

  @Column({ name: 'prod_kind', type: 'varchar', length: 4 })
  prod_kind: string;

  @Column({ name: 'status', type: 'varchar', length: 10, default: 'active' })
  status: string;

  @Column({ name: 'created_at', type: dateColumnType })
  created_at: Date;

  @Column({ name: 'created_by', type: 'varchar', length: 50 })
  created_by: string;

  @Column({ name: 'updated_at', type: dateColumnType })
  updated_at: Date;

  @Column({ name: 'updated_by', type: 'varchar', length: 50 })
  updated_by: string;
}
