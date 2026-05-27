import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m294 / F076 v1.6 — 修正 prod_kind option 標籤對齊 OBMCODEDF dump
 *
 * Root cause：m22（SeedPooldataFieldWhitelist1711360000220）seed `prod_kind` 三筆
 *   option 時標籤與來源碼表不一致：
 *     - 01 → '汽車新車'（誤；'新車' 實為 OBMCODEDF TBL_ID='02' code 01，與 01 大類混用）
 *     - 03 → '其他商品'（誤）
 *
 * 來源權威（reference/DumpData/OBMCODEDF_20260505.csv，TBL_ID='01' 產品大類）：
 *     - OB,01,01,汽車
 *     - OB,01,02,機車
 *     - OB,01,03,一般商品
 *   旁證：OBMLISTDF dump 中 PROD_KIND='01' 之名單含「他新中古」（新車+中古），
 *   證明 01=整個汽車類而非新車；前端 card-type.ts PROD_KIND_STYLES / m285 測試
 *   fixture 亦皆以 '汽車' / '一般商品' 為 canonical。
 *
 * 影響面（此份 option 為 PROD_KIND 雙重角色之單一 SSOT）：
 *   - 計分卡（card-type.service join pooldata_field_option 取 prodKindName 顯示 badge）
 *   - 名單篩選 dropdown（F076 options-tab / Stage 0 試算 prod_kind 條件）
 *   兩處皆讀 option_label，修正後 UI 顯示「汽車 / 一般商品」。
 *
 * 行為（純資料修正，不新增表/欄位/選項；02 機車不動）：
 *   - up()  ：UPDATE option_label  01→'汽車'、03→'一般商品'
 *   - down()：還原為 m22 原值        01→'汽車新車'、03→'其他商品'（可逆）
 *
 * 特性：
 *   - 冪等：UPDATE WHERE column_name='prod_kind' AND option_value IN ('01','03')；
 *     重複執行無害（已為新值時 affected 可能為 0）
 *   - 最小影響：WHERE 精準限定 prod_kind 之 01/03；其他欄位/選項一律不動
 *   - 非 schema 變更（純 UPDATE），SQLite e2e 環境亦可正常執行
 *
 * 為何用新 migration 而非改 m22：m22 已於既有環境執行，原地改不會重跑；
 *   沿用本 repo 既有 seed 修正慣例（m280 realign / m283 upsert / m284 seed）。
 *
 * 對應 test spec：TS-F076-MIG-294-001 ~ 004
 */
export class FixProdKindOptionLabels1711360000294 implements MigrationInterface {
  name = 'FixProdKindOptionLabels1711360000294';

  /** OBMCODEDF TBL_ID='01' canonical 標籤（up 目標值 / down 還原 m22 誤值） */
  private static readonly LABEL_FIX: ReadonlyArray<{
    option_value: string;
    correct: string;
    legacy: string;
  }> = [
    { option_value: '01', correct: '汽車', legacy: '汽車新車' },
    { option_value: '03', correct: '一般商品', legacy: '其他商品' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const r of FixProdKindOptionLabels1711360000294.LABEL_FIX) {
      await queryRunner.query(
        `UPDATE pooldata_field_option
            SET option_label = '${r.correct}', updated_at = CURRENT_TIMESTAMP
          WHERE column_name = 'prod_kind' AND option_value = '${r.option_value}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const r of FixProdKindOptionLabels1711360000294.LABEL_FIX) {
      await queryRunner.query(
        `UPDATE pooldata_field_option
            SET option_label = '${r.legacy}', updated_at = CURRENT_TIMESTAMP
          WHERE column_name = 'prod_kind' AND option_value = '${r.option_value}'`,
      );
    }
  }
}
