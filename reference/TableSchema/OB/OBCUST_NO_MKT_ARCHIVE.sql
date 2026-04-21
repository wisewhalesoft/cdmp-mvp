USE [OB]
GO

/****** Object:  Table [dbo].[OBCUST_NO_MKT_ARCHIVE]    Script Date: 2026/4/20 下午 02:37:56 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBCUST_NO_MKT_ARCHIVE](
	[CUSTO_NO] [varchar](10) NOT NULL,
	[A_SYSDT] [datetime] NOT NULL,
 CONSTRAINT [PK_OB_CUST_NOMKT_ARCHIVE] PRIMARY KEY CLUSTERED 
(
	[CUSTO_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶統編' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT_ARCHIVE', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新增時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT_ARCHIVE', @level2type=N'COLUMN',@level2name=N'A_SYSDT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'舊制勿行銷庫存檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCUST_NO_MKT_ARCHIVE'
GO


