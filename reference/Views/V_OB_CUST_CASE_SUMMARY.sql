/*───────────────────────────────────────────────────────────────────────────
  View     : dbo.V_OB_CUST_CASE_SUMMARY
  Source   : APYHFC16.ZZIPPROD（分期 / ORGNO=02）
  用途     : 以「客戶（CUSTO_NO）」為中心，彙整案件往來資訊，供 CDMP F036 目標表
             customer_financial 之 ETL 抽取來源。輸出一客戶一列。
  下游     : CDMP extraction task（full 模式，直接抽本 view）→ pipeline → customer_financial
             → F075 篩選欄位（名單分派）。

  欄位定義
    has_guarantor        有無保人（保人列數 > 0 → 'Y'）
    guarantor_count      保人數量  = COUNT(*) ZZIP_BAMGUARD_M（經案件橋接，不去重、不排除）
    phone_coll_case_cnt  電催件數  = 該客戶有幾件案曾發生電催（案件層；每案任一期 DELAY_DAY 8–30）
    legal_coll_case_cnt  法催件數  = 該客戶有幾件案曾發生法催（案件層；每案任一期 DELAY_DAY >= 31）
    midterm_case_cnt     期中件數  = STA_CODE 05–89
    matured_case_cnt     滿期件數  = STA_CODE = 90
    settled_case_cnt     中結件數  = STA_CODE 91–98
    void_case_cnt        其他作廢件數 = STA_CODE = 99
                         （互斥級距：每案僅落一桶；四欄相加 = 客戶總案件數 05–99）

  假設 / 注意
    - ZZIP_APMAPPL_M：一案一列、單一 STA_CODE；無 ORGNO 欄（本表即分期 02）。
    - ORGNO='02' 僅在 ARRETURNDF 明確過濾。
    - STA_CODE 走字串比較（假設 2 碼零填充）。
    - APPL_NO 三表型別不一（char / nvarchar / varchar）；SQL Server '=' 忽略尾隨空白，
      若遇 join 對不上改用 RTRIM()。
    - ARRETURNDF 一案一期一列、就地更新（DELAY_DAY 為當期最終值）。
───────────────────────────────────────────────────────────────────────────*/
CREATE VIEW dbo.V_OB_CUST_CASE_SUMMARY AS
WITH appl AS (          -- 分期申請主檔：一案一列、單一 STA_CODE
    -- CUSTO_NO 以 LTRIM/RTRIM 正規化：來源有前導/尾隨空白變體（如 ' 120778230' vs '120778230'），
    --   Chinese_Taiwan_Stroke_BIN 逐位元比對視為相異 → 若不 TRIM，DISTINCT/GROUP BY 會各自成組，
    --   載入時 handler 又 TRIM source_customer_no → 塌縮成同鍵 → PK 重複。先 TRIM 使同一客戶合併、
    --   件數/次數正確加總。並排除無客戶編號之孤兒案件（source_customer_no 為 NOT NULL PK）。
    SELECT APPL_NO, LTRIM(RTRIM(CUSTO_NO)) AS CUSTO_NO, STA_CODE
    FROM ZZIPPROD.dbo.ZZIP_APMAPPL_M WITH (NOLOCK)
    WHERE CUSTO_NO IS NOT NULL AND LTRIM(RTRIM(CUSTO_NO)) <> ''
),
status_cnt AS (         -- 案件狀態件數（互斥級距，每案只落一桶）
    SELECT CUSTO_NO,
        SUM(CASE WHEN STA_CODE >= '05' AND STA_CODE <= '89' THEN 1 ELSE 0 END) AS midterm_case_cnt, -- 期中 05-89
        SUM(CASE WHEN STA_CODE = '90'                       THEN 1 ELSE 0 END) AS matured_case_cnt, -- 滿期 =90
        SUM(CASE WHEN STA_CODE >= '91' AND STA_CODE <= '98' THEN 1 ELSE 0 END) AS settled_case_cnt, -- 中結 91-98
        SUM(CASE WHEN STA_CODE = '99'                       THEN 1 ELSE 0 END) AS void_case_cnt     -- 其他作廢 =99
    FROM appl
    GROUP BY CUSTO_NO
),
guarantor AS (          -- 保人：經案件橋接的保人列數（COUNT(*)，不去重、不排除）
    SELECT a.CUSTO_NO, COUNT(*) AS guarantor_count
    FROM ZZIPPROD.dbo.ZZIP_BAMGUARD_M g WITH (NOLOCK)
    JOIN appl a ON a.APPL_NO = g.APPL_NO
    GROUP BY a.CUSTO_NO
),
coll_case AS (          -- 電/法催：先逐案判定是否曾發生（ARRETURNDF 一案一期一列）
    SELECT r.APPL_NO,
        MAX(CASE WHEN r.DELAY_DAY >= 8 AND r.DELAY_DAY <= 30 THEN 1 ELSE 0 END) AS has_phone,
        MAX(CASE WHEN r.DELAY_DAY >= 31                      THEN 1 ELSE 0 END) AS has_legal
    FROM ZZIPPROD.dbo.ARRETURNDF r WITH (NOLOCK)
    WHERE r.ORGNO = '02'
    GROUP BY r.APPL_NO
),
coll AS (               -- 電/法催件數：再彙總到客戶（曾發生電/法催之案件數）
    SELECT a.CUSTO_NO,
        SUM(cc.has_phone)   AS phone_coll_case_cnt,
        SUM(cc.has_legal)   AS legal_coll_case_cnt
    FROM coll_case cc
    JOIN appl a ON a.APPL_NO = cc.APPL_NO
    GROUP BY a.CUSTO_NO
),
cust AS (SELECT DISTINCT CUSTO_NO FROM appl)
SELECT
    c.CUSTO_NO,
    CASE WHEN ISNULL(g.guarantor_count,0) > 0 THEN 'Y' ELSE 'N' END AS has_guarantor,      -- 有無保人
    ISNULL(g.guarantor_count,0)      AS guarantor_count,      -- 保人數量
    ISNULL(cl.phone_coll_case_cnt,0) AS phone_coll_case_cnt,  -- 電催件數 (DELAY_DAY 8-30)
    ISNULL(cl.legal_coll_case_cnt,0) AS legal_coll_case_cnt,  -- 法催件數 (DELAY_DAY >=31)
    ISNULL(s.midterm_case_cnt,0)     AS midterm_case_cnt,     -- 期中件數    (STA 05-89)
    ISNULL(s.matured_case_cnt,0)     AS matured_case_cnt,     -- 滿期件數    (STA 90)
    ISNULL(s.settled_case_cnt,0)     AS settled_case_cnt,     -- 中結件數    (STA 91-98)
    ISNULL(s.void_case_cnt,0)        AS void_case_cnt         -- 其他作廢件數 (STA 99)
FROM cust c
LEFT JOIN status_cnt s ON s.CUSTO_NO = c.CUSTO_NO
LEFT JOIN guarantor  g ON g.CUSTO_NO = c.CUSTO_NO
LEFT JOIN coll       cl ON cl.CUSTO_NO = c.CUSTO_NO;
