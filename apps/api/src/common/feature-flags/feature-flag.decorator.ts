import { SetMetadata } from '@nestjs/common';

/**
 * Feature Flag marker decorator（AD-E07 v3.0 / architecture-spec §FeatureFlagGuard / 決議 #2）
 *
 * 用法：
 *   @UseGuards(AuthGuard, FeatureFlagGuard)
 *   @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
 *   @Post('/api/v1/assignment/list-definitions/:listNo/advance-to-dept-ratio')
 *
 * Flag = false 時統一回 503 Service Unavailable + FEATURE_NOT_ENABLED。
 *
 * 實作機制：環境變數 `process.env.<FLAG_NAME>`；'true'（不分大小寫）視為啟用，
 *   其餘（含 undefined / '' / 'false' / '0'）視為停用。後續可擴充至 config 表 / LaunchDarkly。
 */
export const REQUIRE_FEATURE_FLAG_KEY = 'requireFeatureFlag';

export const RequireFeatureFlag = (flagName: string) =>
  SetMetadata(REQUIRE_FEATURE_FLAG_KEY, flagName);
