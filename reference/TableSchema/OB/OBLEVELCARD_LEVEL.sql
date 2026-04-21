USE [OB]
GO

/****** Object:  Table [dbo].[OBLEVELCARD_LEVEL]    Script Date: 2026/4/20 下午 01:51:19 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBLEVELCARD_LEVEL](
	[A_PRGID] [varchar](20) NULL,
	[A_USERID] [varchar](20) NULL,
	[A_SYSDT] [datetime] NULL,
	[U_PRGID] [varchar](20) NULL,
	[U_USERID] [varchar](20) NULL,
	[U_SYSDT] [datetime] NULL,
	[CARD_TYPE] [varchar](10) NOT NULL,
	[CARD_VERSION] [int] NOT NULL,
	[SCORE_S] [int] NOT NULL,
	[SCORE_E] [int] NOT NULL,
	[CARD_LEVEL] [varchar](1) NOT NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'A_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'U_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'CARD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡版號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'CARD_VERSION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分數起始值' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'SCORE_S'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分數結束值' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'SCORE_E'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'卡片種類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL', @level2type=N'COLUMN',@level2name=N'CARD_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分派案件名單卡' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_LEVEL'
GO


