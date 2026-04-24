class OBZ020 extends ils.mvc.QLEMView {
    constructor() {
        super();

        //畫面 load 完後
        this.bindView_AfterLoad(this.bindViewAfterLoad);
        //點擊L區資料 後
        this.bindSearchEdit_After(this.bindSearchEditAfter);
        //新增按鈕 click 後
        this.bindInsert_After(this.bindInsertAfter);
        //Save 按鈕 submit 表單前執行
        this.bindSave_BeforePost(this.bindSaveBeforePost);
        //Save 按鈕 submit 表單後執行(已取回執行結果)
        this.bindSave_AfterPost(this.bindSaveAfterPost);

        this.bindMultiGrid_BeforeInit(this.onGrid_BeforeInit);

    }


    /**
    * 畫面 Loading 後
    * */
    bindViewAfterLoad() {
        let me = this;

        //* 繫結 Q 區事件: 下拉式選單模糊搜尋
        // DropDownFilterBindDataSource.bindFilterDataSource(me, $("#Q_tbddlfEMPLID"), { COMTYPE: 117, FLAG: "B" });

        me.ToolBar.show("#" + me.ToolBar.SaveButton.id);      //儲存按鈕
        me.ToolBar.show("#" + me.ToolBar.InsertButton.id);    //新增按鈕
        me.ToolBar.show("#" + me.ToolBar.SearchButton.id);    //搜尋按鈕
        me.ToolBar.show("#" + me.ToolBar.RefreshButton.id);   //畫面重整按鈕
        me.ToolBar.show("#" + me.ToolBar.DeleteButton.id);    //刪除按鈕
        me.ToolBar.hide("#" + me.ToolBar.HelpButton.id);      //問號按鈕
        me.ToolBar.hide("#" + me.ToolBar.PrintButton.id);     //列印報表按鈕
        me.ToolBar.hide("#" + me.ToolBar.ExportButton.id);    //匯出按鈕
        me.ToolBar.hide("#" + me.ToolBar.ImportButton.id);    //匯入按鈕

        //調整grid區大小
        $("#gridMulti").height("369")
        $("#gridList").height("369")
        $(".k-grid-content").height("300")


        // 生成E區選項
        me.renderChk_SPEC();
        me.renderChk_CASESTATUS();

        // 繫結E區CHKBOX點擊事件，把值帶入隱藏欄位
        $('#divSPEC_CHK').off('change')
            .on("change", ".chkSPEC", { me: me, chkNM: 'SpecTypes', fieldNM: 'SPEC_TP' }, me.eventChecked); //因元件是動態產生，必須使用動態繫結
        $('#divCASEYEAR_CHK').off('change')
            .on("change", ".chkCASEYEAR", { me: me, chkNM: 'CaseYears', fieldNM: 'CASEYEAR', selALL: 'selYear_All' }, me.eventChecked);
        $('#divLISTTYPE_CHK').off('change')
            .on("change", ".chkLISTTYPE", { me: me, chkNM: 'ListTypes', fieldNM: 'LIST_TYPE' }, me.eventChecked);
        $('#divSETTLE_CHK').off('change')
            .on("change", ".chkSETTLE", { me: me, chkNM: 'SettleSrc', fieldNM: 'SETTLE_SRC' }, me.eventChecked);

        $('#selYear_All').off('change')
            .on('change', { me: me, chkNM: 'CaseYears', fieldNM: 'CASEYEAR' }, me.eventChecked_All);

        // 繫結L區CHKBOX點擊事件
        $("#gridList").off("click", ".ISSELChk")
            .on("click", ".ISSELChk", me, me.selCheckBoxToggleEvent);


        // 找到L區明細，後面加上按鈕
        let labelL = $(".ils-panelBar-header")[1].children[1];
        let stringButton =
            '&nbsp;<button id="btnCOPY" style="margin:3px" class="btn btn-success btn-sm">複製名單</button>' +
            '&nbsp;<button id="btnCOUNT" style="margin:3px" class="btn btn-success btn-sm">計算案件數量</button>'
        $(labelL).after(stringButton)

        $("#btnCOPY").click((e) => {
            me.doCopyorCount(e, '01');
        })

        $("#btnCOUNT").click((e) => {
            me.doCopyorCount(e, '02');
        })

        // 找到L區明細，後面加上按鈕
        let labelM = $(".ils-panelBar-header")[2].children[1];
        stringButton =
            '&nbsp;<button id="btnDELRATE" style="margin:3px" class="btn btn-danger btn-sm" disabled>清除比例設定</button>'
        $(labelM).after(stringButton)

        $("#btnDELRATE").click(() => {
            me.doDeleteRate();
        })


        /**
         * bind M 區 事件
         * */
        //【新增一筆】click 行為
        //$("#M_btnInsert").on("click", $.proxy(me.insertGrid, this));

        //M 區資料進入編輯模式時觸發行為
        //me.M1.bind('edit', function (e) {

        //    let model = e.model;
        //    let sender = e.container;
        //     console.log(model);
        //    if (sender.context != undefined) {
        //        let nowColnm = this.columns[sender.index()].field;  //* 目前欄位名稱
        //        let colIndex = sender.index();                      //* 目前在第幾欄
        //        nowColnm = this.columns[colIndex].field;            //* 目前欄位的Field
        //        console.log(model['ACTIONCD']);
        //        console.log(sender.context);
        //        switch (model['ACTIONCD']) {
        //            case 'I': //點擊的資料處於 新增 狀態
        //                if (model.isNew()) {//是否新資料

        //                }
        //                break;
        //            case 'U': //點擊的資料處於 編輯 狀態
        //                break;
        //            case 'D': //點擊的資料處於 刪除 狀態
        //                break;
        //        }
        //    }
        //});


        this.doSearch();
    }


    onGrid_BeforeInit(evt, gridOpt: ils.ui.GridOptions) {
        gridOpt.ShowColumnDel = false;  // 移除刪除欄位 

    }
    /**
     * 儲存前處理
     * 表單送出前 可在這另外再寫表單欄位檢查
     * @param e
     * @param evtArgs
     */
    bindSaveBeforePost(e, evtArgs: ils.mvc.QLEMEventArgs) {
        let me = this;
        let E: any = evtArgs.E;     // E區屬於獨立資料，所以可以直接拿物件屬性來取的資料
        let M: any[] = evtArgs.M;   // M區屬於列表型資料，所以會是以 Array 方式處理
        let rationSum: number = 0;

        // E區資料檢核
        if (E.ACTIONCD == 'U' || E.ACTIONCD == 'I') {
            //E.【欄位 Field】 = 欄位 Field 的值

            if ((E.LIST_NM).length == 0 || (E.PROD_KIND).length == 0 || (E.LIST_TYPE).length == 0 ||
                (E.CASEYEAR).length == 0 || (E.SPEC_TP).length == 0 || (E.LIST_PERIOD_START).length == 0 ||
                (E.LIST_PERIOD_END).length == 0 || (E.LIST_INTERVAL).length == 0 || (E.SETTLE_SRC).length == 0) {
                //停止後續發送表單行為
                evtArgs.isCancel = true;
                //顯示系統訊息
                me.MsgMgr.showComMsg(ils.mvc.MessageType.ValidError);
                //隱藏 loading 畫面
                me.hideLoading();
                return;
            }
        }


        // M區資料檢核(比例總和是否為100)
        for (var i = 0; i < M.length; i++) {
            let m = M[i];
            rationSum += Number(m.RATION)*10;
        }
        // console.log(rationSum);
        rationSum=rationSum/10
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

    /**
     * 儲存完成後
     * @param e
     * @param evtArgs
     */
    bindSaveAfterPost(e, evtArgs: ils.mvc.QLEMEventArgs) {

        if (evtArgs.isSuccess) {
            //console.log(evtArgs);
            //* 更新 L 區 Model 值
            evtArgs.List_BindData = {
                //* 於此設定要更新於L區的值，一定要輸入，否則 L 區資料不會做任何更新
                //欄位 Field: 值,
                LIST_NO: evtArgs.Result.d.E.LIST_NO,
                LIST_NM: evtArgs.Result.d.E.LIST_NM,
                PROD_KIND: evtArgs.Result.d.E.PROD_KIND,
                IS_SET_DEPT_RATE: evtArgs.Result.d.E.IS_SET_DEPT_RATE,
                TOTAL_AMOUNT: evtArgs.L.TOTAL_AMOUNT
            };
        }
    }

    /**
     * 查詢E區之後(點擊L區之後)
     * @param e
     * @param evtArgs
     */
    bindSearchEditAfter(e, evtArgs: ils.mvc.QLEMEventArgs) {
        let me = this;
        let dataL = evtArgs.L; //選中的L區資料
        // 讀取資料並勾選對應的CHK BOX
        me.setChkBox_Checked("SPEC_TP", "SpecTypes");
        me.setChkBox_Checked("CASEYEAR", "CaseYears", "selYear_All");
        me.setChkBox_Checked("LIST_TYPE", "ListTypes");
        me.setChkBox_Checked("SETTLE_SRC", "SettleSrc");

        //* 禁用元件
        //$('#E_txtLISTNO').prop("disabled", true);
        if (dataL.IS_SET_DEPT_RATE == '') {
            $('#btnDELRATE').attr('disabled', 'disabled');
        }
        else {
            $('#btnDELRATE').removeAttr('disabled');
        }
    }

    /**
     * 按下新增之後
     * @param e
     * @param evtArgs
     */
    bindInsertAfter(e, evtArgs: ils.mvc.QLEMEventArgs) {
        let me = this;
        me.setChkBox_RESET(); // 清空被選取的選項
    }

    /**
     * M 區 Schema
     * */
    GridMultiSchema(): ils.ui.GridColumn[] {

        return [
            {
                Title: "名單代號", Field: "LIST_NO", DataType: "string", Width: 100,
                ReadOnly: true, //ModelField_IsEdiable: false,
                Template: data => data["LIST_NO"] == null ? "" : data["LIST_NO"]
            },
            {
                Title: "部門名稱", Field: "OBDEPTNM", DataType: "string", Width: 160,
                ReadOnly: true, //ModelField_IsEdiable: false,
                Template: data => data["OBDEPTNM"] == null ? "" : data["OBDEPTNM"]
            },
            {
                Title: "部門代號", Field: "OBDEPTID", DataType: "string", Width: 160,
                ReadOnly: true, //ModelField_IsEdiable: false,
                Template: data => data["OBDEPTID"] == null ? "" : data["OBDEPTID"]
            },
            {
                Title: "比例", Field: "RATION", DataType: "int", Width: 160,
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

            //{
            //    Title: "生效日", Field: "STADT", DataType: "datetime", Width: 120,
            //    DefaultValue: new Date().getFullYear() + "/" + this.dteFill(new Date().getMonth() + 1) + "/" + this.dteFill(new Date().getDate()), //預設今天
            //    Template: data => data["STADT"] == null ? "" : data["STADT"].ToDateString("yyyy/MM/dd") || "",
            //    Editor: ils.GridEditor.TextBoxDate({
            //        min: new Date(2000, 0, 1),
            //        max: new Date(9999, 11, 31)
            //    })
            //},


        ];
    }

    /**
     * L 區 Schema
     * */
    GridListSchema(): ils.ui.GridColumn[] {
        return [
            {
                Title: "選取",
                Field: "SELECT",
                DataType: "varchar",
                Width: 50,
                ModelField_IsEdiable: false,
                //HeaderTemplate: '<a id="ISSELChk">選取</a></br>', //標頭
                //Template: `<div class=ISSELChk style=width:100%; cursor: default;><i class='fa fa-square-o fa-lg'></i></div>`,
                Template: data => this.renderChkBoxHtml(),
                Sortable: false//點 Title 是否可排序(預設true)
            },
            {
                Title: "名單代號", Field: "LIST_NO", DataType: "varchar", Width: 100,
                Template: data => data["LIST_NO"] != null ? data["LIST_NO"] : '',
            },
            {
                Title: "產品類別", Field: "PROD_KIND", DataType: "varchar", Width: 100,
                Template: data => Common.GetCodeName(data["PROD_KIND"], ils.project.GetCOMDs("DsPROD_TYPE")) || ""
            },
            {
                Title: "名單名稱", Field: "LIST_NM", DataType: "varchar", Width: 200,
                Template: data => data["LIST_NM"] != null ? data["LIST_NM"] : '',
            },
            {
                Title: "總件數", Field: "TOTAL_AMOUNT", DataType: "varchar", Width: 100,
                Template: data => data["TOTAL_AMOUNT"] != null ? data["TOTAL_AMOUNT"] : '',
            },
            {
                Title: "部門比例設定", Field: "IS_SET_DEPT_RATE", DataType: "varchar", Width: 100,
                Template: data => data["IS_SET_DEPT_RATE"] != null ? data["IS_SET_DEPT_RATE"] : '',
            },
        ];
    }

    /**
     * M 區新增一筆
     * @param e
     */
    //insertGrid(e) {
    //    let me = this;
    //    me.MsgMgr.hideMessage();

    //    //檢查 E 區必填欄位是否必填
    //    if (!me.E1.Validator.validate("Save")) {
    //        me.MsgMgr.showComMsg(ils.mvc.MessageType.ValidError);
    //        return;
    //    }

    //    //* 禁用元件
    //    $('#E_txtLISTNO').prop("disabled", true);
    //    $('#E_txtLISTNM').prop("disabled", true);

    //    //M 區新增一筆空資料(參考GTM1040)
    //    me.M1.addRow();
    //    let row = $(me.M1.tbody).find("tr").first();
    //    let M1data = me.M1.dataItem(row);
    //    let E1data = me.E1.Data;

    //    //使用E區資料賦值
    //    //M1data.set("DATAID", E1data.get("DATAID"));
    //    //M1data.set("MNAME", E1data.get("MNAME"));

    //    me.M1.refresh();
    //}

    ////自定義顯示範例
    //TextBoxEditorEMPNO() {
    //    let me = this;
    //    return {
    //        Type: ils.ui.EditorType.Custom,
    //        GridEditor: () => function (container, options) {
    //            let model = options.model; //選到該列的內容
    //            let val = model[options.field] || "";//選到欄位的值
    //            let field = options.field  // 選到該欄的欄位名稱
    //            /**
    //             * 可以自己寫出一個 DOM，來把資料 appendTo 到這個 DOM 裡顯示
    //             * 因為 DOM 是自己寫，所有的設定也都必須自己寫上
    //             * DOM 可以是任何有頭尾標籤的 HTML 標籤，不一定要用表單元件，如: span、div
    //             **/
    //            $('<textarea/>')
    //                //設定 DOM 屬性
    //                .addClass("k-textbox form-control ils-upper")
    //                .attr("rows", "3")
    //                .attr("id", "M_txt" + options.field)
    //                .attr("maxlength", 50)
    //                .css("resize", "none")
    //                //bind 資料 Model 
    //                .attr("data-bind", "value:" + options.field)
    //                .appendTo(container);
    //        }
    //    };
    //}

    // E區選項選取事件
    eventChecked(event) {
        let data = event.data; // { me: me, chkNM:checkbox的name屬性, fieldNM:繫結資料庫欄位的名字, selALL:全選選項的id }
        //console.log(data);
        let me = data.me;
        let selectedValue = '';
        let chkboxChecked = $(`input[name="${data.chkNM}"]:checked`) // 勾取的chkboxs

        // 串要存回資料庫的字串，以$$隔開
        chkboxChecked.each(function (index, item) {
            selectedValue += `${$(item).val()}$$`
        })
        selectedValue = selectedValue.slice(0, selectedValue.length - 2) // 刪除最後的$$符號
        //console.log(selectedValue);
        me.E1.Data.set(data.fieldNM, selectedValue)

        // 有設全選的話
        if (typeof (data.selALL) != 'undefined') {
            let checks = $(`input[name="${data.chkNM}"]`); // 所有選項
            // 所有選項數量==選取數量
            if (checks.length == chkboxChecked.length) {
                $(`#${data.selALL}`).prop("checked", true);
            }
            else {
                $(`#${data.selALL}`).prop("checked", false);
            }
        }
    }

    // E區選項全選
    eventChecked_All(event) {
        let data = event.data; // { me: me, chkNM:checkbox的name屬性, fieldNM:繫結資料庫欄位的名字 }
        //console.log(data);
        let me = data.me;
        let selectedValue = '';
        let checks = $(`input[name="${data.chkNM}"]`) // 所有選項
        let chkboxChecked = $(`input[name="${data.chkNM}"]:checked`) // 勾取的chkboxs

        // 選項數量==選取數量
        if (checks.length == chkboxChecked.length) {

            checks.each(function (index, item) {
                $(item).prop("checked", false);         
            })
            selectedValue = '';
            me.E1.Data.set(data.fieldNM, selectedValue)
        }
        else {

            checks.each(function (index, item) {
                $(item).prop("checked", true);
                selectedValue += `${$(item).val()}$$`;  // 串要存回資料庫的字串，以$$隔開

            })
            selectedValue = selectedValue.slice(0, selectedValue.length - 2) // 刪除最後的$$符號
            me.E1.Data.set(data.fieldNM, selectedValue)
        }

    }

    // E區生成專案類別CheckBox
    renderChk_SPEC() {
        let me = this;
        $.ilsPost("GetSPEC_TPE", {},
            function (isSuccess, rlt, err) {
                if (isSuccess) {
                    //me.MsgMgr.showMessage("執行成功。", false);
                    let spec_TPE = rlt[0].Items; //取得下拉選單的選項
                    let htmlstr = '';
                    spec_TPE.forEach(function (item) {
                        htmlstr += `<label class="form-selectgroup-item">` +
                            `<input type="checkbox" name="SpecTypes" value="${item.value}" class="form-selectgroup-input chkSPEC">` +
                            `<span class="form-selectgroup-label">${item.text}</span></label>`
                    })
                    //console.log(spec_TPE)
                    //console.log(htmlstr);
                    $("#divSPEC_CHK").html(htmlstr);
                }
                else {
                    me.MsgMgr.showErroMessage("專案類選項別讀取失敗，請洽系統人員");
                }
            }
        )
    }

    // E區生成名單類型CheckBox
    renderChk_CASESTATUS() {
        let me = this;
        $.ilsPost("GetCASE_STATUS", {},
            function (isSuccess, rlt, err) {
                if (isSuccess) {
                    //me.MsgMgr.showMessage("執行成功。", false);
                    //console.log(rlt);
                    let htmlstr = '';
                    rlt.forEach(function (item) {
                        htmlstr += `<label class="form-selectgroup-item">` +
                            `<input type="checkbox" name="ListTypes" value="${item.value}" class="form-selectgroup-input chkLISTTYPE">` +
                            `<span class="form-selectgroup-label">${item.text}</span></label>`
                    })
                    $("#divLISTTYPE_CHK").html(htmlstr);
                }
                else {
                    me.MsgMgr.showErroMessage("名單類型選項讀取失敗，請洽系統人員");
                }
            }
        )
    }

    // E區 CheckBox繫結L區資料選取
    setChkBox_Checked(fieldNM: string, chkBoxNM: string, selAll: string ='undefined') {
        let fieldVal = this.E1.Data.get(fieldNM);
        let arrFieldVal = fieldVal.split('$$'); // SPEC_TP轉為數值陣列
        let checkBoxs = $(`input[name="${chkBoxNM}"]`); // 選取SPEC_TP CheckBox DOM
        checkBoxs.each(function (index, item) {
            let chkbox = $(item);
            if (arrFieldVal.includes(chkbox.val())) {
                chkbox.prop("checked", true);
            }
            else {
                chkbox.prop("checked", false);
            }
        })

        // 有設全選的話
        if (selAll != 'undefined') {
            let chkboxChecked = $(`input[name="${chkBoxNM}"]:checked`); // 所有選項
            // 所有選項數量==選取數量
            if (checkBoxs.length == chkboxChecked.length) {
                $(`#${selAll}`).prop("checked", true);
            }
            else {
                $(`#${selAll}`).prop("checked", false);
            }
        }
    }

    // E區 清空ChkBox勾選狀態
    setChkBox_RESET() {
        let checkBoxs = $(`input[type="checkbox"]`);
        checkBoxs.each(function (index, item) {
            $(item).prop("checked", false);
        })
    }

    // 產生L區選取CHECKBOX之HTML
    renderChkBoxHtml() {
        let html = `<div class=ISSELChk style=width:100%; cursor: default;><i class='fa fa-square-o fa-lg'></i></div>`;
        return html;

    }

    // 切換L區CHECKBOX之HTML
    changeChkBoxHtml(isSelect) {
        let html;
        html = (isSelect == "Y")
            ? "<i class='fa fa-check fa-lg' style='color:red' ></i>"
            : "<i class='fa fa-square-o fa-lg'></i>";
        return `<div class=ISSELChk style=width:100%; cursor: default;>${html}</div>`;
    }

    // L區CheckBox切換事件
    selCheckBoxToggleEvent(event) {
        let elem = $(event.target); // <div class=ISSELChk>
        let grid = $(elem).parents("div[data-role='grid']").data("ilsGrid"); // M1Grid
        let cell = elem.closest("td"); // 該td DOM
        let tr = elem.closest("tr");  // 該tr DOM
        let data = grid.dataItem(tr); // 取得該tr的資料
        let me = event.data; // OBZ020

        let isSelect = data["SELECT"];

        // 狀態切換
        isSelect = isSelect == "Y" ? "N" : "Y";

        // 更新CHK顯示
        cell.html(me.changeChkBoxHtml(isSelect));

        // SELECT欄位賦值
        data["SELECT"] = isSelect;

        //if (isSelect == "Y") {
        //    data["ACTIONCD"] = "U";
        //}
        //else {
        //    data["ACTIONCD"] = "";
        //}
        //清空所有值
        elem = cell = data = grid = tr = isSelect = undefined;
    }

    // 名單取消或複製事件
    doCopyorCount(e, flag) {  //flag: 01:COPY, else:COUNT
        e.stopPropagation(); // 取消冒泡事件
        let me = this;
        let actionNM = flag == '01' ? 'DoCopy' : 'DoCount';
        let L1data = me.L1.dataSource.data().toJSON();
        let L1check = L1data.filter(e => e["SELECT"] == 'Y'); // 抓L區有打勾的資料
        if (L1check.length == 0) {
            me.MsgMgr.showErroMessage("請先勾選名單", false);
            return;
        }
        me.MsgMgr.hideMessage();
        me.showLoading();
        $.ilsPost(`${actionNM}`, L1check,
            function (isSuccess, result, err) {
                me.hideLoading();
                if (isSuccess) {
                    //console.log(result);
                    let dt = result.d || {};  //回傳的結果
                    let msg: ils.mvc.ILSMessage = result.s; //訊息
                    let message = msg.Message || "";
                    if (msg.IsSuccess) { //如果成功
                        me.MsgMgr.showMessage("執行成功。", false);
                        me.Q1.Data.set("I_CHR_YEARMONTH", "");
                        me.doSearch();
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

    // 刪除部門比例設定
    doDeleteRate() {
        let me = this;
        let E1data = me.E1.Data.toJSON();
        me.MsgMgr.hideMessage();
        me.showLoading();
        $.ilsPost('DoDeleteRate', E1data,
            function (isSuccess, result, err) {
                me.hideLoading();
                if (isSuccess) {
                    //console.log(result);
                    let dt = result.d || {};
                    let msg: ils.mvc.ILSMessage = result.s;
                    let message = msg.Message || "";
                    if (msg.IsSuccess) {
                        let L1selected = me.L1.select();
                        if (L1selected != null) {
                            me.doSearchL1(me.L1.dataItem(L1selected));
                            $(L1selected).children('td').last().text('');

                        }
                        //me.MsgMgr.showMessage(`執行成功，刪除名單"${E1data["LIST_NO"]}"部門比例設定`, false);
                        //me.M1.BindData(dt.Table);
                        //me.L1.dataItem(L1selected).set('IS_SET_DEPT_RATE', '');

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


    doSearchL1(data) {
        let me = this;
        if (data == null) {
            return;
        }
        let L1data = data.toJSON();

        me.MsgMgr.hideMessage();
        me.showLoading();
        $.ilsPost('SearchDetail', L1data,
            function (isSuccess, result, err) {
                me.hideLoading();
                if (isSuccess) {
                    //console.log(result);
                    let dt = result.d || {};
                    let msg: ils.mvc.ILSMessage = result.s;
                    let message = msg.Message || "";
                    if (msg.IsSuccess) {
                        me.MsgMgr.showMessage(`執行成功，刪除名單"${L1data["LIST_NO"]}"部門比例設定`, false);
                        me.M1.BindData(result.d.M);

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
        return ((date < 10 ? '0' : '') + date);
    }
}
ils.app(new OBZ020);

//日期校正(補0)
