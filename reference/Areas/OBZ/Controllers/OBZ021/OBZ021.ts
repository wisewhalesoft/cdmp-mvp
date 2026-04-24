class OBZ021 extends ils.mvc.QMView {
    constructor() {
        super();
        this.bindView_AfterLoad(this.bindViewAfterLoad);
        this.bindGrid_BeforeInit(this.onGrid_BeforeInit);
        this.bindToolBar_BeforeClick(this.onBeforeToolbarClick); // 是否有必填
        this.bindSave_CompletePost(this.onSave_CompletePost);
        this.bindSave_BeforePost(this.onSave_BeforePost)
        this.bindInsert_AfterAddRow(this.bindInsertAfterAddRow); // 按下新增鈕，且 M區 已出現一筆空資料後
        this.bindSearch_AfterPost(this.onSearch_AfterPost);
    }


    //-- M 區 Schema --//
    GridSchema(): ils.ui.GridColumn[] {
        let me = this;
        return [
            {
                Title: "名單年月", Field: "YEARMONTH", DataType: "varchar", Width: 100,
                ReadOnly: true, ModelField_IsEdiable: true,
                Template: data => data["YEARMONTH"] == null ? "" : data["YEARMONTH"]
            },
            {
                Title: "名單代號", Field: "LIST_NO", DataType: "varchar", Width: 150,
                ReadOnly: true, ModelField_IsEdiable: true,
                Template: data => data["LIST_NO"] == null ? "" : data["LIST_NO"]
            },
            {
                Title: "產品類別",
                Field: "PROD_TYPE", //資料庫欄位名(對應SP輸出欄位名稱)
                DataType: "varchar", //輸入的資料型態(全小寫)
                Width: 100,
                ReadOnly: true, ModelField_IsEdiable: true, //是否可以觸發欄位編輯模式(預設 true)
                Template: data => Common.GetCodeName(data["PROD_TYPE"], ils.project.GetCOMDs("DsPROD_TYPE")) || "N/A"

            },
            {
                Title: "電銷處別", Field: "DEPT_CODE", DataType: "varchar", Width: 120,
                ReadOnly: true, ModelField_IsEdiable: true,
                Template: data => data["DEPT_CODE"] == null ? "" : data["DEPT_CODE"]
            },
            {
                Title: "部門名稱", Field: "DEPT_NAME", DataType: "varchar", Width: 120,
                ReadOnly: true, ModelField_IsEdiable: false,
                Template: data => Common.GetCodeName(data["DEPT_CODE"], ils.project.GetCOMDs("DsOB_DEPTID")) || "N/A"
            },
            {
                Title: "員工編號", Field: "EMPLID", DataType: "varchar", Width: 120,
                ReadOnly: false, ModelField_IsEdiable: true,
                Template: data => data["EMPLID"] == null ? "" : data["EMPLID"],
                Editor: ils.GridEditor.TextBox({ maxLength: 5 }, true),
                IsRequired: true
            },
            {
                Title: "員工名稱", Field: "EMP_NM", DataType: "varchar", Width: 120,
                ReadOnly: true, ModelField_IsEdiable: false,
                Template: data => Common.GetCodeName(data["EMPLID"], ils.project.GetCOMDs("DsOB_EMPLID2")) || "N/A"
            },
            {
                Title: "比例", Field: "RATION", DataType: "int", Width: 120,
                //IsRequired: true,
                ReadOnly: false, ModelField_IsEdiable: true,
                Template: data => data["RATION"] == null ? "" : data["RATION"],
                //Editor: ils.GridEditor.TextBox({
                //    maxLength: 3,
                //}, false)
                Editor: ils.GridEditor.TextBoxNumberic({
                    min: 0, max: 100, format: "n2", decimals: 1
                    //decimals?:number 允許小數到第幾位(0 = 不允許有小數)
                })

            },


        ];
    }


    bindViewAfterLoad() {
        let me = this;

        me.ToolBar.show("#" + me.ToolBar.SaveButton.id);      //儲存按鈕
        me.ToolBar.hide("#" + me.ToolBar.InsertButton.id);    //新增按鈕
        me.ToolBar.show("#" + me.ToolBar.SearchButton.id);    //搜尋按鈕
        me.ToolBar.show("#" + me.ToolBar.RefreshButton.id);   //畫面重整按鈕
        me.ToolBar.hide("#" + me.ToolBar.DeleteButton.id);    //刪除按鈕
        me.ToolBar.hide("#" + me.ToolBar.HelpButton.id);      //問號按鈕
        me.ToolBar.hide("#" + me.ToolBar.PrintButton.id);     //列印報表按鈕
        me.ToolBar.show("#" + me.ToolBar.ExportButton.id);    //匯出按鈕
        me.ToolBar.hide("#" + me.ToolBar.ImportButton.id);    //匯入按鈕


        $("#ils_toolBar_btnExport").click(() => {
            me.doExport();
        })
        //$("#ils_toolBar_btnImport").click(() => {
        //    let URL = "../../ChooseLib/OBZ021_POP_1/Index";
        //    PRJCommon.popupWindow({ popId: "OBZ021_POP_1", url: URL, pgmid: "OBZ021", width: 600, height: 160, title: "EXCEL匯入", isCenter: true })
        //})
        $("#btnDoImport").click(() => {
            let URL = "../../ChooseLib/OBZ021_POP_1/Index";
            PRJCommon.popupWindow({ popId: "OBZ021_POP_1", url: URL, pgmid: "OBZ021", width: 600, height: 160, title: "EXCEL匯入", isCenter: true })
        })
        $("#btnInsertAll").click(() => {
            if (confirm('確定匯入系統?')) {
                me.doImport();
            } else {
                return;
            }
            
        })

        // 隱藏Q區
        //$("#panelbar").hide();
        // Q區欄位預設值
        let currentDate = new Date();
        currentDate.setMonth(currentDate.getMonth() + 1); // 將日期增加一個月

        // 獲取新的年份和月份，並以字串yyyyMM的格式顯示
        let year = currentDate.getFullYear().toString();
        let month = (currentDate.getMonth() + 1);
        let yearMonth = year + me.dteFill(month);

        me.Q1.Data.set("I_CHR_YEARMONTH", yearMonth);
        me.Q1.Data.set("I_CHR_PROD_TYPE", "01");


        //M 區資料進入編輯模式時觸發行為
        me.M1.bind('edit', function (e) {
            let model = e.model;
            let sender = e.container;  
            if (sender.context != undefined) {
                let colIndex = sender.index();                      //* 目前在第幾欄
                let nowColnm = this.columns[colIndex].field;        //* 目前欄位的Field
                switch (nowColnm) {
                    case 'EMPLID':
                        $('input[data-bind="value:EMPLID"]').unbind('blur');    // 要記得unbind!
                        $('input[data-bind="value:EMPLID"]').blur(function () {                
                            if (model["ACTIONCD"] == "I") {
                                me.M1.refresh();
                            }
                        });
                        break;
                }
            }
        });
    }


    //* M區新增一筆之後
    bindInsertAfterAddRow() {
        let me = this;
        let dataQ = me.Q1.Data.toJSON();
        let row = $(me.M1.tbody).find("tr").first();
        let insertData = me.M1.dataItem(row);

        // 設定 M 區預設值
        insertData.set("YEARMONTH", dataQ["I_CHR_YEARMONTH"]);
        insertData.set("PROD_TYPE", dataQ["I_CHR_PROD_TYPE"]);
        insertData.set("DEPT_CODE", dataQ["I_CHR_DEPTID"]);
        insertData.set("RATION", Number(0));
        // 重整 M 區資料 Model
        me.M1.refresh();
    }

    onGrid_BeforeInit(evt, gridOpt: ils.ui.GridOptions) {
        gridOpt.ShowColumnDel = false;  // 移除刪除欄位 
    }

    onSearch_AfterPost(e: any, evtArgs: ils.mvc.CEventArgs) {
        let me = this;
        let result: any[] = evtArgs.Result.d;
        if (result.length > 0) {
            me.ToolBar.show("#ils_toolBar_btnInsert");
        }

    }

    //* Toolbar點選事件
    onBeforeToolbarClick(e: JQueryEventObject, evtArgs: ils.ui.ToolBarEventArgs) {
        var me = this;
        let dataQ = me.Q1.Data.toJSON();
        me.MsgMgr.hideMessage();
        $("#btnInsertAll").attr("disabled", "disabled");

        //Search Click
        if (evtArgs.ItemValueName == ils.ui.ToolBarAction.Search ||
            evtArgs.ItemValueName == ils.ui.ToolBarAction.Insert ||
            evtArgs.ItemValueName == ils.ui.ToolBarAction.Export
        ) {

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

    }

    //* 儲存前驗證(100%檢測)
    onSave_BeforePost(e: any, evtArgs: ils.mvc.CEventArgs) {
        let me = this;
        let M: any[] = evtArgs.M;   // M區屬於列表型資料，所以會是以 Array 方式處理
        let rationSum: number = 0;

        M.forEach(e => rationSum += Number((e.RATION * 100)))
        rationSum = Number((rationSum/100).toFixed(0)); //避免浮點數相加問題
        //console.log(rationSum);

        if (rationSum != 0) {
            if (rationSum != 100) {
                //停止後續發送表單行為
                evtArgs.isCancel = true;
                //顯示系統訊息
                me.MsgMgr.showErroMessage(`驗證失敗，設定的部門比例總和為${rationSum.toFixed(1)}%，應為100%!`)
                //隱藏 loading 畫面
                me.hideLoading();
                return;
            }
        }
    }

    onSave_CompletePost(e: any, evtArgs: ils.mvc.CEventArgs) {
        let me = this;
        let msg = evtArgs.Result.s;
        if (msg["IsSuccess"]) {
            me.doSearch();
        }
    }

    

    doExport() {
        let me = this;
        me.showLoading();
        let dataQ = me.Q1.Data.toJSON();
        dataQ['DEPT_NAME'] = Common.GetCodeName(dataQ["I_CHR_DEPTID"], ils.project.GetCOMDs("DsOB_DEPTID")); // json加欄位'DEPT_NAME'
        dataQ['PROD_TYPE_NM'] = Common.GetCodeName(dataQ["I_CHR_PROD_TYPE"], ils.project.GetCOMDs("DsPROD_TYPE")); // json加欄位'PROD_TYPE_NM'

        if (dataQ != null) {
            $.ilsPost("Export", dataQ, function (isSuccess, rlt, xhr) {
                me.hideLoading();
                if (isSuccess) {
                    let msg = rlt.s;
                    if (msg["Message"] != "") {
                        me.MsgMgr.showErroMessage(msg["Message"]);
                    } else {
                        let url = rlt.d["0"]["URL"];
                        window.open(url);
                        me.MsgMgr.showMessageInfo(10);
                    }
                }
            });
        }
    }

    doImport() {
        let me = this;
        let dataM1 = me.M1.dataSource.data().toJSON();
        let PRODTYPE = $("#F_ddlPROD_TYPE").val();
        let YEARMONTH = $("#F_txtYEARMONTH").val();
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
        let parameter = {
            dataM1: dataM1,
            yearMonth: YEARMONTH,
            prodType: PRODTYPE
        }
        me.showLoading();
        $.ilsPost("DoImport", parameter,
            function (isSuccess, result, err) {
                me.hideLoading();
                if (isSuccess) {
                    //console.log(result);
                    let dt = result.d || {};  //回傳的結果
                    let msg: ils.mvc.ILSMessage = result.s; //訊息
                    let message = msg.Message || "";
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
                    } else {
                        me.MsgMgr.showErroMessageInfo(18);
                    }
                }
                else {
                    me.MsgMgr.showErroMessageInfo(18);
                }
            });
    }
    // 日期補0
    dteFill(date) {
        return ((date < 10 ? '0' : '') + String(date));
    }
}
ils.app(new OBZ021)