USE [CRM]
GO

/****** Object:  Table [dbo].[BAMSALE_M_CRM]    Script Date: 2026/4/20 ¤U¤È 02:35:50 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[BAMSALE_M_CRM](
	[SALES_NO] [nvarchar](11) NOT NULL,
	[SALES_NAME] [nvarchar](50) NULL,
	[SALES_STS] [nvarchar](2) NULL,
	[BIRTHDAY] [datetime] NULL,
	[CUS_SEX] [nvarchar](1) NULL,
	[AGENT_RATE1] [numeric](5, 0) NULL,
	[BRNH_NO] [nvarchar](5) NULL,
	[DLR_NO] [nvarchar](4) NULL,
	[CAREA_NO1] [nvarchar](4) NULL,
	[CTEL_NO1] [nvarchar](10) NULL,
	[CEXTEN_NO1] [nvarchar](6) NULL,
	[CAREA_NO2] [nvarchar](4) NULL,
	[CTEL_NO2] [nvarchar](10) NULL,
	[CEXTEN_NO2] [nvarchar](6) NULL,
	[AREA_NO3] [nvarchar](4) NULL,
	[TEL_NO3] [nvarchar](10) NULL,
	[EXTEN_NO3] [nvarchar](6) NULL,
	[FAX_AREA] [nvarchar](3) NULL,
	[FAX_NO] [nvarchar](8) NULL,
	[EMAIL_ADD] [nvarchar](50) NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[CHIEF_NO] [nvarchar](14) NULL,
	[CUSTOM_MK] [nvarchar](2) NULL,
	[AGENT_HEAD_ID] [nvarchar](11) NULL,
	[AGENT_WAY] [nvarchar](2) NULL,
	[AGENT_HEAD_MARK] [nvarchar](1) NULL,
	[CEASE_DATE] [datetime] NULL,
	[DEPT_ID] [nvarchar](6) NULL,
	[FAX_CODE] [nvarchar](5) NULL,
	[WITHHOLDING_TAX] [nvarchar](1) NULL
) ON [PRIMARY]
GO


