USE [OB]
GO

/****** Object:  Table [dbo].[OBPOOLDATA_LIST_LOG]    Script Date: 2026/4/20 下午 01:55:06 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBPOOLDATA_LIST_LOG](
	[A_PRGID] [varchar](20) NULL,
	[A_USERID] [varchar](20) NULL,
	[A_SYSDT] [datetime] NULL,
	[U_PRGID] [varchar](20) NULL,
	[U_USERID] [varchar](20) NULL,
	[U_SYSDT] [datetime] NULL,
	[LIST_NO] [nvarchar](100) NOT NULL,
	[ORGNO] [nvarchar](2) NOT NULL,
	[APPL_NO] [nvarchar](10) NOT NULL,
	[CUSTO_NO] [nvarchar](11) NULL,
	[CUST_NAME] [nvarchar](90) NULL,
	[LIC_NO] [varchar](10) NULL,
	[STA_CODE_NA] [nvarchar](40) NULL,
	[PROJECT_TP] [nvarchar](40) NULL,
	[SPEC_NO] [nvarchar](10) NULL,
	[SPEC_NAME] [nvarchar](45) NULL,
	[DEPT_NAME] [nvarchar](30) NULL,
	[PAY_RESOUC_CODE] [nvarchar](2) NULL,
	[BREAK_PCT] [numeric](5, 0) NULL,
	[EXTEND_DAY] [numeric](2, 0) NULL,
	[PAY_RESOUC] [nvarchar](40) NULL,
	[COMMUTE] [nvarchar](90) NULL,
	[CYCLE_PAY_NA] [nvarchar](40) NULL,
	[CYCLE_PAY_VAL] [nvarchar](2) NULL,
	[DEAL_NUM] [numeric](3, 0) NULL,
	[PRO_RATE] [numeric](5, 2) NULL,
	[B_CASE_IRR] [numeric](5, 2) NULL,
	[FIRST_PAY_DT] [datetime] NULL,
	[FAPCON_DT] [datetime] NULL,
	[MATURITY_DT] [datetime] NULL,
	[DEAL_MARK] [nvarchar](2) NULL,
	[PAY_WAY] [nvarchar](2) NULL,
	[LOAN_TOTAMT] [numeric](18, 0) NULL,
	[LOAN_CAPITAL] [numeric](18, 0) NULL,
	[LOAN_ODDAMT] [numeric](18, 0) NULL,
	[COMMISSION] [numeric](15, 0) NULL,
	[SETTLE_DATE] [datetime] NULL,
	[LOAN_RATE] [numeric](5, 2) NULL,
	[STA_CODE] [nvarchar](2) NULL,
	[OFI_DATE] [datetime] NULL,
	[DEPT_ID] [nvarchar](6) NULL,
	[PAY_WAY_NA] [nvarchar](30) NULL,
	[BRNH_NO] [nvarchar](5) NULL,
	[DLR_NO] [nvarchar](4) NULL,
	[BROKER] [nvarchar](60) NULL,
	[SALES_NO] [nvarchar](14) NULL,
	[BROKER_AGENT] [nvarchar](60) NULL,
	[HFS_SALES] [nvarchar](14) NULL,
	[SALES] [nvarchar](60) NULL,
	[AGENT_HEAD_ID] [nvarchar](11) NULL,
	[PROMOTER_DEPT] [nvarchar](60) NULL,
	[AGENT_ID] [nvarchar](11) NULL,
	[PROMOTER] [nvarchar](60) NULL,
	[BRAND_NO] [nvarchar](2) NULL,
	[BRAND_NAME] [nvarchar](40) NULL,
	[CAR_NAME] [nvarchar](30) NULL,
	[INQUIRY] [nvarchar](10) NULL,
	[APPROVAL] [nvarchar](10) NULL,
	[MANAGER_LIMIT] [nvarchar](2) NULL,
	[SPEC_MK_NA] [nvarchar](40) NULL,
	[SPEC_TYPE_NA] [nvarchar](40) NULL,
	[ATM_BUSINESS] [nvarchar](4) NULL,
	[NO_DUTY] [nvarchar](1) NULL,
	[YEAR_PRODU] [nvarchar](4) NULL,
	[DLR_NAME] [varchar](30) NULL,
	[BRNH_NAME] [varchar](30) NULL,
	[PROJECT_TP_CD] [nvarchar](2) NULL,
	[APPL_DATE] [datetime] NULL,
	[APMACC_MEMO] [nvarchar](1000) NULL,
	[SALES_STS_NA] [nvarchar](30) NULL,
	[SUB_CODE] [nvarchar](2) NULL,
	[CC_NBR] [nvarchar](5) NULL,
	[THROU_MON] [numeric](8, 0) NULL,
	[FUND_SRC] [varchar](2) NULL,
	[SECRET_FLG] [varchar](1) NULL,
	[RATE_CHOICE] [varchar](30) NULL,
	[PER_INFO] [nvarchar](30) NULL,
	[TIE_DOWN_NUM] [int] NULL,
	[REST_AMT] [numeric](8, 0) NULL,
	[OVER_TIE_NUM] [int] NULL,
	[OPEN_CODE] [varchar](1) NULL,
	[EMPLID] [varchar](10) NULL,
	[EMPLID_DEPTID] [varchar](6) NULL,
	[CASE_TYPE] [varchar](2) NULL,
	[HOTAI_AGREE] [varchar](10) NULL,
	[CALL_DEPT] [varchar](4) NULL,
	[C_CLASS] [varchar](1) NULL,
	[PAYT_NUM] [int] NULL,
	[LIST_TYPE] [varchar](2) NULL,
	[PROD_TYPE] [varchar](2) NULL,
	[PROD_TYPE_NAME] [nvarchar](40) NULL,
	[PROD_CLASS] [varchar](2) NULL,
	[PROD_CLASS_NAME] [nvarchar](40) NULL,
	[PROD_KIND] [varchar](2) NULL,
	[PROD_KIND_NAME] [varchar](8) NULL,
	[BEST_CASE] [varchar](1) NULL,
	[ACC_DATE] [datetime] NULL,
	[ORDER1] [int] NULL,
	[ORDER2] [int] NULL,
	[PAYT_TERM] [int] NULL,
	[TERM_AMT] [money] NULL,
	[NONPAYT_TERM] [int] NULL,
	[OVERDUE_AMT] [money] NULL,
	[OVERDUE_DAY] [int] NULL,
	[COLL_EMPL] [nvarchar](50) NULL,
	[CAR_MODEL] [nvarchar](100) NULL,
	[PAY_USER] [nvarchar](90) NULL,
	[PAY_ADD] [nvarchar](255) NULL,
	[FLEET_CAR] [varchar](1) NULL,
	[PROMOTER_TEL] [nvarchar](20) NULL,
	[SALES_TEL] [nvarchar](20) NULL,
	[MEMO1] [nvarchar](255) NULL,
	[CASEYEAR] [nvarchar](4) NULL,
	[OB_DEPT] [nvarchar](6) NULL,
	[OB_EMPLID] [nvarchar](6) NULL,
	[LAST_PAY_DATE] [datetime] NULL,
	[MONTH_CNT] [int] NULL,
	[YEAR_CNT] [int] NULL,
	[SETTLE_SRC] [nvarchar](max) NOT NULL,
	[ASSIGNDAY] [varchar](100) NULL,
	[SPEC_TP] [varchar](2) NULL,
	[CUS_LEVEL] [varchar](1) NULL,
	[CARD_LEVEL] [varchar](1) NULL,
	[TIER_LEVEL] [varchar](5) NULL,
	[HOT_RECYCLE] [varchar](1) NULL,
	[CR_ID] [varchar](20) NULL,
	[CR_NM] [nvarchar](50) NULL,
	[IS_CR] [varchar](1) NULL,
	[ACTION] [varchar](20) NOT NULL,
	[ACTION_DATE] [datetime] NOT NULL
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原建檔程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'A_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'U_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護時間待碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'LIST_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'公司別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'ORGNO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'顧客統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'顧客姓名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CUST_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車牌' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'LIC_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件狀態' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'STA_CODE_NA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案種類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROJECT_TP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SPEC_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SPEC_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷分處名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'DEPT_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'財務撥款來原代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PAY_RESOUC_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'違約金比例' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'BREAK_PCT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'展延日(?) 撥款來源判斷的' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'EXTEND_DAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'撥款來源' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PAY_RESOUC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'?(撥款來源判斷的) 01:和潤件' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'COMMUTE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'繳款週期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CYCLE_PAY_NA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'繳款週期期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CYCLE_PAY_VAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'DEAL_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件承做利率' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PRO_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件扣傭IRR' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'B_CASE_IRR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'首次繳款日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'FIRST_PAY_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'財務撥款確認日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'FAPCON_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'最大繳款日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'MATURITY_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'期初／期末註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'DEAL_MARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'付款方式' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PAY_WAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'總期付款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'LOAN_TOTAMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'總本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'LOAN_CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'總分差' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'LOAN_ODDAMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'傭金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'COMMISSION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'代償／結清日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SETTLE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'貸款成數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'LOAN_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件狀態' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'STA_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'OFI日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'OFI_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件分處代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'DEPT_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'付款方式待碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PAY_WAY_NA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業所代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'BRNH_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'經銷商代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'DLR_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'經銷商營業所名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'BROKER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'業務員統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SALES_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'業務名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'BROKER_AGENT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'和潤業代(對保人)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'HFS_SALES'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'和潤業代(對保人) 姓名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SALES'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Agent公司' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'AGENT_HEAD_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Agent公司名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROMOTER_DEPT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Agent(承辦人)統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'AGENT_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Agent(承辦人)名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROMOTER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'廠牌代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'BRAND_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'廠牌名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'BRAND_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CAR_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'INQUIRY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'審核人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'APPROVAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'經理權限' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'MANAGER_LIMIT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'產品分類名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SPEC_MK_NA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案屬性名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SPEC_TYPE_NA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'ATM業務碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'ATM_BUSINESS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'免責註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'NO_DUTY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'擔保品年份' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'YEAR_PRODU'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'經銷商名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'DLR_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業所名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'BRNH_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主約專案類別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROJECT_TP_CD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'APPL_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信結果說明' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'APMACC_MEMO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'業務員註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SALES_STS_NA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信中心承作建議' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SUB_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'引擎排氣量' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CC_NBR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'成交價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'THROU_MON'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資料袋' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'FUND_SRC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保密件' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SECRET_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'利率計算方式' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'RATE_CHOICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客服同意書' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PER_INFO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'綁約期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'TIE_DOWN_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'小資專案尾款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'REST_AMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'違約金利率' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'OVER_TIE_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'是否開放試算' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'OPEN_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷經辦員編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'EMPLID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷經辦分處' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'EMPLID_DEPTID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分期類型' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CASE_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'驅動城市APP同意' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'HOTAI_AGREE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷部門' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CALL_DEPT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件主分類-TBLID=04比對TBL_VAL5' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'C_CLASS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'已繳期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PAYT_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單類別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'LIST_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'產品分類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'產品分類名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROD_TYPE_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'商品類別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROD_CLASS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'商品類別名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROD_CLASS_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'產品類別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROD_KIND'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'產品類別名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROD_KIND_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'優勢案件註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'BEST_CASE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'結清日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'ACC_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'排序欄位1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'ORDER1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'排序欄位2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'ORDER2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'已繳期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PAYT_TERM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'期付款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'TERM_AMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'未繳期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'NONPAYT_TERM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'逾期金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'OVERDUE_AMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'逾期天數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'OVERDUE_DAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'催收經辦' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'COLL_EMPL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車型' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CAR_MODEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯款人姓名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PAY_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯款人地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PAY_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'FLEET_CAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'承辦人電話' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'PROMOTER_TEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分期業代電話' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SALES_TEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'備註一' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'MEMO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主案年份' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CASEYEAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷分派分處' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'OB_DEPT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷分派員編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'OB_EMPLID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'預計滿期日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'LAST_PAY_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'第一次繳款至分派案件經過月數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'MONTH_CNT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'第一次繳款至分派經過年數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'YEAR_CNT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'終結註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SETTLE_SRC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分派日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'ASSIGNDAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案屬性' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'SPEC_TP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶分級' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CUS_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡資料分級' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CARD_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單分級' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'TIER_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'HOT名單回收註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'HOT_RECYCLE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主案經辦員編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CR_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主案經辦人名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'CR_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'是否分給主案原經辦人註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'IS_CR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資料變動事件' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'ACTION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資料變動時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG', @level2type=N'COLUMN',@level2name=N'ACTION_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分派名單移除紀錄檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBPOOLDATA_LIST_LOG'
GO


