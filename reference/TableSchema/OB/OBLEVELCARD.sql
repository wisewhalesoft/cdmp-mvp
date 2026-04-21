USE [OB]
GO

/****** Object:  Table [dbo].[OBLEVELCARD]    Script Date: 2026/4/20 下午 01:50:01 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBLEVELCARD](
	[LIST_NO] [varchar](20) NOT NULL,
	[TURN_DATE] [datetime] NULL,
	[CARD_LEVEL] [varchar](1) NULL,
	[SCORE] [int] NULL,
	[APPL_NO] [nvarchar](10) NOT NULL,
	[SPEC_NAME] [nvarchar](45) NULL,
	[SPEC_TP] [varchar](2) NULL,
	[YEAR_PRODU] [nvarchar](4) NULL,
	[CAR_YEAR] [int] NULL,
	[ADD_UN_CAPITAL] [money] NULL,
	[LIST_MONTH] [int] NULL,
	[CUS_SEX] [varchar](1) NULL,
	[CUSTO_NO] [varchar](11) NOT NULL,
	[CAREA_NO1] [nvarchar](4) NULL,
	[CAREA_NO2] [nvarchar](4) NULL,
	[SEQ] [int] NULL,
	[GUARD_NO] [nvarchar](11) NULL,
	[CAREA_NO1_GUARD] [nvarchar](4) NULL,
	[CAREA_NO2_GUARD] [nvarchar](4) NULL,
	[AGE] [int] NULL,
	[AGE_GUARD] [int] NULL,
	[EDUCAT_BACK] [varchar](2) NULL,
	[EDUCAT_BACK_GUARD] [varchar](2) NULL,
	[SALES_STS] [varchar](10) NULL,
	[CO_NUM_NM] [varchar](12) NULL,
	[CPOST_NUM_NM] [varchar](12) NULL,
	[HPOST_NUM_NM] [varchar](12) NULL,
	[CELLULAR] [varchar](12) NULL,
	[LOAN_RATE] [int] NULL,
 CONSTRAINT [PK_OBLEVELCARD] PRIMARY KEY CLUSTERED 
(
	[LIST_NO] ASC,
	[APPL_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單種類編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'LIST_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'轉檔日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'TURN_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡分級' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CARD_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'SCORE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'SPEC_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案種類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'SPEC_TP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'產品年份 (車輛出廠年份)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'YEAR_PRODU'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車齡' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CAR_YEAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'累積未繳本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'ADD_UN_CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'首次繳款經過月數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'LIST_MONTH'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶性別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CUS_SEX'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'戶籍地電話區碼 (判斷有無客戶戶籍地電話)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CAREA_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'通訊地電話區碼 (判斷有無通訊地電話)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CAREA_NO2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保人序號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'SEQ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保人統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'GUARD_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保人戶籍地區碼(判斷有無戶籍電話資料)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CAREA_NO1_GUARD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保人通訊電話區碼 (判斷有無保人通訊地電話)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CAREA_NO2_GUARD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶年齡' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'AGE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保人年齡' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'AGE_GUARD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶教育程度' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'EDUCAT_BACK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保人教育程度' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'EDUCAT_BACK_GUARD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件進件人類別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'SALES_STS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主公司地址縣市 (判斷有無車主公司地址資料)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CO_NUM_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主通訊地縣市 (判斷有無車主通訊地址資料)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CPOST_NUM_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車主戶籍地縣市 (判斷有無車主戶籍地址資料)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'HPOST_NUM_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'手機' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'CELLULAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'貸款比例 (%)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD', @level2type=N'COLUMN',@level2name=N'LOAN_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡主檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD'
GO


