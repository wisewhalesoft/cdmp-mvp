USE [OB]
GO

/****** Object:  StoredProcedure [dbo].[USP_OB_APMREAL_M]    Script Date: 2026/4/20 下午 02:19:52 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

/**********************************************************************************
* 系統名稱：OB
 * 程式名稱：USP_OB_APMREAL_M_UPDATE 
 * 功能說明：電銷地產持有 -  從分期資料庫更新地產持有到OB
 * 撰寫日期：2023/09/28
 * 撰寫人員：Peter
 * 維護日期：
 * 維護人員：
**********************************************************************************/
CREATE PROCEDURE [dbo].[USP_OB_APMREAL_M]
AS
BEGIN
	SET XACT_ABORT ON
	DECLARE @NOW DATETIME= GETDATE()
	DECLARE @BREAK VARCHAR(500)
	DECLARE @MSG VARCHAR(300)=''

	IF OBJECT_ID('tempdb.dbo.#TEMP_APMREAL_M','U') IS NOT NULL DROP TABLE  #TEMP_APMREAL_M
	CREATE TABLE #TEMP_APMREAL_M
		(
		 APPL_NO				NVARCHAR(10)
		,CUSTO_NO			NVARCHAR(10)
		,SERIAL_NO			INT
		)

		SET @BREAK='查詢ZZIP地產持有資料'
		PRINT @BREAK
		INSERT INTO #TEMP_APMREAL_M (APPL_NO,CUSTO_NO,SERIAL_NO)
		SELECT APPL_NO,CUSTO_NO,SERIAL_NO
		FROM ZZIPPROD..ZZIP_APMREAL_M 
		BEGIN TRY
			
			SET @BREAK='更新OB地產持有資料'
			PRINT @BREAK
			--更新顧客統編和案號
			UPDATE OB_APMREAL_M
			SET CUSTO_NO=B.CUSTO_NO,APPL_NO=B.APPL_NO,UPDATE_DATE=@NOW
			FROM OB_APMREAL_M A 
			JOIN #TEMP_APMREAL_M B ON A.SERIAL_NO=B.SERIAL_NO
			WHERE A.CUSTO_NO<>B.CUSTO_NO OR A.APPL_NO <>B.APPL_NO
			
			SET @BREAK='移除TEMP中相同序號的資料'
			PRINT @BREAK
			--移除TEMP中相同序號的資料
			DELETE #TEMP_APMREAL_M FROM #TEMP_APMREAL_M A
			INNER JOIN OB_APMREAL_M B ON A.SERIAL_NO=B.SERIAL_NO
			
			SET @BREAK='插入新的地產持有資料'
			PRINT @BREAK
			--插入剩餘資料
			INSERT INTO OB_APMREAL_M
							(APPL_NO,CUSTO_NO,SERIAL_NO,INSERT_DATE)
			SELECT	APPL_NO,CUSTO_NO,SERIAL_NO,@NOW 
			FROM #TEMP_APMREAL_M
			DROP TABLE #TEMP_APMREAL_M

		END TRY
		BEGIN CATCH
		IF OBJECT_ID('tempdb..#TEMP_APMREAL_M') IS NOT NULL DROP TABLE #TEMP_APMREAL_M

		EXEC msdb.dbo.sp_send_dbmail @profile_name='SQLADMIN' , @recipients ='PETERLEE@hfcfinance.com.tw;minyann@hfcfinance.com.tw' , @subject= 'OB地產資料同步失敗' , @body=@BREAK,
						 @body_format='HTML'

		END CATCH
		PRINT N'執行成功!'
END
GO


