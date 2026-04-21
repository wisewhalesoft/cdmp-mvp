USE [OB]
GO

/****** Object:  Table [dbo].[POOLDATA_LAW]    Script Date: 2026/4/20 下午 02:38:55 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[POOLDATA_LAW](
	[CUSTO_NO] [varchar](15) NOT NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'POOLDATA_LAW', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'催收客戶清單' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'POOLDATA_LAW'
GO


