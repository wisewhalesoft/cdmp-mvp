import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema — 由 dev DB (synchronize 依 entity 建) pg_dump 快照收斂而來。
 * 取代舊 67 支演進式 migration，為 schema 唯一事實來源（prod: NODE_ENV=production 關 synchronize）。
 * 涵蓋 37 表（36 entity + customer_core）、7 sequence、15 index、54 constraint、fn_calc_tier_level。
 * 不含 raw_*（ETL 執行期 staging，由 extraction 自建）與 typeorm_migrations（TypeORM 自建）。
 * 重新產生：見 scripts 或 plan；來源 = pg_dump --schema-only --schema=public。
 */
export class BaselineSchema1711360000000 implements MigrationInterface {
  name = 'BaselineSchema1711360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET check_function_bodies = false;
SET standard_conforming_strings = on;

CREATE TABLE public.ob_pool_data (
    created_by_prog character varying(20),
    created_by character varying(20),
    created_at timestamp without time zone,
    updated_by_prog character varying(20),
    updated_by character varying(20),
    updated_at timestamp without time zone,
    orgno character varying(2) NOT NULL,
    appl_no character varying(10) NOT NULL,
    custo_no character varying(11) NOT NULL,
    cust_name character varying(90),
    lic_no character varying(10),
    sta_code_na character varying(40),
    project_tp character varying(40),
    spec_no character varying(10),
    spec_name character varying(45),
    dept_name character varying(30),
    pay_resouc_code character varying(2),
    break_pct numeric(5,0),
    extend_day numeric(2,0),
    pay_resouc character varying(40),
    commute character varying(90),
    cycle_pay_na character varying(40),
    cycle_pay_val character varying(2),
    deal_num numeric(3,0),
    pro_rate numeric(5,2),
    b_case_irr numeric(5,2),
    first_pay_dt timestamp without time zone,
    fapcon_dt timestamp without time zone,
    maturity_dt timestamp without time zone,
    deal_mark character varying(2),
    pay_way character varying(2),
    loan_totamt numeric(18,0),
    loan_capital numeric(18,0),
    loan_oddamt numeric(18,0),
    commission numeric(15,0),
    settle_date timestamp without time zone,
    loan_rate numeric(5,2),
    sta_code character varying(2) NOT NULL,
    ofi_date timestamp without time zone,
    dept_id character varying(6) NOT NULL,
    pay_way_na character varying(30),
    brnh_no character varying(5),
    dlr_no character varying(4),
    broker character varying(60),
    sales_no character varying(14),
    broker_agent character varying(60),
    hfs_sales character varying(14),
    sales character varying(60),
    agent_head_id character varying(11),
    promoter_dept character varying(60),
    agent_id character varying(11),
    promoter character varying(60),
    brand_no character varying(2),
    brand_name character varying(40),
    car_name character varying(30),
    inquiry character varying(10),
    approval character varying(10),
    manager_limit character varying(2),
    spec_mk_na character varying(40),
    spec_type_na character varying(40),
    atm_business character varying(4),
    no_duty character varying(1),
    year_produ character varying(4),
    dlr_name character varying(30),
    brnh_name character varying(30),
    project_tp_cd character varying(2),
    appl_date timestamp without time zone,
    apmacc_memo text,
    sales_sts_na character varying(30),
    sub_code character varying(2),
    cc_nbr character varying(5),
    throu_mon numeric(8,0),
    fund_src character varying(2),
    secret_flg character varying(1),
    rate_choice character varying(30),
    per_info character varying(30),
    tie_down_num integer,
    rest_amt numeric(8,0),
    over_tie_num integer,
    open_code character varying(1),
    emplid character varying(10),
    emplid_deptid character varying(6),
    case_type character varying(2),
    hotai_agree character varying(10),
    call_dept character varying(4),
    c_class character varying(1),
    payt_num integer,
    list_type character varying(2) NOT NULL,
    prod_type character varying(2),
    prod_type_name character varying(40),
    prod_class character varying(2),
    prod_class_name character varying(40),
    prod_kind character varying(2),
    prod_kind_name character varying(8),
    best_case character varying(1),
    acc_date timestamp without time zone,
    order1 integer,
    order2 integer,
    payt_term integer,
    term_amt numeric(19,4),
    nonpayt_term integer,
    overdue_amt numeric(19,4),
    overdue_day integer,
    coll_empl character varying(50),
    car_model character varying(100),
    pay_user character varying(90),
    pay_add character varying(255),
    fleet_car character varying(1),
    promoter_tel character varying(20),
    sales_tel character varying(20),
    memo1 character varying(255),
    caseyear character varying(4),
    ob_dept character varying(6),
    ob_emplid character varying(6),
    last_pay_date timestamp without time zone,
    month_cnt integer,
    year_cnt integer,
    settle_src text NOT NULL,
    spec_tp character varying(2),
    cus_level character varying(1),
    _cdmp_extracted_at timestamp without time zone NOT NULL
);


--
-- Name: fn_calc_tier_level(character varying, integer, public.ob_pool_data); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calc_tier_level(p_card_type character varying, p_card_version integer, p_pool_data public.ob_pool_data) RETURNS TABLE(score integer, card_level character varying, tier_level character varying)
    LANGUAGE plpgsql STABLE
    AS $$
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
$$;


--
-- Name: assignment_approval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_approval (
    approval_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    list_no character varying(11) NOT NULL,
    action character varying(10) NOT NULL,
    reject_reason character varying(500),
    approver_id uuid NOT NULL,
    approver_name character varying(100),
    approver_role character varying(20),
    approved_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: assignment_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_audit_log (
    log_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(100) NOT NULL,
    action character varying(30) NOT NULL,
    actor_id uuid NOT NULL,
    actor_name character varying(100) NOT NULL,
    before_value jsonb,
    after_value jsonb,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: assignment_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_run (
    run_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_workym character varying(6) NOT NULL,
    status character varying(20) NOT NULL,
    triggered_by uuid NOT NULL,
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    duration_ms integer,
    total_cases integer,
    total_lists integer,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    skipped_cases jsonb,
    warning_summary character varying(100)
);


--
-- Name: assignment_run_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_run_snapshot (
    snapshot_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    run_id uuid NOT NULL,
    snapshot_type character varying(20) NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: assignment_run_stage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_run_stage_log (
    id bigint NOT NULL,
    run_id uuid NOT NULL,
    stage_no smallint NOT NULL,
    status character varying(10) NOT NULL,
    started_at timestamp without time zone NOT NULL,
    finished_at timestamp without time zone,
    processed_count integer,
    error_message text
);


--
-- Name: assignment_run_stage_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assignment_run_stage_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignment_run_stage_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assignment_run_stage_log_id_seq OWNED BY public.assignment_run_stage_log.id;


--
-- Name: customer_core; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_core (
    customer_id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_customer_no character varying(20) NOT NULL,
    customer_type_code character varying(2) NOT NULL,
    name character varying(100) NOT NULL,
    english_name character varying(60),
    gender character varying(1),
    date_of_birth date,
    marital_status_code character varying(1),
    education_code character varying(2),
    education_desc character varying(50),
    mobile_phone character varying(30),
    home_phone character varying(30),
    contact_phone character varying(30),
    office_phone character varying(30),
    email character varying(40),
    line_account character varying(50),
    residential_zip character varying(6),
    residential_address character varying(100),
    mailing_zip character varying(6),
    mailing_address character varying(100),
    company_zip character varying(6),
    company_address character varying(100),
    company_name character varying(100),
    occupation_code character varying(4),
    occupation_desc character varying(50),
    job_title_code character varying(4),
    job_title_desc character varying(50),
    job_level_code character varying(2),
    industry_code character varying(10),
    industry_desc character varying(100),
    work_years numeric(8,2),
    company_scale character varying(1),
    monthly_income_code character varying(5),
    approved_income integer,
    income_source_code character varying(5),
    capital numeric(12,0),
    credit_limit numeric(12,0),
    has_real_estate character varying(1),
    debt_flag character(1),
    fine_flag character(1),
    address_anomaly_flag smallint,
    mainland_flag smallint,
    owner_name character varying(50),
    owner_id character varying(10),
    owner_birth date,
    established_capital numeric(12,0),
    employee_count_code character varying(6),
    is_listed_code character varying(6),
    parent_customer_id character varying(10),
    source_created_at timestamp without time zone,
    source_updated_at timestamp without time zone,
    data_source character varying(50) NOT NULL,
    _etl_loaded_at timestamp without time zone DEFAULT now() NOT NULL,
    _etl_pipeline_id uuid NOT NULL,
    spouse_name character varying(100),
    father_name character varying(100),
    mother_name character varying(100),
    id_issue_type character varying(2),
    id_issue_date timestamp without time zone,
    id_issue_address character varying(100),
    driver_license character varying(20),
    maturity_mailing_zip character varying(6),
    maturity_mailing_address character varying(100),
    registered_phone character varying(30),
    registered_fax character varying(30),
    business_fax character varying(30),
    business_mobile character varying(30),
    registered_zip character varying(6),
    registered_address character varying(100),
    highest_transaction_amount numeric(12,0),
    highest_transaction_date timestamp without time zone,
    parent_customer_name character varying(100),
    group_owner character varying(50),
    organization_type character varying(6),
    owner_zip character varying(6),
    owner_address character varying(100),
    customer_type_desc character varying(50),
    marital_status_desc character varying(50),
    job_level_desc character varying(50),
    income_source_desc character varying(50),
    monthly_income_desc character varying(50),
    role character varying(50),
    employee_count_desc character varying(50),
    is_listed_desc character varying(50),
    business_item character varying(100),
    cus_sex character varying(2),
    carea_no1 character varying(10),
    carea_no2 character varying(10),
    cellular character varying(20),
    hpost_city character varying(20),
    cpost_city character varying(20),
    co_city character varying(20)
);


--
-- Name: datasource_health_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.datasource_health_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    datasource_id uuid NOT NULL,
    success boolean NOT NULL,
    response_time_ms integer,
    error_message text,
    checked_at timestamp without time zone NOT NULL
);


--
-- Name: datasources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.datasources (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(20) NOT NULL,
    host character varying(255) NOT NULL,
    port integer NOT NULL,
    database_name character varying(100) NOT NULL,
    username character varying(100) NOT NULL,
    encrypted_password text NOT NULL,
    description character varying(500),
    status character varying(20) DEFAULT 'unknown'::character varying NOT NULL,
    last_tested_at timestamp without time zone,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: etl_pipeline_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etl_pipeline_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pipeline_id uuid NOT NULL,
    version integer NOT NULL,
    status character varying(20) NOT NULL,
    started_at timestamp without time zone NOT NULL,
    finished_at timestamp without time zone,
    duration_ms integer,
    processed_count integer DEFAULT 0 NOT NULL,
    error_message text,
    node_logs text,
    triggered_by character varying(20) NOT NULL,
    is_test_run boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: etl_pipeline_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etl_pipeline_versions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pipeline_id uuid NOT NULL,
    version integer NOT NULL,
    definition text NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    change_summary character varying(500),
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    published_at timestamp without time zone
);


--
-- Name: etl_pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etl_pipelines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    version integer DEFAULT 1 NOT NULL,
    step_count integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    schedule character varying(100),
    last_execution_at timestamp without time zone,
    next_execution_at timestamp without time zone,
    processed_count integer DEFAULT 0 NOT NULL,
    avg_duration_ms integer DEFAULT 0 NOT NULL,
    execution_count integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    deleted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: extraction_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    started_at timestamp without time zone NOT NULL,
    finished_at timestamp without time zone,
    duration_ms integer,
    extracted_count integer DEFAULT 0 NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    error_message text,
    triggered_by character varying(20) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: extraction_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_tasks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    datasource_id uuid NOT NULL,
    mode character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    incremental_column character varying(255),
    last_incremental_value character varying(255),
    schedule character varying(100) NOT NULL,
    last_execution_at timestamp without time zone,
    extracted_count integer DEFAULT 0 NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    progress_percent double precision DEFAULT '0'::double precision NOT NULL,
    avg_duration_ms integer DEFAULT 0 NOT NULL,
    execution_count integer DEFAULT 0 NOT NULL,
    error_message text,
    enabled boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    source_table character varying(255) NOT NULL,
    raw_table_name character varying(20),
    source_schema character varying(255)
);


--
-- Name: ob_arreturndf_min_cap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_arreturndf_min_cap (
    appl_no character varying(20) NOT NULL,
    add_un_capital numeric(15,0),
    _cdmp_extracted_at timestamp without time zone NOT NULL
);


--
-- Name: ob_assign_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_assign_config (
    config_key character varying(50) NOT NULL,
    config_value text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    description text
);


--
-- Name: ob_assign_set; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_assign_set (
    id bigint NOT NULL,
    list_no character varying(20),
    workdt character varying(10) NOT NULL,
    casedt character varying(10) NOT NULL,
    ratio_rate integer NOT NULL
);


--
-- Name: ob_assign_set_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ob_assign_set_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ob_assign_set_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ob_assign_set_id_seq OWNED BY public.ob_assign_set.id;


--
-- Name: ob_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_calendar (
    calendar_date date NOT NULL,
    rest_flg character varying(1) NOT NULL
);


--
-- Name: ob_card_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_card_type (
    card_type character varying(5) NOT NULL,
    card_name character varying(20) NOT NULL,
    prod_kind character varying(4) NOT NULL,
    status character varying(10) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone NOT NULL,
    created_by character varying(50) NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    updated_by character varying(50) NOT NULL
);


--
-- Name: ob_code_df; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_code_df (
    system_id character varying(4) NOT NULL,
    tbl_id character varying(11) NOT NULL,
    tbl_cd character varying(4) NOT NULL,
    tbl_desc1 character varying(40),
    tbl_desc2 character varying(40),
    tbl_val1 numeric(12,0),
    tbl_val2 timestamp without time zone,
    tbl_val3 character varying(40),
    tbl_val4 character varying(40),
    tbl_val5 character varying(40),
    tbl_val6 character varying(80),
    tbl_val7 character varying(80),
    tbl_val8 character varying(80),
    stadt character varying(8),
    enddt character varying(8)
);


--
-- Name: ob_dept_pct; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_dept_pct (
    created_by_prog character varying(10) NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_by_prog character varying(10) NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    project_workym character varying(6) NOT NULL,
    list_no character varying(11) NOT NULL,
    obdeptid character varying(6) NOT NULL,
    obdeptnm character varying(10) NOT NULL,
    ration numeric(9,2) NOT NULL,
    created_by character varying(50) NOT NULL,
    updated_by character varying(50) NOT NULL
);


--
-- Name: ob_emphire; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_emphire (
    emp_id character varying(10) NOT NULL,
    emp_nm character varying(50),
    id_no character varying(10),
    dept_code character varying(10),
    dept_name character varying(30),
    title_code character varying(5),
    title_name character varying(30),
    jfun_id character varying(10),
    jfun_nm character varying(15),
    hire_date date,
    resign_date date,
    email character varying(100),
    is_auth character varying(1)
);


--
-- Name: ob_empl_set; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_empl_set (
    created_by_prog character varying(10),
    created_at timestamp without time zone,
    updated_by_prog character varying(10),
    updated_at timestamp without time zone,
    list_no character varying(11) NOT NULL,
    deptid_m character varying(50) NOT NULL,
    emplid character varying(6) NOT NULL,
    ration numeric(10,2) NOT NULL,
    prod_type character varying(255),
    created_by character varying(50),
    updated_by character varying(50)
);


--
-- Name: ob_levelcard_column; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_levelcard_column (
    id bigint NOT NULL,
    created_by_prog character varying(20),
    created_by character varying(20),
    created_at timestamp without time zone,
    updated_by_prog character varying(20),
    updated_by character varying(20),
    updated_at timestamp without time zone,
    card_type character varying(10),
    card_version integer,
    column_name character varying(30),
    column_label character varying(30),
    status character varying(10) DEFAULT 'active'::character varying NOT NULL,
    match_type character varying(20) NOT NULL
);


--
-- Name: ob_levelcard_column_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ob_levelcard_column_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ob_levelcard_column_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ob_levelcard_column_id_seq OWNED BY public.ob_levelcard_column.id;


--
-- Name: ob_levelcard_level; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_levelcard_level (
    id bigint NOT NULL,
    created_by_prog character varying(20),
    created_by character varying(20),
    created_at timestamp without time zone,
    updated_by_prog character varying(20),
    updated_by character varying(20),
    updated_at timestamp without time zone,
    card_type character varying(10) NOT NULL,
    card_version integer NOT NULL,
    score_s integer NOT NULL,
    score_e integer NOT NULL,
    card_level character varying(1) NOT NULL
);


--
-- Name: ob_levelcard_level_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ob_levelcard_level_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ob_levelcard_level_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ob_levelcard_level_id_seq OWNED BY public.ob_levelcard_level.id;


--
-- Name: ob_levelcard_score; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_levelcard_score (
    id bigint NOT NULL,
    created_by_prog character varying(20),
    created_by character varying(20),
    created_at timestamp without time zone,
    updated_by_prog character varying(20),
    updated_by character varying(20),
    updated_at timestamp without time zone,
    card_type character varying(10) NOT NULL,
    card_version integer NOT NULL,
    column_name character varying(30) NOT NULL,
    level2_s character varying(10),
    level2_e character varying(10),
    score integer NOT NULL,
    level1 character varying(10)
);


--
-- Name: ob_levelcard_score_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ob_levelcard_score_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ob_levelcard_score_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ob_levelcard_score_id_seq OWNED BY public.ob_levelcard_score.id;


--
-- Name: ob_levelcard_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_levelcard_version (
    id bigint NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    card_type text,
    card_name character varying(20),
    card_version integer,
    sdate character varying(8) NOT NULL,
    edate character varying(8) NOT NULL,
    status character varying(10) DEFAULT 'active'::character varying NOT NULL,
    created_by_prog character varying(50),
    created_by character varying(50),
    updated_by_prog character varying(50),
    updated_by character varying(50)
);


--
-- Name: ob_levelcard_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ob_levelcard_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ob_levelcard_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ob_levelcard_version_id_seq OWNED BY public.ob_levelcard_version.id;


--
-- Name: ob_list_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_list_definition (
    created_by_prog character varying(20) NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_by_prog character varying(20) NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    list_no character varying(11) NOT NULL,
    list_nm character varying(45) NOT NULL,
    prod_kind character varying(255) NOT NULL,
    prod_best character varying(5),
    spec_tp character varying(255),
    list_type character varying(255) NOT NULL,
    list_period_start character varying(3) NOT NULL,
    list_period_end character varying(3) NOT NULL,
    list_interval character varying(3) NOT NULL,
    assigned_date timestamp without time zone,
    total_amount integer,
    reserved_amount integer,
    is_assigned character varying(1),
    project_workym character varying(6),
    casenumber character varying(50),
    name character varying(50),
    caseyear character varying(255),
    caseyearnm character varying(10),
    settle_src character varying(6),
    status character varying(10) DEFAULT 'active'::character varying NOT NULL,
    card_type character varying(5),
    stage character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    case_status character varying(14),
    cr_enabled boolean DEFAULT false NOT NULL,
    condition_payload jsonb,
    created_by character varying(50) NOT NULL,
    updated_by character varying(50) NOT NULL,
    stage0_estimate_count integer,
    stage0_estimated_at timestamp without time zone
);


--
-- Name: ob_monthly_run_result; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_monthly_run_result (
    run_id uuid NOT NULL,
    list_no character varying(100) NOT NULL,
    orgno character varying(2) NOT NULL,
    appl_no character varying(10) NOT NULL,
    custo_no character varying(11),
    settle_src text DEFAULT 'N'::text NOT NULL,
    score integer,
    card_level character varying(1),
    tier_level character varying(5),
    is_cr character varying(1),
    cr_id character varying(20),
    cr_nm character varying(50),
    dept_id character varying(6),
    emplid character varying(10),
    emplid_deptid character varying(6),
    result_status character varying(20) DEFAULT 'PENDING'::character varying,
    assignday character varying(100),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    appl_date timestamp without time zone
);


--
-- Name: ob_pool_data_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_pool_data_list (
    created_by_prog character varying(20),
    created_by character varying(20),
    created_at timestamp without time zone,
    updated_by_prog character varying(20),
    updated_by character varying(20),
    updated_at timestamp without time zone,
    list_no character varying(100) NOT NULL,
    orgno character varying(2) NOT NULL,
    appl_no character varying(10) NOT NULL,
    custo_no character varying(11),
    cust_name character varying(90),
    lic_no character varying(10),
    sta_code_na character varying(40),
    project_tp character varying(40),
    spec_no character varying(10),
    spec_name character varying(45),
    dept_name character varying(30),
    pay_resouc_code character varying(2),
    break_pct numeric(5,0),
    extend_day numeric(2,0),
    pay_resouc character varying(40),
    commute character varying(90),
    cycle_pay_na character varying(40),
    cycle_pay_val character varying(2),
    deal_num numeric(3,0),
    pro_rate numeric(5,2),
    b_case_irr numeric(5,2),
    first_pay_dt timestamp without time zone,
    fapcon_dt timestamp without time zone,
    maturity_dt timestamp without time zone,
    deal_mark character varying(2),
    pay_way character varying(2),
    loan_totamt numeric(18,0),
    loan_capital numeric(18,0),
    loan_oddamt numeric(18,0),
    commission numeric(15,0),
    settle_date timestamp without time zone,
    loan_rate numeric(5,2),
    sta_code character varying(2),
    ofi_date timestamp without time zone,
    dept_id character varying(6),
    pay_way_na character varying(30),
    brnh_no character varying(5),
    dlr_no character varying(4),
    broker character varying(60),
    sales_no character varying(14),
    broker_agent character varying(60),
    hfs_sales character varying(14),
    sales character varying(60),
    agent_head_id character varying(11),
    promoter_dept character varying(60),
    agent_id character varying(11),
    promoter character varying(60),
    brand_no character varying(2),
    brand_name character varying(40),
    car_name character varying(30),
    inquiry character varying(10),
    approval character varying(10),
    manager_limit character varying(2),
    spec_mk_na character varying(40),
    spec_type_na character varying(40),
    atm_business character varying(4),
    no_duty character varying(1),
    year_produ character varying(4),
    dlr_name character varying(30),
    brnh_name character varying(30),
    project_tp_cd character varying(2),
    appl_date timestamp without time zone,
    apmacc_memo text,
    sales_sts_na character varying(30),
    sub_code character varying(2),
    cc_nbr character varying(5),
    throu_mon numeric(8,0),
    fund_src character varying(2),
    secret_flg character varying(1),
    rate_choice character varying(30),
    per_info character varying(30),
    tie_down_num integer,
    rest_amt numeric(8,0),
    over_tie_num integer,
    open_code character varying(1),
    emplid character varying(10),
    emplid_deptid character varying(6),
    case_type character varying(2),
    hotai_agree character varying(10),
    call_dept character varying(4),
    c_class character varying(1),
    payt_num integer,
    list_type character varying(2),
    prod_type character varying(2),
    prod_type_name character varying(40),
    prod_class character varying(2),
    prod_class_name character varying(40),
    prod_kind character varying(2),
    prod_kind_name character varying(8),
    best_case character varying(1),
    acc_date timestamp without time zone,
    order1 integer,
    order2 integer,
    payt_term integer,
    term_amt numeric(19,4),
    nonpayt_term integer,
    overdue_amt numeric(19,4),
    overdue_day integer,
    coll_empl character varying(50),
    car_model character varying(100),
    pay_user character varying(90),
    pay_add character varying(255),
    fleet_car character varying(1),
    promoter_tel character varying(20),
    sales_tel character varying(20),
    memo1 character varying(255),
    caseyear character varying(4),
    ob_dept character varying(6),
    ob_emplid character varying(6),
    last_pay_date timestamp without time zone,
    month_cnt integer,
    year_cnt integer,
    settle_src text NOT NULL,
    assignday character varying(100),
    spec_tp character varying(2),
    cus_level character varying(1),
    card_level character varying(1),
    tier_level character varying(5),
    hot_recycle character varying(1),
    cr_id character varying(20),
    cr_nm character varying(50),
    is_cr character varying(1),
    score integer,
    data_source character varying(20)
);


--
-- Name: ob_tier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ob_tier (
    id bigint NOT NULL,
    list_nm character varying(30),
    card_type character varying(5) NOT NULL,
    card_level character varying(5),
    tier_level character varying(5) NOT NULL
);


--
-- Name: ob_tier_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ob_tier_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ob_tier_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ob_tier_id_seq OWNED BY public.ob_tier.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id character varying(36) NOT NULL,
    token character varying(36) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pooldata_field_option; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pooldata_field_option (
    column_name character varying(64) NOT NULL,
    option_value character varying(64) NOT NULL,
    option_label character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    deactivation_reason character varying(30),
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: pooldata_field_whitelist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pooldata_field_whitelist (
    column_name character varying(64) NOT NULL,
    display_name character varying(100) NOT NULL,
    field_type character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    is_system_fixed boolean DEFAULT false NOT NULL,
    data_source character varying(20) DEFAULT 'ob_pool_data'::character varying NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    role_code character varying(30) NOT NULL,
    display_name character varying(50) NOT NULL,
    alias character varying(50),
    type character varying(10) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: token_blocklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_blocklist (
    token character varying(2048) NOT NULL,
    user_id character varying(36) NOT NULL,
    revoked_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    password_changed_at timestamp without time zone,
    role character varying(30) DEFAULT 'user'::character varying NOT NULL,
    is_sales_manager boolean DEFAULT false NOT NULL,
    business_role character varying(20)
);


--
-- Name: assignment_run_stage_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_run_stage_log ALTER COLUMN id SET DEFAULT nextval('public.assignment_run_stage_log_id_seq'::regclass);


--
-- Name: ob_assign_set id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_assign_set ALTER COLUMN id SET DEFAULT nextval('public.ob_assign_set_id_seq'::regclass);


--
-- Name: ob_levelcard_column id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_levelcard_column ALTER COLUMN id SET DEFAULT nextval('public.ob_levelcard_column_id_seq'::regclass);


--
-- Name: ob_levelcard_level id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_levelcard_level ALTER COLUMN id SET DEFAULT nextval('public.ob_levelcard_level_id_seq'::regclass);


--
-- Name: ob_levelcard_score id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_levelcard_score ALTER COLUMN id SET DEFAULT nextval('public.ob_levelcard_score_id_seq'::regclass);


--
-- Name: ob_levelcard_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_levelcard_version ALTER COLUMN id SET DEFAULT nextval('public.ob_levelcard_version_id_seq'::regclass);


--
-- Name: ob_tier id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_tier ALTER COLUMN id SET DEFAULT nextval('public.ob_tier_id_seq'::regclass);


--
-- Name: etl_pipeline_logs PK_002e7ece0b705c4370990da32fa; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_pipeline_logs
    ADD CONSTRAINT "PK_002e7ece0b705c4370990da32fa" PRIMARY KEY (id);


--
-- Name: assignment_run_stage_log PK_070f0897705d07a618d2854004b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_run_stage_log
    ADD CONSTRAINT "PK_070f0897705d07a618d2854004b" PRIMARY KEY (id);


--
-- Name: assignment_run PK_0bc2c27a7373651f135a3aa61c9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_run
    ADD CONSTRAINT "PK_0bc2c27a7373651f135a3aa61c9" PRIMARY KEY (run_id);


--
-- Name: ob_tier PK_1484ef7513286dffbaca95b2972; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_tier
    ADD CONSTRAINT "PK_1484ef7513286dffbaca95b2972" PRIMARY KEY (id);


--
-- Name: ob_arreturndf_min_cap PK_1e55ceee948c467921a5b28392c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_arreturndf_min_cap
    ADD CONSTRAINT "PK_1e55ceee948c467921a5b28392c" PRIMARY KEY (appl_no);


--
-- Name: ob_pool_data_list PK_25012a3a33820861fa2c76266b8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_pool_data_list
    ADD CONSTRAINT "PK_25012a3a33820861fa2c76266b8" PRIMARY KEY (list_no, orgno, appl_no);


--
-- Name: ob_emphire PK_372ea98fc4d94c566be3bdb1268; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_emphire
    ADD CONSTRAINT "PK_372ea98fc4d94c566be3bdb1268" PRIMARY KEY (emp_id);


--
-- Name: roles PK_3feee96f9a604421f24496988db; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "PK_3feee96f9a604421f24496988db" PRIMARY KEY (role_code);


--
-- Name: ob_card_type PK_54d27e1a09e1ab6f390c68a6071; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_card_type
    ADD CONSTRAINT "PK_54d27e1a09e1ab6f390c68a6071" PRIMARY KEY (card_type);


--
-- Name: datasources PK_58956946c51ef1259c83ac28afa; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasources
    ADD CONSTRAINT "PK_58956946c51ef1259c83ac28afa" PRIMARY KEY (id);


--
-- Name: etl_pipelines PK_5a89a196fdd31fc93ef5a88a17c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_pipelines
    ADD CONSTRAINT "PK_5a89a196fdd31fc93ef5a88a17c" PRIMARY KEY (id);


--
-- Name: assignment_approval PK_5e154eb3553ccd0d2642d3db67c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_approval
    ADD CONSTRAINT "PK_5e154eb3553ccd0d2642d3db67c" PRIMARY KEY (approval_id);


--
-- Name: ob_pool_data PK_61272888dbb69edc11bd16c3778; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_pool_data
    ADD CONSTRAINT "PK_61272888dbb69edc11bd16c3778" PRIMARY KEY (orgno, appl_no);


--
-- Name: ob_assign_config PK_6479fa58aa0887aac321e8d7390; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_assign_config
    ADD CONSTRAINT "PK_6479fa58aa0887aac321e8d7390" PRIMARY KEY (config_key);


--
-- Name: ob_levelcard_column PK_650c8d344ce783c2262c4c016b3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_levelcard_column
    ADD CONSTRAINT "PK_650c8d344ce783c2262c4c016b3" PRIMARY KEY (id);


--
-- Name: assignment_audit_log PK_698fbc2718b05d079eda3a8e3bd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_audit_log
    ADD CONSTRAINT "PK_698fbc2718b05d079eda3a8e3bd" PRIMARY KEY (log_id);


--
-- Name: ob_levelcard_level PK_7a1d35e59667da50bec98bb0c62; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_levelcard_level
    ADD CONSTRAINT "PK_7a1d35e59667da50bec98bb0c62" PRIMARY KEY (id);


--
-- Name: ob_levelcard_score PK_82abd3a52e5c27c23707ab6b41f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_levelcard_score
    ADD CONSTRAINT "PK_82abd3a52e5c27c23707ab6b41f" PRIMARY KEY (id);


--
-- Name: etl_pipeline_versions PK_961136cde05fabe2d9b1df68ce5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_pipeline_versions
    ADD CONSTRAINT "PK_961136cde05fabe2d9b1df68ce5" PRIMARY KEY (id);


--
-- Name: ob_assign_set PK_9e07acf20db946eaaa30af1e22d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_assign_set
    ADD CONSTRAINT "PK_9e07acf20db946eaaa30af1e22d" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: ob_levelcard_version PK_a60886445f18e5dcf75dfc018da; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_levelcard_version
    ADD CONSTRAINT "PK_a60886445f18e5dcf75dfc018da" PRIMARY KEY (id);


--
-- Name: token_blocklist PK_a873f7efa1cb7ff02034abdaa45; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_blocklist
    ADD CONSTRAINT "PK_a873f7efa1cb7ff02034abdaa45" PRIMARY KEY (token);


--
-- Name: ob_monthly_run_result PK_ae7626a9cdbb4815d2dc08ead13; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_monthly_run_result
    ADD CONSTRAINT "PK_ae7626a9cdbb4815d2dc08ead13" PRIMARY KEY (run_id, list_no, orgno, appl_no);


--
-- Name: datasource_health_logs PK_b037f59b0406c9cb34258b7309a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasource_health_logs
    ADD CONSTRAINT "PK_b037f59b0406c9cb34258b7309a" PRIMARY KEY (id);


--
-- Name: ob_calendar PK_b103cfa0e0c26b2bd23c04de887; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_calendar
    ADD CONSTRAINT "PK_b103cfa0e0c26b2bd23c04de887" PRIMARY KEY (calendar_date);


--
-- Name: pooldata_field_option PK_b55f18f0dcc149ce16d1eabf1dd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pooldata_field_option
    ADD CONSTRAINT "PK_b55f18f0dcc149ce16d1eabf1dd" PRIMARY KEY (column_name, option_value);


--
-- Name: ob_code_df PK_b6ea28aa51409b39e79f1cdbbe7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_code_df
    ADD CONSTRAINT "PK_b6ea28aa51409b39e79f1cdbbe7" PRIMARY KEY (system_id, tbl_id, tbl_cd);


--
-- Name: assignment_run_snapshot PK_c2f7a759b7ecaeaa27159558b1a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_run_snapshot
    ADD CONSTRAINT "PK_c2f7a759b7ecaeaa27159558b1a" PRIMARY KEY (snapshot_id);


--
-- Name: ob_empl_set PK_c5ffb434eafe13f6879e7aae399; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_empl_set
    ADD CONSTRAINT "PK_c5ffb434eafe13f6879e7aae399" PRIMARY KEY (list_no, deptid_m, emplid, ration);


--
-- Name: pooldata_field_whitelist PK_c9d521803ec95347b8b80876bb4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pooldata_field_whitelist
    ADD CONSTRAINT "PK_c9d521803ec95347b8b80876bb4" PRIMARY KEY (column_name);


--
-- Name: extraction_tasks PK_c9db75dd7bc7e1a1c729ed0cc12; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_tasks
    ADD CONSTRAINT "PK_c9db75dd7bc7e1a1c729ed0cc12" PRIMARY KEY (id);


--
-- Name: ob_dept_pct PK_cd74ca89c5897daa640005afe09; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_dept_pct
    ADD CONSTRAINT "PK_cd74ca89c5897daa640005afe09" PRIMARY KEY (project_workym, list_no, obdeptid, ration);


--
-- Name: password_reset_tokens PK_d16bebd73e844c48bca50ff8d3d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY (id);


--
-- Name: extraction_logs PK_e07ace3ad4133bb1cf0e11b99a8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_logs
    ADD CONSTRAINT "PK_e07ace3ad4133bb1cf0e11b99a8" PRIMARY KEY (id);


--
-- Name: ob_list_definition PK_fa863d3f4ae0e74d3d183f458de; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_list_definition
    ADD CONSTRAINT "PK_fa863d3f4ae0e74d3d183f458de" PRIMARY KEY (list_no);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: password_reset_tokens UQ_ab673f0e63eac966762155508ee; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "UQ_ab673f0e63eac966762155508ee" UNIQUE (token);


--
-- Name: customer_core customer_core_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_core
    ADD CONSTRAINT customer_core_pkey PRIMARY KEY (customer_id);


--
-- Name: customer_core customer_core_source_customer_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_core
    ADD CONSTRAINT customer_core_source_customer_no_key UNIQUE (source_customer_no);


--
-- Name: idx_assignment_approval_list_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_approval_list_action ON public.assignment_approval USING btree (list_no, action);


--
-- Name: idx_assignment_approval_list_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_approval_list_approved ON public.assignment_approval USING btree (list_no, approved_at);


--
-- Name: idx_assignment_audit_log_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_audit_log_actor ON public.assignment_audit_log USING btree (actor_id, created_at);


--
-- Name: idx_assignment_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_audit_log_created ON public.assignment_audit_log USING btree (created_at);


--
-- Name: idx_assignment_audit_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_audit_log_entity ON public.assignment_audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_assignment_run_snapshot_run_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_run_snapshot_run_type ON public.assignment_run_snapshot USING btree (run_id, snapshot_type);


--
-- Name: idx_assignment_run_workym_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_run_workym_status ON public.assignment_run USING btree (project_workym, status);


--
-- Name: idx_ob_assign_set_workdt_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ob_assign_set_workdt_list ON public.ob_assign_set USING btree (workdt, list_no);


--
-- Name: idx_ob_pool_data_list_assignday_custo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ob_pool_data_list_assignday_custo ON public.ob_pool_data_list USING btree (assignday, custo_no);


--
-- Name: idx_ob_pool_data_list_score_notnull; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ob_pool_data_list_score_notnull ON public.ob_pool_data_list USING btree (score) WHERE (score IS NOT NULL);


--
-- Name: idx_omrr_assignday; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omrr_assignday ON public.ob_monthly_run_result USING btree (assignday);


--
-- Name: idx_omrr_custo_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omrr_custo_no ON public.ob_monthly_run_result USING btree (custo_no);


--
-- Name: idx_omrr_list_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omrr_list_run ON public.ob_monthly_run_result USING btree (list_no, run_id);


--
-- Name: idx_omrr_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omrr_run_id ON public.ob_monthly_run_result USING btree (run_id);


--
-- Name: uq_assignment_run_stage_log_run_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_assignment_run_stage_log_run_stage ON public.assignment_run_stage_log USING btree (run_id, stage_no);


--
-- Name: etl_pipeline_logs FK_23cceae00b5eb9729b565024fad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_pipeline_logs
    ADD CONSTRAINT "FK_23cceae00b5eb9729b565024fad" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: datasource_health_logs FK_2a38507fd9a0a6de371d921db74; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasource_health_logs
    ADD CONSTRAINT "FK_2a38507fd9a0a6de371d921db74" FOREIGN KEY (datasource_id) REFERENCES public.datasources(id);


--
-- Name: datasources FK_2ad1c86df28b8c46ac3e5d23238; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasources
    ADD CONSTRAINT "FK_2ad1c86df28b8c46ac3e5d23238" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: extraction_tasks FK_2fe739526cd82fd0d2ef376214a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_tasks
    ADD CONSTRAINT "FK_2fe739526cd82fd0d2ef376214a" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assignment_run_stage_log FK_3815c7b25214c516b5c938addc2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_run_stage_log
    ADD CONSTRAINT "FK_3815c7b25214c516b5c938addc2" FOREIGN KEY (run_id) REFERENCES public.assignment_run(run_id) ON DELETE CASCADE;


--
-- Name: extraction_tasks FK_4937cd817002913b0defd7ec830; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_tasks
    ADD CONSTRAINT "FK_4937cd817002913b0defd7ec830" FOREIGN KEY (datasource_id) REFERENCES public.datasources(id);


--
-- Name: etl_pipeline_versions FK_5a657616bca41ce733c024f641d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_pipeline_versions
    ADD CONSTRAINT "FK_5a657616bca41ce733c024f641d" FOREIGN KEY (pipeline_id) REFERENCES public.etl_pipelines(id);


--
-- Name: etl_pipeline_versions FK_5c05232024200afbe85d5c716fa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_pipeline_versions
    ADD CONSTRAINT "FK_5c05232024200afbe85d5c716fa" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: etl_pipelines FK_6f864c19c58f10f9b55ea80b8d4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_pipelines
    ADD CONSTRAINT "FK_6f864c19c58f10f9b55ea80b8d4" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assignment_run_snapshot FK_86feefc58c9aa84b275678df02f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_run_snapshot
    ADD CONSTRAINT "FK_86feefc58c9aa84b275678df02f" FOREIGN KEY (run_id) REFERENCES public.assignment_run(run_id) ON DELETE CASCADE;


--
-- Name: extraction_logs FK_9dbe26a18140840dac4354d6529; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_logs
    ADD CONSTRAINT "FK_9dbe26a18140840dac4354d6529" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: extraction_logs FK_c2e4403e494318fc2b869006fcc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_logs
    ADD CONSTRAINT "FK_c2e4403e494318fc2b869006fcc" FOREIGN KEY (task_id) REFERENCES public.extraction_tasks(id);


--
-- Name: etl_pipeline_logs FK_f6e5ca1fddc558eb97b91fb90c8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_pipeline_logs
    ADD CONSTRAINT "FK_f6e5ca1fddc558eb97b91fb90c8" FOREIGN KEY (pipeline_id) REFERENCES public.etl_pipelines(id);


--
-- Name: ob_monthly_run_result FK_ffd66384bf9ecee4e5e6aa38bca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ob_monthly_run_result
    ADD CONSTRAINT "FK_ffd66384bf9ecee4e5e6aa38bca" FOREIGN KEY (run_id) REFERENCES public.assignment_run(run_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
  }
}
