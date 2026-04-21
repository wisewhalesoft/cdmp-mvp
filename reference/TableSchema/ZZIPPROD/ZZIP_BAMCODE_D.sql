USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_BAMCODE_D]    Script Date: 2026/4/20 下午 02:46:11 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_BAMCODE_D](
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
 CONSTRAINT [P_ZZIP_BAMCODE_D] PRIMARY KEY CLUSTERED 
(
	[SYSTEM_ID] ASC,
	[TBL_ID] ASC,
	[TBL_CD] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'系統代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'SYSTEM_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分類種類編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_CD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'說明1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_DESC1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'說明2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_DESC2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'數字其他值' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_VAL1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'日期其他值' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_VAL2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'數值三' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_VAL3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'數值四' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_VAL4'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'數值五' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_VAL5'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'數值6' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_VAL6'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'數值7' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_VAL7'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'數值八' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D', @level2type=N'COLUMN',@level2name=N'TBL_VAL8'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'代碼彙總明細檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCODE_D'
GO


