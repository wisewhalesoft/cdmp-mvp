USE [OB]
GO

/****** Object:  Table [dbo].[OBLEVELCARD_COLUNM]    Script Date: 2026/4/20 下午 01:50:27 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBLEVELCARD_COLUNM](
	[A_PRGID] [varchar](20) NULL,
	[A_USERID] [varchar](20) NULL,
	[A_SYSDT] [datetime] NULL,
	[U_PRGID] [varchar](20) NULL,
	[U_USERID] [varchar](20) NULL,
	[U_SYSDT] [datetime] NULL,
	[CARD_TYPE] [varchar](10) NULL,
	[CARD_VERSION] [int] NULL,
	[COLUNM] [varchar](30) NULL,
	[COLUNM_NAME] [varchar](30) NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'A_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'U_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡種類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'CARD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡版號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'CARD_VERSION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'欄位' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'COLUNM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'欄位名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM', @level2type=N'COLUMN',@level2name=N'COLUNM_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡欄位名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBLEVELCARD_COLUNM'
GO


