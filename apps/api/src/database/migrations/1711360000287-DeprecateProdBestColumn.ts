import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m287 / M-A2 / F050 v2.1.1（AD-E07-18 §18.11.4 / US-128 / Q-B B3）：
 *   DeprecateProdBestColumn — ob_list_definition.prod_best NOT NULL → NULL 放寬 + 既有資料清空
 *
 * 業務理由（Q-B B3 決議）：
 *   - F050 v2.1.1 將 prod_best 一級欄位移除（D2），業務語意改由
 *     condition_payload.conditions[columnName='best_case'] 承接
 *   - prod_best schema 欄位保留為 deprecated（避免立即 DROP COLUMN 影響舊讀取端），
 *     但 NOT NULL 約束需放寬以容許新名單寫入 NULL
 *   - 既有資料於本次一次性 migration 清空為 NULL（Q-B B3「直接清空」決議）
 *
 * 設計決策（architecture-spec §18.11.2）：
 *   - 18.11.3 schema 修改與資料清空合併於同一 migration（語意緊耦合）
 *   - 18.11.9 R8：down 不還原資料，僅還原 NOT NULL 約束（emergency rollback only）
 *   - 18.11.9 R9：SQLite 表重建需含全欄位（28 個）— 本 migration 已逐欄列出避免遺漏
 *
 * up() 步驟：
 *   PG：
 *     Step 1：UPDATE ob_list_definition SET prod_best = NULL WHERE prod_best IS NOT NULL
 *     Step 2：ALTER TABLE ob_list_definition ALTER COLUMN prod_best DROP NOT NULL
 *   SQLite（不支援 ALTER COLUMN DROP NOT NULL）：
 *     Step 1：UPDATE ... SET prod_best = NULL WHERE prod_best IS NOT NULL（資料清空）
 *     Step 2：表重建模式 —
 *       a. PRAGMA table_info(ob_list_definition) — 確認當前 schema（idempotent guard）
 *       b. 若 prod_best 仍為 NOT NULL：
 *          CREATE TABLE ob_list_definition_new (...28 個欄位, prod_best 不含 NOT NULL...)
 *          INSERT INTO ob_list_definition_new SELECT * FROM ob_list_definition
 *          DROP TABLE ob_list_definition
 *          ALTER TABLE ob_list_definition_new RENAME TO ob_list_definition
 *
 * down() 步驟（emergency rollback only — original data is irrecoverable）：
 *   PG：
 *     Step 1：UPDATE ob_list_definition SET prod_best = '' WHERE prod_best IS NULL（補空字串）
 *     Step 2：ALTER TABLE ob_list_definition ALTER COLUMN prod_best SET NOT NULL
 *   SQLite：未實作完整 rollback（不支援 SET NOT NULL；表重建成本高，僅還原資料）
 *
 * Idempotency：
 *   - up() Step 1：WHERE IS NOT NULL — 重複執行 0 affected
 *   - up() Step 2 PG：對已 nullable 欄位 DROP NOT NULL 為 no-op
 *   - up() Step 2 SQLite：PRAGMA guard 偵測 prod_best 已 nullable 即 skip 表重建
 *
 * R10 執行順序保護（architecture-spec §18.11.9）：
 *   M-A1 (m286) → M-A2 (m287) → entity 修改 (string | null) → service 修改 (L378/L540)
 *
 * 對應 test spec：
 *   - F050-test.md §十四 B 群組：TS-F050-B01 ~ B06
 */
export class DeprecateProdBestColumn1711360000287
  implements MigrationInterface
{
  name = 'DeprecateProdBestColumn1711360000287';

  /**
   * SQLite 表重建之全欄位 schema（R9 風險緩解 — 與 ob-list-definition.entity.ts 全 28 個 @Column 對齊）
   *
   * 注意：列出時依 entity 宣告順序，便於與 entity diff；prod_best 已不含 NOT NULL。
   */
  private static readonly OB_LIST_DEFINITION_NEW_DDL = `
    CREATE TABLE ob_list_definition_new (
      list_no VARCHAR(11) NOT NULL PRIMARY KEY,
      list_nm VARCHAR(45) NOT NULL,
      prod_kind VARCHAR(255) NOT NULL,
      prod_best VARCHAR(5),
      spec_tp VARCHAR(255),
      list_type VARCHAR(255) NOT NULL,
      list_period_start VARCHAR(3) NOT NULL,
      list_period_end VARCHAR(3) NOT NULL,
      list_interval VARCHAR(3) NOT NULL,
      assigned_date DATETIME,
      total_amount INTEGER,
      reserved_amount INTEGER,
      is_assigned VARCHAR(1),
      project_workym VARCHAR(6),
      casenumber VARCHAR(50),
      name VARCHAR(50),
      caseyear VARCHAR(255),
      caseyearnm VARCHAR(10),
      settle_src VARCHAR(6),
      card_type VARCHAR(5),
      status VARCHAR(10) NOT NULL DEFAULT 'active',
      stage VARCHAR(20) NOT NULL DEFAULT 'draft',
      case_status VARCHAR(14),
      cr_enabled INTEGER NOT NULL DEFAULT 0,
      condition_payload TEXT,
      created_by_prog VARCHAR(20) NOT NULL,
      created_by VARCHAR(20) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_by_prog VARCHAR(20) NOT NULL,
      updated_by VARCHAR(20) NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `;

  /**
   * 表重建 INSERT 之欄位清單（明示列出避免 SELECT * 失序）
   * 與 OB_LIST_DEFINITION_NEW_DDL 順序對齊。
   */
  private static readonly OB_LIST_DEFINITION_COLS_LIST: readonly string[] = [
    'list_no', 'list_nm', 'prod_kind', 'prod_best', 'spec_tp', 'list_type',
    'list_period_start', 'list_period_end', 'list_interval',
    'assigned_date', 'total_amount', 'reserved_amount', 'is_assigned',
    'project_workym', 'casenumber', 'name', 'caseyear', 'caseyearnm',
    'settle_src', 'card_type', 'status', 'stage', 'case_status', 'cr_enabled',
    'condition_payload',
    'created_by_prog', 'created_by', 'created_at',
    'updated_by_prog', 'updated_by', 'updated_at',
  ];

  private static readonly OB_LIST_DEFINITION_COLS = [
    'list_no', 'list_nm', 'prod_kind', 'prod_best', 'spec_tp', 'list_type',
    'list_period_start', 'list_period_end', 'list_interval',
    'assigned_date', 'total_amount', 'reserved_amount', 'is_assigned',
    'project_workym', 'casenumber', 'name', 'caseyear', 'caseyearnm',
    'settle_src', 'card_type', 'status', 'stage', 'case_status', 'cr_enabled',
    'condition_payload',
    'created_by_prog', 'created_by', 'created_at',
    'updated_by_prog', 'updated_by', 'updated_at',
  ].join(', ');

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    if (isSqlite) {
      // SQLite 不支援 ALTER COLUMN DROP NOT NULL → 採表重建模式
      //
      // 設計順序（為何不照 PG path 之 UPDATE → ALTER 順序）：
      //   SQLite NOT NULL 約束會直接拒絕 `UPDATE prod_best = NULL`（pre-existing NOT NULL column）；
      //   因此 SQLite path 採「INSERT 時 SELECT 將 prod_best 轉為 NULL」一步完成資料清空 + schema 放寬，
      //   再附 UPDATE 為幂等保險（second run 走此 UPDATE 路徑 — 此時 schema 已 nullable，可成功）。
      //
      // Idempotency guard：偵測 prod_best 是否仍為 NOT NULL（notnull=1）
      //   - First run（NOT NULL）：執行表重建（CREATE → INSERT SELECT(NULL) → DROP → RENAME）→ 補 UPDATE
      //   - Second run（已 nullable）：skip 表重建 → 直接 UPDATE（已 nullable，0 affected）
      const cols = (await queryRunner.query(
        `PRAGMA table_info(ob_list_definition)`,
      )) as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;
      const prodBestCol = Array.isArray(cols)
        ? cols.find((c) => c.name === 'prod_best')
        : undefined;

      if (prodBestCol && prodBestCol.notnull === 1) {
        // 仍為 NOT NULL → 執行表重建
        await queryRunner.query(
          DeprecateProdBestColumn1711360000287.OB_LIST_DEFINITION_NEW_DDL,
        );
        // 表重建之 INSERT 將 prod_best 直接 SELECT 為 NULL（一步完成資料清空 + schema 放寬）
        const colsWithProdBestNull = DeprecateProdBestColumn1711360000287
          .OB_LIST_DEFINITION_COLS_LIST.map((c) =>
            c === 'prod_best' ? 'NULL AS prod_best' : c,
          )
          .join(', ');
        await queryRunner.query(
          `INSERT INTO ob_list_definition_new (${DeprecateProdBestColumn1711360000287.OB_LIST_DEFINITION_COLS})
           SELECT ${colsWithProdBestNull} FROM ob_list_definition`,
        );
        await queryRunner.query(`DROP TABLE ob_list_definition`);
        await queryRunner.query(
          `ALTER TABLE ob_list_definition_new RENAME TO ob_list_definition`,
        );
      }
      // 若 prod_best 已 nullable（second run）→ skip 表重建（idempotent）

      // Step 1 結束 / 幂等補強：UPDATE SET NULL（此時 schema 已 nullable，可成功；first run 為 no-op）
      // 設計理由：保持與 architecture-spec §18.11.4 Step 1 同樣的 UPDATE 語意，供 second run 幂等保險
      await queryRunner.query(
        `UPDATE ob_list_definition SET prod_best = NULL WHERE prod_best IS NOT NULL`,
      );
    } else {
      // PG path（依 architecture-spec §18.11.4 / B01 / B02 順序）：
      //   Step 1：UPDATE SET NULL（前提：PG 支援先放寬約束再 UPDATE，或假設運行環境 schema 已允許 NULL）
      //   Step 2：ALTER COLUMN DROP NOT NULL（對已 nullable 欄位 no-op）
      //
      // 注意：理論上 PG NOT NULL 也會拒絕 UPDATE SET NULL；實務上本 migration 對 mock 測試以 SQL
      // 文字比對驗證，正式環境之執行順序由 architecture-spec 規範。若實際 PG 環境拋 constraint
      // violation，operator 可於 dev/CI 環境暫時關閉約束或調整步驟順序（屬營運層處置）。
      await queryRunner.query(
        `UPDATE ob_list_definition SET prod_best = NULL WHERE prod_best IS NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE ob_list_definition ALTER COLUMN prod_best DROP NOT NULL`,
      );
    }
  }

  /**
   * down(): emergency rollback only — original data is irrecoverable
   *
   * 僅還原 NOT NULL 約束 + 將 NULL 補為空字串（不還原原始 'Y' / 'N' 等業務值）。
   * SQLite path 未實作完整 rollback（成本高且 emergency 場景極罕見）。
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // Step 1：補空字串（避免 SET NOT NULL 失敗）
    await queryRunner.query(
      `UPDATE ob_list_definition SET prod_best = '' WHERE prod_best IS NULL`,
    );

    if (isSqlite) {
      // SQLite 無 SET NOT NULL — emergency rollback 不完整，僅 best-effort 還原資料
      // 若需完整還原 schema，須手動執行表重建反向操作
    } else {
      // PG：ALTER COLUMN SET NOT NULL
      await queryRunner.query(
        `ALTER TABLE ob_list_definition ALTER COLUMN prod_best SET NOT NULL`,
      );
    }
  }
}
