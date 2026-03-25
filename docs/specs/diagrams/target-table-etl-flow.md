# 目標表 ETL 轉換流程

> 說明：customer_core 目標表的 ETL 資料流，展示從兩個來源系統經過轉換規則後載入目標表的流程。

```mermaid
flowchart LR
    subgraph Sources["來源系統"]
        ZZIP["ZZIP_BAMCUST_M\n（核心系統客戶主檔）"]
        MLMC["MLMCUSTOMER\n（行銷/租賃系統客戶主檔）"]
    end

    subgraph Extract["Extract 節點"]
        E1["讀取 ZZIP raw data"]
        E2["讀取 MLMC raw data"]
    end

    subgraph Transform["Transform 節點"]
        T1["客戶類型對應\nMLMC: 1→01, 2→02"]
        T2["電話合併\n區碼-號碼\n佔位值→NULL"]
        T3["代碼描述轉換\nUS-030 對照表"]
        T4["資本額型別轉換\nvarchar→DECIMAL"]
        T5["衝突解決\nsource_updated_at\n較新者為準"]
    end

    subgraph Load["Load 節點"]
        L1["UPSERT customer_core\n（以 customer_id 為主鍵）"]
        L2["自動填充 ETL 追蹤欄位\ndata_source\n_etl_loaded_at\n_etl_pipeline_id"]
    end

    subgraph Target["目標表"]
        CC["customer_core\n約 45 欄位 / 8 分類"]
    end

    ZZIP --> E1
    MLMC --> E2
    E1 --> T1
    E2 --> T1
    T1 --> T2
    T2 --> T3
    T3 --> T4
    T4 --> T5
    T5 --> L1
    L1 --> L2
    L2 --> CC
```

## 來源關聯

兩系統以身分證字號/統一編號作為共同鍵：

- ZZIP.CUSTO_NO = MLMC.CUSTID

## 欄位分類

| 分類 | 欄位數 | 主要來源 |
|------|--------|---------|
| A. 識別與分類 | 5 | ZZIP + MLMC |
| B. 個人屬性 | 5 | ZZIP |
| C. 聯絡資訊 | 6 | ZZIP + MLMC |
| D. 地址 | 6 | ZZIP + MLMC |
| E. 職業與就業 | 10 | ZZIP + MLMC |
| F. 財務與風控 | 10 | ZZIP + MLMC |
| G. 企業客戶專屬 | 7 | MLMC |
| H. 稽核與 ETL 追蹤 | 5 | ZZIP + MLMC + ETL 自動 |

**相關功能**：[F036](../features/F036-target-tables.md)
