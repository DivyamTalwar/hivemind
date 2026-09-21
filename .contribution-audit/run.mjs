import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';

const specPath = process.argv[2];
assert.ok(specPath, 'A reviewed patch specification is required');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
assert.match(spec.id, /^[a-z0-9-]+$/);
assert.match(spec.branch, /^fix\/[a-z0-9][a-z0-9/-]*$/);
assert.match(spec.base, /^[0-9a-f]{40}$/);
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), spec.base);
const root = process.cwd();
const out = process.env.RUNNER_TEMP || '/tmp';
const expectedPaths = new Set();

function checkedPath(p) {
  assert.ok(typeof p === 'string' && /^(src|tests)\//.test(p));
  assert.ok(!p.split('/').includes('..') && !path.isAbsolute(p));
  const absolute = path.resolve(root, p);
  assert.ok(absolute.startsWith(root + path.sep));
  expectedPaths.add(p);
  return absolute;
}
function execute(label, argv, allowFailure = false) {
  console.log(`\n=== ${label}: ${argv.join(' ')} ===`);
  const started = Date.now();
  const result = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000,
    env: { ...process.env, HUSKY: '0' },
  });
  const log = `${result.stdout || ''}${result.stderr || ''}`;
  fs.writeFileSync(path.join(out, `${spec.id}-${label}.log`), log);
  console.log(log.slice(-18000));
  console.log(`${label}: exit=${result.status}, elapsed_ms=${Date.now() - started}`);
  if (result.error) throw result.error;
  if (!allowFailure) assert.equal(result.status, 0, `${label} must pass`);
  return result;
}
function vitest(label, files, coverage = false) {
  const reportPath = path.join(out, `${spec.id}-${label}.json`);
  const args = [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', ...files,
    '--pool=forks', '--reporter=json', `--outputFile=${reportPath}`];
  if (coverage) args.push('--coverage');
  const result = execute(label, args, label === 'baseline');
  assert.ok(fs.existsSync(reportPath), `${label} must produce a real test report`);
  return { result, report: JSON.parse(fs.readFileSync(reportPath, 'utf8')) };
}

for (const test of spec.tests) {
  const dest = checkedPath(test.path);
  assert.ok(!fs.existsSync(dest), `Regression test must be new: ${test.path}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, test.content);
}
const baseline = vitest('baseline', spec.tests.map(test => test.path));
assert.equal(baseline.result.status, 1, 'Baseline must fail tests, not fail to start');
const baselineCases = baseline.report.testResults.flatMap(suite => suite.assertionResults);
assert.equal(baselineCases.length, spec.expectedBaselineCases);
const failures = baselineCases.filter(test => test.status === 'failed');
assert.equal(failures.length, spec.expectedBaselineFailures);
assert.ok(baselineCases.every(test => ['passed', 'failed'].includes(test.status)));
for (const test of failures) console.log('PROVEN BASELINE FAILURE:', test.fullName, test.failureMessages.join('\n'));

for (const change of spec.changes) {
  const dest = checkedPath(change.path);
  let text = fs.readFileSync(dest, 'utf8');
  for (const edit of change.edits) {
    assert.ok(edit.before.length > 0);
    assert.equal(text.split(edit.before).length - 1, 1, `Patch anchor must be unique: ${change.path}`);
    text = text.replace(edit.before, edit.after);
  }
  fs.writeFileSync(dest, text);
}
const focused = vitest('focused', [...new Set([...spec.tests.map(test => test.path), ...spec.focused])]);
assert.equal(focused.report.numFailedTests, 0);
execute('build', ['npm', 'run', 'build']);
execute('bundle-audit', ['npm', 'run', 'audit:openclaw', '--', '--criticals-only']);
execute('duplication', ['npm', 'run', 'dup']);
const full = vitest('full-coverage', [], true);
assert.equal(full.report.numFailedTests, 0);
execute('whitespace', ['git', 'diff', '--check']);
const changed = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
assert.deepEqual([...new Set([...changed, ...untracked])].sort(), [...expectedPaths].sort(), 'Do not publish incidental generated or unrelated changes');
execute('stage', ['git', 'add', '--', ...expectedPaths]);
execute('commit', ['git', '-c', 'user.name=Divyam Talwar', '-c', 'user.email=194859478+DivyamTalwar@users.noreply.github.com', 'commit', '-m', spec.title]);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const summary = {
  id: spec.id, base: spec.base, branch: spec.branch, sha, title: spec.title,
  files: [...expectedPaths],
  baselineFailed: failures.length, focusedPassed: focused.report.numPassedTests,
  fullPassed: full.report.numPassedTests, fullSkipped: full.report.numPendingTests,
};
fs.writeFileSync(path.join(out, `${spec.id}-result.json`), JSON.stringify(summary, null, 2));
console.log('CONTRIBUTION_VALIDATED=' + JSON.stringify(summary));
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `branch=${spec.branch}\nsha=${sha}\n`);
