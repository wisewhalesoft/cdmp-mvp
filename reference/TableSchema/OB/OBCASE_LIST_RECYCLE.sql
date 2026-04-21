USE [OB]
GO

/****** Object:  Table [dbo].[OBCASE_LIST_RECYCLE]    Script Date: 2026/4/20 下午 01:47:52 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBCASE_LIST_RECYCLE](
	[DEPTID] [varchar](10) NOT NULL,
	[EMPLID] [varchar](10) NOT NULL,
	[ASSIGNDAY] [varchar](10) NOT NULL,
	[APPL_NO] [varchar](10) NOT NULL,
	[CUSTO_NO] [varchar](20) NOT NULL,
	[CUST_NAME] [nvarchar](50) NOT NULL,
	[LIST_NO] [varchar](20) NULL,
	[LIST_NM] [nvarchar](50) NULL,
	[TIER_LEVEL] [varchar](5) NULL,
	[IS_CR] [varchar](1) NULL,
	[IS_HOT_RECYCLE] [varchar](1) NULL,
	[RECYCLE_DATE] [datetime] NULL,
	[EXPIRE_DATE] [datetime] NULL,
	[INSERT_DATE] [datetime] NULL,
	[ASSIGNDAY_NEW] [varchar](10) NULL,
	[EMPLID_NEW] [varchar](5) NULL,
	[ASSIGN_DATE] [datetime] NULL,
	[LIC_NO] [varchar](10) NULL,
	[DEPTID_NEW] [varchar](5) NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原分派電銷分處' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'DEPTID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原分派擔當員編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'EMPLID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原分派日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'ASSIGNDAY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'CUST_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單種類代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'LIST_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單種類名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'LIST_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單等級' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'TIER_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'CR客註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'IS_CR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'HOT名單抽回註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'IS_HOT_RECYCLE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'抽回時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'RECYCLE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件到期日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'EXPIRE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'名單寫入抽回清單時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新分派日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'ASSIGNDAY_NEW'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新分派擔當員編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'EMPLID_NEW'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'重新分派執行日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'ASSIGN_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'車號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'LIC_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新派發電銷分處' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE', @level2type=N'COLUMN',@level2name=N'DEPTID_NEW'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件分派檔_抽案' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCASE_LIST_RECYCLE'
GO


