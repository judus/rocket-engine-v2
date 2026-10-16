import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { checkCoverage } from '../scripts/coverage-gate.js';

void test('coverage gate detects missing modules, reports, and unrounded regression', () => {
  const metrics = {
    coveredLinePercent: 90,
    coveredBranchPercent: 80,
    coveredFunctionPercent: 70,
  };
  const baseline = { excluded: {}, modules: { 'a.js': metrics } };
  const summary = {
    files: [{ path: resolve('dist/src/a.js'), ...metrics }],
    totals: metrics,
  };
  assert.deepEqual(checkCoverage(summary, baseline, ['a.js']), []);
  assert.match(
    checkCoverage({ ...summary, files: [] }, baseline, ['a.js']).join(),
    /missing coverage/,
  );
  assert.match(
    checkCoverage(summary, baseline, ['a.js', 'b.js']).join(),
    /missing baseline/,
  );
  assert.match(
    checkCoverage(
      {
        ...summary,
        files: [{ ...summary.files[0]!, coveredBranchPercent: 79.99999 }],
      },
      baseline,
      ['a.js'],
    ).join(),
    /below 80/,
  );
  assert.match(checkCoverage(summary, baseline, []).join(), /stale baseline/);
});
