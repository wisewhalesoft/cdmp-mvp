USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_MIMENDS_M]    Script Date: 2026/4/20 下午 02:47:22 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_MIMENDS_M](
	[APPL_NO] [nvarchar](10) NOT NULL,
	[SETTLE_DT] [datetime] NULL,
	[SETTLE_MEM] [nvarchar](10) NULL,
	[SETTLE_STA] [nvarchar](2) NULL,
	[DELAY_INTE] [numeric](8, 0) NULL,
	[LAW_FEE] [numeric](8, 0) NULL,
	[TELRECE_FEE] [numeric](8, 0) NULL,
	[PARK_FEE] [numeric](8, 0) NULL,
	[AUCTION_FEE] [numeric](8, 0) NULL,
	[CARGET_FEE] [numeric](8, 0) NULL,
	[OTHER_FEE] [numeric](8, 0) NULL,
	[CHANGE_MON] [numeric](8, 0) NULL,
	[CHANGE_DIS] [numeric](8, 0) NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[INTER_DATE] [datetime] NULL,
	[CASH_AMONT] [numeric](9, 0) NULL,
	[DEBT_AMONT] [numeric](10, 0) NULL,
	[BREAK_DAY] [numeric](8, 0) NULL,
	[BREAK_INTER] [numeric](8, 0) NULL,
	[DEBT_INTER] [numeric](8, 0) NULL,
	[DEBT_CAP] [numeric](8, 0) NULL,
	[DELAY_INTER] [numeric](8, 0) NULL,
	[DUE_AMONT] [numeric](10, 0) NULL,
	[RE_STA_CODE] [nvarchar](2) NULL,
	[DELAY_PAY_ADJ] [numeric](8, 0) NULL,
	[DEBT_CAP_ADJ] [numeric](8, 0) NULL,
	[BREAK_INTER_ADJ] [numeric](8, 0) NULL,
	[END_APMCONT_ADJ] [numeric](8, 0) NULL,
	[DELAY_INTE_ADJ] [numeric](8, 0) NULL,
	[TELRECE_FEE_ADJ] [numeric](8, 0) NULL,
	[CARGET_FEE_ADJ] [numeric](8, 0) NULL,
	[LAW_FEE_ADJ] [numeric](8, 0) NULL,
	[PARK_FEE_ADJ] [numeric](8, 0) NULL,
	[AUCTION_FEE_ADJ] [numeric](8, 0) NULL,
	[OTHER_FEE_ADJ] [numeric](8, 0) NULL,
	[DELAY_PAY_REAL] [numeric](10, 0) NULL,
	[DEBT_CAP_REAL] [numeric](10, 0) NULL,
	[BREAK_INTER_REAL] [numeric](10, 0) NULL,
	[END_APMCONT_REAL] [numeric](10, 0) NULL,
	[DELAY_INTE_REAL] [numeric](10, 0) NULL,
	[TELRECE_FEE_REAL] [numeric](10, 0) NULL,
	[CARGET_FEE_REAL] [numeric](10, 0) NULL,
	[LAW_FEE_REAL] [numeric](10, 0) NULL,
	[PARK_FEE_REAL] [numeric](10, 0) NULL,
	[AUCTION_FEE_REAL] [numeric](10, 0) NULL,
	[OTHER_FEE_REAL] [numeric](10, 0) NULL,
	[ACC_DATE] [datetime] NULL,
PRIMARY KEY CLUSTERED 
(
	[APPL_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請書案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'結清/扣車日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'SETTLE_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'結清人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'SETTLE_MEM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'結清狀態，TBL_ID=40' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'SETTLE_STA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'延滯利息' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DELAY_INTE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'法務費用' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'LAW_FEE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電催費用' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'TELRECE_FEE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛停放費用' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'PARK_FEE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛拍賣費用' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'AUCTION_FEE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛取回費用' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'CARGET_FEE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'其他費用' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'OTHER_FEE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'沖銷金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'CHANGE_MON'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'沖銷折讓' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'CHANGE_DIS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'起息日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'INTER_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'已收期款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'CASH_AMONT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應收剩餘期款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DEBT_AMONT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'破月天數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'BREAK_DAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'破月本金利息' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'BREAK_INTER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'剩餘未償利息' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DEBT_INTER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'剩餘未償本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DEBT_CAP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'延滯利息' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DELAY_INTER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應收總期款' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DUE_AMONT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原狀態碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'RE_STA_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'已到期未付分期款調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DELAY_PAY_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'剩餘未償本金調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DEBT_CAP_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'破月本金利息調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'BREAK_INTER_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'違約金調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'END_APMCONT_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'延滯利息調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DELAY_INTE_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電催費用調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'TELRECE_FEE_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛取回費用調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'CARGET_FEE_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'法務費用調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'LAW_FEE_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛停放費用調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'PARK_FEE_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛拍賣費用調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'AUCTION_FEE_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'其他費用調整金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'OTHER_FEE_ADJ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'已到期未付分期款實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DELAY_PAY_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'剩餘未償本金實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DEBT_CAP_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'破月本金利息實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'BREAK_INTER_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'違約金實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'END_APMCONT_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'延滯利息實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'DELAY_INTE_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電催費用實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'TELRECE_FEE_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛取回費用實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'CARGET_FEE_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'法務費用實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'LAW_FEE_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛停放費用實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'PARK_FEE_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車輛拍賣費用實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'AUCTION_FEE_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'其他費用實收金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'OTHER_FEE_REAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'會計結清日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M', @level2type=N'COLUMN',@level2name=N'ACC_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'結清主檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_MIMENDS_M'
GO


