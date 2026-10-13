# GitRunnerHub v2 Upgrade Plan

Status: **READY_FOR_IMPLEMENTATION**  
Owner: **Bui The Long**  
Execution agent: **Antigravity / Codex / Claude Code compatible**  
Baseline audited: `main@645a6c82da26d86868b8cc5bf8877290757e015a`  
Target: turn GitRunnerHub from a runner provisioner into a reliable **Local CI Control Plane** for multiple repositories and coding agents.

---

## 1. Product objective

GitRunnerHub v2 must provide one stable contract:

```
Coding Agent -> Local validation contract -> GitHub self-hosted runner -> verified CI result
```

The hub owns runner lifecycle, routing, status, isolation, verification and operational evidence.

Each repository owns its own test/build logic.

A repository is **not** considered Local-CI-ready merely because a runner is online.

Definition of READY:

```
runner provisioned
+ runner verified online
+ workflow routed to intended labels
+ validation entrypoint exists
+ real CI run executed on that runner
+ exact SHA recorded
+ result and evidence available
= READY
```

---

## 2. Non-negotiable constraints

1. Do not enable paid GitHub Actions usage.
2. Do not silently fall back to GitHub-hosted runners.
3. Do not merge, release or deploy production as part of this project.
4. Do not weaken required checks to obtain a green status.
5. Do not execute untrusted fork PR code on a persistent self-hosted runner.
6. Do not expose GitHub tokens, SSH keys or host credentials in logs.
7. Do not share one writable Unix identity across unrelated repository workspaces.
8. Do not rewrite the application unless a blocker is demonstrated.
9. Preserve Electron security defaults: `contextIsolation: true`, `nodeIntegration: false`.
10. Implementation claims require executable evidence, not UI state alone.

---

## 3. Current audit findings to close

### P0 blockers

- **GRH-001 — Runner online != CI attached**
  - Current setup registers the runner but does not ensure the target repository workflow routes jobs to it.
  - Acceptance: the app can detect workflow routing and only report READY after a real self-hosted run.

- **GRH-002 — Linux/WSL GitHub authentication boundary is unsafe/brittle**
  - Current Linux setup runs through sudo/root while using `gh api`; Windows UI authentication and WSL/root authentication may differ.
  - Acceptance: token acquisition happens in the authenticated user context and only the minimum privileged installation steps escalate.

- **GRH-003 — Public repository persistent-runner risk**
  - Current UI permits setup for public repos without a trust warning or blocking policy.
  - Acceptance: persistent self-hosted execution for public/untrusted PR code is denied by default. Explicit override must be visible and auditable.

- **GRH-004 — Cross-repository isolation**
  - Current Linux runners share the `actions-runner` Unix account.
  - Acceptance: per-repository service identities/workspaces, or an equivalent documented isolation boundary.

### P1 high severity

- **GRH-005 — README promises flock but implementation has none**
- **GRH-006 — README promises doctor/validate contract but files do not exist**
- **GRH-007 — Setup success is not verified against GitHub**
- **GRH-008 — Missing detach/uninstall lifecycle**
- **GRH-009 — Runner binary integrity not verified**
- **GRH-010 — Linux runner architecture hard-coded to x64**
- **GRH-011 — Setup idempotency incomplete**
- **GRH-012 — Status detection accepts any online runner as this app's runner**

### P2 completeness / quality

- **GRH-013 — Offline vs unconfigured state conflation**
- **GRH-014 — Repository list limited to 100 without pagination**
- **GRH-015 — No automated tests**
- **GRH-016 — No lockfile / non-reproducible desktop build**
- **GRH-017 — Runner version hard-coded without update policy**
- **GRH-018 — WSL HTTP/2 patch applied broadly and errors swallowed**
- **GRH-019 — Renderer lacks CSP and uses unsafe innerHTML with dynamic data**
- **GRH-020 — No operational evidence model for SHA/run/runner/validation state**

---

## 4. Target architecture

```
GitRunnerHub
|
+-- Desktop UI
|   +-- repository inventory
|   +-- runner state
|   +-- workflow routing state
|   +-- last validation evidence
|   +-- security/risk state
|
+-- Control Plane
|   +-- runner lifecycle
|   +-- repo adapter
|   +-- validation contract discovery
|   +-- verification engine
|   +-- evidence store
|
+-- Host Runtime
|   +-- per-repo service identity
|   +-- per-repo runner directory
|   +-- per-repo workspace
|   +-- bounded concurrency
|   +-- local logs/evidence
|
+-- GitHub
    +-- repo-scoped runner registration
    +-- workflow routing
    +-- check/run result
```

### State model

Every repository must have independent status dimensions:

```
Runner:       UNINSTALLED | OFFLINE | ONLINE | BUSY | ERROR
Workflow:     UNKNOWN | GITHUB_HOSTED | SELF_HOSTED | MIXED | INVALID
Validation:   MISSING | READY | RUNNING | PASS | FAIL
Security:     SAFE | WARNING | BLOCKED
Overall:      NOT_READY | DEGRADED | READY
```

The UI must never reduce all of these into one boolean.

---

## 5. Stable agent contract

GitRunnerHub must standardize discovery, not business-specific test commands.

Preferred repository contract:

```bash
bash scripts/ci/doctor.sh
bash scripts/ci/validate.sh
```

If a repository already has an equivalent contract, reuse it rather than duplicating logic.

### doctor.sh

Must:
- verify required tools and versions;
- verify resources and writable paths;
- verify required config without exposing secrets;
- fail with a non-zero exit code and useful diagnostics;
- never mutate application code.

### validate.sh

Must:
- run the repository's actual validation suite;
- produce correct exit codes;
- record repository, SHA, dirty/clean state, toolchain and duration;
- never deploy, publish, migrate remote data or modify product code;
- distinguish dirty-working-tree validation from committed-SHA validation.

GitHub Actions and local coding agents must call the same validation entrypoint wherever feasible.

---

## 6. Implementation phases

## Phase 0 — Reproducible baseline

Tasks:
- **GRH-100** Add package-manager lockfile.
- **GRH-101** Add unit-test framework using the smallest viable dependency footprint.
- **GRH-102** Add smoke tests for main-process helpers without requiring real runner registration.
- **GRH-103** Add CI for GitRunnerHub itself that can also be executed locally.
- **GRH-104** Add versioned docs index.

Exit criteria:
- clean install is reproducible;
- tests run locally;
- current behavior captured before major refactor.

---

## Phase 1 — Extract a testable control-plane core

Move shell/process/repository logic out of Electron IPC handlers into modules with explicit inputs and outputs.

Suggested structure:

```
src/core/
  github.js
  runner.js
  repo.js
  workflow.js
  validation.js
  security.js
  evidence.js
  platform.js
```

Tasks:
- **GRH-110** Replace ad-hoc command construction with safe argument arrays / spawn wrappers.
- **GRH-111** Validate repository identifiers strictly as `owner/repo`.
- **GRH-112** Introduce typed/result-shaped internal contracts.
- **GRH-113** Separate privilege-requiring operations from normal-user operations.
- **GRH-114** Add structured errors and user-actionable remediation.

Exit criteria:
- core logic is callable without Electron;
- key logic has tests;
- IPC becomes a thin adapter.

---

## Phase 2 — Secure runner provisioning and lifecycle

### Linux/WSL

Tasks:
- **GRH-120** Detect native Linux vs WSL and CPU architecture.
- **GRH-121** Acquire GitHub registration token in the authenticated user context.
- **GRH-122** Use privilege escalation only for service user/directories/service installation.
- **GRH-123** Create per-repository Unix service identity.
- **GRH-124** Create per-repository runner and work directories with restrictive permissions.
- **GRH-125** Download runner release for detected architecture.
- **GRH-126** Verify checksum/signature information published by GitHub before extraction.
- **GRH-127** Make provisioning idempotent.
- **GRH-128** Implement start/stop/restart/status.
- **GRH-129** Implement detach/unregister/uninstall/cleanup.
- **GRH-130** Replace blanket HTTP/2 patch with conditional, documented WSL remediation only when required.
- **GRH-131** Verify runner online state from GitHub after registration.

### macOS

Apply the same lifecycle guarantees:
- architecture detection;
- integrity verification;
- idempotency;
- lifecycle management;
- post-registration verification.

Exit criteria:
- setup can be safely rerun;
- uninstall removes only managed resources;
- app reports actual GitHub runner state.

---

## Phase 3 — Repo adapter and workflow routing

Tasks:
- **GRH-140** Inspect target repository workflows before setup.
- **GRH-141** Detect GitHub-hosted, self-hosted, mixed and unsupported routing.
- **GRH-142** Generate a proposed workflow patch instead of silently rewriting unrelated workflows.
- **GRH-143** Preserve job/check names when required checks may depend on them.
- **GRH-144** Require custom per-repo runner labels.
- **GRH-145** Detect duplicate `push` + `pull_request` validation triggers and propose de-duplication.
- **GRH-146** Add concurrency/cancel-in-progress only to non-deployment validation workflows.
- **GRH-147** Detect deploy/release workflows and keep them outside automatic migration.
- **GRH-148** Detect/create repository validation contract only when safe; otherwise return explicit MISSING state.
- **GRH-149** Verify a newly triggered run actually executed on the intended self-hosted runner.

Exit criteria:
- “Attach Local CI” means runner + workflow + validation + verification;
- no READY state without an observed real job on intended runner.

---

## Phase 4 — Security model

Tasks:
- **GRH-150** Add public/private repository risk classification.
- **GRH-151** Block untrusted fork PR execution on persistent runner by default.
- **GRH-152** Add explicit security status to repository card.
- **GRH-153** Prevent access to unrelated user home, SSH and production credential paths.
- **GRH-154** Do not grant Docker socket or passwordless sudo by default.
- **GRH-155** Redact tokens/secrets from logs.
- **GRH-156** Add per-repository runtime isolation checks.
- **GRH-157** Add threat-model documentation.

Exit criteria:
- public repo risk is visible and guarded;
- repository A cannot trivially access repository B's managed workspace;
- secrets do not appear in app logs.

---

## Phase 5 — Concurrency, evidence and observability

Tasks:
- **GRH-160** Implement real host-level concurrency limiting; if `flock` is used, test stale/crash behavior.
- **GRH-161** Record local evidence per run:
  - repository;
  - exact checkout SHA;
  - dirty/clean state;
  - GitHub run ID / attempt where applicable;
  - runner name and labels;
  - toolchain;
  - commands;
  - duration;
  - exit codes;
  - provenance/checksums.
- **GRH-162** Add retention and bounded cleanup.
- **GRH-163** Never commit evidence back into target repo automatically.
- **GRH-164** Add “last verified CI” to UI.
- **GRH-165** Distinguish product-test failure from infrastructure failure.
- **GRH-166** Distinguish offline vs unconfigured vs busy vs invalid workflow.

Exit criteria:
- every READY claim points to verifiable run evidence;
- host cannot be overloaded by many simultaneous repo jobs.

---

## Phase 6 — UI hardening and operator workflow

Tasks:
- **GRH-170** Replace dynamic `innerHTML` usage with safe DOM/text rendering.
- **GRH-171** Add Content Security Policy and remove unnecessary remote renderer dependencies.
- **GRH-172** Paginate repository inventory beyond 100.
- **GRH-173** Scope runner detection to GitRunnerHub-managed runner identity/labels.
- **GRH-174** Add actions:
  - Attach;
  - Verify;
  - Start;
  - Stop;
  - Restart;
  - Detach;
  - Open CI history.
- **GRH-175** Display multi-dimensional status.
- **GRH-176** Add “why not ready?” diagnostics.
- **GRH-177** Do not optimistically mark runner online after script exit 0; refresh authoritative state.

Exit criteria:
- UI state is evidence-backed;
- operator can diagnose and recover common failures without shell archaeology.

---

## Phase 7 — Documentation and multi-agent adoption

Tasks:
- **GRH-180** Add `docs/LOCAL-CI-CONTRACT.md`.
- **GRH-181** Add `docs/SECURITY.md`.
- **GRH-182** Add `docs/OPERATIONS.md`.
- **GRH-183** Add `docs/TROUBLESHOOTING.md`.
- **GRH-184** Add repository onboarding template.
- **GRH-185** Add concise instructions for Antigravity, Codex and Claude Code:
  - run doctor;
  - run validate;
  - never modify runner infrastructure without an explicit infrastructure task;
  - report exact SHA and evidence;
  - do not treat GitHub quota failure as product-test failure.

Exit criteria:
- a new coding agent can use the system without knowing runner internals.

---

## 7. First reference implementation: CAE Vietnam

Repository: `buithelong-all/caevietnam.vn`

Use CAE as the first end-to-end acceptance target because its current validation workflow is already known.

The implementation must:

1. Detect the existing validation workflow.
2. Preserve the validation/check contract.
3. Route only validation to the self-hosted runner.
4. Avoid production/release migration.
5. Reuse or introduce `scripts/ci/doctor.sh` and `scripts/ci/validate.sh` so local agents and GitHub Actions call the same logic.
6. Trigger a new workflow run on the updated configuration.
7. Prove from GitHub run/job data that the intended local runner executed it.
8. Record exact SHA and outcome.
9. Demonstrate that a deliberate temporary validation failure returns non-zero and is surfaced as FAIL.
10. Restore the temporary test condition and confirm PASS when product code is valid.

Do not use rerun of an old workflow revision as acceptance evidence for new routing.

---

## 8. Acceptance rubric

A release candidate is accepted only if all P0 requirements pass.

### Functional — 25
- setup works;
- verify works;
- rerun-safe;
- detach works;
- CAE end-to-end works.

### Security — 25
- privilege boundary;
- per-repo isolation;
- public/fork guard;
- secret redaction;
- binary verification.

### Reliability — 20
- idempotency;
- offline recovery;
- concurrency control;
- correct state model.

### Evidence / observability — 15
- exact SHA;
- GitHub run/job/runner proof;
- logs;
- failure classification.

### Developer / agent experience — 10
- doctor/validate contract;
- clear docs;
- predictable commands.

### UI correctness — 5
- safe rendering;
- authoritative status.

Target: **>= 90/100 with no P0 blocker open.**

A score is not a substitute for the explicit P0 gate.

---

## 9. Execution rules for Antigravity

1. Read this plan before editing.
2. Inspect current HEAD; do not assume the audit baseline is still HEAD.
3. Do not overwrite concurrent work.
4. Work in small atomic commits referencing GRH task IDs.
5. Before each phase, run current tests and capture baseline.
6. After each phase, run relevant tests and record evidence.
7. If blocked, try at least three reasonable technical approaches before escalating, unless the blocker is permissions/security/user approval.
8. Never mark a task complete from code inspection alone when runtime verification is required.
9. Do not self-declare production readiness without the acceptance evidence listed here.
10. Prefer extending the existing codebase over rewriting.
11. Keep the desktop UI usable throughout; no “big bang” rewrite.
12. If a requirement conflicts with platform behavior, document the exact constraint and propose the smallest safe deviation.

---

## 10. Delivery sequence

Recommended order:

```
Wave 1: GRH-100..114
Wave 2: GRH-120..131
Wave 3: GRH-140..149
Wave 4: GRH-150..157
Wave 5: GRH-160..166
Wave 6: GRH-170..177
Wave 7: GRH-180..185
Wave 8: CAE end-to-end acceptance
```

Do not begin broad multi-repo rollout before Wave 8 passes.

---

## 11. Definition of Done

GitRunnerHub v2 is done when:

- a repository can be onboarded without manually installing a runner;
- the hub knows whether workflow routing is actually correct;
- all coding agents can invoke one local validation contract;
- GitHub can route validation to the local machine without paid hosted minutes;
- a real run proves which runner and SHA were tested;
- the host remains isolated enough that one repo cannot casually read another repo's managed workspace;
- public/untrusted PR risk is blocked or explicitly controlled;
- setup, verify, restart and detach all work;
- the app can explain why a repo is not READY;
- CAE Vietnam passes the reference acceptance flow;
- documentation is sufficient for another coding agent to operate the system without hidden context.

