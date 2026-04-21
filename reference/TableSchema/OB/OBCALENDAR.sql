USE [OB]
GO

/****** Object:  Table [dbo].[OBCALENDAR]    Script Date: 2026/4/20 下午 01:46:13 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[OBCALENDAR](
	[CALENDAR_DATE] [date] NOT NULL,
	[REST_FLG] [int] NOT NULL
) ON [PRIMARY]
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'日期' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCALENDAR', @level2type=N'COLUMN',@level2name=N'CALENDAR_DATE'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'工作日註記 1:是 0:否' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCALENDAR', @level2type=N'COLUMN',@level2name=N'REST_FLG'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'OB工作日主表' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'OBCALENDAR'
GO


