USE [OB]
GO

/****** Object:  Table [dbo].[OBCUST_NO_MKT]    Script Date: 2026/4/20 下午 02:37:37 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBCUST_NO_MKT](
	[A_SYSDT] [datetime] NOT NULL,
	[A_USERID] [varchar](20) NOT NULL,
	[U_SYSDT] [datetime] NOT NULL,
	[U_USERID] [varchar](20) NOT NULL,
	[CUSTO_NO] [varchar](10) NOT NULL,
	[START_DATE] [date] NOT NULL,
	[END_DATE] [date] NOT NULL,
 CONSTRAINT [PK_OB_OUT_CUST] PRIMARY KEY CLUSTERED 
(
	[CUSTO_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT', @level2type=N'COLUMN',@level2name=N'A_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT', @level2type=N'COLUMN',@level2name=N'U_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'更新人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT', @level2type=N'COLUMN',@level2name=N'U_USERID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'生效日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT', @level2type=N'COLUMN',@level2name=N'START_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'失效日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT', @level2type=N'COLUMN',@level2name=N'END_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'電銷勿行銷主檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT'
GO


