USE [OB]
GO

/****** Object:  Table [dbo].[OBEMPHIRE]    Script Date: 2026/4/20 下午 01:48:20 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBEMPHIRE](
	[EMP_ID] [varchar](10) NULL,
	[EMP_NM] [nvarchar](50) NULL,
	[ID] [varchar](10) NULL,
	[DEPT_CODE] [varchar](10) NULL,
	[DEPT_NAME] [nvarchar](30) NULL,
	[TITLE_CODE] [varchar](5) NULL,
	[TITLE_NAME] [nvarchar](30) NULL,
	[JFUN_ID] [varchar](10) NULL,
	[JFUN_NM] [nvarchar](15) NULL,
	[HIRE_DATE] [date] NULL,
	[RESIGN_DATE] [date] NULL,
	[EMAIL] [varchar](100) NULL,
	[IS_AUTH] [varchar](1) NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'人員員編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'EMP_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'人員姓名' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'EMP_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'身份證字號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'部門代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'DEPT_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'部門名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'DEPT_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資位代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'TITLE_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資位名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'TITLE_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'職位代號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'JFUN_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'職位名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'JFUN_NM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'在職日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'HIRE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'離職日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'RESIGN_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'信箱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'EMAIL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'是否最高權限' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE', @level2type=N'COLUMN',@level2name=N'IS_AUTH'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'人員在職檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBEMPHIRE'
GO


