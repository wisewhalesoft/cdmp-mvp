# M02 計分設定 — Dev 環境手動 Seed 指南

## 背景

`npm run dev` 啟動的 SQLite in-memory（DB_TYPE=sqlite）或 PostgreSQL 容器（DB_TYPE=postgres）DB
每次重啟資料清空。為了讓 dev 環境能跑 happy-path 流程，需手動 seed：

1. PROD_KIND 代碼（ob_code_df）
2. 至少一個 CARD_TYPE active 紀錄（ob_card_type）
3. 對應的 v1 計分版本（ob_levelcard_version）— F070 POST 會自動建立

## 流程

### 1. 取得 Sales Manager Token

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@cdmp.test","password":"P@ssw0rd123"}' \
  | jq -r .token
```

### 2. Seed PROD_KIND 代碼（3 筆：01 汽車 / 02 機車 / 03 一般商品）

```bash
TOKEN=<上一步取得的 token>

for code in '01:汽車' '02:機車' '03:一般商品'; do
  CD=$(echo $code|cut -d: -f1)
  NAME=$(echo $code|cut -d: -f2)
  curl -s -X POST http://localhost:3000/api/v1/assignment/codes \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"tblId\":\"PROD_KIND\",\"tblCd\":\"$CD\",\"tblDesc1\":\"$NAME\",\"stadt\":\"20000101\",\"enddt\":\"20991231\"}"
  echo
done
```

### 3. Seed 6 個正規 CARD_TYPE（H/S/E/S5/E5/M）

```bash
for entry in 'H:期中:01' 'S:中結:01' 'E:滿期:01' 'S5:中結5年:01' 'E5:滿期5年:01' 'M:機車:02'; do
  CT=$(echo $entry|cut -d: -f1)
  NAME=$(echo $entry|cut -d: -f2)
  PK=$(echo $entry|cut -d: -f3)
  curl -s -X POST http://localhost:3000/api/v1/assignment/scoring/card-types \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"cardType\":\"$CT\",\"cardName\":\"$NAME\",\"prodKind\":\"$PK\"}"
  echo
done
```

### 4. 確認 seed 成功

```bash
curl -s "http://localhost:3000/api/v1/assignment/scoring/card-types" \
  -H "Authorization: Bearer $TOKEN" | jq
```

預期回傳 6 筆 active cardTypes。

## 注意

- 此檔僅供 dev 環境手動使用；不對應任何 production migration
- e2e fixture 不依賴此 seed（各 e2e spec 自行 seed）
- 若使用 PostgreSQL container，請先確認 migration（1711360000160~1711360000164）已執行
  以正確建立 ob_card_type 表 + extended ob_levelcard_version.created_by length=50
- OPEN-H 修補後（migration 1711360000164），PostgreSQL 接受 36-char UUID 作為 created_by
