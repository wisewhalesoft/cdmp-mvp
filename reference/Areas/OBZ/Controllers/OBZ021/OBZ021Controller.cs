using ILS.Mvc;
using ILS.Mvc.Data;
using ILS.Mvc.Model;
using System.Collections.Generic;
using System.Web.Mvc;
using NPOI.SS.UserModel;
using System;
using System.Data;
using System.IO;
using HFC_PhoneMVC.Classas.ExcelWorkbook;
using System.Data.SqlTypes;
using System.Linq;
using Newtonsoft.Json;

namespace HFC_PhoneMVC.Areas.OBZ.Controllers.OBZ021
{
    /**
     * QL 版型
     **/
    public class OBZ021Controller : QMController
    {
        /**
         *  是否在板面顯示 footer 區塊(預設 false)
         *  如不需要 footer 區塊，可將此程式碼移除
         **/
        public override bool HasFooter
        {
            get
            {
                return true;
            }
        }

        /**
         * 執行儲存行為
         **/
        public override SPHelper SaveSP
        {
            get
            {
                return new SPHelper("USP_OBZ021_XML")
                    .AddParam("I_CHR_FLAG", "SAVE")
                    .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                    .AddParamOutMSG();
            }
        }

        /**
         * 執行 Q區 查詢行為
         **/
        public override SPHelper QuerySP
        {
            get
            {
                return new SPHelper("USP_OBZ021_S00")
                    .AddParamMT(this.USERID, this.PGMID, false, true, true)
                    .AddParamOutMSG();
            }
        }

        /**
         * 預載下拉選單資料進 Session
         **/
        public override IEnumerable<ListCollecion> SelectListDataSource
        {
            get
            {
                return new COMListManager()
                    .Require(CD030Type.OB_DEPTID, this.USERCOMPID, USER.CurrentFunSYSID)
                    .Require(CD030Type.PROD_TYPE, this.USERCOMPID, USER.CurrentFunSYSID)
                    .Require(CD030Type.OB_EMPLID2, this.USERCOMPID, USER.CurrentFunSYSID)
                    .ToList();
            }
        }
       

        /// <summary>
        /// 明細下載EXCEL匯出
        /// </summary>
        /// <param name="data">Q區data</param>
        /// <returns></returns>
        public ContentResult Export([ModelBinder(typeof(DictionaryBinder))] Dictionary<string, object> data)
        {
            ILSMessage msg = new ILSMessage();
            DataTable dt = null;
            var url = string.Empty;

            SPHelper querySP = new SPHelper("USP_OBZ021_EXPORT")
                   .AddParam("I_CHR_YEARMONTH", data["I_CHR_YEARMONTH"])
                   .AddParam("I_CHR_PROD_TYPE", data["I_CHR_PROD_TYPE"])
                   .AddParam("I_CHR_DEPTID", data["I_CHR_DEPTID"])
                   .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                   .AddParamOutMSG();


            querySP.ExecSP(ref msg, ref dt);

            if (msg.IsSuccess && msg.Message == string.Empty)
            {
                if (dt.Rows.Count > 0)
                {
                    string id = "Export_" + DateTime.Now.ToString("yyyyMMddHHmmss");
                    System.Web.HttpContext.Current.Session[id] = dt;

                    url = this.Url.Content("WriteExcelWithNPOI?pid=" + id + "&depNM=" + data["DEPT_NAME"] + "&tpeNM=" + data["PROD_TYPE_NM"]);
                }
                else
                {
                    msg.Message = "查無資料!";
                }
            }

            DataTable dt2 = new DataTable("Table");
            dt2.Columns.Add("URL");
            DataRow dr = dt2.NewRow();
            dr["URL"] = url;
            dt2.Rows.Add(dr);

            string jsonstring = ResultHelper.ToGridJSON(dt2, msg);

            return Content(jsonstring);
        }
        //* NPOI 匯出
        public void WriteExcelWithNPOI(string pid, string depNM, string tpeNM)
        {
            DataTable dt = null;

            if (System.Web.HttpContext.Current.Session[pid] != null)
            {
                dt = System.Web.HttpContext.Current.Session[pid] as DataTable;
            }

            if (dt != null)
            {
                if (dt.Rows.Count > 0)
                {

                    string sheetname = "OBZ021";
                    string filename = tpeNM + "_" + depNM + "_人員比例_" + DateTime.Today.ToString("yyyyMMdd") + ".xlsx";
                    ExcelWorkbookClass ExcelWorkbook = new ExcelWorkbookClass(filename);

                    //不須標頭
                    //ExcelWorkbook.IsShowTitle = false; MARK BY SIMON 20200917  顯示標頭

                    ////* 設定CELL文字樣式
                    //ICellStyle CFL003_CellStyle = ExcelWorkbook.workbook.CreateCellStyle();
                    //CFL003_CellStyle.WrapText = true;
                    //CFL003_CellStyle.Alignment = HorizontalAlignment.Center;
                    //CFL003_CellStyle.VerticalAlignment = VerticalAlignment.Center;
                    //IFont font1 = ExcelWorkbook.workbook.CreateFont();
                    //font1.FontHeightInPoints = 10;
                    //font1.FontName = "Microsoft JhengHei";
                    //CFL003_CellStyle.SetFont(font1);

                    ////* 設定HEADER文字樣式
                    //ICellStyle CFL003_HeadStyle = ExcelWorkbook.workbook.CreateCellStyle();
                    //CFL003_HeadStyle.WrapText = true;
                    //CFL003_HeadStyle.Alignment = HorizontalAlignment.Center;
                    //CFL003_HeadStyle.VerticalAlignment = VerticalAlignment.Center;
                    //CFL003_HeadStyle.FillForegroundColor = IndexedColors.LightTurquoise.Index;
                    //CFL003_HeadStyle.FillPattern = FillPattern.SolidForeground;
                    //IFont font2 = ExcelWorkbook.workbook.CreateFont();
                    //font2.FontHeightInPoints = 10;
                    //font2.FontName = "Microsoft JhengHei";
                    //font2.Boldweight = (short)FontBoldWeight.Bold;
                    //CFL003_HeadStyle.SetFont(font2);

                    //ExcelWorkbook.AddStyle("CFL003_HeadStyle", CFL003_HeadStyle);
                    //ExcelWorkbook.AddStyle("CFL003_CellStyle", CFL003_CellStyle);

                    #region 報表欄位     
                    ExcelWorkbook.Add("名單年月", "YEARMONTH", 15)
                                 .Add("產品類別", "PROD_TYPE", 15)
                                 .Add("部門代碼", "DEPT_CODE", 15)
                                 .Add("員工編號", "EMPLID", 15)
                                 .Add("員工名字", "EMP_NM", 15)
                                 .Add("比例", "RATION", 15);
                    #endregion


                    //* 設定標題列
                    //* 定位點設定 1
                    int StartRowIndex = 0;
                    int CellPosition = 0;
                    IWorkbook workbook = ExcelWorkbook.Output(dt, sheetname, StartRowIndex, CellPosition);

                    //* 匯出
                    using (MemoryStream exportData = new MemoryStream())
                    {
                        Response.Clear();
                        workbook.Write(exportData);

                        Response.ContentType = "application/octet-stream";  //application/vnd.ms-excel
                        Response.AddHeader("Content-Disposition", string.Format("attachment;filename={0}", filename));
                        Response.BinaryWrite(exportData.ToArray());

                        //== 釋放資源 by shiw 20170822
                        workbook = null;
                        //exportData.Close();
                        //exportData.Dispose();
                        Response.Flush();
                        Response.End();
                    }
                }
            }
        }

        /// <summary>
        /// EXCEL匯入比例設定
        /// </summary>
        /// <param name="dataM1">M區資料</param>
        /// <param name="yearMonth">名單年月</param>
        /// <param name="prodType">名單產品類別</param>
        /// <returns></returns>
        public ContentResult DoImport(List<Dictionary<string, dynamic>> dataM1, string yearMonth, string prodType)
        {
            ILSMessage msg = new ILSMessage();
            DataTable dt = null;
            SqlXml xml = new CreateSqlXml().AddRoot()
                .AppendData(dataM1, "M1")
                .ToSqlXml();
            try
            {
                SPHelper USP_OBZ021_IMPORT = new SPHelper("USP_OBZ021_IMPORT")
                    .AddParam("I_XML_DATA", xml)
                    .AddParam("I_CHR_YEARMONTH", yearMonth)
                    .AddParam("I_CHR_PROD_TYPE", prodType)
                    .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                    .AddParamOutMSG();

                USP_OBZ021_IMPORT.ExecSP(ref msg, ref dt);

            }
            catch (Exception ex)
            {
                msg.IsSuccess = false;
                msg.Message = ex.Message;
            }

            string jsonString = JsonConvert.SerializeObject(new
            {
                d = dt,
                s = msg
            });

            return Content(jsonString);
        }
    }
}