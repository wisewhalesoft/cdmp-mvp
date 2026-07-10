/* =============================================================================
   AD-E07-43 P6c — customer_core 中文顯示欄 varchar -> nvarchar (dev CDMP ALTER)
   I-MSSQL-NVARCHAR-DISPLAY-01 家族（P5i 之延伸；customer_core 為 migration-only、無 entity）。

   根因：Chinese_Taiwan_Stroke_BIN collation 下 varchar(N) 以 BYTE 計長（中文 2 bytes/字），
        maturity_mailing_address 之 59 中文字（≈118 bytes）於 varchar(100)=100 bytes 溢位截斷，
        致 ETL "ETL for Customer Core" target_load UPSERT 失敗。

   範圍：31 個中文自由文字顯示欄（姓名 8 / 地址 7 / 代碼解碼 _desc 11 / 縣市 3 / 營業項目+角色 2）。
        寬度（字元數）維持不變——dev 實測來源最長字元數 FATHER_NM 86 / registered_address 64 /
        business_item 71 / city 8 / role 34，皆 ≤ 既有寬度。純型別轉換即足，不需加寬。
   保留 varchar：ASCII 鍵/代碼/電話/zip/flag 欄（避 cross-type join、無 Unicode 益處）。
   nullability 逐欄保真：僅 name 為 NOT NULL，其餘 30 欄 NULL。

   注意：新鮮部署（prod）已由 MssqlBaselineSchema.ts 內建，本檔僅供既有 dev CDMP 就地 ALTER。
   ============================================================================= */

-- 姓名 (names)
ALTER TABLE dbo.customer_core ALTER COLUMN [name] nvarchar(100) NOT NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [owner_name] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [spouse_name] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [father_name] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [mother_name] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [parent_customer_name] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [group_owner] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [company_name] nvarchar(100) NULL;

-- 地址 (addresses)
ALTER TABLE dbo.customer_core ALTER COLUMN [residential_address] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [mailing_address] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [company_address] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [id_issue_address] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [maturity_mailing_address] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [registered_address] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [owner_address] nvarchar(100) NULL;

-- 代碼解碼輸出 (code_decode _desc outputs)
ALTER TABLE dbo.customer_core ALTER COLUMN [education_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [occupation_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [job_title_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [industry_desc] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [customer_type_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [marital_status_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [job_level_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [income_source_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [monthly_income_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [employee_count_desc] nvarchar(50) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [is_listed_desc] nvarchar(50) NULL;

-- 縣市 (postal-decoded cities)
ALTER TABLE dbo.customer_core ALTER COLUMN [hpost_city] nvarchar(20) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [cpost_city] nvarchar(20) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [co_city] nvarchar(20) NULL;

-- 其他中文顯示欄 (business item / role)
ALTER TABLE dbo.customer_core ALTER COLUMN [business_item] nvarchar(100) NULL;
ALTER TABLE dbo.customer_core ALTER COLUMN [role] nvarchar(50) NULL;

/* --- 驗證：應回傳 31 列 nvarchar，且 name IS_NULLABLE='NO'、其餘='YES' ---
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME='customer_core' AND DATA_TYPE='nvarchar'
ORDER BY COLUMN_NAME;
*/
