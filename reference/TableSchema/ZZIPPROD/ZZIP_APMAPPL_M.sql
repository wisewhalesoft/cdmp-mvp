USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_APMAPPL_M]    Script Date: 2026/4/20 下午 02:45:23 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_APMAPPL_M](
	[APPL_NO] [char](10) NOT NULL,
	[CUSTO_NO] [varchar](11) NULL,
	[ORDERS_ID] [varchar](14) NULL,
	[DEPT_ID] [varchar](6) NULL,
	[SPEC_NO] [varchar](10) NULL,
	[APRO_NO] [varchar](10) NULL,
	[CASE_TYPE] [varchar](2) NULL,
	[IMMOPRO_MK] [char](1) NULL,
	[CAR_USER] [nvarchar](90) NULL,
	[GUARD_NO] [varchar](11) NULL,
	[GUARD_NO2] [varchar](11) NULL,
	[GUARD_NO3] [varchar](11) NULL,
	[SPON_MK1] [varchar](2) NULL,
	[SPON_MK2] [varchar](2) NULL,
	[SPON_MK3] [varchar](2) NULL,
	[RELATION1] [varchar](2) NULL,
	[RELATION2] [varchar](2) NULL,
	[RELATION3] [varchar](2) NULL,
	[BRNH_NO] [char](5) NULL,
	[DLR_NO] [char](4) NULL,
	[SALES_NO] [varchar](14) NULL,
	[HFS_SALES] [nvarchar](14) NULL,
	[CAR_MODEL] [nvarchar](30) NULL,
	[CAR_SFX] [nvarchar](10) NULL,
	[YEAR_PRODU] [nvarchar](4) NULL,
	[BANK_ID] [nvarchar](3) NULL,
	[BRBANK_NO] [nvarchar](4) NULL,
	[PAY_WAY] [nvarchar](2) NULL,
	[ACC_NAME] [nvarchar](90) NULL,
	[BANK_ACC] [nvarchar](15) NULL,
	[GUARD_MK] [nvarchar](2) NULL,
	[CEASE_DATE] [datetime] NULL,
	[SMILE_U] [nvarchar](1) NULL,
	[ESCORT_TAX] [numeric](6, 0) NULL,
	[REC_CODE] [nvarchar](2) NULL,
	[CONFIR_DATE] [datetime] NULL,
	[REFU_CODE] [nvarchar](2) NULL,
	[APPL_DATE] [datetime] NULL,
	[STA_CODE] [nvarchar](2) NULL,
	[INPUT_DATE] [datetime] NULL,
	[REFRE_DATE] [datetime] NULL,
	[KEYIN_MEM] [nvarchar](14) NULL,
	[DIFF_MEM] [nvarchar](14) NULL,
	[MASTER_RATE] [numeric](6, 3) NULL,
	[APP_RATE] [numeric](6, 3) NULL,
	[PRO_RATE] [numeric](6, 3) NULL,
	[DEAL_NUM] [numeric](3, 0) NULL,
	[CYCLE_PAY] [nvarchar](2) NULL,
	[DEAL_MARK] [nvarchar](2) NULL,
	[THROU_MON] [numeric](8, 0) NULL,
	[MASTER_CAP] [numeric](8, 0) NULL,
	[APP_CAP] [numeric](8, 0) NULL,
	[ADV_FIR_DT] [datetime] NULL,
	[APP_COMM] [numeric](6, 0) NULL,
	[MAST_COMM] [numeric](6, 0) NULL,
	[B_MAST_IRR] [numeric](6, 3) NULL,
	[B_APP_IRR] [numeric](6, 3) NULL,
	[B_CASE_IRR] [numeric](6, 3) NULL,
	[EXTEND_DT] [datetime] NULL,
	[ENGIN_NO] [nvarchar](20) NULL,
	[BD_NO] [nvarchar](30) NULL,
	[LIC_NO] [varchar](8) NULL,
	[B_FINC_DATE] [datetime] NULL,
	[CHK_MEN] [nvarchar](14) NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[CAR_NAME] [nvarchar](30) NULL,
	[ZZIPR1270] [numeric](18, 0) NULL,
	[CUST_ZIP] [nvarchar](5) NULL,
	[CUST_ADD] [nvarchar](90) NULL,
	[CAR_ZIP] [nvarchar](5) NULL,
	[CAR_ADD] [nvarchar](90) NULL,
	[PAY_USER] [nvarchar](90) NULL,
	[PAY_ZIP] [nvarchar](5) NULL,
	[PAY_ADD] [nvarchar](90) NULL,
	[PAY_FIR_DATE] [datetime] NULL,
	[AGENT_HEAD_ID] [nvarchar](11) NULL,
	[AGENT_ID] [nvarchar](11) NULL,
	[RPMESBK_M] [nvarchar](11) NULL,
	[NOTE_APPL_NO] [nvarchar](10) NULL,
	[INQUIRY] [nvarchar](10) NULL,
	[EXPLAIN] [nvarchar](2000) NULL,
	[SUB_CODE] [nvarchar](2) NULL,
	[REC_CODE_MEMO] [nvarchar](2) NULL,
	[DEP_CODE_COMM] [nvarchar](300) NULL,
	[ORG_PRO_RATE] [numeric](6, 3) NULL,
	[ORG_B_CASE_IRR] [numeric](6, 3) NULL,
	[ORG_TOT_CAP] [numeric](8, 0) NULL,
	[ORG_DEAL_NUM] [numeric](3, 0) NULL,
	[CONTACT_MAN] [nvarchar](30) NULL,
	[CONTACT_TEL_NO1] [varchar](4) NULL,
	[CONTACT_TEL_NO2] [varchar](10) NULL,
	[CONTACT_CELL_NO] [varchar](12) NULL,
	[CONTACT_RELATION] [nvarchar](2) NULL,
	[OPEN_BANK_YM] [nvarchar](6) NULL,
	[BILL_COAGO] [nvarchar](2) NULL,
	[BILL_MEMO] [nvarchar](90) NULL,
	[CHECK_COND] [nvarchar](2) NULL,
	[MANAGER_LIMIT] [nvarchar](2) NULL,
	[CHECK_MEMO] [nvarchar](2000) NULL,
	[APPL_LIC_NO] [varchar](10) NULL,
	[FINAL_IRR] [numeric](6, 3) NULL,
	[HOTAI_SUB] [numeric](7, 0) NULL,
	[SALE_POINT] [nvarchar](2) NULL,
	[BANK_NA] [nvarchar](5) NULL,
	[AGENT_NO] [nvarchar](2) NULL,
	[REQ_NOTE] [nvarchar](1) NULL,
	[APPROVAL] [nvarchar](10) NULL,
	[NO_DUTY] [nvarchar](1) NULL,
	[NO_DUTY1] [nvarchar](1) NULL,
	[NO_DUTY2] [nvarchar](1) NULL,
	[NO_DUTY3] [nvarchar](1) NULL,
	[CAR_USER_ID] [varchar](11) NULL,
	[HAA_CAR] [nvarchar](1) NULL,
	[SPEC_TP] [char](2) NOT NULL,
	[APRO_TP] [varchar](2) NULL,
	[CARLOAN_FLG] [char](2) NOT NULL,
	[FUND_SRC] [char](2) NOT NULL,
	[BRAND] [varchar](2) NULL,
	[SECRET_FLG] [char](1) NULL,
	[ROWID] [int] IDENTITY(1,1) NOT NULL,
	[SECRET_REMARK] [nvarchar](150) NULL,
	[PROD_TYPE] [varchar](2) NULL,
	[CAR_PURPOSE] [varchar](2) NULL,
	[CAR_PRICE] [numeric](8, 0) NOT NULL,
	[MONTH_PRODU] [nvarchar](2) NULL,
	[CAREER_PROV] [nvarchar](2) NULL,
	[CONT_REMARK] [nvarchar](2000) NULL,
	[PRICE] [numeric](8, 0) NULL,
	[CONT_NOTE_FLG] [char](1) NULL,
	[CONT_MAIL_ADDR] [char](1) NULL,
	[O_HOTAI_SUB] [numeric](7, 0) NULL,
	[VISIT_QRY_USER] [nvarchar](14) NULL,
	[VISIT_CAR_USER] [nvarchar](14) NULL,
	[CHECK_DATE] [datetime] NULL,
	[INFORM_DATE] [datetime] NULL,
	[MANAGER_LIMIT_DEPT] [char](1) NOT NULL,
	[MANAGER_DEPT_DESC] [nvarchar](450) NULL,
	[POINT_DESC] [nvarchar](50) NULL,
	[MANAGER_AMT_LIMIT] [char](1) NOT NULL,
	[DEPT_NOT_SIGN] [smallint] NULL,
	[DLR_PHILO_NO] [nvarchar](30) NULL,
	[HOT_PRICE] [numeric](8, 0) NULL,
	[HOT_CODE] [nvarchar](14) NULL,
	[INQUIRY_REMARK] [nvarchar](2000) NULL,
	[AUDIT_REMARK] [nvarchar](1000) NULL,
	[SALES_CHK_FLG] [smallint] NOT NULL,
	[PRICE_REF] [nvarchar](2) NULL,
	[TRACK_FLG] [smallint] NOT NULL,
	[TRACK_DATE] [datetime] NULL,
	[VER_REMARK] [nvarchar](2000) NULL,
	[PIC_R_FLG] [smallint] NULL,
	[PIC_C_FLG] [smallint] NULL,
	[PIC_R_DATE] [datetime] NULL,
	[PIC_C_DATE] [datetime] NULL,
	[PIC_R_FLG2] [smallint] NULL,
	[PIC_R_DATE2] [datetime] NULL,
	[ENTER_SALES] [nvarchar](11) NULL,
	[PIC_R2_FLG] [smallint] NULL,
	[PIC_R2_DATE] [datetime] NULL,
	[PIC_R2_FLG2] [smallint] NULL,
	[PIC_R2_DATE2] [datetime] NULL,
	[PIC_C2_FLG] [smallint] NULL,
	[PIC_C2_DATE] [datetime] NULL,
	[CALL_DEPT] [varchar](4) NULL,
	[C_CLASS] [varchar](1) NULL,
	[CAR_BUSINESS] [varchar](2) NULL
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  CONSTRAINT [DF__ZZIP_APMA__NO_DU__69C6B1F5]  DEFAULT ('N') FOR [NO_DUTY]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  CONSTRAINT [DF__ZZIP_APMA__NO_DU__6ABAD62E]  DEFAULT ('N') FOR [NO_DUTY1]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  CONSTRAINT [DF__ZZIP_APMA__NO_DU__6BAEFA67]  DEFAULT ('N') FOR [NO_DUTY2]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  CONSTRAINT [DF__ZZIP_APMA__NO_DU__6CA31EA0]  DEFAULT ('N') FOR [NO_DUTY3]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  CONSTRAINT [DF_CAR_PRICE_1]  DEFAULT ((0)) FOR [CAR_PRICE]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  CONSTRAINT [DF__ZZIP_APMA__CONT___4CCB4BEB]  DEFAULT ('N') FOR [CONT_NOTE_FLG]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  CONSTRAINT [DF__ZZIP_APMA__CONT___4DBF7024]  DEFAULT ('0') FOR [CONT_MAIL_ADDR]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  DEFAULT ('N') FOR [MANAGER_LIMIT_DEPT]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  DEFAULT ('N') FOR [MANAGER_AMT_LIMIT]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  DEFAULT ((0)) FOR [DEPT_NOT_SIGN]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  DEFAULT ((0)) FOR [SALES_CHK_FLG]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_M] ADD  DEFAULT ((0)) FOR [TRACK_FLG]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請書案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'訂單編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ORDERS_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分處代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'DEPT_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主約專案代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SPEC_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'附約專案代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APRO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件分類碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CASE_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'是否有自有不動產' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'IMMOPRO_MK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實際用車人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人編號1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'GUARD_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人編號2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'GUARD_NO2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人編號3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'GUARD_NO3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人註記1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SPON_MK1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人註記2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SPON_MK2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人註記3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SPON_MK3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'與車主關係1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'RELATION1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'與車主關係2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'RELATION2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'與車主關係3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'RELATION3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業所代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BRNH_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'經銷商代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'DLR_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'業務員代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SALES_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'和潤業代(對保人)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'HFS_SALES'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車型' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_MODEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'SFX' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_SFX'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'年份' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'YEAR_PRODU'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'銀行代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BANK_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分行代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BRBANK_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'付款方式 TBL=08' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PAY_WAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'戶名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ACC_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'帳號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BANK_ACC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'對保註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'GUARD_MK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'失效日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CEASE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'微笑專案' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SMILE_U'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'遞延稅款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ESCORT_TAX'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'承作狀態碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'REC_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'承作確認日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONFIR_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'拒承作原因代號,TBL=36' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'REFU_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APPL_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'狀態碼 TBL_ID=18' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'STA_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'輸入日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'INPUT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'REFRE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'輸入人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'KEYIN_MEM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信人員(EXPLAIN)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'DIFF_MEM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主約利率' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'MASTER_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'附約利率' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APP_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件承作利率/客戶利率' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PRO_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'DEAL_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'繳款週期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CYCLE_PAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'期初/期末註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'DEAL_MARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'成交價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'THROU_MON'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主約本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'MASTER_CAP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'附約本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APP_CAP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'預定第一次繳款日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ADV_FIR_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'附約佣金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APP_COMM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主約佣金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'MAST_COMM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'扣佣irr(主約)/扣佣利率' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'B_MAST_IRR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'扣佣irr(附約)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'B_APP_IRR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件扣佣irr' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'B_CASE_IRR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'展期日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'EXTEND_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'引擎號碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ENGIN_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'底盤號碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BD_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'牌照號碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'LIC_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'回件完成日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'B_FINC_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'承作審核人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CHK_MEN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'輸入人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'最後修改日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'最後修改人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'1270列印次數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ZZIPR1270'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶聯絡地址區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CUST_ZIP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶聯絡地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CUST_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實際用車人聯絡地址區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_ZIP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實際用車人聯絡地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯款人姓名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PAY_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯款人聯絡地址區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PAY_ZIP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯款人聯絡地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PAY_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分處預定撥款日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PAY_FIR_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'agent公司' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'AGENT_HEAD_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'agent(承辦人)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'AGENT_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'動保設定' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'RPMESBK_M'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'票據案號(9106)舊案號(9306)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'NOTE_APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'INQUIRY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'整體案件說明' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'EXPLAIN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信中心承作建議 TBL_ID=56' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SUB_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信中心承作說明' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'REC_CODE_MEMO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分處承作原因' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'DEP_CODE_COMM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原承作利率' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ORG_PRO_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原承作IRR' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ORG_B_CASE_IRR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原申貸金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ORG_TOT_CAP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原申貸期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ORG_DEAL_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主聯絡人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONTACT_MAN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主聯絡人電話號碼一' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONTACT_TEL_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主聯絡人電話號碼二' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONTACT_TEL_NO2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主聯絡人行動號碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONTACT_CELL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主聯絡人與車主關係' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONTACT_RELATION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'票信狀況-開戶日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'OPEN_BANK_YM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'票信狀況-票據往來' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BILL_COAGO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'票信狀況-備註' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BILL_MEMO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'覆核條件 TBL_ID=74' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CHECK_COND'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'經理權限' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'MANAGER_LIMIT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'覆核說明' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CHECK_MEMO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'進件牌號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APPL_LIC_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'irr(和泰補貼款)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'FINAL_IRR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'和泰補貼款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'HOTAI_SUB'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'業績認定基礎 TBL_ID = S3 01發票 02撥款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SALE_POINT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯徵銀行別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BANK_NA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'AGENT據點別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'AGENT_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'強制用票碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'REQ_NOTE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'簽核人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APPROVAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主免責' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'NO_DUTY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人一免責' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'NO_DUTY1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人二免責' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'NO_DUTY2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人三免責' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'NO_DUTY3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實際用車人ID' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_USER_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'勁拍車' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'HAA_CAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主約專案類別，TBL=04' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SPEC_TP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'附約專案類別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'APRO_TP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車貸/非車貸' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CARLOAN_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資料袋，TBL=S8' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'FUND_SRC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'廠牌，TBL=63' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'BRAND'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保密件' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SECRET_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'序號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ROWID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保密備註' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SECRET_REMARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'產品分類，TBL=T1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PROD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛用途，TBLID=T2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_PURPOSE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新車價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'出廠月份' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'MONTH_PRODU'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主職業抵保證' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAREER_PROV'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡備註說明' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONT_REMARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'權威價/成交價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'是否已照會完成' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONT_NOTE_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'照會確認後劃撥單郵寄地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CONT_MAIL_ADDR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原和泰補貼款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'O_HOTAI_SUB'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'訪查表實勘人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'VISIT_QRY_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車勘表實勘人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'VISIT_CAR_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信完成日(覆核徵信完成日)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CHECK_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'通知書列印時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'INFORM_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業單位簽核權限' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'MANAGER_LIMIT_DEPT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業單位覆核說明' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'MANAGER_DEPT_DESC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重點選項' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'POINT_DESC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'金額為主管權限' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'MANAGER_AMT_LIMIT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業部不可簽核' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'DEPT_NOT_SIGN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'進件經銷商編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'DLR_PHILO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'HOT情報價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'HOT_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'HOT認證號碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'HOT_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信人員備註' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'INQUIRY_REMARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'審核備註' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'AUDIT_REMARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'業考註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'SALES_CHK_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'參考價，TBL=U8' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PRICE_REF'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'信管追蹤註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'TRACK_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'信管追蹤日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'TRACK_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'覆核徵信人員備註' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'VER_REMARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車行實勘照片_進件' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_R_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'對保人照' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_C_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'0-> 實勘照片-異動日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_R_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'0-> 對保照片-異動日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_C_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車行實勘照片_撥款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_R_FLG2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'0-> 實勘照片-異動日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_R_DATE2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'進件業務' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'ENTER_SALES'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛實勘照片(進件上傳)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_R2_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛實勘照片(撥款上傳)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_R2_FLG2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'對保地照' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'PIC_C2_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷部門名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CALL_DEPT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件主分類-TBLID=04比對TBL_VAL5' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'C_CLASS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業類型' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M', @level2type=N'COLUMN',@level2name=N'CAR_BUSINESS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請書主檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_M'
GO


