USE [OB]
GO

/****** Object:  Table [dbo].[OB_ARRETURNDF_MIN_CAP]    Script Date: 2026/4/20 下午 01:49:32 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OB_ARRETURNDF_MIN_CAP](
	[APPL_NO] [varchar](20) NULL,
	[ADD_UN_CAPITAL] [numeric](15, 0) NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OB_ARRETURNDF_MIN_CAP', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'應收帳款金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OB_ARRETURNDF_MIN_CAP', @level2type=N'COLUMN',@level2name=N'ADD_UN_CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件應收帳款對應檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OB_ARRETURNDF_MIN_CAP'
GO


