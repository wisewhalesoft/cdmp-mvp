-- 一次性驗證 SQL：手動依序套用 m22 → m24 → m28 之 up() 等效邏輯
-- 用於 dev DB 在 synchronize:true 未走 TypeORM migration 機制下，驗證 F075/F076 v1.4.6
-- 5 欄對齊之最終狀態。
--
-- 用法：docker exec cdmp-postgres psql -U cdmp -d cdmp_dev -f /tmp/verify-m28-realign.sql
-- 或於 host：cat | docker exec -i cdmp-postgres psql -U cdmp -d cdmp_dev

BEGIN;

-- =============================================================================
-- m22 等效：seed 8 個白名單欄位 + 16 個 options（v1.4.3 case 對齊小寫）
-- =============================================================================

INSERT INTO pooldata_field_whitelist (column_name, display_name, field_type, is_active, created_at, updated_at) VALUES
  ('prod_kind',  '產品類別',     'categorical', TRUE,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('list_type',  '名單類型',     'categorical', TRUE,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('best_case',  '優質案件',     'categorical', TRUE,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('spec_tp',    '特殊類別',     'categorical', TRUE,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '案件年度',     'categorical', TRUE,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('settle_src', '結清來源',     'categorical', TRUE,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('month_cnt',  '撈取月份計數', 'numeric',     TRUE,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('payt_term',  '繳款期數',     'numeric',     FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (column_name) DO NOTHING;

INSERT INTO pooldata_field_option (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at) VALUES
  ('prod_kind',  '01', '汽車新車',     TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prod_kind',  '02', '機車',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prod_kind',  '03', '其他商品',     TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('list_type',  '01', '期中',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('list_type',  '02', '中結',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('list_type',  '03', '滿期',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '0',  '0 年',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '1',  '1 年',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '2',  '2 年',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '3',  '3 年',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '4',  '4 年',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '5',  '5 年',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '6',  '6 年',         TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '99', '不限年數',     TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('settle_src', 'Y',  '含他行代償',   TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('settle_src', 'N',  '不含他行代償', TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (column_name, option_value) DO NOTHING;

-- =============================================================================
-- m24 等效：補 best_case / spec_tp options（5 筆 placeholder）
-- =============================================================================

INSERT INTO pooldata_field_option (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at) VALUES
  ('best_case', 'Y',  '優質案件',  TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('best_case', 'N',  '一般案件',  TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('spec_tp',   '01', '特殊類別 01', TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('spec_tp',   '02', '特殊類別 02', TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('spec_tp',   '03', '特殊類別 03', TRUE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (column_name, option_value) DO NOTHING;

-- =============================================================================
-- m28 等效：對齊舊系統 OBZ020 — 移除 best_case / month_cnt / payt_term
-- + belt-and-braces 重 seed 5 個保留欄位（idempotent）
-- =============================================================================

DELETE FROM pooldata_field_option WHERE column_name IN ('best_case', 'month_cnt', 'payt_term');
DELETE FROM pooldata_field_whitelist WHERE column_name IN ('best_case', 'month_cnt', 'payt_term');

INSERT INTO pooldata_field_whitelist (column_name, display_name, field_type, is_active, created_at, updated_at) VALUES
  ('prod_kind',  '產品類別',                 'categorical', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('list_type',  '名單類型',                 'categorical', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('spec_tp',    '專案類別',                 'categorical', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('caseyear',   '進件/滿期/中結年數',       'categorical', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('settle_src', '被他行代償案件',           'categorical', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (column_name) DO NOTHING;

COMMIT;

-- =============================================================================
-- 驗證
-- =============================================================================

\echo '== Whitelist 最終狀態 =='
SELECT column_name, field_type, is_active FROM pooldata_field_whitelist ORDER BY column_name;

\echo '== Option 統計 =='
SELECT column_name, COUNT(*) AS opts FROM pooldata_field_option GROUP BY column_name ORDER BY column_name;

\echo '== 對齊驗證：應有恰好 5 筆 active 的 v1.4.6 欄位 =='
SELECT COUNT(*) AS aligned_count FROM pooldata_field_whitelist
 WHERE column_name IN ('prod_kind','list_type','spec_tp','caseyear','settle_src')
   AND field_type = 'categorical' AND is_active = TRUE;

\echo '== 對齊驗證：v1.4.6 應移除之 3 欄不可存在 =='
SELECT column_name FROM pooldata_field_whitelist WHERE column_name IN ('best_case','month_cnt','payt_term');
