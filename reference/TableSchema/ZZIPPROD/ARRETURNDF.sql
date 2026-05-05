USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ARRETURNDF]    Script Date: 2026/5/5 上午 10:43:10 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ARRETURNDF](
	[ID] [int] NOT NULL,
	[ORGNO] [varchar](2) NULL,
	[CUSTID] [varchar](20) NULL,
	[APPL_NO] [varchar](20) NULL,
	[DEAL_NUM] [int] NULL,
	[DEAL_NUM2] [int] NULL,
	[AR_DATE] [varchar](10) NULL,
	[AR_AMOUNT] [decimal](10, 0) NULL,
	[PAY_DATE] [varchar](10) NULL,
	[PAY_AMOUNT] [decimal](10, 0) NULL,
	[AR_RETURN_CAPITAL] [decimal](15, 0) NULL,
	[AR_RETURN_INTEREST] [decimal](15, 0) NULL,
	[RETURN_CAPITAL] [decimal](15, 0) NULL,
	[RETURN_INTEREST] [decimal](15, 0) NULL,
	[ADD_PAY_CAPITAL] [decimal](15, 0) NULL,
	[ADD_UN_CAPITAL] [decimal](15, 0) NULL,
	[DELAY_DAY] [int] NULL,
	[DELAY_INTEREST] [decimal](15, 0) NULL,
	[AR_CODE] [varchar](1) NULL,
	[RCCHKMFID] [int] NULL,
	[CHKNO] [varchar](20) NULL,
	[CHKDATE] [varchar](10) NULL,
	[ADD_PAY_C_EXPECT] [decimal](15, 0) NULL,
	[ADD_UNPAY_C_EXPECT] [decimal](15, 0) NULL,
	[INSERT_USER] [varchar](10) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [varchar](10) NULL,
	[UPDATE_DATE] [datetime] NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'公司別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'ORGNO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'期數,依照AR_DATE(DUEDATE)重新排過後的期數,以方便作展期運算' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'DEAL_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'期數,存放原來AR資料中的合約期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'DEAL_NUM2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應繳日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'AR_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應繳金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'AR_AMOUNT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'兌現日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'PAY_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實繳金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'PAY_AMOUNT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應攤還本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'AR_RETURN_CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應攤還利息' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'AR_RETURN_INTEREST'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實際攤還本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'RETURN_CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實際攤還利息' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'RETURN_INTEREST'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'累計已償本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'ADD_PAY_CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'累計未償本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'ADD_UN_CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'延遲天數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'DELAY_DAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'延遲利息' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'DELAY_INTEREST'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'為應繳記錄CODE' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'AR_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'票據主檔流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'RCCHKMFID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'票號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'CHKNO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'票據到期日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'CHKDATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應累計償還本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'ADD_PAY_C_EXPECT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應累計未償還本金' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF', @level2type=N'COLUMN',@level2name=N'ADD_UNPAY_C_EXPECT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分期貸款攤還主檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ARRETURNDF'
GO


