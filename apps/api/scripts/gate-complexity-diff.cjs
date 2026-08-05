#!/usr/bin/env node
/**
 * F118 ring metric gate #4 — complexity/size gate that reports NEW violations only.
 *
 * Why this exists (test-generator dispute #2, 2026-08-04 / docs/test-specs/risks-and-gaps.md
 * R-F118-04): `assignment-list.service.ts` was already 1580 lines with 14 pre-existing
 * complexity/size violations *before* F118 touched it (see eslint-baseline.f118.json,
 * generated from HEAD prior to F118). A plain `eslint -c eslint.ring.config.cjs <files>`
 * exit-code gate cannot distinguish "F118 introduced new debt" from "this file already had
 * debt" — it would fail on ANY correct F118 implementation forever, because the 14
 * pre-existing errors never go away on their own. A constraint a correct implementation can
 * never satisfy is not a constraint, it's a broken gate.
 *
 * This script runs the SAME ESLint config (eslint.ring.config.cjs — thresholds unchanged,
 * nothing loosened), then subtracts the known pre-existing baseline, matched by
 * (file basename, ruleId, message text) — NOT by line number, since new code shifts line
 * numbers around harmlessly. Message text bakes in the numeric complexity/length value, so
 * if a *baseline* function's value changes (better OR worse), it no longer matches the
 * baseline entry and is correctly re-surfaced as something needing attention. Any violation
 * in a function that never appeared in the baseline (e.g. inside a newly-added method) is
 * always reported as new, regardless of the baseline file's contents.
 *
 * Usage: node scripts/gate-complexity-diff.cjs <file...>
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/gate-complexity-diff.cjs <file...>');
  process.exit(2);
}

const repoRoot = path.join(__dirname, '..');
const baselinePath = path.join(repoRoot, 'eslint-baseline.f118.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
const baselineSet = new Set(
  baseline.violations.map((v) => `${v.file}::${v.ruleId}::${v.message}`),
);

function runEslintJson() {
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['eslint', '-c', 'eslint.ring.config.cjs', '--format', 'json', ...files];
  try {
    const out = execFileSync(npxBin, args, {
      cwd: repoRoot,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    return JSON.parse(out);
  } catch (e) {
    // ESLint exits 1 when there are lint errors; stdout still holds the JSON report in
    // that case. Only bail out if we truly got nothing back.
    if (e.stdout) {
      return JSON.parse(e.stdout);
    }
    console.error('gate:complexity — eslint invocation failed to produce output.');
    console.error(e.message);
    process.exit(2);
  }
}

const results = runEslintJson();
const newViolations = [];
let baselineIgnoredCount = 0;

for (const fileResult of results) {
  const base = path.basename(fileResult.filePath);
  for (const msg of fileResult.messages) {
    const key = `${base}::${msg.ruleId}::${msg.message}`;
    if (baselineSet.has(key)) {
      baselineIgnoredCount += 1;
    } else {
      newViolations.push({ file: base, line: msg.line, ruleId: msg.ruleId, message: msg.message });
    }
  }
}

if (newViolations.length > 0) {
  console.error(
    `\ngate:complexity — ${newViolations.length} NEW complexity/size violation(s) (baseline debt excluded):\n`,
  );
  for (const v of newViolations) {
    console.error(`  ${v.file}:${v.line}  [${v.ruleId}]  ${v.message}`);
  }
  console.error(
    `\n(${baselineIgnoredCount} known pre-existing baseline violation(s) ignored — see eslint-baseline.f118.json)`,
  );
  process.exit(1);
}

console.log(
  `gate:complexity — PASS (0 new violations; ${baselineIgnoredCount} known pre-existing baseline violation(s) ignored, see eslint-baseline.f118.json)`,
);
process.exit(0);
