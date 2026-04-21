USE [OB]
GO

/****** Object:  Table [dbo].[OBMDEPTPCT]    Script Date: 2026/4/20 下午 01:53:25 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBMDEPTPCT](
	[A_PRGID] [varchar](10) NOT NULL,
	[A_USERID] [varchar](10) NOT NULL,
	[A_SYSDT] [datetime] NOT NULL,
	[U_PRGID] [varchar](10) NOT NULL,
	[U_USERID] [varchar](10) NOT NULL,
	[U_SYSDT] [datetime] NOT NULL,
	[PROJECT_WORKYM] [varchar](6) NOT NULL,
	[LIST_NO] [varchar](11) NOT NULL,
	[OBDEPTID] [varchar](6) NOT NULL,
	[OBDEPTNM] [nvarchar](10) NOT NULL,
	[RATION] [numeric](9, 1) NOT NULL,
 CONSTRAINT [PK_OBMDEPTPCT_1] PRIMARY KEY CLUSTERED 
(
	[PROJECT_WORKYM] ASC,
	[LIST_NO] ASC,
	[OBDEPTID] ASC,
	[RATION] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建立程式編碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'A_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建立者' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建立時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護程式代碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'U_PRGID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護者' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'維護時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分派案件年月' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'PROJECT_WORKYM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分派案件種類編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'LIST_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷部門' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'OBDEPTID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷部門名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'OBDEPTNM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'分案比例' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT', @level2type=N'COLUMN',@level2name=N'RATION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'部門案件分案比例設定' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBMDEPTPCT'
GO


