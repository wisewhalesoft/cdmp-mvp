-- F054/F061 v1.3 — try-cast 邊界驗證 seed
-- 用途：補 dump 沒有的 RANGE 邊界樣本（numeric two-digit 字典序差、純字串 fallback）
-- 註：CATEGORY 與 COMPOSITE 樣本已由 OBLEVELCARD_SCORE dump 提供
--    （H/PROJECT_TP, S5/CO_NUM_NM, S5/HPOST_NUM_NM 等），不需 TEST_ fixtures
-- 套用範圍：card_type='H', card_version=1
-- 可重複執行（DELETE 既有同名測試列後 INSERT）

BEGIN;

-- ============================================================
-- Step 1: 清掉舊測試列（idempotent）
-- ============================================================
DELETE FROM ob_levelcard_score
 WHERE card_type='H' AND card_version=1
   AND column_name IN ('TEST_AGE_RANGE', 'TEST_LABEL_RANGE');

DELETE FROM ob_levelcard_column
 WHERE card_type='H' AND card_version=1
   AND column_name IN ('TEST_AGE_RANGE', 'TEST_LABEL_RANGE');

-- ============================================================
-- Step 2: 新增兩個 RANGE try-cast 邊界樣本
-- ============================================================
INSERT INTO ob_levelcard_column
  (card_type, card_version, column_name, column_label, status, match_type, created_at, updated_at)
VALUES
  ('H', 1, 'TEST_AGE_RANGE',   '測試-年齡(RANGE numeric)',  'active', 'RANGE', NOW(), NOW()),
  ('H', 1, 'TEST_LABEL_RANGE', '測試-字典序(RANGE string)', 'active', 'RANGE', NOW(), NOW());

-- ============================================================
-- Step 3: RANGE numeric 樣本（try-cast 邊界）
-- level2_s='5', level2_e='99' — 字典序下 '9' > '10'，須走 numeric BETWEEN 才正確
-- ============================================================
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
VALUES
  ('H', 1, 'TEST_AGE_RANGE', NULL, '0',   '4',  10, NOW(), NOW()),
  ('H', 1, 'TEST_AGE_RANGE', NULL, '5',   '99', 30, NOW(), NOW()),  -- 包含 9, 10, 50, 99
  ('H', 1, 'TEST_AGE_RANGE', NULL, '100', '999', 50, NOW(), NOW());

-- ============================================================
-- Step 4: RANGE string 樣本（try-cast fallback 字典序）
-- ============================================================
INSERT INTO ob_levelcard_score
  (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
VALUES
  ('H', 1, 'TEST_LABEL_RANGE', NULL, 'A', 'F', 10, NOW(), NOW()),
  ('H', 1, 'TEST_LABEL_RANGE', NULL, 'G', 'M', 20, NOW(), NOW()),
  ('H', 1, 'TEST_LABEL_RANGE', NULL, 'N', 'Z', 30, NOW(), NOW());

-- ============================================================
-- Step 5: 驗證
-- ============================================================
SELECT column_name, match_type,
       (SELECT COUNT(*) FROM ob_levelcard_score s
         WHERE s.card_type=c.card_type AND s.card_version=c.card_version AND s.column_name=c.column_name) AS score_count
  FROM ob_levelcard_column c
 WHERE card_type='H' AND card_version=1 AND column_name LIKE 'TEST_%'
 ORDER BY column_name;

COMMIT;
