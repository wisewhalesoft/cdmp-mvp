# US-072：查看計分維度設定

> **Story ID**：US-072
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** 業務主管
**I want** 查看目前生效的計分維度設定清單
**So that** 了解系統如何替客戶評分，並評估是否需要調整維度權重或分數

---

## 驗收標準

### AC-1：顯示當前計分版本的維度清單

- **Given** 業務主管已進入計分設定頁面
- **When** 頁面載入完成
- **Then** 顯示目前生效版本（OBLEVELCARD_VERSION 中 status = 'active'）的所有計分維度，每列包含：維度編號、維度名稱、維度欄位（來源欄位）、各區間分數設定摘要
- **And** 清單依維度編號升序排列

### AC-2：顯示版本資訊

- **Given** 計分維度清單已顯示
- **When** 業務主管查看頁面頂部
- **Then** 顯示目前生效版本的版本號、建立日期、建立者、備註說明

### AC-3：查看維度詳細分數表

- **Given** 計分維度清單已顯示
- **When** 業務主管點擊某一維度列
- **Then** 展開詳細分數表，顯示各分數區間的條件值與對應分數（來源：OBLEVELCARD_SCORE）

---

## 技術備註

- 計分版本管理：`reference/TableSchema/OB/OBLEVELCARD_VERSION.sql`
- 計分維度定義：`reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql`
- 計分分數設定：`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`
- 此頁面為唯讀查看；修改操作由 US-073 處理

---

## 測試案例

### TC-072-01：正常顯示生效版本維度

- **Given**：OBLEVELCARD_VERSION 中有一筆 status = 'active' 的版本，含 8 個維度
- **When**：業務主管進入計分設定頁面
- **Then**：顯示 8 個維度列，版本資訊顯示於頁面頂部

### TC-072-02：展開維度分數詳情

- **Given**：維度「帳齡」有 4 個分數區間
- **When**：業務主管點擊「帳齡」列
- **Then**：展開顯示 4 個區間，含區間條件與對應分數

### TC-072-03：無生效版本的提示

- **Given**：OBLEVELCARD_VERSION 無 status = 'active' 的版本
- **When**：頁面載入
- **Then**：顯示警示：「目前無生效的計分版本，請聯繫 IT 確認設定」

---

## 依賴關係

- **Blocked By**：US-001（登入驗證）
- **Blocks**：US-073（編輯計分維度需先知道現有設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-073（編輯計分維度）、US-074（編輯 CARD_LEVEL 門檻）
- **Reference**：`reference/TableSchema/OB/OBLEVELCARD_VERSION.sql`、`reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql`、`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`
