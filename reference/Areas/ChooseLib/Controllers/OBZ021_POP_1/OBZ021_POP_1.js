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
var OBZ021_POP_1 = /** @class */ (function (_super) {
    __extends(OBZ021_POP_1, _super);
    function OBZ021_POP_1() {
        return _super.call(this) || this;
    }
    OBZ021_POP_1.prototype.Init = function (args) {
        _super.prototype.Init.call(this, args);
        OBZ021_POP_1.ME = this;
        var me = this;
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
        $("#btn_import").click(function () { me.doImport(me.doClose); });
        $("#btn_close").click(function () { me.doClose(); });
        return me;
    };
    /**
     * EXCEL匯入
     */
    OBZ021_POP_1.prototype.doImport = function (callback) {
        var me = this;
        //* 組成傳到後端的資料
        var fileInput = $("#Q_txtFile").prop("files")[0]; // 取得upload檔案    
        if (fileInput == undefined) {
            return;
        }
        var formdata = new FormData();
        formdata.append("FileUpload", fileInput);
        me.showLoading();
        me.MsgMgr.hideMessage();
        parent.ilsApp.hideMessage();
        $.ajax({
            type: "POST",
            url: "ImportExcel",
            data: formdata,
            dataType: 'json',
            contentType: false,
            processData: false,
            success: function (rlt) {
                //console.log(rlt)
                var msg = rlt.s;
                var dt = rlt.d || {};
                if (msg["IsSuccess"]) {
                    // 將回傳資料bind回父視窗M區
                    parent.ilsApp.M1.BindData(dt);
                    //(<POP_Parent>parent).ilsApp.MsgMgr.showMessage("執行成功!");
                    // 父視窗UI調整
                    parent.$("#btnInsertAll").removeAttr("disabled");
                    parent.ilsApp.ToolBar.hide("#ils_toolBar_btnSave");
                    parent.ilsApp.ToolBar.hide("#ils_toolBar_btnSearch");
                    parent.ilsApp.ToolBar.hide("#ils_toolBar_btnInsert");
                    //(<POP_Parent>parent).$("#ils_toolBar_btnSave").addClass("k-state-disabled");
                    //(<POP_Parent>parent).$("#ils_toolBar_btnSave").click((e) => { e.stopPropagation();});
                    parent.$("#ILS_UI_PanQuery").slideUp("fast");
                    //(<POP_Parent>parent).ilsApp.M1.hideColumn(1);
                    //(<POP_Parent>parent).$("#btnRESET").attr("disabled", "disabled");
                    //(<POP_Parent>parent).$("#btnRESETALL").removeAttr("disabled");
                    //(<POP_Parent>parent).$("#Q_ddlCOMPID").data('ilsDropDownList').enable(false);
                    if (callback)
                        callback();
                }
                else {
                    me.MsgMgr.showErroMessage(msg["Message"]);
                }
                me.hideLoading();
            },
            error: function (error) {
                me.MsgMgr.showErroMessageInfo(18);
                me.hideLoading();
            }
        });
    };
    // 關閉開窗
    OBZ021_POP_1.prototype.doClose = function () {
        parent.$("#OBZ021_POP_1").data("kendoWindow").close();
    };
    return OBZ021_POP_1;
}(ils.mvc.BaseView));
ils.app(new OBZ021_POP_1());
//# sourceMappingURL=OBZ021_POP_1.js.map