USE [OB]
GO

/****** Object:  Table [dbo].[ARSTATISMF]    Script Date: 2026/4/20 ¤U¤È 01:54:38 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[ARSTATISMF](
	[ORGNO] [char](2) NOT NULL,
	[CONTNO] [char](20) NOT NULL,
	[TOTTERM] [int] NOT NULL,
	[FIRST_PAYT_DATE] [datetime] NULL,
	[LAST_PAYT_DATE] [datetime] NULL,
	[TERM_AMT] [money] NOT NULL,
	[AR] [money] NOT NULL,
	[PAYT_TERM] [int] NOT NULL,
	[PAYT_AMT] [money] NOT NULL,
	[NONPAYT_TERM] [int] NOT NULL,
	[RECENT_PAYT_DATE] [datetime] NULL,
	[PAYT_DUE_DATE] [datetime] NULL,
	[OVERDUE_DAY] [int] NULL,
	[OVERDUE_AMT] [money] NOT NULL,
	[REMAINING_AMT] [money] NOT NULL,
	[STATIS_DATE] [datetime] NULL,
	[User_Name] [varchar](50) NOT NULL
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[ARSTATISMF] ADD  CONSTRAINT [DF_ARSTATISMF_User_Name]  DEFAULT ('') FOR [User_Name]
GO


