const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  inspectWorkflow,
  findRunsOnLines,
  findWorkflowDiff,
  generateProposedPatch
} = require('../src/core/workflow');

test('GRH-205: Detect exact line number of runs-on (e.g. Line 12 in docs-check.yml)', () => {
  const sampleDocsCheckYaml = `name: Docs Quality Gate
on:
  push:
    branches: [main, docs/**]
  pull_request:
    branches: [main]

jobs:
  verify-docs:
    name: Docs Verification
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run audit
        run: npm run audit:docs
`;

  const runsOnMatches = findRunsOnLines(sampleDocsCheckYaml);
  assert.equal(runsOnMatches.length, 1);
  assert.equal(runsOnMatches[0].lineNumber, 11); // line 11 in this string
  assert.equal(runsOnMatches[0].target, 'ubuntu-latest');
  assert.equal(runsOnMatches[0].isGithubHosted, true);
});

test('GRH-206: Generate clean 1-click patch replacing ubuntu-latest with self-hosted runner', () => {
  const sampleYaml = `name: CI
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;

  const patched = generateProposedPatch(sampleYaml);
  assert.ok(patched.includes('runs-on: [self-hosted, Linux, X64]'));
  assert.ok(!patched.includes('runs-on: ubuntu-latest'));

  const diffs = findWorkflowDiff(sampleYaml, patched);
  assert.ok(diffs.length > 0);
  const runsOnDiff = diffs.find(d => d.original.includes('ubuntu-latest'));
  assert.ok(runsOnDiff);
  assert.ok(runsOnDiff.patched.includes('[self-hosted, Linux, X64]'));
});

test('GRH-206: Preserves existing self-hosted runners without duplicate patching', () => {
  const selfHostedYaml = `name: CI
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: [self-hosted, Linux, X64]
    steps:
      - run: npm test
`;

  const inspection = inspectWorkflow(selfHostedYaml);
  assert.equal(inspection.routing, 'SELF_HOSTED');

  const matches = findRunsOnLines(selfHostedYaml);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].isGithubHosted, false);
});
