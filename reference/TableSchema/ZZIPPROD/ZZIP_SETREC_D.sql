USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_SETREC_D]    Script Date: 2026/4/20 下午 02:47:46 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_SETREC_D](
	[APPL_NO] [nvarchar](10) NOT NULL,
	[SEQ_NO] [numeric](2, 0) NOT NULL,
	[COLLECTION_DATE] [datetime] NULL,
	[COLLECTION_AMT] [numeric](8, 0) NULL,
	[ACCOUNT_NO] [nvarchar](40) NULL,
	[REMITTER] [nvarchar](90) NULL,
	[INSERT_USER] [nvarchar](10) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](10) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[ACCOUNT_CODE] [nvarchar](2) NULL,
	[INSERT_PGMID] [nvarchar](22) NULL,
	[UPDATE_PGMID] [nvarchar](22) NULL,
 CONSTRAINT [PK_ZZIP_SETREC_D] PRIMARY KEY CLUSTERED 
(
	[APPL_NO] ASC,
	[SEQ_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案號(合約編號)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'序號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'SEQ_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯入日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'COLLECTION_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯入金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'COLLECTION_AMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯入帳號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'ACCOUNT_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯款人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'REMITTER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新增人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新增日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'匯入帳號代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D', @level2type=N'COLUMN',@level2name=N'ACCOUNT_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分期中途結清收款明細檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_SETREC_D'
GO


