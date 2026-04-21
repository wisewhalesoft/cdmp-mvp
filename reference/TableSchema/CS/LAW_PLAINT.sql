USE [CS]
GO

/****** Object:  Table [dbo].[LAW_PLAINT]    Script Date: 2026/4/20 下午 02:40:55 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[LAW_PLAINT](
	[LAW_PLAINT_SER] [int] IDENTITY(1,1) NOT FOR REPLICATION NOT NULL,
	[INSTANCE_SER] [int] NOT NULL,
	[CASE_NO] [varchar](20) NOT NULL,
	[DOC_SER] [int] NOT NULL,
	[DOC_TEMP_SER] [int] NOT NULL,
	[COURT_SER] [int] NOT NULL,
	[PROC_SER] [int] NOT NULL,
	[CIF_SER_1] [int] NULL,
	[CIF_SER_2] [int] NULL,
	[CIF_SER_3] [int] NULL,
	[CIF_SER_4] [int] NULL,
	[CH_NAME_STR] [nvarchar](60) NULL,
	[PHONE_SER_1] [int] NULL,
	[PHONE_SER_2] [int] NULL,
	[PHONE_SER_3] [int] NULL,
	[PHONE_SER_4] [int] NULL,
	[AMT] [int] NULL,
	[LAW_NO_SER] [int] NULL,
	[GENERATE_DATE] [datetime] NULL,
	[RENDER_DATE] [datetime] NULL,
PRIMARY KEY CLUSTERED 
(
	[LAW_PLAINT_SER] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[LAW_PLAINT] ADD  CONSTRAINT [DF__LAW_PLAIN__DOC_T__42ACE4D4]  DEFAULT ((0)) FOR [DOC_TEMP_SER]
GO

ALTER TABLE [dbo].[LAW_PLAINT] ADD  CONSTRAINT [DF__LAW_PLAIN__RENDE__43A1090D]  DEFAULT ('1900/01/01') FOR [RENDER_DATE]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'撰狀記錄流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'LAW_PLAINT_SER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'實體流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'INSTANCE_SER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'案件編號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'CASE_NO'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'書狀信函種類流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'DOC_SER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'書狀信函樣版流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'DOC_TEMP_SER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'受理法院流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'COURT_SER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'法務流程流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'PROC_SER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人一CIF流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'CIF_SER_1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人二CIF流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'CIF_SER_2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人三CIF流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'CIF_SER_3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人四CIF流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'CIF_SER_4'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人姓名字串' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'CH_NAME_STR'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人一聯絡方式流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'PHONE_SER_1'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人二聯絡方式流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'PHONE_SER_2'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人三聯絡方式流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'PHONE_SER_3'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'相對人四聯絡方式流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'PHONE_SER_4'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'訴訟金額' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'AMT'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'參考案號流水號' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'LAW_NO_SER'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'撰狀日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'GENERATE_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'遞狀日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'LAW_PLAINT', @level2type=N'COLUMN',@level2name=N'RENDER_DATE'
GO


