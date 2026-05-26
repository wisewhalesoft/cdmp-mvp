/**
 * 一次性 backfill：重算既有 ready 名單的物化 Stage 0 估算
 *
 * F092（2026-05-26）起，per-list 估算升級為完整 Stage1FilterChain dry-run
 * （欄位篩選 + month_cnt 期別 + 近3月去重 + 特殊 DELETE，與月跑同源 → estimate ≡ run）。
 * 改 code 不回填既有 ready 名單的 stage0_estimate_count，故以本腳本用**同一條 chain**
 * （executeStage1Chain dryRun:true）重算並寫回，與 estimateListCount / 月跑邏輯一致。
 *
 * 用法（本機，讀 apps/api/.env，連 localhost:5432）：
 *   cd apps/api && npx ts-node -r tsconfig-paths/register src/database/scripts/backfill-stage0-estimate.ts
 *
 * 冪等：可重複執行。注意：ob_pool_data_list 無 ETL 歷史時去重不減（dev）；prod 載入歷史後數值會更精確。
 */

import 'reflect-metadata';
import AppDataSource from '../data-source';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { executeStage1Chain } from '@/modules/assignment/stage1/stage1-filter-chain';

/** 'YYYYMM' → 本月第一天 Date（對應 SP @WORKDT = PROJECT_WORKYM + '01'） */
function deriveWorkdt(ym: string | null): Date {
  if (ym && /^\d{6}$/.test(ym)) {
    return new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(4, 6), 10) - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const listRepo = AppDataSource.getRepository(ObListDefinition);
  const poolRepo = AppDataSource.getRepository(ObPoolData);
  const poolDataListRepo = AppDataSource.getRepository(ObPoolDataList);

  const readyLists = await listRepo.find({ where: { stage: 'ready' } });
  console.log(`找到 ${readyLists.length} 張 ready 名單，以完整 Stage1 鏈 dry-run 重算…\n`);

  let updated = 0;
  for (const list of readyLists) {
    const before = list.stage0_estimate_count;
    const workdt = deriveWorkdt(list.project_workym);

    // 與 estimateListCount（F092）/ 月跑同源：完整鏈唯讀 COUNT
    const result = await executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, {
      dryRun: true,
    });
    const count = result.count;

    await listRepo.update(
      { list_no: list.list_no },
      { stage0_estimate_count: count, stage0_estimated_at: new Date() },
    );
    updated += 1;
    console.log(
      `  ${list.list_no}  ${list.list_nm}` +
        `\n      ${before === null || before === undefined ? '—' : before.toLocaleString()} → ${count.toLocaleString()}` +
        `${result.skipped ? '  (skipped: ' + result.skipReason + ')' : ''}`,
    );
  }

  console.log(`\n完成：已更新 ${updated} 張名單。`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('backfill 失敗：', err);
  process.exitCode = 1;
});
