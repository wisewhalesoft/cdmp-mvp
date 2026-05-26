/**
 * 一次性 backfill：重算既有 ready 名單的物化 Stage 0 估算（F049 v1.2 / F088 修復）
 *
 * 背景：approve→ready 物化 hook（F086）原先用脫節的舊篩選邏輯，導致既有 ready 名單
 *       的 stage0_estimate_count 為錯誤的 0 / NULL。改 code 不會回填既有資料 ——
 *       本腳本以修正後的篩選邏輯（複用月跑 Stage 1 的 buildStage1WhereConditions）
 *       對所有 stage='ready' 名單重算並 UPDATE。
 *
 * 與 StageActionService.materializeStage0Estimate / Stage0EstimateService.buildPoolCountQuery
 * 完全相同的演算法（同一純函式），確保 estimate ≡ 月跑 Stage 1 逐欄位一致。
 *
 * 用法（本機，讀 apps/api/.env，連 localhost:5432）：
 *   cd apps/api && npx ts-node -r tsconfig-paths/register src/database/scripts/backfill-stage0-estimate.ts
 *
 * 冪等：可重複執行；每次以當下 ob_pool_data 重算覆寫。
 * 注意：prod / staging 既有 ready 名單需同樣執行本腳本（或下次 re-approve 自動物化）。
 */

import 'reflect-metadata';
import AppDataSource from '../data-source';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { buildStage1WhereConditions } from '@/modules/assignment/stage1/stage1-query-composer';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const listRepo = AppDataSource.getRepository(ObListDefinition);
  const poolRepo = AppDataSource.getRepository(ObPoolData);

  const readyLists = await listRepo.find({ where: { stage: 'ready' } });
  console.log(`找到 ${readyLists.length} 張 ready 名單，開始重算 Stage 0 估算…\n`);

  let updated = 0;
  for (const list of readyLists) {
    const before = list.stage0_estimate_count;

    // 與 Stage0EstimateService.buildPoolCountQuery（修正後）相同邏輯
    const fragment = buildStage1WhereConditions(list);
    let count: number;
    if (fragment.skipReason === 'EMPTY_CONDITIONS') {
      count = 0; // BR-5：無有效條件 → 0（與 Stage 1 skip 一致）
    } else {
      const qb = poolRepo.createQueryBuilder('ob_pool_data');
      if (fragment.where) qb.where(fragment.where, fragment.params);
      count = await qb.getCount();
    }

    await listRepo.update(
      { list_no: list.list_no },
      { stage0_estimate_count: count, stage0_estimated_at: new Date() },
    );
    updated += 1;
    console.log(
      `  ${list.list_no}  ${list.list_nm}` +
        `\n      ${before === null || before === undefined ? '—' : before} → ${count.toLocaleString()}`,
    );
  }

  console.log(`\n完成：已更新 ${updated} 張名單。`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('backfill 失敗：', err);
  process.exitCode = 1;
});
