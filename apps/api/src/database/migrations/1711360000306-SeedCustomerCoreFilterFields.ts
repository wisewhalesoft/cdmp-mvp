import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m306 / F109 / US-172 / AD-E07-37 §4.2：
 *   SeedCustomerCoreFilterFields —— seed 8 個 customer_core 白名單欄位 + 7 個 categorical 欄位可選值
 *
 * 內容（spec §5.2 / §5.4，值取自 dev `SELECT DISTINCT` 實查校驗，feedback_mock_real_system_contract）：
 *   1. whitelist 8 欄（data_source='customer_core'、is_active=true、is_system_fixed=false）：
 *        gender / date_of_birth（numeric）/ occupation_desc / education_desc /
 *        marital_status_desc / customer_type_desc / monthly_income_desc / cpost_city
 *   2. options 106 筆（gender 3 code→label + occupation 55 + education 8 + marital 5 +
 *        customer_type 4 + income 9 + city 22；value=label，僅 gender 為 code→label）
 *      - date_of_birth（年齡 numeric）無 options，不 seed（沿用 numeric 欄位慣例）
 *
 * 冪等（BR-12）：
 *   - PG   ：ON CONFLICT (column_name) / (column_name, option_value) DO NOTHING
 *   - SQLite：INSERT OR IGNORE
 *
 * ⚠️ dev distinct 校驗結果（2026-07-02 實查 customer_core，360 萬筆）：
 *   - occupation_desc distinct=55（含資料品質值「304」「無」；忠實 seed，非臆造，
 *     value=label 前提要求與 customer_core 儲存值逐字相符，否則月跑 IN 比對失配）
 *   - gender：乾淨值 1/2/3（+ 少量雜訊碼 4/8/9/A/B/C/D/U/V/空白，僅 seed 1/2/3，AD OQ-F109-03）
 *   - cpost_city LEFT(,3) distinct=25（含空白/釣魚臺/南海諸雜訊；僅 seed 標準 22 縣市臺字形，OQ-172-02）
 *
 * down()：先刪 options（子表）再刪 whitelist（母表），FK 安全（AD §4.2）。
 */
export class SeedCustomerCoreFilterFields1711360000306
  implements MigrationInterface
{
  name = 'SeedCustomerCoreFilterFields1711360000306';

  /** 8 個客戶資料白名單欄位（column_name / display_name / field_type）。 */
  private static readonly WHITELIST_FIELDS: ReadonlyArray<{
    columnName: string;
    displayName: string;
    fieldType: 'categorical' | 'numeric';
  }> = [
    { columnName: 'gender', displayName: '性別', fieldType: 'categorical' },
    { columnName: 'date_of_birth', displayName: '年齡', fieldType: 'numeric' },
    { columnName: 'occupation_desc', displayName: '職業別', fieldType: 'categorical' },
    { columnName: 'education_desc', displayName: '教育程度', fieldType: 'categorical' },
    { columnName: 'marital_status_desc', displayName: '婚姻狀況', fieldType: 'categorical' },
    { columnName: 'customer_type_desc', displayName: '身分別', fieldType: 'categorical' },
    { columnName: 'monthly_income_desc', displayName: '收入區間', fieldType: 'categorical' },
    { columnName: 'cpost_city', displayName: '居住城市', fieldType: 'categorical' },
  ];

  /** 全部 8 個欄名（供 down() 使用）。 */
  private static readonly ALL_COLUMN_NAMES: ReadonlyArray<string> =
    SeedCustomerCoreFilterFields1711360000306.WHITELIST_FIELDS.map(
      (f) => f.columnName,
    );

  /** gender：唯一 code→label 欄位（option_value ≠ option_label）。 */
  private static readonly GENDER_OPTIONS: ReadonlyArray<[string, string]> = [
    ['1', '男'],
    ['2', '女'],
    ['3', '法人'],
  ];

  /** occupation_desc：dev distinct 55 筆（value=label，含資料品質值「304」「無」，忠實枚舉）。 */
  private static readonly OCCUPATION_VALUES: ReadonlyArray<string> = [
    '304',
    'KTV/酒吧/夜總會/卡拉OK/三溫暖/俱樂部',
    '不動產業',
    '二手車商',
    '保險業',
    '倉儲業',
    '公教人員',
    '公營事業',
    '其他',
    '其他專業人士(公證人等)',
    '博弈業(賭場、線上博弈)',
    '商業',
    '地政士、代書',
    '地產管理人或經紀商(含仲介)',
    '大眾傳播、藝術工作、體育',
    '學生',
    '宗教服務',
    '家管',
    '專業人士(律師、會計師)',
    '建築師',
    '批發、零售業',
    '攤販',
    '政府機關',
    '教職人員',
    '旅行社',
    '服務業',
    '水電媒氣業、加油站',
    '無',
    '營造、土木、建築業',
    '珠寶商(含銀樓)',
    '當鋪',
    '自營商',
    '自由業',
    '藝品店',
    '虛擬貨幣業',
    '製造業',
    '記帳士',
    '證券及期貨業',
    '貴金屬商、寶石商(如買賣未切割之原石)',
    '資訊業',
    '車商',
    '軍火商',
    '軍警消防業',
    '農、林、魚、牧、狩獵、礦、土石採取業',
    '退休',
    '通信業',
    '進出口貿易業',
    '運輸業',
    '醫務人員',
    '醫生',
    '醫療院所',
    '金融業',
    '非營利事業',
    '非營利團體',
    '餐飲業',
  ];

  /** education_desc：dev distinct 8 筆（value=label）。 */
  private static readonly EDUCATION_VALUES: ReadonlyArray<string> = [
    '高中',
    '大學',
    '專科',
    '未定',
    '國中',
    '碩士',
    '小學',
    '博士',
  ];

  /** marital_status_desc：dev distinct 5 筆（value=label）。 */
  private static readonly MARITAL_VALUES: ReadonlyArray<string> = [
    '已婚',
    '未婚',
    '離婚',
    '未定',
    '同居',
  ];

  /** customer_type_desc：dev distinct 4 筆（value=label）。 */
  private static readonly CUSTOMER_TYPE_VALUES: ReadonlyArray<string> = [
    '個人',
    '法人',
    '外籍人士',
    '虛擬車商編號',
  ];

  /** monthly_income_desc：dev distinct 9 筆（含逗號千分位，須逐字相符）。 */
  private static readonly INCOME_VALUES: ReadonlyArray<string> = [
    '20,000以下',
    '20,001~30,000',
    '30,001~40,000',
    '40,001~50,000',
    '50,001~60,000',
    '60,001~70,000',
    '70,001~80,000',
    '80,001以上',
    '未確定',
  ];

  /** cpost_city：22 縣市（臺字形，非「台」字形，OQ-172-02）。 */
  private static readonly CITY_VALUES: ReadonlyArray<string> = [
    '臺北市',
    '新北市',
    '桃園市',
    '臺中市',
    '臺南市',
    '高雄市',
    '基隆市',
    '新竹市',
    '嘉義市',
    '新竹縣',
    '苗栗縣',
    '彰化縣',
    '南投縣',
    '雲林縣',
    '嘉義縣',
    '屏東縣',
    '宜蘭縣',
    '花蓮縣',
    '臺東縣',
    '澎湖縣',
    '金門縣',
    '連江縣',
  ];

  /** SQL 字串常值單引號跳脫（seed 為靜態已知值，無使用者輸入；防禦性 double-quote）。 */
  private static esc(s: string): string {
    return s.replace(/'/g, "''");
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const trueLit = isSqlite ? '1' : 'TRUE';
    const falseLit = isSqlite ? '0' : 'FALSE';
    const esc = SeedCustomerCoreFilterFields1711360000306.esc;

    // Step 1：UPSERT whitelist 8 欄（母表先，FK 安全）
    const whitelistRows = SeedCustomerCoreFilterFields1711360000306.WHITELIST_FIELDS.map(
      (f) =>
        `('${esc(f.columnName)}', '${esc(f.displayName)}', '${esc(f.fieldType)}', ` +
        `'customer_core', ${trueLit}, ${falseLit}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).join(',\n  ');

    const whitelistSql = isSqlite
      ? `INSERT OR IGNORE INTO pooldata_field_whitelist
           (column_name, display_name, field_type, data_source, is_active, is_system_fixed, created_at, updated_at)
         VALUES\n  ${whitelistRows}`
      : `INSERT INTO pooldata_field_whitelist
           (column_name, display_name, field_type, data_source, is_active, is_system_fixed, created_at, updated_at)
         VALUES\n  ${whitelistRows}
         ON CONFLICT (column_name) DO NOTHING`;
    await queryRunner.query(whitelistSql);

    // Step 2：UPSERT options（7 個 categorical 欄位；date_of_birth 無 options）
    const optionGroups: Array<{ column: string; pairs: ReadonlyArray<[string, string]> }> = [
      { column: 'gender', pairs: SeedCustomerCoreFilterFields1711360000306.GENDER_OPTIONS },
      {
        column: 'occupation_desc',
        pairs: SeedCustomerCoreFilterFields1711360000306.OCCUPATION_VALUES.map(
          (v) => [v, v] as [string, string],
        ),
      },
      {
        column: 'education_desc',
        pairs: SeedCustomerCoreFilterFields1711360000306.EDUCATION_VALUES.map(
          (v) => [v, v] as [string, string],
        ),
      },
      {
        column: 'marital_status_desc',
        pairs: SeedCustomerCoreFilterFields1711360000306.MARITAL_VALUES.map(
          (v) => [v, v] as [string, string],
        ),
      },
      {
        column: 'customer_type_desc',
        pairs: SeedCustomerCoreFilterFields1711360000306.CUSTOMER_TYPE_VALUES.map(
          (v) => [v, v] as [string, string],
        ),
      },
      {
        column: 'monthly_income_desc',
        pairs: SeedCustomerCoreFilterFields1711360000306.INCOME_VALUES.map(
          (v) => [v, v] as [string, string],
        ),
      },
      {
        column: 'cpost_city',
        pairs: SeedCustomerCoreFilterFields1711360000306.CITY_VALUES.map(
          (v) => [v, v] as [string, string],
        ),
      },
    ];

    for (const group of optionGroups) {
      const rows = group.pairs
        .map(
          ([value, label]) =>
            `('${esc(group.column)}', '${esc(value)}', '${esc(label)}', ${trueLit}, ` +
            `NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .join(',\n  ');

      const optionSql = isSqlite
        ? `INSERT OR IGNORE INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES\n  ${rows}`
        : `INSERT INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES\n  ${rows}
           ON CONFLICT (column_name, option_value) DO NOTHING`;
      await queryRunner.query(optionSql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const esc = SeedCustomerCoreFilterFields1711360000306.esc;
    const inList = SeedCustomerCoreFilterFields1711360000306.ALL_COLUMN_NAMES.map(
      (n) => `'${esc(n)}'`,
    ).join(', ');

    // 子表先刪（options），母表後刪（whitelist），FK 安全
    await queryRunner.query(
      `DELETE FROM pooldata_field_option WHERE column_name IN (${inList})`,
    );
    await queryRunner.query(
      `DELETE FROM pooldata_field_whitelist WHERE column_name IN (${inList})`,
    );
  }
}
