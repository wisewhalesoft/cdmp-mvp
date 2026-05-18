BEGIN;

ALTER TABLE "ob_levelcard_column" ADD COLUMN IF NOT EXISTS "match_type" varchar(20);

UPDATE "ob_levelcard_column" AS c
SET "match_type" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "ob_levelcard_score" s
    WHERE s."card_type" = c."card_type"
      AND s."card_version" = c."card_version"
      AND s."column_name" = c."column_name"
      AND s."level1" IS NOT NULL
      AND s."level2_s" IS NULL
      AND s."level2_e" IS NULL
  ) THEN 'CATEGORY'
  WHEN EXISTS (
    SELECT 1 FROM "ob_levelcard_score" s
    WHERE s."card_type" = c."card_type"
      AND s."card_version" = c."card_version"
      AND s."column_name" = c."column_name"
      AND s."level1" IS NOT NULL
      AND s."level2_s" IS NOT NULL
  ) THEN 'COMPOSITE'
  WHEN EXISTS (
    SELECT 1 FROM "ob_levelcard_score" s
    WHERE s."card_type" = c."card_type"
      AND s."card_version" = c."card_version"
      AND s."column_name" = c."column_name"
      AND s."level1" IS NULL
      AND s."level2_s" IS NOT NULL
  ) THEN 'RANGE'
  ELSE 'RANGE'
END
WHERE "match_type" IS NULL;

ALTER TABLE "ob_levelcard_column" ALTER COLUMN "match_type" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ob_levelcard_column_match_type') THEN
    ALTER TABLE "ob_levelcard_column" ADD CONSTRAINT "chk_ob_levelcard_column_match_type" CHECK ("match_type" IN ('CATEGORY','RANGE','COMPOSITE'));
  END IF;
END$$;

COMMIT;

SELECT match_type, COUNT(*) FROM ob_levelcard_column GROUP BY match_type ORDER BY match_type;
