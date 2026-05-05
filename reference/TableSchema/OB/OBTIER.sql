USE [OB]
GO

/****** Object:  Table [dbo].[OBTIER]    Script Date: 2026/5/5 上午 10:44:29 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBTIER](
	[LIST_NM] [nvarchar](30) NULL,
	[CARD_TYPE] [varchar](5) NULL,
	[CARD_LEVEL] [varchar](5) NULL,
	[TIER_LEVEL] [varchar](5) NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBTIER', @level2type=N'COLUMN',@level2name=N'LIST_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡種類' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBTIER', @level2type=N'COLUMN',@level2name=N'CARD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單卡分級' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBTIER', @level2type=N'COLUMN',@level2name=N'CARD_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單級距' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBTIER', @level2type=N'COLUMN',@level2name=N'TIER_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單分級級距表' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBTIER'
GO


