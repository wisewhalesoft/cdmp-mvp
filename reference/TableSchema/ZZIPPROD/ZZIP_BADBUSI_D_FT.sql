USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_BADBUSI_D_FT]    Script Date: 2026/4/20 下午 02:45:47 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_BADBUSI_D_FT](
	[DLR_NO] [varchar](4) NOT NULL,
	[BRNH_NO] [varchar](5) NOT NULL,
	[PHILO_NO] [nvarchar](10) NULL,
	[ACC_PAY_NO] [varchar](11) NULL,
	[CHARGE_MAN] [nvarchar](18) NULL,
	[SETUP_DT] [datetime] NULL,
	[UPLOAD_DATE] [datetime] NULL,
	[CAREA_NO1] [nvarchar](4) NULL,
	[CTEL_NO1] [nvarchar](10) NULL,
	[CEXTEN_NO1] [nvarchar](6) NULL,
	[WORK_POSTAL_NO] [nvarchar](5) NULL,
	[WORK_ADDR] [nvarchar](90) NULL,
	[CHARGE_POSTAL_NO] [nvarchar](5) NULL,
	[CHARGE_ADDR] [nvarchar](90) NULL,
	[MULT_SHOP] [numeric](5, 0) NULL,
	[COP_SHOP] [numeric](5, 0) NULL,
	[PROD] [nvarchar](50) NULL,
	[PROD_CLASS] [varchar](2) NULL,
	[PROD_PRICE] [nvarchar](100) NULL,
	[GEN_PROD] [varchar](1) NULL,
	[PLUS_IRR] [numeric](5, 2) NULL,
	[COMM_IRR] [numeric](5, 2) NULL,
	[CAP_LIMT] [numeric](12, 0) NULL,
	[M_SIGN] [varchar](1) NULL,
	[FT_CODE] [varchar](1) NULL,
	[C_CAP_LIMT] [numeric](8, 0) NULL,
	[OTHER_MENO] [nvarchar](200) NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[CHARGE_ID] [varchar](10) NULL,
	[DEAL_PRIOD] [varchar](50) NULL,
	[M_CAP_LIMT] [numeric](18, 0) NULL,
 CONSTRAINT [PK_ZZIP_BADBUSI_D_FT] PRIMARY KEY CLUSTERED 
(
	[BRNH_NO] ASC,
	[DLR_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'經銷商編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'DLR_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業所編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'BRNH_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'統一編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'PHILO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'撥款對象ID(車款)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'ACC_PAY_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'負責人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'CHARGE_MAN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'公司設立日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'SETUP_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'上傳申請表日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'UPLOAD_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話區號1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'CAREA_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'CTEL_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話分機1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'CEXTEN_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業地址(1)郵區' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'WORK_POSTAL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'營業地址(1)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'WORK_ADDR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'負責人)郵區' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'CHARGE_POSTAL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'負責人地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'CHARGE_ADDR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'據點數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'MULT_SHOP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'合作據點數' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'COP_SHOP'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主要商品' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'PROD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'商品類別(ZZIP_BAMCODE_D:V2)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'PROD_CLASS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'商品價格區間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'PROD_PRICE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'遞延性商品(Y N)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'GEN_PROD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'增補利率%' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'PLUS_IRR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'現況利率%' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'COMM_IRR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'總額度' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'CAP_LIMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主管簽核(Y/N)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'M_SIGN'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'特約商註記(D解散 G廢止 R 撤銷 )' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'FT_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'單筆金額額度' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'C_CAP_LIMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'其他說明' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'OTHER_MENO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'每月額度上限' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT', @level2type=N'COLUMN',@level2name=N'M_CAP_LIMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BADBUSI_D_FT'
GO


