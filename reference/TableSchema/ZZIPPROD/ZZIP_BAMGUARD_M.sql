USE [ZZIPPROD]
GO

/****** Object:  Table [dbo].[ZZIP_BAMGUARD_M]    Script Date: 2026/4/20 下午 01:56:39 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ZZIP_BAMGUARD_M](
	[APPL_NO] [nvarchar](10) NOT NULL,
	[GUARD_SEQ] [int] NOT NULL,
	[GUARD_NO] [nvarchar](11) NOT NULL,
	[SPON_MK] [nvarchar](2) NULL,
	[RELATION] [nvarchar](2) NULL,
	[NO_DUTY] [nvarchar](1) NULL,
	[GRD_REMARK] [nvarchar](150) NULL,
	[GRD_GROUP_NO] [nvarchar](10) NULL,
	[INSERT_USER] [nvarchar](14) NULL,
	[INSERT_DATE] [datetime] NULL,
	[UPDATE_USER] [nvarchar](14) NULL,
	[UPDATE_DATE] [datetime] NULL,
	[MSG_SEND] [char](1) NULL,
	[SMS_CHK] [varchar](1) NULL,
	[PHONE_CHK] [varchar](1) NULL,
	[LETTER_CHK] [varchar](1) NULL,
	[NONOTI_CHK] [varchar](1) NULL,
	[OTHER_CHK] [varchar](1) NULL,
	[OTHER_EXPLAIN] [nvarchar](10) NULL,
	[LETTER_CHK_COMM] [varchar](1) NULL,
	[INCOME_APPROVED] [int] NULL,
	[INCOME_SOURCE] [varchar](5) NULL,
	[GUARD_MK] [varchar](2) NULL,
	[HFS_SALES] [varchar](14) NULL,
	[CHK_LOCATION] [varchar](1) NULL,
	[CHK_LOCATION_ADDR] [nvarchar](100) NULL,
 CONSTRAINT [IND_ZZIP_BAMGUARD_1] PRIMARY KEY CLUSTERED 
(
	[APPL_NO] ASC,
	[GUARD_NO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[ZZIP_BAMGUARD_M] ADD  DEFAULT ('N') FOR [NO_DUTY]
GO

ALTER TABLE [dbo].[ZZIP_BAMGUARD_M] ADD  DEFAULT ('0') FOR [MSG_SEND]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'申請書案號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'APPL_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人順序' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'GUARD_SEQ'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'GUARD_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人註記 TBL_ID=59' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'SPON_MK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'與車主關係 TBL_ID=35' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'RELATION'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人免責' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'NO_DUTY'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'備註' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'GRD_REMARK'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聯徵群組號碼' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'GRD_GROUP_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新增人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'INSERT_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'新增日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'INSERT_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改人員' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'UPDATE_USER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'UPDATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'發送簡訊' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'MSG_SEND'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'認定月收入-保人' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'INCOME_APPROVED'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'收入來源 TBL_ID=Y0' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M', @level2type=N'COLUMN',@level2name=N'INCOME_SOURCE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'保證人主檔' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'ZZIP_BAMGUARD_M'
GO


