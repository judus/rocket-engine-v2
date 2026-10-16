import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export interface FileCoverage {
  path: string;
  coveredLinePercent: number;
  coveredBranchPercent: number;
  coveredFunctionPercent: number;
}
export interface CoverageSummary {
  files: FileCoverage[];
  totals: Omit<FileCoverage, 'path'>;
}
export interface CoverageBaseline {
  excluded: Record<string, string>;
  modules: Record<string, Omit<FileCoverage, 'path'>>;
}
const metrics = [
  'coveredLinePercent',
  'coveredBranchPercent',
  'coveredFunctionPercent',
] as const;

export function checkCoverage(
  summary: CoverageSummary,
  baseline: CoverageBaseline,
  inventory: string[],
): string[] {
  const errors: string[] = [];
  const files = new Map(
    summary.files.map((file) => [
      relative(resolve('dist/src'), file.path).replaceAll('\\', '/'),
      file,
    ]),
  );
  for (const name of inventory) {
    if (baseline.excluded[name]) continue;
    const floor = baseline.modules[name];
    const file = files.get(name);
    if (!floor) errors.push(`${name}: missing baseline`);
    if (!file) errors.push(`${name}: missing coverage`);
    if (!floor || !file) continue;
    for (const metric of metrics) {
      const actual = file[metric];
      if (!Number.isFinite(actual) || actual < floor[metric])
        errors.push(`${name}: ${metric} ${actual} below ${floor[metric]}`);
    }
  }
  for (const name of Object.keys(baseline.modules))
    if (!inventory.includes(name)) errors.push(`${name}: stale baseline`);
  if (!inventory.length || !summary.files.length)
    errors.push('Empty module inventory or coverage report');
  return errors;
}
interface Event {
  type: string;
  data: {
    summary?: CoverageSummary;
    success?: boolean;
    counts?: { tests: number; failed: number };
  };
}
export default async function* report(events: AsyncIterable<Event>) {
  // Remove previous success evidence before consuming this run.
  mkdirSync('coverage', { recursive: true });
  writeFileSync('coverage/summary.json', JSON.stringify({ complete: false }));
  let summary: CoverageSummary | undefined;
  let success = false;
  let count = 0;
  for await (const event of events) {
    if (event.type === 'test:coverage') summary = event.data.summary;
    if (event.type === 'test:summary') {
      success = event.data.success === true;
      count = event.data.counts?.tests ?? 0;
    }
    if (event.type === 'test:fail')
      yield 'Test failure; inspect the test output with npm test.\n';
  }
  const baseline = JSON.parse(
    readFileSync('scripts/coverage-baseline.json', 'utf8'),
  ) as CoverageBaseline;
  const inventory = readdirSync('dist/src', { recursive: true })
    .filter(
      (name): name is string =>
        typeof name === 'string' && name.endsWith('.js'),
    )
    .map((name) => name.replaceAll('\\', '/'))
    .sort();
  const errors = summary
    ? checkCoverage(summary, baseline, inventory)
    : ['Missing coverage event'];
  if (!success || count === 0) errors.push('Tests failed or incomplete');
  const lines =
    summary?.files.map(
      (file) =>
        `${relative(resolve('dist/src'), file.path)}: lines ${file.coveredLinePercent.toFixed(2)}%, branches ${file.coveredBranchPercent.toFixed(2)}%, functions ${file.coveredFunctionPercent.toFixed(2)}%`,
    ) ?? [];
  lines.push(
    `${count} tests; coverage gate ${errors.length ? 'FAILED' : 'PASSED'}`,
    ...errors,
  );
  const text = lines.join('\n') + '\n';
  writeFileSync(
    'coverage/summary.json',
    JSON.stringify(
      {
        complete: success && count > 0 && !!summary,
        errors,
        inventory,
        summary,
      },
      null,
      2,
    ),
  );
  writeFileSync('coverage/summary.txt', text);
  if (errors.length) process.exitCode = 1;
  yield text;
}
