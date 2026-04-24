using ILS.Mvc;
using ILS.Mvc.Data;
using ILS.Mvc.Model;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlTypes;
using System.Web.Mvc;

namespace HFC_PhoneMVC.Areas.OBZ.Controllers.OBZ020
{
    /**
     * QLEM 版型
     **/
    public class OBZ020Controller : QLEMController
    {

        public override SPHelper SaveSP
        {
            get
            {
                return new SPHelper("USP_OBZ020_XML")
                    .AddParam("I_CHR_FLAG", "SAVE")
                    .AddParam("I_CHR_COMPID", "02")
                    .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                    .AddParamOutMSG();
            }
        }

        public override SPHelper QuerySP
        {
            get
            {
                return new SPHelper("USP_OBZ020_S00")
                    .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                    .AddParamOutMSG();
            }
        }

        public override IEnumerable<ListCollecion> SelectListDataSource
        {
            get
            {
                return new COMListManager()
                    .Require(CD030Type.LIST_TYPE, this.USERCOMPID, USER.CurrentFunSYSID)
                    .Require(CD030Type.PROD_TYPE, this.USERCOMPID, USER.CurrentFunSYSID)
                    .Require(CD030Type.SPEC_TYPE, this.USERCOMPID, USER.CurrentFunSYSID)
                    .Add("DsEMPID", new Item[0]) //員編
                    .Add("session_yesorno", new[] {
                        new Item(){ text="是",value="Y"},
                        new Item(){ text="否",value="N"}
                    })
                    .ToList();
            }
        }

        /**
         * 查詢E區 (點L查詢)
         **/
        public override SPHelper SearchEditSP([ModelBinder(typeof(DictionaryBinder))] Dictionary<string, object> list)
        {
            SPHelper querySP = new SPHelper("USP_OBZ020_S01")
                .AddParam("I_CHR_LIST_NO", list["LIST_NO"])
                .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                .AddParamOutMSG();

            return querySP;
        }

        /**
         * 查詢M區
         **/
        public override SPHelper SearchMultiSP([ModelBinder(typeof(DictionaryBinder))] Dictionary<string, object> list, DataTable edit)
        {
            return new SPHelper("USP_OBZ020_S10")
                .AddParam("I_CHR_LIST_NO", list["LIST_NO"])
                .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                .AddParamOutMSG();
        }

        // 取得CHKBOX來源(專案類別)
        [ActionName("GetSPEC_TPE")]
        public ContentResult GetSPEC_TPE()
        {
            IList<ListCollecion> specTypes = new COMListManager()
                .Require(CD030Type.SPEC_TYPE, this.USERCOMPID, USER.CurrentFunSYSID)
                .ToList();

            string jsonString = JsonConvert.SerializeObject(specTypes);

            return Content(jsonString);
        }

        // 取得CHKBOX來源(名單結清類型)
        [ActionName("GetCASE_STATUS")]
        public ContentResult GetCASE_STATUS()
        {
            DataTable dt= COMDb.RunSP_COMCD(this.USERCOMPID,116,this.USER.CurrentFunSYSID,string.Empty,"");
            if (dt.Columns.Contains("COMCD") && dt.Columns.Contains("COMNM"))
            {
                dt.Columns["COMCD"].ColumnName = "value";
                dt.Columns["COMNM"].ColumnName = "text";
            }
            string jsonString = JsonConvert.SerializeObject(dt);
            return Content(jsonString);
        }

        // 複製名單
        [ActionName("DoCopy")]
        public ContentResult DoCopy([ModelBinder(typeof(MultiDictionaryBinder))] List<Dictionary<string, dynamic>> data)
        {
            ILSMessage msg = new ILSMessage();
            DataSet ds = null;

            SqlXml sqlXml = new CreateSqlXml().AddRoot()
                            //.AddChild("TAB1")
                            .AppendData(data, "L1")
                            .ToSqlXml();

            try
            {
                SPHelper USP_OBZ020_XML = new SPHelper("USP_OBZ020_XML")
                .AddParam("I_XML_DATA", sqlXml)
                .AddParam("I_CHR_FLAG", "COPY")
                .AddParam("I_CHR_COMPID", "02")
                .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                .AddParamOutMSG();

                USP_OBZ020_XML.ExecSP(ref msg, ref ds);
            }
            catch (Exception EX)
            {
                msg.IsSuccess = false;
                msg.Message = EX.Message;
            }

            string jsonString = JsonConvert.SerializeObject(new
            {
                s = msg,
                d = ds,
            });

            return Content(jsonString);
        }

        // 計算名單案件數量
        [ActionName("DoCount")]
        public ContentResult DoCount([ModelBinder(typeof(MultiDictionaryBinder))] List<Dictionary<string, dynamic>> data)
        {
            ILSMessage msg = new ILSMessage();
            DataSet ds = null;

            SqlXml sqlXml = new CreateSqlXml().AddRoot()
                            //.AddChild("TAB1")
                            .AppendData(data, "L1")
                            .ToSqlXml();

            try
            {
                SPHelper USP_OBZ020_XML = new SPHelper("USP_OBZ020_XML")
                .AddParam("I_XML_DATA", sqlXml)
                .AddParam("I_CHR_FLAG", "COUNT")
                .AddParam("I_CHR_COMPID", "02")
                .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                .AddParamOutMSG();

                USP_OBZ020_XML.EventBeforeExeSP = (cmd) =>
                {
                    cmd.CommandTimeout = 120;
                    return true;
                };

                USP_OBZ020_XML.ExecSP(ref msg, ref ds);
            }
            catch (Exception EX)
            {
                msg.IsSuccess = false;
                msg.Message = EX.Message;
            }

            string jsonString = JsonConvert.SerializeObject(new
            {
                s = msg,
                d = ds,
            });

            return Content(jsonString);
        }

        // 刪除部門比例
        public ContentResult DoDeleteRate([ModelBinder(typeof(DictionaryBinder))] Dictionary<string, dynamic> data)
        {
            ILSMessage msg = new ILSMessage();
            DataSet ds = null;

            SqlXml sqlXml = new CreateSqlXml().AddRoot()
                            .AppendData(data, "E1")
                            .ToSqlXml();

            try
            {
                SPHelper USP_OBZ020_XML = new SPHelper("USP_OBZ020_XML")
                .AddParam("I_XML_DATA", sqlXml)
                .AddParam("I_CHR_FLAG", "DELETE_RATE")
                .AddParam("I_CHR_COMPID", "02")
                .AddParamMT(this.USERID.Substring(2), this.PGMID, false, true, true)
                .AddParamOutMSG();

                USP_OBZ020_XML.ExecSP(ref msg, ref ds);
            }
            catch (Exception EX)
            {
                msg.IsSuccess = false;
                msg.Message = EX.Message;
            }

            string jsonString = JsonConvert.SerializeObject(new
            {
                s = msg,
                d = ds,
            });

            return Content(jsonString);
        }
    }
}