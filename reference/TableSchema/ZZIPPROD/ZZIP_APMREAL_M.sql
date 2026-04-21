USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_APMREAL_M]    Script Date: 2026/4/20 下午 02:48:12 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_APMREAL_M](
	[APPL_NO] [nvarchar](10) NOT NULL,
	[CUSTO_NO] [nvarchar](10) NULL,
	[ACCEPT_DT] [datetime] NULL,
	[FINISH_DT] [datetime] NULL,
	[ROAD_NO1] [nvarchar](30) NULL,
	[ROAD_NO2] [nvarchar](30) NULL,
	[LAND_NO] [nvarchar](10) NULL,
	[LAND_AREA] [numeric](8, 2) NULL,
	[HOUSE_NUM] [nvarchar](90) NULL,
	[BUILD_NO] [nvarchar](10) NULL,
	[BUILD_AREA] [numeric](8, 2) NULL,
	[OBLIGEE_NAME1] [nvarchar](90) NULL,
	[OBLIGEE_NAME2] [nvarchar](90) NULL,
	[REG_DT1] [datetime] NULL,
	[REG_DT2] [datetime] NULL,
	[PAWN_AMT1] [numeric](10, 1) NULL,
	[PAWN_AMT2] [numeric](10, 1) NULL,
	[DEBT_NAME1] [nvarchar](90) NULL,
	[DEBT_NAME2] [nvarchar](90) NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[POSTAL_NO] [nvarchar](5) NULL,
	[POSTAL_ADD] [nvarchar](36) NULL,
	[CONTENT] [nvarchar](1200) NULL,
	[LAND_NAME] [nvarchar](9) NULL,
	[OBLIGEE_NAME3] [nvarchar](90) NULL,
	[REG_DT3] [datetime] NULL,
	[PAWN_AMT3] [numeric](10, 1) NULL,
	[DEBT_NAME3] [nvarchar](90) NULL,
	[SERIAL_NO] [int] IDENTITY(1,1) NOT NULL,
	[RIGHT_HOLD] [nvarchar](10) NULL,
	[OWN_GAGE_FLG] [smallint] NULL,
	[USE_GAGE_FLG] [smallint] NULL,
	[USE_GAGE_APPLNO] [nvarchar](20) NULL,
 CONSTRAINT [PK_ZZIP_APMREAL_M] PRIMARY KEY CLUSTERED 
(
	[SERIAL_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[ZZIP_APMREAL_M] ADD  DEFAULT ((0)) FOR [OWN_GAGE_FLG]
GO

ALTER TABLE [dbo].[ZZIP_APMREAL_M] ADD  DEFAULT ((0)) FOR [USE_GAGE_FLG]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請書案號或合約編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'取得日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'ACCEPT_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建物完成日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'FINISH_DT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'段' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'ROAD_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'小段' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'ROAD_NO2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'地號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'LAND_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'土地面積(m2)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'LAND_AREA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'門牌' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'HOUSE_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'BUILD_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建物總面積(m2)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'BUILD_AREA'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'權利人1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'OBLIGEE_NAME1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'權利人2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'OBLIGEE_NAME2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'登記日期1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'REG_DT1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'登記日期2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'REG_DT2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'抵押金額1(萬)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'PAWN_AMT1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'抵押金額2(萬)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'PAWN_AMT2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'債務人1' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'DEBT_NAME1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'債務人2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'DEBT_NAME2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'輸入人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'輸入日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'最後修改人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'最後修改日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'郵遞區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'POSTAL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'郵遞區號-名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'POSTAL_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'備註' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'CONTENT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'地目' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'LAND_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'權利人3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'OBLIGEE_NAME3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'登記日期3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'REG_DT3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'抵押金額3(萬)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'PAWN_AMT3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'債務人3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'DEBT_NAME3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'序號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'SERIAL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'權利持分' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'RIGHT_HOLD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'本案擔保品註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'OWN_GAGE_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'沿用前案設定註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'USE_GAGE_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'沿用前案設定註記案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M', @level2type=N'COLUMN',@level2name=N'USE_GAGE_APPLNO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'不動產狀況檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_APMREAL_M'
GO


