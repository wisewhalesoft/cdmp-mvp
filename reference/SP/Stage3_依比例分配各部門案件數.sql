USE[OB]
/*********************************************************
--  程式名稱：電銷每月分派名單產生
--  功能說明：Stage3_依比例分配各部門案件數
--  撰寫人員：
--  開發日期：
--  修改日期：

-- 
-- 檢查:
SELECT OB_DEPT,TIER_LEVEL,COUNT(1) 
FROM OBPOOLDATA_LIST WITH(NOLOCK) 
WHERE LIST_NO LIKE '%202603%'
GROUP BY OB_DEPT,TIER_LEVEL
ORDER BY OB_DEPT,TIER_LEVEL
(T51、T52案件要直接汽車組+廣宣均分，跑人員比例時再分)
*********************************************************/
	DECLARE @MSG NVARCHAR(MAX)='',
			@WORKDT VARCHAR(10)='20260401' -- 下月一號日期 yyyyMM01


	IF DATEPART(D,GETDATE())<'21' OR  @WORKDT < convert(varchar(10),GETDATE(),112)	--正式用21
	--IF DATEPART(D,GETDATE())<'01' OR  @WORKDT < convert(varchar(10),GETDATE(),112)	--測試用01
	BEGIN
		PRINT('本月已派案')
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
			-- 清空上次分配
			UPDATE OBPOOLDATA_LIST
			SET ASSIGNDAY=''
				,OB_DEPT = NULL
				,OB_EMPLID = NULL
			WHERE LIST_NO LIKE '%'+SUBSTRING(@LIST_NO, 3, 6)+'%'
			
			--20240530 Peter 清除本月無分派CR
			IF OBJECT_ID('tempdb.dbo.#RationList','U') IS NOT NULL DROP TABLE #RationList
			SELECT DEPTID_M,EMPLID,PROD_TYPE, MAX(RATION) Ration 
			INTO #RationList 
			FROM OBEMPLSETMF
			WHERE LIST_NO LIKE LEFT(@LIST_NO,8)+'%'
			GROUP BY DEPTID_M,EMPLID,PROD_TYPE

			IF OBJECT_ID('tempdb..#OBPOOLDATA_LIST') IS NOT NULL DROP TABLE #OBPOOLDATA_LIST
			SELECT A.LIST_NO, APPL_NO, APPL_DATE, OB_DEPT, OB_EMPLID,A.PROD_KIND
					, ISNULL(CR_ID,'') AS CR_ID, ISNULL(CR_NM,'') AS CR_NM,  ISNULL(IS_CR,'') AS IS_CR
			  INTO #OBPOOLDATA_LIST
			  FROM OBPOOLDATA_LIST A
			  WHERE LEFT(A.LIST_NO,8)=LEFT(@LIST_NO,8) 
			 AND ISNULL(IS_CR,'')='Y'

			 UPDATE A 
			 SET IS_CR='N'
			 ,CR_ID=''
			 ,CR_NM=''
			 FROM #OBPOOLDATA_LIST A
			 LEFT JOIN #RationList rl ON A.CR_ID=rl.EMPLID AND A.PROD_KIND=rl.PROD_TYPE
			 WHERE ISNULL(rl.Ration,0)=0
			
			IF OBJECT_ID('tempdb.dbo.#RationList','U') IS NOT NULL DROP TABLE #RationList
			IF OBJECT_ID('tempdb..#OBPOOLDATA_LIST') IS NOT NULL DROP TABLE #OBPOOLDATA_LIST


			SET @BREAK='部門分配(汽車):SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept'
			---------------------------
			-- 以tier分配，@LIST_NO作為參考分配哪個月份的tier
			-- 部門分配-汽車
			SET @BREAK='部門分配(汽車):SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept'
			PRINT @BREAK
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END

			-- 部門分配-機車
			SET @BREAK='部門分配(汽車):SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept_motor'
			PRINT @BREAK
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept_motor]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END

			-- 部門分配-商品(分給機車) Rumin20220803
			SET @BREAK='部門分配(商品):SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept_motor_c'
			PRINT @BREAK
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept_motor_c]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END

			-- 部門分配-機車中結滿期三年以上
			SET @BREAK='部門分配(機車T5):SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept_T5M'
			PRINT @BREAK
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept_T5M]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END

			--20220429 MinYann 汽車T5案件要直接汽車組+廣宣均分，跑emplid_T5就好
			/*
			--[汽機車中結滿期三年以上]
			--部門分配-汽車中結滿期三年以上
			PRINT 'SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept_T5'
			EXEC [dbo].[SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept_T5]  @MSG OUTPUT, @LIST_NO
			IF ISNULL(@MSG,'')<>''
			BEGIN 
				--RETURN
				RAISERROR (15600, -1, -1, @MSG);  
			END
			*/
		END
		END TRY
		BEGIN CATCH
			SET @MSG= @BREAK + ', ERROR:' + ISNULL(ERROR_MESSAGE(),'') 
			PRINT  @MSG
			RETURN
		END CATCH
		
	END