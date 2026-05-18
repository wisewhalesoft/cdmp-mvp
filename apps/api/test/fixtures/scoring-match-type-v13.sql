-- scoring-match-type-v13.sql
-- F054/F061 v1.3 測試 fixture seed
--
-- 用途：
--   assignment-scoring-f054-match-type.service.spec.ts
--   scoring-integrity-check.service.spec.ts
--   assignment-run-precheck-v13.service.spec.ts
--   f054-f061-composite.e2e.spec.ts
--   fn-calc-tier-level.spec.ts（TS-F061-013 try-cast 三類）
--
-- 前置條件：
--   - migration add-match-type-to-ob-levelcard-column 已執行（match_type 欄位存在）
--   - migration 1711360000140 / 141 已執行（fn_calc_tier_level 存在）
--
-- 清除方式：每個 it 用 BEGIN / ROLLBACK 隔離；E2E 用 afterEach 手動 DELETE

-- ============================================================
-- A. PROJECT_TP COMPOSITE fixture（3 筆）
--    card_type='H', card_version=1, column_name='PROJECT_TP'
--    match_type='COMPOSITE'（新增 v1.3 欄位）
--    level1='A' → 命中「專案」標記；level1=NULL → 一般
-- ============================================================

-- A-1：COMPOSITE，level1=NULL（一般情況基線）
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'PROJECT_TP_MATCH_TEST', NULL, '20', '25', 5);

-- A-2：COMPOSITE，level1='A'（含「專案」附加分）
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'PROJECT_TP_MATCH_TEST', 'A', '20', '25', 10);

-- A-3：COMPOSITE，level1='B'（另一標記，用於多 LEVEL1 互斥驗證）
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'PROJECT_TP_MATCH_TEST', 'B', '20', '25', 3);

-- 對應 ob_levelcard_column（含 match_type）
INSERT INTO ob_levelcard_column
  (card_type, card_version, column_name, column_label, status, match_type)
VALUES
  ('H', 1, 'PROJECT_TP_MATCH_TEST', '專案類型測試', 'active', 'COMPOSITE');

-- ============================================================
-- B. REGION CATEGORY fixture（3 筆）
--    card_type='H', card_version=1, column_name='REGION_CAT_TEST'
--    match_type='CATEGORY'（類別型，精確比對）
--    level1=NULL，level2_s=level2_e（單值）
-- ============================================================

-- B-1：北部（命中）
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'REGION_CAT_TEST', NULL, 'N', 'N', 8);

-- B-2：南部
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'REGION_CAT_TEST', NULL, 'S', 'S', 5);

-- B-3：東部
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'REGION_CAT_TEST', NULL, 'E', 'E', 3);

INSERT INTO ob_levelcard_column
  (card_type, card_version, column_name, column_label, status, match_type)
VALUES
  ('H', 1, 'REGION_CAT_TEST', '地區分類測試', 'active', 'CATEGORY');

-- ============================================================
-- C. EMPTY RANGE fixture（3 筆）
--    用於 TS-F061-013 try-cast 三類案例驗證
--    column_name='RANGE_TRYCAST_TEST'
-- ============================================================

-- C-1：純數值 RANGE（try-cast numeric 路徑）
--    level2_s='5', level2_e='99' → 輸入 value='9' 應命中（5 ≤ 9 ≤ 99）
--    字典序若誤用：'9' > '10' → 不命中（此設計可抓 bug）
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'RANGE_TRYCAST_TEST', NULL, '5', '99', 20);

-- C-2：VARCHAR BETWEEN fallback 路徑
--    level2_s='A', level2_e='Z' → 輸入 value='M' 應命中（字典序）
--    此情境 try-cast 失敗（非數值），回退 VARCHAR BETWEEN
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'RANGE_TRYCAST_TEST_VAR', NULL, 'A', 'Z', 15);

-- C-3：零填充混合（zero-padded PROJECT_TP 樣本）
--    level2_s='01', level2_e='23' → 輸入 value='15' 應命中
--    數值 BETWEEN：1 ≤ 15 ≤ 23 → HIT；字典序 BETWEEN：'01' ≤ '15' ≤ '23' → HIT
--    兩種策略均應通過
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'RANGE_TRYCAST_ZERO_PAD', NULL, '01', '23', 12);

INSERT INTO ob_levelcard_column
  (card_type, card_version, column_name, column_label, status, match_type)
VALUES
  ('H', 1, 'RANGE_TRYCAST_TEST', 'RANGE try-cast 數值', 'active', 'RANGE');

INSERT INTO ob_levelcard_column
  (card_type, card_version, column_name, column_label, status, match_type)
VALUES
  ('H', 1, 'RANGE_TRYCAST_TEST_VAR', 'RANGE try-cast 字串', 'active', 'RANGE');

INSERT INTO ob_levelcard_column
  (card_type, card_version, column_name, column_label, status, match_type)
VALUES
  ('H', 1, 'RANGE_TRYCAST_ZERO_PAD', 'RANGE try-cast 零填充', 'active', 'RANGE');
