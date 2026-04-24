using ILS.Mvc;
using ILS.Mvc.Data;
using ILS.Mvc.Model;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlTypes;
using System.Web;
using System.Web.Mvc;
using System.Web.Script.Serialization;
using static ILS.Mvc.ImportController;

namespace HFC_PhoneMVC.Areas.ChooseLib.Controllers.OBZ021_POP_1
{
    public class OBZ021_POP_1Controller : DefaultController
    {

        public override SPHelper SaveSP
        {
            get
            {
                throw new NotImplementedException();
            }
        }

        public override SPHelper QuerySP
        {
            get
            {
                throw new NotImplementedException();
            }
        }

        public override IEnumerable<ListCollecion> SelectListDataSource
        {
            get
            {
                return (new COMListManager())
                    .ToList();
            }
        }


        // 匯入
        [ActionName("ImportExcel")]
        public ContentResult ImportExcel()
        {
            //* 獲得檔案
            HttpPostedFileBase file = (Request.Files != null && Request.Files.Count > 0) ? Request.Files[0] : null;

            //* 訊息設定
            ILSMessage msg = new ILSMessage();
            string errorMsg = string.Empty;
            msg.IsSuccess = true;
            msg.Message = string.Empty;

            //* 回傳資料設定
            DataTable dt = new DataTable();
            DataTable dtResult = new DataTable();

            //* 驗證excel資料格式
            List<VaildData> vaildlist = SetImportVaild();

            //* 執行共用匯入(檢核、資料格式的轉換)
            ImportController.Import(file, vaildlist, ref dt, ref dtResult, ref errorMsg, false, "");

            //* 共用匯入如果有誤，回傳訊息
            if (errorMsg != "")
            {
                msg.IsSuccess = false;
                msg.Message = errorMsg;
                return Content(ResultHelper.ToGridJSON(dtResult, msg));
            }

            return Content(ResultHelper.ToGridJSON(dtResult, msg));

            ////* 串查詢字串
            //string ASSETID = "";
            //foreach (DataRow row in dtResult.Rows)
            //{
            //    ASSETID += row["ASSET_ID"] + "*";  //dtResult.Rows[0]["EMPNO"];
            //}


            ////* 共用匯入成功，開始匯入到DB
            //if (msg.IsSuccess)
            //{
            //    #region 執行XML

            //    DataTable ds = null;
            //    try
            //    {
            //        SPHelper ImportSearch = new SPHelper("USP_HFC_PhoneMVCA050_S00_IMPORT")
            //            .AddParam("I_CHR_LONGASSETID", ASSETID)
            //            .AddParamMT(this.USER.EMPNO, this.PGMID, false, true, true)
            //            .AddParamOutMSG();

            //        ImportSearch.ExecSP(ref msg, ref ds);
            //    }
            //    catch (Exception ex)
            //    {
            //        msg.IsSuccess = false;
            //        msg.Message = ex.Message;
            //    }
            //    dtResult = ResultHelper.HandleGridData(ds); // 將結果轉換成M區格式的TABLE(可新刪修)
            //    #endregion
            //}

            //// 上傳成功回傳結果
            //var result = new
            //{
            //    s = msg,
            //    d = dtResult,
            //    assetID = ASSETID
            //};
            //return Content(JsonConvert.SerializeObject(result));

        }

        /// <summary>定義驗證匯入格式</summary>
        /// <returns></returns>
        public List<VaildData> SetImportVaild()
        {
            List<VaildData> vaildlist = new List<VaildData>();
            vaildlist.Add(new VaildData
            {
                columAt = 0,            //* 第?欄
                fileld = "YEARMONTH",       //* 欄位英文名稱
                fileldNM = "名單年月",   //* 欄位中文名稱(顯示訊息用)
                dataType = "string",    //* 欄位型態(同Grid schema 型態)
                isRequire = true,       //* 是否必填
                isVaild = true          //* 是否檢核
            });

            vaildlist.Add(new VaildData
            {
                columAt = 1,            //* 第?欄
                fileld = "PROD_TYPE",       //* 欄位英文名稱
                fileldNM = "產品類別",   //* 欄位中文名稱(顯示訊息用)
                dataType = "string",    //* 欄位型態(同Grid schema 型態)
                isRequire = true,       //* 是否必填
                isVaild = true          //* 是否檢核
            });

            vaildlist.Add(new VaildData
            {
                columAt = 2,            //* 第?欄
                fileld = "DEPT_CODE",       //* 欄位英文名稱
                fileldNM = "部門代碼",   //* 欄位中文名稱(顯示訊息用)
                dataType = "string",    //* 欄位型態(同Grid schema 型態)
                isRequire = true,       //* 是否必填
                isVaild = true          //* 是否檢核
            });

            vaildlist.Add(new VaildData
            {
                columAt = 3,            //* 第?欄
                fileld = "EMPLID",       //* 欄位英文名稱
                fileldNM = "員工編號",   //* 欄位中文名稱(顯示訊息用)
                dataType = "string",    //* 欄位型態(同Grid schema 型態)
                isRequire = true,       //* 是否必填
                isVaild = true          //* 是否檢核
            });

            vaildlist.Add(new VaildData
            {
                columAt = 4,            //* 第?欄
                fileld = "EMP_NM",       //* 欄位英文名稱
                fileldNM = "員工名字",   //* 欄位中文名稱(顯示訊息用)
                dataType = "string",    //* 欄位型態(同Grid schema 型態)
                isRequire = false,       //* 是否必填
                isVaild = true          //* 是否檢核
            });

            vaildlist.Add(new VaildData
            {
                columAt = 5,            //* 第?欄
                fileld = "RATION",       //* 欄位英文名稱
                fileldNM = "比例",   //* 欄位中文名稱(顯示訊息用)
                dataType = "decimal",    //* 欄位型態(同Grid schema 型態)
                isRequire = true,       //* 是否必填
                isVaild = true,          //* 是否檢核
                Min = 0,
                Max = 100
            });

            return vaildlist;
        }

        /// <summary>
        /// 無異動資料
        /// </summary>
        /// <param name="row"></param>
        /// <returns></returns>
        public bool NO_FilterXML(Dictionary<string, object> row)
        {
            return true;
        }
    }
}