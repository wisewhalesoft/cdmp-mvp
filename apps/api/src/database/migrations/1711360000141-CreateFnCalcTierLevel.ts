import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E07 Track D — fn_calc_tier_level PostgreSQL function（AD-E07-10）
 *
 * 移植自 SQL Server SP_OBLEVELCARD_*（H/S/E/S5/E5/M）系列 Stored Procedure，
 * 將原 SP 的計分流程封裝為單一 plpgsql 函式，支援 Stage 2 LATERAL JOIN 批次呼叫。
 *
 * 設計重點（AD-E07-10 + lookup 約定）：
 *   1. 參數簽章嚴格符合 AD-E07-10：(card_type, card_version, ob_pool_data row)
 *   2. 函式內部以 LEFT JOIN customer_core / ob_arreturndf_min_cap 補齊 SP 中跨表欄位
 *      （ob_pool_data 不含的客戶屬性與 loan 維度），對齊 SP `ISNULL(...)` default 行為
 *   3. column_name 採「per-column hardcode 規則 + generic JSONB engine」混合策略
 *   4. ob_tier fallback：先 (card_type, card_level) 精確比對，找不到再 card_level IS NULL
 *
 * column_name 對應規則（與 AD-E07-10 lookup 約定一致）：
 *   - CUS_SEX, CAREA_NO1, CAREA_NO2, CELLULAR, AGE, EDUCAT_BACK,
 *     HPOST_NUM_NM, CPOST_NUM_NM, CO_NUM_NM    → customer_core
 *   - ADD_UN_CAPITAL                           → ob_arreturndf_min_cap
 *   - CAR_YEAR, LIST_MONTH, PROJECT_TP, SALES_STS, LOAN_RATE → ob_pool_data 衍生
 *   - 其餘                                       → generic engine（jsonb→>lower(column_name)）
 *
 * 依賴 migration（已執行）：
 *   - 1711360000000-CreateCustomerCore（customer_core）
 *   - 1711360000100-CreateE07ObSettingsTables（ob_levelcard_score/level/tier）
 *   - 1711360000110-CreateObPoolData（ob_pool_data 複合型別）
 *   - 1711360000140-CreateObArreturndfMinCap（ob_arreturndf_min_cap）
 */
export class CreateFnCalcTierLevel1711360000141 implements MigrationInterface {
  name = 'CreateFnCalcTierLevel1711360000141';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE OR REPLACE FUNCTION fn_calc_tier_level(
    p_card_type     VARCHAR(5),
    p_card_version  INTEGER,
    p_pool_data     ob_pool_data
)
RETURNS TABLE(
    score       INTEGER,
    card_level  VARCHAR(5),
    tier_level  VARCHAR(5)
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
    v_score             INTEGER := 0;
    v_card_level        VARCHAR(5);
    v_tier_level        VARCHAR(5);
    v_pool_jsonb        JSONB;

    -- customer_core lookup（缺值→NULL，後續 COALESCE 套 SP default）
    v_cust_gender       VARCHAR(1);
    v_cust_has_home     INTEGER;
    v_cust_has_contact  INTEGER;
    v_cust_has_mobile   INTEGER;
    v_cust_dob          DATE;
    v_cust_edu          VARCHAR(2);
    v_cust_res_zip      VARCHAR(6);
    v_cust_mail_zip     VARCHAR(6);
    v_cust_co_zip       VARCHAR(6);

    -- ob_arreturndf_min_cap lookup
    v_add_un_capital    NUMERIC;

    v_score_rule        RECORD;
    v_match             BOOLEAN;
    v_field_text        TEXT;
    v_field_num         NUMERIC;
    v_level1_norm       TEXT;
    v_proj_flag         TEXT;
BEGIN
    -- ===== Step 1: pool_data → JSONB（generic engine 動態取值用）=====
    v_pool_jsonb := to_jsonb(p_pool_data);

    -- ===== Step 2: customer_core 客戶屬性（CUS_SEX/CAREA_NO1/2/CELLULAR/AGE/EDUCAT_BACK/zip）=====
    SELECT
        cc.gender,
        (cc.home_phone    IS NOT NULL)::int,
        (cc.contact_phone IS NOT NULL)::int,
        (cc.mobile_phone  IS NOT NULL)::int,
        cc.date_of_birth,
        cc.education_code,
        cc.residential_zip,
        cc.mailing_zip,
        cc.company_zip
      INTO
        v_cust_gender, v_cust_has_home, v_cust_has_contact, v_cust_has_mobile,
        v_cust_dob, v_cust_edu, v_cust_res_zip, v_cust_mail_zip, v_cust_co_zip
      FROM customer_core cc
     WHERE cc.source_customer_no = (p_pool_data).custo_no
     LIMIT 1;

    -- ===== Step 3: ob_arreturndf_min_cap loan 屬性（ADD_UN_CAPITAL）=====
    SELECT a.add_un_capital INTO v_add_un_capital
      FROM ob_arreturndf_min_cap a
     WHERE a.appl_no = (p_pool_data).appl_no
     LIMIT 1;

    -- ===== Step 4: 迭代 ob_levelcard_score 規則 =====
    -- AD-E07-10 第 1 步：JOIN ob_levelcard_column 過濾 status='active'
    -- 跳過已停用維度的所有 score 規則（停用維度可能尚未定型或已過期）
    FOR v_score_rule IN
        SELECT s.column_name, s.level1, s.level2_s, s.level2_e, s.score
          FROM ob_levelcard_score s
          JOIN ob_levelcard_column c
            ON c.card_type    = s.card_type
           AND c.card_version = s.card_version
           AND c.column_name  = s.column_name
           AND c.status = 'active'
         WHERE s.card_type    = p_card_type
           AND s.card_version = p_card_version
    LOOP
        v_match       := FALSE;
        v_level1_norm := COALESCE(TRIM(v_score_rule.level1), '');

        BEGIN  -- per-rule exception block：cast 失敗或欄位缺漏時跳過該 rule，不中止整個函式
            CASE v_score_rule.column_name
              -- ----- customer_core 來源 -----
              WHEN 'CUS_SEX' THEN
                  v_field_num := COALESCE(NULLIF(v_cust_gender, '')::NUMERIC, 3);
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              WHEN 'CAREA_NO1' THEN
                  v_field_num := COALESCE(v_cust_has_home, 0);
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              WHEN 'CAREA_NO2' THEN
                  v_field_num := COALESCE(v_cust_has_contact, 0);
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              WHEN 'CELLULAR' THEN
                  v_field_num := COALESCE(v_cust_has_mobile, 0);
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              WHEN 'AGE' THEN
                  v_field_num := COALESCE(EXTRACT(YEAR FROM age(v_cust_dob))::NUMERIC, 0);
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              WHEN 'EDUCAT_BACK' THEN
                  v_field_text := COALESCE(v_cust_edu, '');
                  IF v_score_rule.level1 IS NOT NULL THEN
                      v_match := v_field_text = v_score_rule.level1;
                  ELSE
                      v_field_num := NULLIF(v_field_text, '')::NUMERIC;
                      v_match := COALESCE(v_field_num, 0) BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;
                  END IF;

              WHEN 'HPOST_NUM_NM' THEN
                  v_field_text := COALESCE(v_cust_res_zip, '');
                  v_match := v_field_text BETWEEN v_score_rule.level2_s AND v_score_rule.level2_e;

              WHEN 'CPOST_NUM_NM' THEN
                  v_field_text := COALESCE(v_cust_mail_zip, '');
                  v_match := v_field_text BETWEEN v_score_rule.level2_s AND v_score_rule.level2_e;

              WHEN 'CO_NUM_NM' THEN
                  v_field_text := COALESCE(v_cust_co_zip, '');
                  v_match := v_field_text BETWEEN v_score_rule.level2_s AND v_score_rule.level2_e;

              -- ----- ob_arreturndf_min_cap 來源 -----
              WHEN 'ADD_UN_CAPITAL' THEN
                  v_field_num := COALESCE(v_add_un_capital, 0);
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              -- ----- ob_pool_data 衍生欄位 -----
              WHEN 'CAR_YEAR' THEN
                  v_field_num := COALESCE(
                      EXTRACT(YEAR FROM CURRENT_DATE)::NUMERIC - NULLIF((p_pool_data).year_produ, '')::NUMERIC,
                      0
                  );
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              WHEN 'LIST_MONTH' THEN
                  v_field_num := COALESCE((p_pool_data).month_cnt, 25);
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              WHEN 'PROJECT_TP' THEN
                  v_field_text := COALESCE((p_pool_data).spec_tp, '01');
                  v_proj_flag  := CASE WHEN (p_pool_data).spec_name LIKE '%專案%' THEN 'A' ELSE '' END;
                  v_match := v_field_text BETWEEN v_score_rule.level2_s AND v_score_rule.level2_e
                          AND v_proj_flag = v_level1_norm;

              WHEN 'SALES_STS' THEN
                  v_field_text := CASE COALESCE((p_pool_data).sales_sts_na, '')
                                      WHEN 'AGENT'   THEN 'AGENT'
                                      WHEN '經銷商' THEN 'UCD'
                                      ELSE 'HFC'
                                  END;
                  v_match := v_field_text = v_score_rule.level1;

              WHEN 'LOAN_RATE' THEN
                  v_field_num := COALESCE((p_pool_data).loan_rate, 0);
                  v_match := v_field_num BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC;

              -- ----- Generic engine（其他 column_name）-----
              ELSE
                  v_field_text := v_pool_jsonb->>LOWER(v_score_rule.column_name);
                  v_field_num  := NULLIF(v_field_text, '')::NUMERIC;
                  v_match := COALESCE(v_field_num, 0) BETWEEN v_score_rule.level2_s::NUMERIC AND v_score_rule.level2_e::NUMERIC
                         AND (v_score_rule.level1 IS NULL OR v_level1_norm = COALESCE(v_field_text, ''));
            END CASE;
        EXCEPTION WHEN OTHERS THEN
            v_match := FALSE;
        END;

        IF v_match THEN
            v_score := v_score + v_score_rule.score;
        END IF;
    END LOOP;

    -- ===== Step 5: 由總分查 card_level（ob_levelcard_level）=====
    SELECT l.card_level INTO v_card_level
      FROM ob_levelcard_level l
     WHERE l.card_type    = p_card_type
       AND l.card_version = p_card_version
       AND v_score BETWEEN l.score_s AND l.score_e
     LIMIT 1;

    -- ===== Step 6: 由 (card_type, card_level) 查 tier_level；fallback 至 card_level IS NULL =====
    SELECT t.tier_level INTO v_tier_level
      FROM ob_tier t
     WHERE t.card_type = p_card_type
       AND t.card_level = v_card_level
     LIMIT 1;

    IF v_tier_level IS NULL THEN
        SELECT t.tier_level INTO v_tier_level
          FROM ob_tier t
         WHERE t.card_type = p_card_type
           AND t.card_level IS NULL
         LIMIT 1;
    END IF;

    RETURN QUERY SELECT v_score, v_card_level, v_tier_level;
END;
$fn$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_calc_tier_level(VARCHAR, INTEGER, ob_pool_data);`,
    );
  }
}
