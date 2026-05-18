-- 從 reference/DumpData/OBLEVELCARD_LEVEL_20260505.csv 載入 CARD_LEVEL 門檻
-- 流程：TRUNCATE ob_levelcard_level → INSERT 22 筆（H/S/E/E5/S5/M 六卡）
-- 對應 F054 v1.3 Tab 4「CARD_LEVEL 門檻」UI
--
-- 用法：
--   cat apps/api/src/database/seeds/load-oblevelcard-level-dump.sql \
--     | docker exec -i cdmp-postgres psql -U cdmp -d cdmp_dev

BEGIN;
TRUNCATE TABLE ob_levelcard_level RESTART IDENTITY;

INSERT INTO ob_levelcard_level (card_type, card_version, score_s, score_e, card_level, created_at, updated_at) VALUES
  ('S',  1, 191, 999, 'A', NOW(), NOW()),
  ('S',  1, 169, 190, 'B', NOW(), NOW()),
  ('S',  1, 153, 168, 'C', NOW(), NOW()),
  ('S',  1,   0, 152, 'D', NOW(), NOW()),
  ('H',  1, 243, 999, 'A', NOW(), NOW()),
  ('H',  1, 214, 242, 'B', NOW(), NOW()),
  ('H',  1, 185, 213, 'C', NOW(), NOW()),
  ('H',  1,   0, 184, 'D', NOW(), NOW()),
  ('E',  1, 176, 999, 'A', NOW(), NOW()),
  ('E',  1, 149, 175, 'B', NOW(), NOW()),
  ('E',  1, 141, 148, 'C', NOW(), NOW()),
  ('E',  1,   0, 140, 'D', NOW(), NOW()),
  ('E5', 1, 154, 999, 'A', NOW(), NOW()),
  ('E5', 1, 127, 153, 'B', NOW(), NOW()),
  ('E5', 1, 104, 126, 'C', NOW(), NOW()),
  ('E5', 1,   0, 103, 'D', NOW(), NOW()),
  ('S5', 1, 152, 999, 'A', NOW(), NOW()),
  ('S5', 1,   0, 151, 'B', NOW(), NOW()),
  ('M',  1, 170, 999, 'A', NOW(), NOW()),
  ('M',  1, 150, 169, 'B', NOW(), NOW()),
  ('M',  1, 143, 149, 'C', NOW(), NOW()),
  ('M',  1,   0, 142, 'D', NOW(), NOW());

COMMIT;

-- 驗證
SELECT card_type, COUNT(*) AS levels FROM ob_levelcard_level GROUP BY card_type ORDER BY card_type;
