USE [GTS]
GO

/****** Object:  Table [dbo].[ZZIP_APMAPPL_EX]    Script Date: 2026/4/20 下午 02:41:48 ******/
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
	[INSERT_PGMID] [nvarchar](20) NULL,
	[UPDATE_PGMID] [nvarchar](20) NULL,
	[CONT_NOTE_FLG] [varchar](1) NULL,
	[CONT_NOTE_DATE] [datetime] NULL,
	[TAX_BACK_FLG] [varchar](1) NULL,
	[INV_BACK_FLG] [varchar](1) NULL,
	[BRAND_DLR] [varchar](2) NULL,
	[1PLUS1_LIC_NO] [varchar](8) NULL,
	[PAYWAY_NOTICE] [varchar](2) NULL,
	[NPV] [int] NULL,
	[NPV_ANNUAL] [int] NULL,
	[AGENT_SUB] [int] NULL,
	[ADD_DEAL_NUM_PRICE] [smallint] NULL,
	[ID_BACK_FLG] [varchar](1) NULL,
	[LOAN_BACK_FLG] [varchar](1) NULL,
	[WANTED_BACK_FLG] [varchar](1) NULL,
	[SETTING_BACK_FLG] [varchar](1) NULL,
	[CUST_NOT_BRANDUSER_FLG] [varchar](1) NULL,
	[MOTO_DOCUMENT_URL] [varchar](100) NULL,
	[SUB_CODE_FORMAPP] [varchar](5) NULL,
	[CHECK_COND_FORMAPP] [varchar](5) NULL,
	[MID_FLAG] [varchar](1) NULL,
	[CUS_DIGI_FLG] [varchar](1) NULL,
	[INCOME_APPROVED] [int] NULL,
	[INCOME_EXPENSE_RATIO] [numeric](5, 2) NULL,
	[PAY_TOTAL] [int] NULL,
	[INCOME_SOURCE] [varchar](5) NULL,
 CONSTRAINT [PK_ZZIP_APMAPPL_EX] PRIMARY KEY CLUSTERED 
(
	[APPL_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_EX] ADD  CONSTRAINT [DF__ZZIP_APMA__PROJ___6CE315C2]  DEFAULT ((0)) FOR [PROJ_NOMATCH_FLG]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_EX] ADD  CONSTRAINT [DF__ZZIP_APMA__PAYAB__6DD739FB]  DEFAULT ((0)) FOR [PAYABLE_FLG]
GO

ALTER TABLE [dbo].[ZZIP_APMAPPL_EX] ADD  CONSTRAINT [DF__ZZIP_APMA__CAL_F__6ECB5E34]  DEFAULT ((0)) FOR [CAL_FLG]
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

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔程式(+)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INSERT_PGMID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改程式(+)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'UPDATE_PGMID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'已照會到聯絡人(+)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CONT_NOTE_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'照會日期(+)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'CONT_NOTE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'已補違規欠稅(+)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'TAX_BACK_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'已補發票或商品確認書(+)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INV_BACK_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件類型 [0]=線下/紙本 [1][3]=線上/簽章已完成 [2]=線上/簽章未完成 [4]=線上/紙本合約 [非01234]=線下/紙本' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'MID_FLAG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'認定月收入-車主' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INCOME_APPROVED'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'收支比' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INCOME_EXPENSE_RATIO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'月付款總額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'PAY_TOTAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'收入來源 TBL_ID=Y0' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX', @level2type=N'COLUMN',@level2name=N'INCOME_SOURCE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請書主檔-擴充' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMAPPL_EX'
GO


