USE [OB]
GO

/****** Object:  UserDefinedFunction [dbo].[fn_SplitString_cte]    Script Date: 2026/4/20 ¤U¤È 01:58:03 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


-- v20200506

create function [dbo].[fn_SplitString_cte]
(
 @source nvarchar(max),
 @spiltor nvarchar(200)
)
returns table
as
return
(
 with splitlist(startposition, endposition)
 as
 (
  select 
   0 as startposition, 
   charindex(@spiltor, @source) as endposition
  union all
  select 
   convert(int, endposition) + LEN(@spiltor), 
   charindex (@spiltor, @source, endposition + LEN(@spiltor)) 
  from splitlist 
  where endposition > 0
 )
 select substring(@source, startposition, coalesce(nullif(endposition, 0), len(@source) + LEN(@spiltor)) - startposition) as field
 from splitlist
)
GO


