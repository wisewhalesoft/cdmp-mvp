#!/usr/bin/env node
/**
 * AD-E07-39 P1b3（B2 修復）— TypeORM CLI 啟動器（robust to monorepo hoisting + Node 24）。
 *
 * P1b2 §4.2 記錄：原 npm script `"typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js"`
 * 於本機失效，兩個獨立原因疊加：
 *   (1) monorepo workspace 提升：typeorm 被提升到 repo root node_modules，`./node_modules/typeorm/cli.js` 不存在。
 *   (2) Node 24 + ts-node 作為 entry launcher：getProjectSearchDir 對 `require.resolve('./cli.js')` 拋錯。
 *
 * 本啟動器改以 **node 為 launcher**（避開 (2)），ts-node / tsconfig-paths 僅作 require hook（preload），
 * 並以 `require.resolve('typeorm/cli.js')` 解析 CLI 路徑（避開 (1)，提升 / 未提升皆可）。
 * 讓字面 `npm run migration:run` / `npm run bootstrap` 於 mssql 與 postgres 兩路徑皆可直接執行。
 *
 * 傳遞的 CLI 參數（migration:run -d src/database/data-source.ts …）由 typeorm cli.js 之 yargs 讀取
 * process.argv，行為與 `node <cli.js> <args>` 完全一致。
 */
require('tsconfig-paths/register');
require('ts-node/register/transpile-only');
require(require.resolve('typeorm/cli.js'));
