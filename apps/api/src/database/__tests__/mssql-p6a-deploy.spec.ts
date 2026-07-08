/**
 * AD-E07-44 P6a — MSSQL 生產部署 bootstrap 路徑（docker-compose 靜態守門）。
 *
 * P6a 為「可逆部署準備」：於 docker-compose.yml 以 additive 方式新增 MSSQL 生產部署路徑
 * （bootstrap-mssql / api-mssql / worker-mssql / web-mssql），對齊現行 postgres 版一鍵部署，
 * 但 **不翻動 postgres 預設**（分階段：預設切換由 P6b 處理）。
 *
 * 本 spec 為零外部相依之靜態守門（讀 repo 根 docker-compose.yml 文字）：
 *   (1) 新增之 MSSQL 部署服務存在且 DB_TYPE=mssql / 指向 mssql 服務。
 *   (2) bootstrap-mssql 沿用字面 `npm run bootstrap`（與 PG 版同一 npm script，僅 env 不同）。
 *   (3) 🔴 PG 一鍵部署路徑不受影響（additive）：預設 api/worker/bootstrap 仍為 DB_TYPE: postgres。
 *
 * 不需 MSSQL 連線、不需 docker，於一般 sqlite 套件即可跑（fast、CI 恆可執行）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const API_ROOT = join(__dirname, '..', '..', '..'); // apps/api
const COMPOSE_PATH = join(API_ROOT, '..', '..', 'docker-compose.yml'); // repo 根

const compose = readFileSync(COMPOSE_PATH, 'utf8');

/**
 * 擷取單一 service 之 YAML 區塊文字（自 `  <name>:` 起，至下一個同層級 2-空格縮排的 `  <key>:` 止）。
 * 用於逐 service 斷言其環境變數，避免跨 service 誤命中。
 */
function serviceBlock(name: string): string {
  const lines = compose.split(/\r?\n/);
  const startRe = new RegExp(`^  ${name}:\\s*$`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    // 下一個 2-空格縮排、非註解、非空白之 `key:` 行 → service 邊界。
    if (/^  \S/.test(lines[i]) && !/^  #/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

describe('AD-E07-44 P6a — docker-compose MSSQL 部署路徑（additive）', () => {
  // ── 新增之 MSSQL 部署服務 ──
  it('TS-P6A-DEPLOY-001：bootstrap-mssql 服務存在、DB_TYPE=mssql、指向 mssql 服務、沿用 npm run bootstrap', () => {
    const b = serviceBlock('bootstrap-mssql');
    expect(b, 'bootstrap-mssql 服務應存在於 docker-compose.yml').not.toBe('');
    expect(b).toMatch(/DB_TYPE:\s*mssql/);
    expect(b).toMatch(/DB_HOST:\s*mssql/);
    expect(b).toMatch(/DB_PORT:\s*1433/);
    // 與 PG 版 bootstrap 同一 npm script（seeds 已 driver-portable，AD-E07-39 P1b3）。
    expect(b).toMatch(/command:\s*npm run bootstrap/);
  });

  it('TS-P6A-DEPLOY-002：api-mssql 服務存在、DB_TYPE=mssql、指向 mssql 服務', () => {
    const a = serviceBlock('api-mssql');
    expect(a, 'api-mssql 服務應存在').not.toBe('');
    expect(a).toMatch(/DB_TYPE:\s*mssql/);
    expect(a).toMatch(/DB_HOST:\s*mssql/);
  });

  it('TS-P6A-DEPLOY-003：worker-mssql 服務存在、DB_TYPE=mssql、指向 mssql 服務', () => {
    const w = serviceBlock('worker-mssql');
    expect(w, 'worker-mssql 服務應存在').not.toBe('');
    expect(w).toMatch(/DB_TYPE:\s*mssql/);
    expect(w).toMatch(/DB_HOST:\s*mssql/);
  });

  it('TS-P6A-DEPLOY-004：MSSQL 部署服務以 profile 隔離（預設 docker compose up 不啟動）', () => {
    // bootstrap-mssql 自成一 profile（比照 PG 版 bootstrap 於獨立 profile、部署時顯式跑一次）。
    const boot = serviceBlock('bootstrap-mssql');
    expect(boot, 'bootstrap-mssql 應以 profiles 設為選用').toMatch(/profiles:/);
    expect(boot, 'bootstrap-mssql 應屬 mssql-bootstrap profile').toMatch(/mssql-bootstrap/);
    // 長駐服務屬 mssql-prod profile。
    for (const svc of ['api-mssql', 'worker-mssql']) {
      const blk = serviceBlock(svc);
      expect(blk, `${svc} 應以 profiles 設為選用`).toMatch(/profiles:/);
      expect(blk, `${svc} 應屬 mssql-prod profile`).toMatch(/mssql-prod/);
    }
  });

  it('TS-P6A-DEPLOY-005：api-mssql/worker-mssql 於 mssql 就緒後才啟動（depends_on）', () => {
    for (const svc of ['api-mssql', 'worker-mssql', 'bootstrap-mssql']) {
      const blk = serviceBlock(svc);
      expect(blk, `${svc} 應 depends_on`).toMatch(/depends_on:/);
    }
  });

  // ── 🔴 PG 一鍵部署路徑不受影響（additive；預設不翻）──
  it('TS-P6A-DEPLOY-006：預設 bootstrap 服務仍為 DB_TYPE: postgres（PG 路徑不變）', () => {
    const b = serviceBlock('bootstrap');
    expect(b).not.toBe('');
    expect(b).toMatch(/DB_TYPE:\s*postgres/);
    expect(b).toMatch(/command:\s*npm run bootstrap/);
  });

  it('TS-P6A-DEPLOY-007：預設 api/worker 仍為 DB_TYPE: postgres（P6a 不翻預設，P6b 才處理）', () => {
    expect(serviceBlock('api')).toMatch(/DB_TYPE:\s*postgres/);
    expect(serviceBlock('worker')).toMatch(/DB_TYPE:\s*postgres/);
  });

  it('TS-P6A-DEPLOY-008：bootstrap npm script 未被更動（步驟順序 = migration:run → seed → seed-datasource → data-seed）', () => {
    const pkg = JSON.parse(readFileSync(join(API_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.bootstrap).toBe(
      'npm run migration:run && npm run seed && npm run seed-datasource && npm run data-seed',
    );
  });
});
