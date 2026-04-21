USE [CRM]
GO

/****** Object:  Table [dbo].[BADBUSI_D_CRM]    Script Date: 2026/4/20 ¤U¤È 02:35:26 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[BADBUSI_D_CRM](
	[BRNH_NO] [nvarchar](5) NOT NULL,
	[DLR_NO] [nvarchar](4) NOT NULL,
	[POSTAL_NO] [nvarchar](5) NULL,
	[BRNH_NAME] [nvarchar](30) NULL,
	[COMMU_MEM] [nvarchar](18) NULL,
	[COMM_ADD] [nvarchar](90) NULL,
	[CAREA_NO1] [nvarchar](4) NULL,
	[CTEL_NO1] [nvarchar](10) NULL,
	[CEXTEN_NO1] [nvarchar](6) NULL,
	[CAREA_NO2] [nvarchar](4) NULL,
	[CTEL_NO2] [nvarchar](10) NULL,
	[CEXTEN_NO2] [nvarchar](6) NULL,
	[PHILO_NO] [nvarchar](10) NOT NULL,
	[INVOICE_NE] [nvarchar](50) NULL,
	[DLR_CODE] [nvarchar](1) NULL,
	[INVOICE_ADD] [nvarchar](90) NULL,
	[DLR_NAME] [nvarchar](30) NULL,
	[IB_CODE] [nvarchar](5) NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[CFFE_TP] [nvarchar](2) NULL,
	[SFFE_TP] [nvarchar](2) NULL,
	[APPRO_CAR] [nvarchar](2) NULL,
	[APPRO_SALES] [nvarchar](2) NULL,
	[ACC_PAY] [varchar](11) NULL,
	[ACC_COM] [varchar](11) NULL,
	[CAP_AMT] [numeric](12, 0) NULL,
	[TURNOVER_Y] [numeric](12, 0) NULL,
	[SETUP_DT] [datetime] NULL,
	[CHARGE_MAN] [nvarchar](18) NULL,
	[EXECU_MAN] [nvarchar](18) NULL,
	[CELL_PHONE] [nvarchar](12) NULL,
	[WORK_ITEM] [nvarchar](90) NULL,
	[WORK_TYPE] [nvarchar](2) NULL,
	[MULT_SHOP] [numeric](5, 0) NULL,
	[POPUL_CNT] [numeric](6, 0) NULL,
	[BUSIN_CNT] [numeric](5, 0) NULL,
	[STAFF_CNT] [numeric](4, 0) NULL,
	[TECH_CNT] [numeric](3, 0) NULL,
	[WORK_POSTAL_NO] [nvarchar](5) NULL,
	[WORK_ADDR] [nvarchar](90) NULL,
	[SHOP_POSTAL_NO] [nvarchar](5) NULL,
	[SHOP_ADDR] [nvarchar](90) NULL,
	[EFFECT_DT] [datetime] NULL,
	[EXPIRY_DT] [datetime] NULL,
	[DEPT_ID] [nvarchar](5) NULL
) ON [PRIMARY]
GO


