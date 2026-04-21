USE [OB]
GO

/****** Object:  Table [dbo].[OBLEVELCARD_VERSION]    Script Date: 2026/4/20 下午 01:51:51 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBLEVELCARD_VERSION](
	[A_PRGID] [varchar](20) NULL,
	[A_USERID] [varchar](20) NULL,
	[A_SYSDT] [datetime] NULL,
	[U_PRGID] [varchar](20) NULL,
	[U_USERID] [varchar](20) NULL,
	[U_SYSDT] [datetime] NULL,
	[CARD_TYPE] [varchar](max) NULL,
	[CARD_NAME] [varchar](20) NULL,
	[CARD_VERSION] [int] NULL,
	[SDATE] [varchar](8) NULL,
	[EDATE] [varchar](8) NULL
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'A_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'U_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡類別代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'CARD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'CARD_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡版本號碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'CARD_VERSION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'生效日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'SDATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'失效日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION', @level2type=N'COLUMN',@level2name=N'EDATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡版本主檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_VERSION'
GO


