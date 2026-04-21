USE [OB]
GO

/****** Object:  Table [dbo].[OBLEVELCARD_SCORE]    Script Date: 2026/4/20 下午 01:51:36 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBLEVELCARD_SCORE](
	[A_PRGID] [varchar](20) NULL,
	[A_USERID] [varchar](20) NULL,
	[A_SYSDT] [datetime] NULL,
	[U_PRGID] [varchar](20) NULL,
	[U_USERID] [varchar](20) NULL,
	[U_SYSDT] [datetime] NULL,
	[CARD_TYPE] [varchar](10) NOT NULL,
	[CARD_VERSION] [int] NOT NULL,
	[COLUNM] [varchar](30) NOT NULL,
	[LEVEL1] [nchar](10) NULL,
	[LEVEL2_S] [varchar](10) NULL,
	[LEVEL2_E] [varchar](10) NULL,
	[SCORE] [int] NOT NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'A_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'U_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡類型' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'CARD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡版號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'CARD_VERSION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單資料欄位名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'COLUNM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'欄位資料比對值' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'LEVEL1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'範圍起始值' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'LEVEL2_S'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'範圍結束值' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'LEVEL2_E'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE', @level2type=N'COLUMN',@level2name=N'SCORE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單分數試算對照表' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_SCORE'
GO


