USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_BAMCUST_M]    Script Date: 2026/4/20 下午 01:56:09 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_BAMCUST_M](
	[CUSTO_NO] [varchar](11) NOT NULL,
	[CUSTOM_MK] [varchar](2) NULL,
	[APPLI_MARK] [varchar](1) NULL,
	[SPON_MARK] [varchar](1) NULL,
	[CUS_NAME] [nvarchar](90) NULL,
	[BITBE_DATE] [datetime] NULL,
	[CMARRY_MK] [varchar](1) NULL,
	[HPOST_NUM] [varchar](5) NULL,
	[HPOST_ADD] [nvarchar](90) NULL,
	[CPOST_NUM] [varchar](5) NULL,
	[COMM_ADD] [nvarchar](90) NULL,
	[CO_NAME] [nvarchar](45) NULL,
	[UNIT_ADD] [nvarchar](90) NULL,
	[CROLE] [nvarchar](45) NULL,
	[WORK_YEAR] [nvarchar](5) NULL,
	[INCOME_MON] [numeric](8, 0) NULL,
	[CAREA_NO1] [nvarchar](4) NULL,
	[CTEL_NO1] [nvarchar](10) NULL,
	[CEXTEN_NO1] [nvarchar](14) NULL,
	[CAREA_NO2] [nvarchar](4) NULL,
	[CTEL_NO2] [nvarchar](10) NULL,
	[CEXTEN_NO2] [nvarchar](14) NULL,
	[IMMOPRO_MK] [varchar](1) NULL,
	[CUS_SEX] [varchar](1) NULL,
	[CELLULAR] [varchar](12) NULL,
	[INSERT_USER] [varchar](14) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [varchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[CO_NUM] [varchar](5) NULL,
	[ISSUE_CLASS] [nvarchar](1) NULL,
	[ISSUE_DATE] [datetime] NULL,
	[DRIVE_LIC] [nvarchar](1) NULL,
	[COMP_DIM] [nvarchar](1) NULL,
	[N_WORK_YEAR] [numeric](8, 2) NULL,
	[VOCATION_CODE] [nvarchar](2) NULL,
	[EDUCAT_BACK] [nvarchar](2) NULL,
	[MONTH_INCOME] [nvarchar](2) NULL,
	[E_MAIL] [varchar](40) NULL,
	[ENG_NAME] [nvarchar](60) NULL,
	[JOB_LEVEL] [nvarchar](2) NULL,
	[CO_CAREA_NO] [nvarchar](4) NULL,
	[CO_CTEL_NO] [nvarchar](10) NULL,
	[CO_CEXTEN_NO] [nvarchar](14) NULL,
	[CAPITAL] [numeric](9, 0) NULL,
	[DEBT_FLG] [char](1) NULL,
	[LAND_FLG] [smallint] NULL,
	[FINE_FLG] [char](1) NULL,
	[ISSUE_ADD] [nvarchar](6) NULL,
	[ID_CHECK] [smallint] NOT NULL,
	[ID_CHECK_DATE] [datetime] NULL,
	[PRINT_FLG] [smallint] NOT NULL,
	[OLD_P_ID] [nvarchar](11) NULL,
	[ADDR_FLG] [smallint] NULL,
	[JOB_TITLE] [varchar](4) NULL,
	[SPOUSE_NM] [nvarchar](90) NULL,
	[FATHER_NM] [nvarchar](90) NULL,
	[MOTHER_NM] [nvarchar](90) NULL,
	[EPRPOST_NUM] [varchar](5) NULL,
	[EPRPOST_ADD] [nvarchar](90) NULL,
	[INDUSTRY] [varchar](4) NULL,
	[INCOME_APPROVED] [int] NULL,
	[INCOME_SOURCE] [varchar](5) NULL,
 CONSTRAINT [PK__ZZIP_BAMCUST_M__628FA481] PRIMARY KEY CLUSTERED 
(
	[CUSTO_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[ZZIP_BAMCUST_M] ADD  CONSTRAINT [DF__ZZIP_BAMC__DEBT___4AE30379]  DEFAULT ((2)) FOR [DEBT_FLG]
GO

ALTER TABLE [dbo].[ZZIP_BAMCUST_M] ADD  DEFAULT ((0)) FOR [ID_CHECK]
GO

ALTER TABLE [dbo].[ZZIP_BAMCUST_M] ADD  DEFAULT ((0)) FOR [PRINT_FLG]
GO

ALTER TABLE [dbo].[ZZIP_BAMCUST_M] ADD  DEFAULT ((0)) FOR [ADDR_FLG]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CUSTO_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶註記 TBL_ID=55' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CUSTOM_MK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請人註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'APPLI_MARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'SPON_MARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CUS_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'生日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'BITBE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'婚姻 TBL_ID=33' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CMARRY_MK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'戶籍地址區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'HPOST_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'戶籍地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'HPOST_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'通訊地址區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CPOST_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'通訊地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'COMM_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'服務公司名稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CO_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'服務地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'UNIT_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'職稱' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CROLE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'年資_C(95/06/01停用)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'WORK_YEAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'月所得' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'INCOME_MON'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話區號1(戶籍電話區號)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CAREA_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話1(戶籍電話)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CTEL_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話分機1(戶籍電話分機)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CEXTEN_NO1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話區號2(通訊電話區號)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CAREA_NO2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話2(通訊電話)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CTEL_NO2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯絡電話分機2(通訊電話分機)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CEXTEN_NO2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'是否有自有不動產' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'IMMOPRO_MK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'性別' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CUS_SEX'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'行動電話' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CELLULAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建檔日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'服務地址區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CO_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'發證類別，初發=1，換發=2，補發=3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'ISSUE_CLASS'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'發證日' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'ISSUE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'駕照(1:有/2:無)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'DRIVE_LIC'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'公司規模(1:>=1000萬or公教/2:<1000萬/3:其他)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'COMP_DIM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'年資_N(95/06/01啟用)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'N_WORK_YEAR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'職業(95/06/01啟用)CODE TBLID=A4' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'VOCATION_CODE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'學歷(95/06/01啟用)CODE  TBL_ID=A2' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'EDUCAT_BACK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'月所得(95/06/01啟用)CODE  TBL_ID=A3' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'MONTH_INCOME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'E_MAIL' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'E_MAIL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'英文姓名(由網站會員登錄)' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'ENG_NAME'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'職級(由網站會員登錄)/A6' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'JOB_LEVEL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'公司電話區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CO_CAREA_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'公司電話' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CO_CTEL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'公司電話分機' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CO_CEXTEN_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'資本額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'CAPITAL'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'消債' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'DEBT_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'大陸籍' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'LAND_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'違規欠稅大於2萬' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'FINE_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'發證地點，TBLID=V6' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'ISSUE_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'舊ID' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'OLD_P_ID'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'地址異常註記' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'ADDR_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'職稱 TBL=A5 201907啟用' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'JOB_TITLE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'滿期寄送地址區號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'EPRPOST_NUM'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'滿期寄送地址' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'EPRPOST_ADD'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'行業，TBLID=AA' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'INDUSTRY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'認定月收入' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'INCOME_APPROVED'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'收入來源 TBL_ID=Y0' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M', @level2type=N'COLUMN',@level2name=N'INCOME_SOURCE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'客戶主檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMCUST_M'
GO


