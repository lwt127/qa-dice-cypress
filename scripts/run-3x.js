#!/usr/bin/env node
/**
 * Runs the full suite N times in a row (default 3) and saves, for each run:
 *   runs/run-<n>.txt              full console output
 *   runs/reports/run-<n>.html     HTML test report (mochawesome), self-contained
 *   runs/reports/run-<n>.json     the same report as merged JSON
 * plus a one-line-per-run summary in runs/summary.txt.
 *
 *   node scripts/run-3x.js                         # all tests, known bugs fail
 *   node scripts/run-3x.js --env skipKnownBugs=true # known-bug tests skipped
 *   RUNS=5 node scripts/run-3x.js                   # different count
 *
 * Extra arguments are passed straight to `cypress run`.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { merge } = require('mochawesome-merge');
const generator = require('mochawesome-report-generator');

const runs = Number(process.env.RUNS || 3);
const extra = process.argv.slice(2);
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'runs');
const reportsDir = path.join(outDir, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });

async function buildReport(i, jsonDir, started) {
  const files = fs.existsSync(jsonDir) ? fs.readdirSync(jsonDir).filter((f) => f.endsWith('.json')) : [];
  if (!files.length) return 'no report data';
  const merged = await merge({ files: [path.join(jsonDir, '*.json').replace(/\\/g, '/')] });
  fs.writeFileSync(path.join(reportsDir, `run-${i}.json`), JSON.stringify(merged, null, 2));
  await generator.create(merged, {
    reportDir: reportsDir,
    reportFilename: `run-${i}`,
    reportTitle: `Joy Dice E2E - run ${i} of ${runs}`,
    reportPageTitle: `Joy Dice E2E - run ${i}`,
    inline: true,
    charts: true,
    timestamp: false,
    showPassed: true,
    saveJson: false,
  });
  fs.rmSync(jsonDir, { recursive: true, force: true });
  const s = merged.stats;
  return `report: ${s.tests} tests, ${s.passes} passed, ${s.failures} failed, ${s.pending + s.skipped} skipped (started ${started.toISOString()})`;
}

(async () => {

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const summary = [];

for (let i = 1; i <= runs; i++) {
  const started = new Date();
  const jsonDir = path.join(outDir, `.json-run-${i}`);
  fs.rmSync(jsonDir, { recursive: true, force: true });
  console.log(`\n=== Run ${i}/${runs} started ${started.toISOString()} ===`);
  const res = spawnSync(['npx', 'cypress', 'run', '--e2e', ...extra].join(' '), {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0', REPORT_DIR: jsonDir },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = stripAnsi(`${res.stdout || ''}${res.stderr || ''}`);
  const header = [
    `Run ${i} of ${runs}`,
    `Started:  ${started.toISOString()}`,
    `Finished: ${new Date().toISOString()}`,
    `Command:  npx cypress run --e2e ${extra.join(' ')}`.trim(),
    `Exit code: ${res.status} (number of failed tests)`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, `run-${i}.txt`), header + output);

  const totals = output.split('\n').filter((l) => /\d+ of \d+ failed|All specs passed/.test(l));
  const line = `run-${i}: exit=${res.status} ${totals.map((t) => t.trim().replace(/\s+/g, ' ')).join(' | ')}`;
  summary.push(line);
  console.log(line);
  console.log(`  ${await buildReport(i, jsonDir, started)}`);
}

fs.writeFileSync(path.join(outDir, 'summary.txt'), summary.join('\n') + '\n');
console.log(`\nSaved logs to ${outDir} and HTML reports to ${reportsDir}`);
})();
