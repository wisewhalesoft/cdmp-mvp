USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_BAMPOST_M]    Script Date: 2026/4/20 下午 01:57:02 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_BAMPOST_M](
	[POSTAL_NO] [nvarchar](5) NOT NULL,
	[POSTAL_ADD] [nvarchar](36) NULL,
	[QUERY_TEL] [nvarchar](14) NULL,
	[C_TYPE] [nvarchar](2) NULL,
	[C_CODE] [nvarchar](2) NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
 CONSTRAINT [P_ZZIP_BAMPOST_M] PRIMARY KEY CLUSTERED 
(
	[POSTAL_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'郵遞區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'POSTAL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'POSTAL_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'查詢電話' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'QUERY_TEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'監理站' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'C_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'C註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'C_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'郵遞區號檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMPOST_M'
GO


