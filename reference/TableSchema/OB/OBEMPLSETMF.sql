USE [OB]
GO

/****** Object:  Table [dbo].[OBEMPLSETMF]    Script Date: 2026/4/20 下午 01:53:47 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBEMPLSETMF](
	[A_PRGID] [varchar](10) NULL,
	[A_USERID] [varchar](10) NULL,
	[A_SYSDT] [datetime] NULL,
	[U_PRGID] [varchar](10) NULL,
	[U_USERID] [varchar](10) NULL,
	[U_SYSDT] [datetime] NULL,
	[LIST_NO] [varchar](11) NOT NULL,
	[DEPTID_M] [nvarchar](50) NOT NULL,
	[EMPLID] [varchar](6) NOT NULL,
	[RATION] [numeric](10, 1) NOT NULL,
	[PROD_TYPE] [varchar](255) NULL,
 CONSTRAINT [PK_OBEMPLSETMF] PRIMARY KEY CLUSTERED 
(
	[LIST_NO] ASC,
	[DEPTID_M] ASC,
	[EMPLID] ASC,
	[RATION] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'A_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'U_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單種類代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'LIST_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷人員所數分處' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'DEPTID_M'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷人員編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'EMPLID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分派比例' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'RATION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'產品類別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF', @level2type=N'COLUMN',@level2name=N'PROD_TYPE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'員工分派案件比例設定檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPLSETMF'
GO


