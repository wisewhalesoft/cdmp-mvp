USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_APMAPPL_EX]    Script Date: 2026/4/20 下午 02:44:46 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_APMAPPL_EX](
	[APPL_NO] [varchar](10) NOT NULL,
	[CHK_LOCATION] [varchar](1) NULL,
	[CHK_LOCATION_ADDR] [nvarchar](100) NULL,
	[INSERT_DATE] [datetime] NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[FLEET_CAR] [varchar](1) NULL,
	[FLEET_COMP_ID] [varchar](10) NULL,
	[FLEET_COMP_NAME] [nvarchar](40) NULL,
	[PROJ_NOMATCH_FLG] [smallint] NOT NULL,
	[PAYABLE_FLG] [smallint] NOT NULL,
	[CAL_FLG] [smallint] NULL,
	[TEL_PASS] [varchar](2) NULL,
	[TEL_PASS_AMT] [numeric](8, 0) NULL,
	[SALE_STORE_NAME] [nvarchar](100) NULL,
	[TEL_FLG] [smallint] NULL,
	[TELRPT_VER] [varchar](5) NULL,
	[APPLY_EMPCNT] [int] NULL,
	[FLEET_CARCC] [varchar](10) NULL,
	[FLEET_CARCOLOR] [nvarchar](20) NULL,
	[FLEET_EMPCNT] [int] NULL,
	[FLEET_TURNOVER] [money] NULL,
	[FLEET_CAPITAL] [money] NULL,
	[FLEET_ADDR] [nvarchar](150) NULL,
	[FLEET_TEL] [nvarchar](20) NULL,
	[FLEET_SETDATE] [datetime] NULL,
	[TEL_IMG_UPLOAD] [int] NULL,
	[MONTH_PRODU] [nvarchar](20) NULL,
	[CHECK] [varchar](30) NULL,
	[SPEC_TIME] [varchar](15) NULL,
	[REMARKS] [nvarchar](300) NULL,
	[1PLUS1_LIC_NO] [varchar](8) NULL,
	[ML_CASE_NO] [nvarchar](20) NULL,
	[ML_CAR_TYPE] [nvarchar](2) NULL,
	[ML_CHILD_CAR_TYPE] [nvarchar](2) NULL,
	[ML_CAR_BODY_TYPE] [nvarchar](2) NULL,
	[ML_CAR_TONNES_NUM] [numeric](6, 2) NULL,
	[ML_CAR_USAGE_TYPE] [nvarchar](2) NULL,
	[ML_FIRSTPAY] [numeric](9, 0) NULL,
	[ML_PATDAYS] [numeric](3, 0) NULL,
	[ML_NPV] [numeric](9, 0) NULL,
	[ML_NPVRATECOST] [numeric](8, 3) NULL,
	[ML_FEE] [numeric](9, 0) NULL,
	[ML_PURCHASEMARGIN] [numeric](9, 0) NULL,
	[ML_COMMISSION] [numeric](9, 0) NULL,
	[HC_CASE_TYPE] [nvarchar](10) NULL,
	[ML_CAR_BODY_TYPE_PRICE] [numeric](8, 0) NULL,
	[ML_CHILD_CAR_TYPE_PRICE] [numeric](8, 0) NULL,
	[ML_SECOND_PRICE] [numeric](8, 0) NULL,
	[ML_C_SELL_PRICE] [numeric](8, 0) NULL,
	[ML_CAR_CHA_NO] [nvarchar](20) NULL,
	[ML_CAR_CHA_PRICE] [numeric](8, 0) NULL,
	[HC_CASE_TYPE_DESC1] [nvarchar](30) NULL,
	[HC_CASE_TYPE_DESC2] [nvarchar](10) NULL,
	[ML_ESBK_AMT] [numeric](9, 0) NULL,
	[ML_DLR_FEE] [int] NULL,
	[AUTOAUDIT] [varchar](2) NULL,
	[ML_CAR_STYLE] [nvarchar](4) NULL,
	[IPPA_FLG] [varchar](1) NULL,
	[CC_NBR] [varchar](10) NULL,
	[ML_GAGE_TOT_BAL] [int] NULL,
	[ML_GAGE_RATE] [numeric](5, 2) NULL,
	[ML_DIRECT] [bit] NULL,
	[ML_FLEET_CAR] [bit] NULL,
	[ML_FLEET_TO_GUARD] [bit] NULL,
	[LIC_PDF_FILE] [nvarchar](100) NULL,
	[TEL_NOTBAD_FLG] [varchar](1) NULL,
	[PAYWAY_NOTICE] [varchar](2) NULL,
	[CCIS_EXPLAIN] [xml] NULL,
	[CCIS_EXPLAIN_DATE] [datetime] NULL,
	[IS_HOTAI_PAY] [bit] NULL,
	[AGENT_SUB] [int] NULL,
	[NPV] [int] NULL,
	[AUTO_IPD0200_FLG] [varchar](1) NULL,
	[NPV_ANNUAL] [int] NULL,
	[SUB_CODE_FORMAPP] [varchar](4) NULL,
	[CHECK_COND_FORMAPP] [varchar](4) NULL,
	[DIGI_PDF_FILE] [nvarchar](250) NULL,
	[DIGI_CHK_FILE_PATH] [nvarchar](250) NULL,
	[STORE_APPL_NO] [nvarchar](50) NULL,
	[STD_DIFF] [numeric](6, 3) NULL,
	[NPPCC_NOTE] [nvarchar](200) NULL,
	[ASSIGNOR_NO] [nvarchar](14) NULL,
	[IS_ESBK_FLG] [bit] NULL,
	[IS_COMM_FLG] [bit] NULL,
	[IS_SET] [bit] NULL,
	[IS_SET2] [bit] NULL,
	[R_PRICE] [varchar](20) NULL,
	[STD_RATE] [numeric](6, 3) NULL,
	[RETAIL_PRICE] [int] NULL,
	[CONFIRM_FLG] [bit] NULL,
	[OWNER_ET_USER] [int] NULL,
	[OWNER_ET_DATE] [datetime] NULL,
	[OWNER_ET_FFLG] [int] NULL,
	[GUARD1_ET_USER] [int] NULL,
	[GUARD1_ET_DATE] [datetime] NULL,
	[GUARD1_ET_FFLG] [int] NULL,
	[GUARD2_ET_USER] [int] NULL,
	[GUARD2_ET_DATE] [datetime] NULL,
	[GUARD2_ET_FFLG] [int] NULL,
	[PERMIT_DATE] [datetime] NULL,
	[INCOME_APPROVED] [int] NULL,
	[INCOME_EXPENSE_RATIO] [numeric](6, 2) NULL,
	[PAY_TOTAL] [int] NULL,
	[INCOME_SOURCE] [varchar](5) NULL,
	[FUND_USE] [varchar](4) NULL,
	[FUND_USE_OTHER] [nvarchar](30) NULL,
	[SALES_SIGN] [bit] NULL,
	[FINAL_PAY] [varchar](2) NULL,
	[REDEMPTION] [int] NULL,
 CONSTRAINT [PK_ZZIP_APMAPPL_EX] PRIMARY KEY CLUSTERED 
(
	[APPL_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_EX] ADD  DEFAULT ((0)) FOR [PROJ_NOMATCH_FLG]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_EX] ADD  DEFAULT ((0)) FOR [PAYABLE_FLG]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_EX] ADD  DEFAULT ((0)) FOR [CAL_FLG]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'對保地，TBL=V9' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CHK_LOCATION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'對保地，其他地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CHK_LOCATION_ADDR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新增日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新增人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行司機' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_CAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_COMP_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_COMP_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案不符' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'PROJ_NOMATCH_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'可撥款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'PAYABLE_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'計算註記(0:表示IPC0180可儲存,1:表示IPC0180儲存時需要先重展主管權限)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CAL_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷快速徵審' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'TEL_PASS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷快速徵審-判斷金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'TEL_PASS_AMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實際銷售車行' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'SALE_STORE_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷自KEY件註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'TEL_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'列印申請書版本(對應ZZIP_BAMCODE_D TBL_ID=''W8''' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'TELRPT_VER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司車輛排氣量(CC)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_CARCC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司車色' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_CARCOLOR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司員工數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_EMPCNT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司營業額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_TURNOVER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司資本額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_ADDR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司電話' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_TEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'靠行公司設立日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FLEET_SETDATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷件上傳圖檔註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'TEL_IMG_UPLOAD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'出廠月份' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'MONTH_PRODU'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'選項 TBL_ID=X1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CHECK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'照會時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'SPEC_TIME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'備註' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'REMARKS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'1+1車號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'1PLUS1_LIC_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車合約編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CASE_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車底盤或子車' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CAR_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車子車分類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CHILD_CAR_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車車體分類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CAR_BODY_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車噸位' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CAR_TONNES_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車車輛用途' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CAR_USAGE_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車頭期款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_FIRSTPAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車付款差異天數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_PATDAYS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車npv' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_NPV'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車ＮＰＶ成本' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_NPVRATECOST'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車手續費收入' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_FEE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車保證金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_PURCHASEMARGIN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車佣金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_COMMISSION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車案件來源' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'HC_CASE_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車車體成交價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CAR_BODY_TYPE_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車子車成交價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CHILD_CAR_TYPE_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車中古車二手價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_SECOND_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車信審鑑價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_C_SELL_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車底盤編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CAR_CHA_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車底盤成交價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CAR_CHA_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車案件來源其他欄位1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'HC_CASE_TYPE_DESC1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車案件來源其他欄位2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'HC_CASE_TYPE_DESC2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車動保費' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_ESBK_AMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車專案補貼款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_DLR_FEE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'自動審核狀態，TBLID=Y4' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'AUTOAUDIT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車車式，TBL=X2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_CAR_STYLE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔維護IPD0221使用' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'IPPA_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重車擔保品總餘額(元，含履保)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_GAGE_TOT_BAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'擔保價值(含履保)(擔保率)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ML_GAGE_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'牌登書檔案(ZZIP_IPK上傳)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'LIC_PDF_FILE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷自審負面表列' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'TEL_NOTBAD_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'自動/數位，細項TBL_ID[0A]、[0B]' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'PAYWAY_NOTICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'CCIS解析' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CCIS_EXPLAIN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'CCIS解析時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CCIS_EXPLAIN_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'是否為和泰PAY' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'IS_HOTAI_PAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'補貼款金額(調整)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'AGENT_SUB'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'徵信建議FORMAPP' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'SUB_CODE_FORMAPP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'覆核條件FORMAPP' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CHECK_COND_FORMAPP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'標準差異' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'STD_DIFF'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'不符PPCC註記(覆審)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'NPPCC_NOTE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'債權讓與人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'ASSIGNOR_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'內扣動保費' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'IS_ESBK_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'內扣補貼款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'IS_COMM_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'設定後撥款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'IS_SET'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'設定後撥款(覆核)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'IS_SET2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'標準利率' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'STD_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'零售價' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'RETAIL_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'確認可撥款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CONFIRM_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主委託對保人員(ZZIP_DISPAPPL_ET_M.ROWID)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'OWNER_ET_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主委託對保日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'OWNER_ET_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主確定文件對保日期註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'OWNER_ET_FFLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保一委託對保人員(ZZIP_DISPAPPL_ET_M.ROWID)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'GUARD1_ET_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保一委託對保日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'GUARD1_ET_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保一確定文件對保日期註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'GUARD1_ET_FFLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保二委託對保人員(ZZIP_DISPAPPL_ET_M.ROWID)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'GUARD2_ET_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保二委託對保日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'GUARD2_ET_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保二確定文件對保日期註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'GUARD2_ET_FFLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'核准可撥日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'PERMIT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'認定月收入-車主' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INCOME_APPROVED'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'收支比' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INCOME_EXPENSE_RATIO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'月付款總額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'PAY_TOTAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'收入來源 TBL_ID=Y0' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INCOME_SOURCE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資金用途 TBL_ID=Y7' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FUND_USE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資金用途_其他' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FUND_USE_OTHER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'業務簽核' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'SALES_SIGN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'尾款客戶選擇 TBL_ID=AF' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'FINAL_PAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'經銷商購回金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'REDEMPTION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請書主檔-擴充' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX'
GO


