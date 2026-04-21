USE [OB]
GO

/****** Object:  Table [dbo].[OBMCODEDF]    Script Date: 2026/4/20 下午 02:38:19 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBMCODEDF](
	[SYSTEM_ID] [nvarchar](4) NOT NULL,
	[TBL_ID] [nvarchar](2) NOT NULL,
	[TBL_CD] [nvarchar](4) NOT NULL,
	[TBL_DESC1] [nvarchar](40) NULL,
	[TBL_DESC2] [nvarchar](40) NULL,
	[TBL_VAL1] [numeric](12, 0) NULL,
	[TBL_VAL2] [datetime] NULL,
	[TBL_VAL3] [nvarchar](40) NULL,
	[TBL_VAL4] [nvarchar](40) NULL,
	[TBL_VAL5] [nvarchar](40) NULL,
	[TBL_VAL6] [nvarchar](80) NULL,
	[TBL_VAL7] [nvarchar](80) NULL,
	[TBL_VAL8] [nvarchar](80) NULL,
	[STADT] [varchar](8) NULL,
	[ENDDT] [varchar](8) NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'系統別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'SYSTEM_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'代碼類別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'代碼項目編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_CD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目內容' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_DESC1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目內容2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_DESC2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目屬性1(數值)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_VAL1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目屬性2(日期時間)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_VAL2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目屬性3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_VAL3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目屬性4' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_VAL4'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目屬性5' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_VAL5'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目屬性6' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_VAL6'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目屬性7' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_VAL7'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目屬性8' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'TBL_VAL8'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目生效日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'STADT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'項目失效日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF', @level2type=N'COLUMN',@level2name=N'ENDDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'OB代碼彙總明細檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMCODEDF'
GO


