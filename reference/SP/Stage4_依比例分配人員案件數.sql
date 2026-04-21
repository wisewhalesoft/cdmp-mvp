USE [OB]
/*********************************************************
--  程式名稱：電銷每月分派名單產生
--  功能說明：Stage4_依比例分配人員案件數
--  撰寫人員：
--  開發日期：
--  修改日期：

-- 
-- 檢查:
SELECT LIST_NO,APPL_NO,TIER_LEVEL,OB_DEPT,OB_EMPLID,IS_CR,CR_ID,ASSIGNDAY 
FROM OBPOOLDATA_LIST WITH(NOLOCK)
WHERE LIST_NO LIKE '%202603%'

*********************************************************/
	DECLARE @MSG NVARCHAR(MAX)='',
			@WORKDT VARCHAR(10)='20260401' -- 下月一號日期 yyyyMM01


	IF DATEPART(D,GETDATE())<'21' OR  @WORKDT < convert(varchar(10),GETDATE(),112)	--正式用21
	--IF DATEPART(D,GETDATE())<'01' OR  @WORKDT < convert(varchar(10),GETDATE(),112)	--測試用01
	BEGIN
		RETURN    -- 執行時間日期<21號 、 @WORKDT<現在時間 => 不給執行，因為已派案
	END 
	ELSE BEGIN

		DECLARE @BREAK VARCHAR(200)=''
		DECLARE @LIST_NO VARCHAR(15)=''

		-- 取下月名單編號
		SELECT TOP 1 @LIST_NO=LIST_NO 
		FROM OBMLISTDF
		WHERE PROJECT_WORKYM = LEFT(@WORKDT,6)
		ORDER BY LIST_NO
			
		BEGIN TRY
		IF ISNULL(@LIST_NO,'')<>''
		BEGIN
			---------------------------
			--以tier分配，@LIST_NO作為參考分配哪個月份的tier

			--人員分配-汽車
			SET @BREAK='人員分配(汽車):SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid'
			PRINT @BREAK			
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END

			--人員分配-機車
			SET @BREAK='人員分配(機車):SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid_motor'
			PRINT @BREAK
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid_motor]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END

			--人員分配-商品
			SET @BREAK='人員分配(商品):SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid_motor_c'
			PRINT @BREAK
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid_motor_c]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END
			

			--人員分配-汽車中結滿期三年以上 --汽車T5案件是汽車組+廣宣均分，這裡會同時平均分配部門+人員
			SET @BREAK='人員分配(汽車T5):SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid_T5'
			PRINT @BREAK
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid_T5]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END

			--人員分配-機車中結滿期三年以上
			SET @BREAK='人員分配(機車T5):SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid_T5M'
			PRINT @BREAK			
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid_T5M]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END
			

			--20230223 Rumin 汽車組課長、主任當月總數10%的期中名單（T1、T2、T3）等量且平均交換專員的中結五年內滿期三年內名單（T32、T4） (浩銓)
			SET @BREAK='交換案件(浩銓):SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange'
			PRINT @BREAK
			PRINT 'SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange'
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange]	@MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END

		END
		END TRY
		BEGIN CATCH
			SET @MSG= @BREAK + ', ERROR:' + ISNULL(ERROR_MESSAGE(),'') 
			PRINT  @MSG
			RETURN
		END CATCH
	END