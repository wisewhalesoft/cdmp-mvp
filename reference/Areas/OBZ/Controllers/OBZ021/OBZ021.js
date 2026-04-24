var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var OBZ021 = /** @class */ (function (_super) {
    __extends(OBZ021, _super);
    function OBZ021() {
        var _this = _super.call(this) || this;
        _this.bindView_AfterLoad(_this.bindViewAfterLoad);
        _this.bindGrid_BeforeInit(_this.onGrid_BeforeInit);
        _this.bindToolBar_BeforeClick(_this.onBeforeToolbarClick); // 是否有必填
        _this.bindSave_CompletePost(_this.onSave_CompletePost);
        _this.bindSave_BeforePost(_this.onSave_BeforePost);
        _this.bindInsert_AfterAddRow(_this.bindInsertAfterAddRow); // 按下新增鈕，且 M區 已出現一筆空資料後
        _this.bindSearch_AfterPost(_this.onSearch_AfterPost);
        return _this;
    }
    //-- M 區 Schema --//
    OBZ021.prototype.GridSchema = function () {
        var me = this;
        return [
            {
                Title: "名單年月", Field: "YEARMONTH", DataType: "varchar", Width: 100,
                ReadOnly: true, ModelField_IsEdiable: true,
                Template: function (data) { return data["YEARMONTH"] == null ? "" : data["YEARMONTH"]; }
            },
            {
                Title: "名單代號", Field: "LIST_NO", DataType: "varchar", Width: 150,
                ReadOnly: true, ModelField_IsEdiable: true,
                Template: function (data) { return data["LIST_NO"] == null ? "" : data["LIST_NO"]; }
            },
            {
                Title: "產品類別",
                Field: "PROD_TYPE",
                DataType: "varchar",
                Width: 100,
                ReadOnly: true, ModelField_IsEdiable: true,
                Template: function (data) { return Common.GetCodeName(data["PROD_TYPE"], ils.project.GetCOMDs("DsPROD_TYPE")) || "N/A"; }
            },
            {
                Title: "電銷處別", Field: "DEPT_CODE", DataType: "varchar", Width: 120,
                ReadOnly: true, ModelField_IsEdiable: true,
                Template: function (data) { return data["DEPT_CODE"] == null ? "" : data["DEPT_CODE"]; }
            },
            {
                Title: "部門名稱", Field: "DEPT_NAME", DataType: "varchar", Width: 120,
                ReadOnly: true, ModelField_IsEdiable: false,
                Template: function (data) { return Common.GetCodeName(data["DEPT_CODE"], ils.project.GetCOMDs("DsOB_DEPTID")) || "N/A"; }
            },
            {
                Title: "員工編號", Field: "EMPLID", DataType: "varchar", Width: 120,
                ReadOnly: false, ModelField_IsEdiable: true,
                Template: function (data) { return data["EMPLID"] == null ? "" : data["EMPLID"]; },
                Editor: ils.GridEditor.TextBox({ maxLength: 5 }, true),
                IsRequired: true
            },
            {
                Title: "員工名稱", Field: "EMP_NM", DataType: "varchar", Width: 120,
                ReadOnly: true, ModelField_IsEdiable: false,
                Template: function (data) { return Common.GetCodeName(data["EMPLID"], ils.project.GetCOMDs("DsOB_EMPLID2")) || "N/A"; }
            },
            {
                Title: "比例", Field: "RATION", DataType: "int", Width: 120,
                //IsRequired: true,
                ReadOnly: false, ModelField_IsEdiable: true,
                Template: function (data) { return data["RATION"] == null ? "" : data["RATION"]; },
                //Editor: ils.GridEditor.TextBox({
                //    maxLength: 3,
                //}, false)
                Editor: ils.GridEditor.TextBoxNumberic({
                    min: 0, max: 100, format: "n2", decimals: 1
                    //decimals?:number 允許小數到第幾位(0 = 不允許有小數)
                })
            },
        ];
    };
    OBZ021.prototype.bindViewAfterLoad = function () {
        var me = this;
        me.ToolBar.show("#" + me.ToolBar.SaveButton.id); //儲存按鈕
        me.ToolBar.hide("#" + me.ToolBar.InsertButton.id); //新增按鈕
        me.ToolBar.show("#" + me.ToolBar.SearchButton.id); //搜尋按鈕
        me.ToolBar.show("#" + me.ToolBar.RefreshButton.id); //畫面重整按鈕
        me.ToolBar.hide("#" + me.ToolBar.DeleteButton.id); //刪除按鈕
        me.ToolBar.hide("#" + me.ToolBar.HelpButton.id); //問號按鈕
        me.ToolBar.hide("#" + me.ToolBar.PrintButton.id); //列印報表按鈕
        me.ToolBar.show("#" + me.ToolBar.ExportButton.id); //匯出按鈕
        me.ToolBar.hide("#" + me.ToolBar.ImportButton.id); //匯入按鈕
        $("#ils_toolBar_btnExport").click(function () {
            me.doExport();
        });
        //$("#ils_toolBar_btnImport").click(() => {
        //    let URL = "../../ChooseLib/OBZ021_POP_1/Index";
        //    PRJCommon.popupWindow({ popId: "OBZ021_POP_1", url: URL, pgmid: "OBZ021", width: 600, height: 160, title: "EXCEL匯入", isCenter: true })
        //})
        $("#btnDoImport").click(function () {
            var URL = "../../ChooseLib/OBZ021_POP_1/Index";
            PRJCommon.popupWindow({ popId: "OBZ021_POP_1", url: URL, pgmid: "OBZ021", width: 600, height: 160, title: "EXCEL匯入", isCenter: true });
        });
        $("#btnInsertAll").click(function () {
            if (confirm('確定匯入系統?')) {
                me.doImport();
            }
            else {
                return;
            }
        });
        // 隱藏Q區
        //$("#panelbar").hide();
        // Q區欄位預設值
        var currentDate = new Date();
        currentDate.setMonth(currentDate.getMonth() + 1); // 將日期增加一個月
        // 獲取新的年份和月份，並以字串yyyyMM的格式顯示
        var year = currentDate.getFullYear().toString();
        var month = (currentDate.getMonth() + 1);
        var yearMonth = year + me.dteFill(month);
        me.Q1.Data.set("I_CHR_YEARMONTH", yearMonth);
        me.Q1.Data.set("I_CHR_PROD_TYPE", "01");
        //M 區資料進入編輯模式時觸發行為
        me.M1.bind('edit', function (e) {
            var model = e.model;
            var sender = e.container;
            if (sender.context != undefined) {
                var colIndex = sender.index(); //* 目前在第幾欄
                var nowColnm = this.columns[colIndex].field; //* 目前欄位的Field
                switch (nowColnm) {
                    case 'EMPLID':
                        $('input[data-bind="value:EMPLID"]').unbind('blur'); // 要記得unbind!
                        $('input[data-bind="value:EMPLID"]').blur(function () {
                            if (model["ACTIONCD"] == "I") {
                                me.M1.refresh();
                            }
                        });
                        break;
                }
            }
        });
    };
    //* M區新增一筆之後
    OBZ021.prototype.bindInsertAfterAddRow = function () {
        var me = this;
        var dataQ = me.Q1.Data.toJSON();
        var row = $(me.M1.tbody).find("tr").first();
        var insertData = me.M1.dataItem(row);
        // 設定 M 區預設值
        insertData.set("YEARMONTH", dataQ["I_CHR_YEARMONTH"]);
        insertData.set("PROD_TYPE", dataQ["I_CHR_PROD_TYPE"]);
        insertData.set("DEPT_CODE", dataQ["I_CHR_DEPTID"]);
        insertData.set("RATION", Number(0));
        // 重整 M 區資料 Model
        me.M1.refresh();
    };
    OBZ021.prototype.onGrid_BeforeInit = function (evt, gridOpt) {
        gridOpt.ShowColumnDel = false; // 移除刪除欄位 
    };
    OBZ021.prototype.onSearch_AfterPost = function (e, evtArgs) {
        var me = this;
        var result = evtArgs.Result.d;
        if (result.length > 0) {
            me.ToolBar.show("#ils_toolBar_btnInsert");
        }
    };
    //* Toolbar點選事件
    OBZ021.prototype.onBeforeToolbarClick = function (e, evtArgs) {
        var me = this;
        var dataQ = me.Q1.Data.toJSON();
        me.MsgMgr.hideMessage();
        $("#btnInsertAll").attr("disabled", "disabled");
        //Search Click
        if (evtArgs.ItemValueName == ils.ui.ToolBarAction.Search ||
            evtArgs.ItemValueName == ils.ui.ToolBarAction.Insert ||
            evtArgs.ItemValueName == ils.ui.ToolBarAction.Export) {
            if (!me.Q1.Validator.validate("Search")) {
                me.MsgMgr.showComMsg(ils.mvc.MessageType.ValidError);
                evtArgs.isCancel = true;
                return;
            }
            //else if (dataQ['I_CHR_ASSET_ID'] == '' && dataQ['I_CHR_COMPID'] == '' && dataQ['I_CHR_ASSET_LOC'] == '') {
            //    me.MsgMgr.showErroMessage("搜尋條件請擇一輸入。");
            //    evtArgs.isCancel = true;
            //    return;
            //}
        }
    };
    //* 儲存前驗證(100%檢測)
    OBZ021.prototype.onSave_BeforePost = function (e, evtArgs) {
        var me = this;
        var M = evtArgs.M; // M區屬於列表型資料，所以會是以 Array 方式處理
        var rationSum = 0;
        M.forEach(function (e) { return rationSum += Number((e.RATION * 100)); });
        rationSum = Number((rationSum / 100).toFixed(0)); //避免浮點數相加問題
        //console.log(rationSum);
        if (rationSum != 0) {
            if (rationSum != 100) {
                //停止後續發送表單行為
                evtArgs.isCancel = true;
                //顯示系統訊息
                me.MsgMgr.showErroMessage("\u9A57\u8B49\u5931\u6557\uFF0C\u8A2D\u5B9A\u7684\u90E8\u9580\u6BD4\u4F8B\u7E3D\u548C\u70BA" + rationSum.toFixed(1) + "%\uFF0C\u61C9\u70BA100%!");
                //隱藏 loading 畫面
                me.hideLoading();
                return;
            }
        }
    };
    OBZ021.prototype.onSave_CompletePost = function (e, evtArgs) {
        var me = this;
        var msg = evtArgs.Result.s;
        if (msg["IsSuccess"]) {
            me.doSearch();
        }
    };
    OBZ021.prototype.doExport = function () {
        var me = this;
        me.showLoading();
        var dataQ = me.Q1.Data.toJSON();
        dataQ['DEPT_NAME'] = Common.GetCodeName(dataQ["I_CHR_DEPTID"], ils.project.GetCOMDs("DsOB_DEPTID")); // json加欄位'DEPT_NAME'
        dataQ['PROD_TYPE_NM'] = Common.GetCodeName(dataQ["I_CHR_PROD_TYPE"], ils.project.GetCOMDs("DsPROD_TYPE")); // json加欄位'PROD_TYPE_NM'
        if (dataQ != null) {
            $.ilsPost("Export", dataQ, function (isSuccess, rlt, xhr) {
                me.hideLoading();
                if (isSuccess) {
                    var msg = rlt.s;
                    if (msg["Message"] != "") {
                        me.MsgMgr.showErroMessage(msg["Message"]);
                    }
                    else {
                        var url = rlt.d["0"]["URL"];
                        window.open(url);
                        me.MsgMgr.showMessageInfo(10);
                    }
                }
            });
        }
    };
    OBZ021.prototype.doImport = function () {
        var me = this;
        var dataM1 = me.M1.dataSource.data().toJSON();
        var PRODTYPE = $("#F_ddlPROD_TYPE").val();
        var YEARMONTH = $("#F_txtYEARMONTH").val();
        //let rationSum: number = 0;
        me.MsgMgr.hideMessage();
        if (PRODTYPE == '' || YEARMONTH == '') {
            me.MsgMgr.showErroMessage("驗證失敗，請設定產品類別及年月。");
            return;
        }
        //dataM1.forEach(e => rationSum += Number(e.RATION))
        //if (rationSum != 0) {
        //    if (rationSum != 100) {
        //        //顯示系統訊息
        //        me.MsgMgr.showErroMessage(`驗證失敗，設定的部門比例總和為${rationSum.toFixed(1)}%，應為100%!`)
        //        //隱藏 loading 畫面
        //        me.hideLoading();
        //        return;
        //    }
        //}
        var parameter = {
            dataM1: dataM1,
            yearMonth: YEARMONTH,
            prodType: PRODTYPE
        };
        me.showLoading();
        $.ilsPost("DoImport", parameter, function (isSuccess, result, err) {
            me.hideLoading();
            if (isSuccess) {
                //console.log(result);
                var dt = result.d || {}; //回傳的結果
                var msg = result.s; //訊息
                var message = msg.Message || "";
                if (msg.IsSuccess) { //回傳狀態為成功
                    if (message.length > 0) {
                        me.MsgMgr.showErroMessage(msg.Message); //成功但傳送提醒訊息(當匯入的資料有員工不在員工檔內須提醒)
                    }
                    else {
                        me.MsgMgr.showMessage("執行成功。", false);
                    }
                    me.M1.BindData(dt);
                }
                else if (message.length > 0) {
                    me.MsgMgr.showErroMessage(msg.Message);
                }
                else {
                    me.MsgMgr.showErroMessageInfo(18);
                }
            }
            else {
                me.MsgMgr.showErroMessageInfo(18);
            }
        });
    };
    // 日期補0
    OBZ021.prototype.dteFill = function (date) {
        return ((date < 10 ? '0' : '') + String(date));
    };
    return OBZ021;
}(ils.mvc.QMView));
ils.app(new OBZ021);
//# sourceMappingURL=OBZ021.js.map