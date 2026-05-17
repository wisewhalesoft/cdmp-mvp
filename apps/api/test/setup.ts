// API test setup
process.env.DB_TYPE = 'sqlite';

// v2.0 補：FeatureFlagGuard 預設為 true（ENABLE_E07_REFACTOR_PHASE3）
// 個別 unit test（FeatureFlagGuard 自身 + assignment-list TC-FF 等）會自行 override 為 false / unset。
// E2E 預設啟用 E07 寫入端點。
if (process.env.ENABLE_E07_REFACTOR_PHASE3 === undefined) {
  process.env.ENABLE_E07_REFACTOR_PHASE3 = 'true';
}
