USE [OB]
GO

/****** Object:  Table [dbo].[OBASSIGNSET]    Script Date: 2026/4/20 下午 01:41:27 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBASSIGNSET](
	[LIST_NO] [varchar](20) NULL,
	[WORKDT] [varchar](10) NOT NULL,
	[CASEDT] [varchar](10) NOT NULL,
	[RATIO_RATE] [int] NOT NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件種類代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBASSIGNSET', @level2type=N'COLUMN',@level2name=N'LIST_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'工作月' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBASSIGNSET', @level2type=N'COLUMN',@level2name=N'WORKDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBASSIGNSET', @level2type=N'COLUMN',@level2name=N'CASEDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分配比例(千分比)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBASSIGNSET', @level2type=N'COLUMN',@level2name=N'RATIO_RATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'OB案件待分配日_比例設定檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBASSIGNSET'
GO


