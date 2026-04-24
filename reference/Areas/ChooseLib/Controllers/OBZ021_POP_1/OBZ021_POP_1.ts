class OBZ021_POP_1 extends ils.mvc.BaseView {
    constructor() {
        super();
    }
    static ME: OBZ021_POP_1;
    M1: ils.ui.Grid;

    Init(args: any) {
        super.Init(args);
        OBZ021_POP_1.ME = this;
        let me = this;

        // 隱藏版面
        $('#ILS_UI_ToolBar').hide();
        $('#ILS_UI_TitleInfo').hide();
        $('.ils-panelBar-header').hide();
        $('.ils-body-content').css("padding-top", 15);
        $('.ils-body-content').removeClass("ils-body-content");
        $('#panelbar').removeClass("ils-panelBar");
        $('#ILS_UI_PanQuery').css("padding", "0px");
        $('#panelbar').hide();
        $("#panelbar").next("div").hide();
        $('#panelbar').parent("div").css("padding-top", "0px");
        $('.ils-msg-btn').hide();

        $("#btn_import").click(() => { me.doImport(me.doClose); });
        $("#btn_close").click(() => { me.doClose(); });

        return me;
    }


    /**
     * EXCEL匯入  
     */
    doImport(callback) {
        let me = this;

        //* 組成傳到後端的資料
        let fileInput = $("#Q_txtFile").prop("files")[0]; // 取得upload檔案    
        if (fileInput == undefined) {
            return;
        }

        let formdata = new FormData();
        formdata.append("FileUpload", fileInput);

        me.showLoading();
        me.MsgMgr.hideMessage();
        (<POP_Parent>parent).ilsApp.hideMessage();

        $.ajax({
            type: "POST",
            url: "ImportExcel",
            data: formdata,
            dataType: 'json',
            contentType: false, // 告訴jQuery不要去處理發送的數據
            processData: false, // 告訴jQuery不要去設置Content-Type請求
            success: function (rlt) {
                //console.log(rlt)
                let msg = rlt.s;
                let dt = rlt.d || {};
                if (msg["IsSuccess"]) {
                    // 將回傳資料bind回父視窗M區
                    (<POP_Parent>parent).ilsApp.M1.BindData(dt);
                    //(<POP_Parent>parent).ilsApp.MsgMgr.showMessage("執行成功!");

                    // 父視窗UI調整
                    (<POP_Parent>parent).$("#btnInsertAll").removeAttr("disabled");
                    (<POP_Parent>parent).ilsApp.ToolBar.hide("#ils_toolBar_btnSave");
                    (<POP_Parent>parent).ilsApp.ToolBar.hide("#ils_toolBar_btnSearch");
                    (<POP_Parent>parent).ilsApp.ToolBar.hide("#ils_toolBar_btnInsert");
                    //(<POP_Parent>parent).$("#ils_toolBar_btnSave").addClass("k-state-disabled");
                    //(<POP_Parent>parent).$("#ils_toolBar_btnSave").click((e) => { e.stopPropagation();});
                    (<POP_Parent>parent).$("#ILS_UI_PanQuery").slideUp("fast");
                    //(<POP_Parent>parent).ilsApp.M1.hideColumn(1);
                    //(<POP_Parent>parent).$("#btnRESET").attr("disabled", "disabled");
                    //(<POP_Parent>parent).$("#btnRESETALL").removeAttr("disabled");
                    //(<POP_Parent>parent).$("#Q_ddlCOMPID").data('ilsDropDownList').enable(false);


                    if (callback) callback();
                } else {
                    me.MsgMgr.showErroMessage(msg["Message"]);
                }
                me.hideLoading();
            },
            error: function (error) {
                me.MsgMgr.showErroMessageInfo(18);
                me.hideLoading();
            }
        });
    }

    // 關閉開窗
    doClose() {
        (<POP_Parent>parent).$("#OBZ021_POP_1").data("kendoWindow").close();
    }
}
ils.app(new OBZ021_POP_1());