USE [OB]
GO

/****** Object:  Table [dbo].[OBMLISTDF]    Script Date: 2026/4/20 下午 01:46:43 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBMLISTDF](
	[A_PRGID] [varchar](20) NOT NULL,
	[A_USERID] [varchar](20) NOT NULL,
	[A_SYSDT] [datetime] NOT NULL,
	[U_PRGID] [varchar](20) NOT NULL,
	[U_USERID] [varchar](20) NOT NULL,
	[U_SYSDT] [datetime] NOT NULL,
	[LIST_NO] [varchar](11) NOT NULL,
	[LIST_NM] [nvarchar](45) NOT NULL,
	[PROD_KIND] [varchar](255) NOT NULL,
	[PROD_BEST] [varchar](5) NOT NULL,
	[SPEC_TP] [varchar](255) NULL,
	[LIST_TYPE] [varchar](255) NOT NULL,
	[LIST_PERIOD_START] [varchar](3) NOT NULL,
	[LIST_PERIOD_END] [varchar](3) NOT NULL,
	[LIST_INTERVAL] [varchar](3) NOT NULL,
	[ASSIGNED_DATE] [datetime] NULL,
	[TOTAL_AMOUNT] [int] NULL,
	[RESERVED_AMOUNT] [int] NULL,
	[IS_ASSIGNED] [varchar](1) NULL,
	[PROJECT_WORKYM] [varchar](6) NULL,
	[CASENUMBER] [nvarchar](50) NULL,
	[NAME] [nvarchar](50) NULL,
	[CASEYEAR] [varchar](255) NULL,
	[CASEYEARNM] [nvarchar](10) NULL,
	[SETTLE_SRC] [varchar](6) NULL,
	[CARD_TYPE] [varchar](2) NULL,
 CONSTRAINT [PK_OBMLISTDF] PRIMARY KEY CLUSTERED 
(
	[LIST_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建立程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'A_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建立者' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建立時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'U_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單類別編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'LIST_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單類別名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'LIST_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分期類型 01：汽車、02：機車' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'PROD_KIND'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'專案類型' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'SPEC_TP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單類型' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'LIST_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單開始期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'LIST_PERIOD_START'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單結束期數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'LIST_PERIOD_END'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單周期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'LIST_INTERVAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單生成日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'ASSIGNED_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件數量' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'TOTAL_AMOUNT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分發案件數量' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'RESERVED_AMOUNT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'派發狀態 Y:已派發' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'IS_ASSIGNED'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單年月' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'PROJECT_WORKYM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'代償種類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'SETTLE_SRC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分派名單卡種類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF', @level2type=N'COLUMN',@level2name=N'CARD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分派名單類型清單' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMLISTDF'
GO


