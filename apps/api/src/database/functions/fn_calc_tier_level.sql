-- =============================================================================
-- fn_calc_tier_level — F061 Stage 2 計分 PostgreSQL function
--
-- 對應 spec：
--   - architecture-spec.md §AD-E07-3（PostgreSQL function 三分支計分）
--   - F061 v1.3 BR-14：card_level ↔ level1 規一化（NULL ↔ '' 等價、TRIM）
--   - F054 v1.3 BR-8 / BR-9：match_type 三模式分支、level1 規一化
--   - F061 v1.3 決策 5.3 TS-F061-013：RANGE try-cast 三類案例
--
-- 函式契約：
--   INPUT:  card_type VARCHAR, card_version INT, pd ob_pool_data%ROWTYPE
--   OUTPUT: TABLE(score INT, card_level VARCHAR, tier_level VARCHAR)
--
-- 三模式分支邏輯：
--   - CATEGORY:  WHERE NULLIF(RTRIM(level1),'') IS NOT DISTINCT FROM v_norm_level1
--   - RANGE:     try-cast — 若 level2_s/2_e + value 皆 regex match `^-?\d+(\.\d+)?$`
--                則 numeric BETWEEN；否則 VARCHAR BETWEEN
--   - COMPOSITE: level1 partition + level2 try-cast BETWEEN
--
-- fallback TIER_LEVEL：若 card_level 在 ob_tier 找不到，回退 card_level IS NULL 那筆
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_calc_tier_level(
  p_card_type    VARCHAR,
  p_card_version INTEGER,
  pd             ob_pool_data
)
RETURNS TABLE(score INTEGER, card_level VARCHAR, tier_level VARCHAR)
LANGUAGE plpgsql
AS $$
DECLARE
  v_score        INTEGER := 0;
  v_card_level   VARCHAR(5) := NULL;
  v_tier_level   VARCHAR(5) := NULL;
  v_col          RECORD;
  v_match_score  INTEGER;
  v_value        TEXT;
  v_norm_value   TEXT;
BEGIN
  -- ===========================================================================
  -- 0. 防呆：版本不存在 → 回 score=0
  -- ===========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM ob_levelcard_version
     WHERE card_type = p_card_type
       AND card_version = p_card_version
       AND status = 'active'
  ) THEN
    -- 試試 fallback TIER_LEVEL（card_level IS NULL）
    SELECT t.tier_level INTO v_tier_level
      FROM ob_tier t
     WHERE t.card_type = p_card_type
       AND t.card_level IS NULL
     LIMIT 1;
    RETURN QUERY SELECT 0, NULL::VARCHAR(5), v_tier_level;
    RETURN;
  END IF;

  -- ===========================================================================
  -- 1. 逐個 active 計分維度 — 依 match_type 三分支
  -- ===========================================================================
  FOR v_col IN
    SELECT column_name, match_type
      FROM ob_levelcard_column
     WHERE card_type    = p_card_type
       AND card_version = p_card_version
       AND status       = 'active'
  LOOP
    -- 從 pool_data 取值（依 column_name）；找不到對映欄位 → 空字串
    v_value := fn_resolve_column_value(v_col.column_name, pd);
    -- BR-9 / BR-14：規一化：TRIM；空字串保留為空字串（CATEGORY 比對時 NULL ↔ '' 等價）
    v_norm_value := COALESCE(NULLIF(TRIM(v_value), ''), '');

    v_match_score := NULL;

    IF v_col.match_type = 'CATEGORY' THEN
      -- ----- 類別精確比對：level1 必填、level2 必為 NULL -----
      SELECT s.score INTO v_match_score
        FROM ob_levelcard_score s
       WHERE s.card_type    = p_card_type
         AND s.card_version = p_card_version
         AND s.column_name  = v_col.column_name
         AND s.level1 IS NOT NULL
         AND COALESCE(NULLIF(RTRIM(s.level1), ''), '') = v_norm_value
       ORDER BY s.score DESC
       LIMIT 1;

    ELSIF v_col.match_type = 'RANGE' THEN
      -- ----- 數值區間：try-cast numeric，失敗回退 VARCHAR BETWEEN -----
      -- Strategy 1: numeric BETWEEN — 三方皆可 cast number
      SELECT s.score INTO v_match_score
        FROM ob_levelcard_score s
       WHERE s.card_type    = p_card_type
         AND s.card_version = p_card_version
         AND s.column_name  = v_col.column_name
         AND s.level1 IS NULL
         AND s.level2_s ~ '^-?\d+(\.\d+)?$'
         AND s.level2_e ~ '^-?\d+(\.\d+)?$'
         AND v_norm_value ~ '^-?\d+(\.\d+)?$'
         AND v_norm_value::NUMERIC BETWEEN s.level2_s::NUMERIC AND s.level2_e::NUMERIC
       ORDER BY s.score DESC
       LIMIT 1;

      -- Strategy 2: 任一邊非數字 → fallback VARCHAR BETWEEN
      IF v_match_score IS NULL THEN
        SELECT s.score INTO v_match_score
          FROM ob_levelcard_score s
         WHERE s.card_type    = p_card_type
           AND s.card_version = p_card_version
           AND s.column_name  = v_col.column_name
           AND s.level1 IS NULL
           AND (
             NOT (s.level2_s ~ '^-?\d+(\.\d+)?$')
             OR NOT (s.level2_e ~ '^-?\d+(\.\d+)?$')
             OR NOT (v_norm_value ~ '^-?\d+(\.\d+)?$')
           )
           AND v_norm_value BETWEEN s.level2_s AND s.level2_e
         ORDER BY s.score DESC
         LIMIT 1;
      END IF;

    ELSIF v_col.match_type = 'COMPOSITE' THEN
      -- ----- 複合：先 level1 partition（規一化等價），再 level2 try-cast BETWEEN -----
      -- COMPOSITE level1 規一化後可能為 '' 或非空字串；先嘗試 numeric BETWEEN
      SELECT s.score INTO v_match_score
        FROM ob_levelcard_score s
       WHERE s.card_type    = p_card_type
         AND s.card_version = p_card_version
         AND s.column_name  = v_col.column_name
         AND COALESCE(NULLIF(RTRIM(s.level1), ''), '') = v_norm_value
         AND s.level2_s IS NOT NULL
         AND s.level2_e IS NOT NULL
         AND s.level2_s ~ '^-?\d+(\.\d+)?$'
         AND s.level2_e ~ '^-?\d+(\.\d+)?$'
         AND v_norm_value ~ '^-?\d+(\.\d+)?$'
         AND v_norm_value::NUMERIC BETWEEN s.level2_s::NUMERIC AND s.level2_e::NUMERIC
       ORDER BY s.score DESC
       LIMIT 1;
      -- 無 numeric 命中 → fallback VARCHAR BETWEEN 同 level1
      IF v_match_score IS NULL THEN
        SELECT s.score INTO v_match_score
          FROM ob_levelcard_score s
         WHERE s.card_type    = p_card_type
           AND s.card_version = p_card_version
           AND s.column_name  = v_col.column_name
           AND COALESCE(NULLIF(RTRIM(s.level1), ''), '') = v_norm_value
           AND s.level2_s IS NOT NULL
           AND s.level2_e IS NOT NULL
           AND v_norm_value BETWEEN s.level2_s AND s.level2_e
         ORDER BY s.score DESC
         LIMIT 1;
      END IF;
    END IF;

    -- 累加 score
    IF v_match_score IS NOT NULL THEN
      v_score := v_score + v_match_score;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- 2. score → card_level：在 ob_levelcard_level 找區間
  -- ===========================================================================
  SELECT l.card_level INTO v_card_level
    FROM ob_levelcard_level l
   WHERE l.card_type    = p_card_type
     AND l.card_version = p_card_version
     AND v_score BETWEEN l.score_s AND l.score_e
   ORDER BY l.score_s DESC
   LIMIT 1;

  -- ===========================================================================
  -- 3. card_level → tier_level：在 ob_tier 對應；找不到回退 card_level IS NULL 那筆
  -- ===========================================================================
  IF v_card_level IS NOT NULL THEN
    SELECT t.tier_level INTO v_tier_level
      FROM ob_tier t
     WHERE t.card_type  = p_card_type
       AND t.card_level = v_card_level
     LIMIT 1;
  END IF;

  -- fallback：找不到 standard 對應或本身 card_level=NULL → 取 card_level IS NULL 那筆
  IF v_tier_level IS NULL THEN
    SELECT t.tier_level INTO v_tier_level
      FROM ob_tier t
     WHERE t.card_type = p_card_type
       AND t.card_level IS NULL
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_score, v_card_level, v_tier_level;
END;
$$;

-- =============================================================================
-- fn_resolve_column_value — 依 column_name 從 ob_pool_data 取值 helper
--
-- 目前實作子集（與 AssignmentRunPipelineService.resolveColumnValue 對齊）：
--   - LIST_MONTH → month_cnt
--   - PROJECT_TP → spec_tp
--   - CAR_YEAR   → CURRENT_YEAR - year_produ
--   - COMMISSION → commission
-- 其他欄位回傳空字串（合 BR-9：'' 與 NULL 等價，視為「無對應值」）
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_resolve_column_value(
  p_column_name VARCHAR,
  pd            ob_pool_data
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_value TEXT;
  v_year_produ INT;
BEGIN
  CASE p_column_name
    WHEN 'LIST_MONTH' THEN
      v_value := COALESCE(pd.month_cnt::TEXT, '25');
    WHEN 'PROJECT_TP' THEN
      v_value := COALESCE(pd.spec_tp, '01');
    WHEN 'CAR_YEAR' THEN
      v_year_produ := CASE WHEN pd.year_produ ~ '^\d+$' THEN pd.year_produ::INT ELSE NULL END;
      v_value := CASE WHEN v_year_produ IS NULL THEN '0'
                      ELSE (EXTRACT(YEAR FROM CURRENT_DATE)::INT - v_year_produ)::TEXT
                 END;
    WHEN 'COMMISSION' THEN
      v_value := COALESCE(pd.commission, '0');
    ELSE
      -- 其他客戶屬性（CUS_SEX / AGE / 等）需 join customer_core；本實作不在此處 join
      -- 由 caller（AssignmentRunPipelineService.executeV2）以 JS 計算或 v2.1 升級補完
      v_value := '';
  END CASE;
  RETURN v_value;
END;
$$;
