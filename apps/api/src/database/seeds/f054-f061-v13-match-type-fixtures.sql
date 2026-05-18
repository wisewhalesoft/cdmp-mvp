-- F054/F061 v1.3 — match_type 三模式 + try-cast 驗證 seed
-- 採用 TEST_ 前綴避免污染 41 筆既有真實 OB 計分維度
-- 套用範圍：card_type='H', card_version=1（與既有 PROJECT_TP 等共用 H 卡基礎）
-- 可重複執行（DELETE 既有同名測試列後 INSERT）

BEGIN;

-- ============================================================
-- Step 1: 清掉舊測試列（idempotent）
-- ============================================================
DELETE FROM ob_levelcard_score
 WHERE card_type='H' AND card_version=1
   AND column_name IN ('TEST_REGION', 'TEST_PROJECT_TP', 'TEST_AGE_RANGE', 'TEST_LABEL_RANGE');

DELETE FROM ob_levelcard_column
 WHERE card_type='H' AND card_version=1
   AND column_name IN ('TEST_REGION', 'TEST_PROJECT_TP', 'TEST_AGE_RANGE', 'TEST_LABEL_RANGE');

-- ============================================================
-- Step 2: 新增四個測試維度（涵蓋 CATEGORY / RANGE / COMPOSITE + try-cast 邊界）
-- ============================================================
INSERT INTO ob_levelcard_column
  (card_type, card_version, column_name, column_label, status, match_type, created_at, updated_at)
VALUES
  ('H', 1, 'TEST_REGION',      '測試-區域(CATEGORY)',         'active', 'CATEGORY',  NOW(), NOW()),
  ('H', 1, 'TEST_PROJECT_TP',  '測試-專案類型(COMPOSITE)',    'active', 'COMPOSITE', NOW(), NOW()),
  ('H', 1, 'TEST_AGE_RANGE',   '測試-年齡(RANGE numeric)',    'active', 'RANGE',     NOW(), NOW()),
  ('H', 1, 'TEST_LABEL_RANGE', '測試-字典序(RANGE string)',   'active', 'RANGE',     NOW(), NOW());

-- ============================================================
-- Step 3: CATEGORY 樣本（純 level1，level2 須 NULL）
-- ============================================================
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
VALUES
  ('H', 1, 'TEST_REGION', 'NORTH', NULL, NULL, 30, NOW(), NOW()),
  ('H', 1, 'TEST_REGION', 'SOUTH', NULL, NULL, 20, NOW(), NOW()),
  ('H', 1, 'TEST_REGION', 'EAST',  NULL, NULL, 25, NOW(), NOW());

-- ============================================================
-- Step 4: COMPOSITE 樣本（level1 + level2_s/2_e 同時，對齊 OBLEVELCARD_SCORE dump 樣本）
-- 模擬 dump 中 H/PROJECT_TP: level1='A' (P貸款) + level2_s='06' 與 level1='' + level2_s='06'
-- ============================================================
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
VALUES
  ('H', 1, 'TEST_PROJECT_TP', 'A',  '01', '01', 50, NOW(), NOW()),
  ('H', 1, 'TEST_PROJECT_TP', 'A',  '02', '02', 45, NOW(), NOW()),
  ('H', 1, 'TEST_PROJECT_TP', '',   '01', '01', 35, NOW(), NOW()),
  ('H', 1, 'TEST_PROJECT_TP', '',   '02', '02', 30, NOW(), NOW()),
  ('H', 1, 'TEST_PROJECT_TP', NULL, '03', '03', 20, NOW(), NOW());  -- BR-9 NULL ↔ '' 等價驗證

-- ============================================================
-- Step 5: RANGE numeric 樣本（try-cast 邊界）
-- level2_s='5', level2_e='99' — 字典序下 '9' > '10'，須走 numeric BETWEEN 才正確
-- ============================================================
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
VALUES
  ('H', 1, 'TEST_AGE_RANGE', NULL, '0',   '4',  10, NOW(), NOW()),
  ('H', 1, 'TEST_AGE_RANGE', NULL, '5',   '99', 30, NOW(), NOW()),  -- 包含 9, 10, 50, 99
  ('H', 1, 'TEST_AGE_RANGE', NULL, '100', '999', 50, NOW(), NOW());

-- ============================================================
-- Step 6: RANGE string 樣本（try-cast fallback 字典序）
-- ============================================================
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
VALUES
  ('H', 1, 'TEST_LABEL_RANGE', NULL, 'A', 'F', 10, NOW(), NOW()),
  ('H', 1, 'TEST_LABEL_RANGE', NULL, 'G', 'M', 20, NOW(), NOW()),
  ('H', 1, 'TEST_LABEL_RANGE', NULL, 'N', 'Z', 30, NOW(), NOW());

-- ============================================================
-- Step 7: 驗證 seed 結果
-- ============================================================
SELECT column_name, match_type,
       (SELECT COUNT(*) FROM ob_levelcard_score s
         WHERE s.card_type=c.card_type AND s.card_version=c.card_version AND s.column_name=c.column_name) AS score_count
  FROM ob_levelcard_column c
 WHERE card_type='H' AND card_version=1 AND column_name LIKE 'TEST_%'
 ORDER BY column_name;

COMMIT;
