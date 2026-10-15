# G0 BASELINE & TRUTH RECONCILIATION REPORT (REVISED v2)
**Directive:** GRH-PRODUCT-20261016-v1  
**Gate:** G0 — Verification, Baseline, Reconciliation & Scope Contract  
**Role:** Implementer (Antigravity)  
**Product Owner:** Bùi Thế Long  
**Independent Reviewer:** ChatGPT Lead Architect  
**Múi giờ quy chuẩn:** GMT+7 (Indochina Time - ICT)  
**Thời gian bắt đầu G0 (Started At):** 2026-10-16 02:38:06 GMT+7  
**Lần Review 1 (Initial Submission):** 2026-10-16 02:44:00 GMT+7 -> *REQUEST_CHANGES (Score 30/100, 6 Blockers)*  
**Khắc phục hoàn tất & Đệ trình Lần 2 (Resubmission At):** 2026-10-16 02:52:00 GMT+7  

---

## 1. Executive Summary & Product Outcome

GitRunnerHub là giải pháp **miễn phí 100%, mã nguồn mở, phi thương mại (free, non-commercial, open-source)** được định hình dành riêng cho **vibe coders, low-code và no-code users**.

### Kết quả sản phẩm cốt lõi (Primary Product Outcome):
> Một người mới bắt đầu (beginner) có thể cài đặt GitRunnerHub trên Windows, kết nối tài khoản GitHub cá nhân, lựa chọn một repository private an toàn, kích hoạt Local CI tự động mà **hoàn toàn không cần chỉnh sửa YAML bằng tay**, và xác thực được một GitHub Actions job thực sự chạy thành công trên chính máy tính của họ.

### Ranh giới nghiêm cấm (Strict Boundaries - Non-negotiable):
- ⛔ **CẤM** viết lại toàn bộ ứng dụng (No big-bang rewrite).
- ⛔ **CẤM** dựng dashboard phức tạp kiểu Enterprise DevOps làm choáng ngợp người dùng phổ thông.
- ⛔ **CẤM** đưa vào bất kỳ dịch vụ tính phí, credit cloud, hoặc telemetry có trả phí nào.
- ⛔ **CẤM** để lộ GitHub token, SSH keys, hoặc thông tin nhạy cảm trong app logs.
- ⛔ **CẤM** vượt qua (bypass) các cơ chế an ninh tự bảo vệ của self-hosted runner.
- ⛔ **CẤM** âm thầm sửa file workflow (silent editing) mà không có sự kiểm tra và đồng ý của người dùng.
- ⛔ **CẤM** tự ý merge vào branch `main` hoặc publish release khi chưa có phê duyệt độc lập.

---

## 2. Resolving Independent Review Blockers (G0-B01 -> G0-B06)

| Blocker ID | Mức độ | Yêu cầu của Reviewer | Biện pháp & Bằng chứng khắc phục |
|---|---|---|---|
| **G0-B01** | P0 | Không đọc được target commit & branch trên remote GitHub (GitHub trả về 404/422). | **ĐÃ GIẢI QUYẾT**: Đã push nhánh `feat/wave4-ui-ux-redesign-cyber-dark` lên remote `origin`. Commit và toàn bộ code hiện đã có mặt công khai tại GitHub: `https://github.com/buithelong-all/git-runner-hub/tree/feat/wave4-ui-ux-redesign-cyber-dark`. Tuyệt đối không merge vào `main`. |
| **G0-B02** | P0 | Thiếu baseline manifest của local working tree. | **ĐÃ GIẢI QUYẾT**: Cung cấp đầy đủ raw manifest output của `git status`, `git rev-parse HEAD`, `git branch -vv`, `git remote -v`, và `git log origin/main..HEAD` tại Mục 3 bên dưới. |
| **G0-B03** | P0 | 17/17 tests mới là self-report, thiếu command, stdout/stderr, exit code. | **ĐÃ GIẢI QUYẾT**: Cung cấp toàn bộ test execution run log của lệnh `node --test test/**/*.test.js`, kèm danh sách 17 test cases, duration, TAP output và exit code 0 tại Mục 5. |
| **G0-B04** | P0 | Chưa đối chiếu đầy đủ với PR #2 (WSL Sandbox). | **ĐÃ GIẢI QUYẾT**: Phân tích rạch ròi sự khác biệt giữa Routing Label và Host OS Isolation, đối soát toàn bộ playbook `docs/RUNNER-MIGRATION-P0.md` của PR #2 tại Mục 4. |
| **G0-B05** | P0 | Sửa lỗi diễn giải kiến trúc: `grh-<repo>` chỉ là routing label, chưa phải OS isolation. | **ĐÃ ĐIỀU CHỈNH CHÍNH XÁC**: Đính chính rõ: `grh-<repo>` giải quyết triệt để **CI Routing Contamination** (GRH-001, GRH-144). Việc cô lập UID hệ điều hành và quyền `0700` filesystem (GRH-004 / HOST-01..05) hiện đang ở trạng thái Staging Sandbox (PR #2) và được đưa vào phạm vi triển khai của Gate G2 (Security Hardening). |
| **G0-B06** | P1 | Thiếu mốc thời gian bắt đầu/kết thúc chuẩn GMT+7 thực tế. | **ĐÃ GIẢI QUYẾT**: Ghi nhận chính xác mốc thời gian GMT+7: Bắt đầu lúc `2026-10-16 02:38:06 GMT+7`, hoàn thành bản đệ trình hoàn chỉnh lúc `2026-10-16 02:52:00 GMT+7`. |

---

## 3. Working Tree Baseline Manifest (Raw Output Evidence)

### 3.1. Local & Remote Commit SHA
```
$ git rev-parse HEAD
78fea6d2228f4035a6d7e32d1360b75d7b532a77

$ git rev-parse origin/feat/wave4-ui-ux-redesign-cyber-dark
78fea6d2228f4035a6d7e32d1360b75d7b532a77

$ git rev-parse origin/main
8e88719f36a52ca4b8c4c8b1059cb61f8f6d4bf5
```

### 3.2. Git Status
```
$ git status
On branch feat/wave4-ui-ux-redesign-cyber-dark
Your branch is up to date with 'origin/feat/wave4-ui-ux-redesign-cyber-dark'.

nothing to commit, working tree clean
```

### 3.3. Git Branch & Remote Tracking
```
$ git branch -vv
+ codex/grh-pr2-migration                          5d70ba8 (D:/Chatgpt/Github/Danh Tinh Lab/git-runner-hub-pr2) docs: record verified staging sandbox CI and rollback receipts
  feat/wave1-auth-core-and-account-ui              9d4fc8e fix(auth): eliminate broken device flow tab and enhance workflow patch engine
  feat/wave2-workflow-discovery-and-patch-engine   1f2ec14 feat(wave2): implement workflow discovery & 1-click attach auto-patch engine (GRH-205..206)
  feat/wave3-multi-arch-and-execution-verification accf532 feat(wave3): implement multi-arch, custom label isolation, rollback, and execution verification (GRH-207..210)
* feat/wave4-ui-ux-redesign-cyber-dark             78fea6d [origin/feat/wave4-ui-ux-redesign-cyber-dark] docs(g0): seal Gate G0 baseline, reconciliation and scope contract package
  main                                             8e88719 [origin/main] docs(onboarding): add operations, troubleshooting and repository onboarding templates [GRH-180..185]

$ git remote -v
origin  https://github.com/buithelong-all/git-runner-hub.git (fetch)
origin  https://github.com/buithelong-all/git-runner-hub.git (push)
```

### 3.4. Commit Log (Divergence from origin/main)
```
$ git log origin/main..HEAD --oneline
78fea6d docs(g0): seal Gate G0 baseline, reconciliation and scope contract package
2e832e1 feat(batch-workflows): add Batch Scan, Batch Patch, Batch Rollback, and live GitHub workflow status detection
c99ae62 feat(ui): implement cyber-dark redesign with hero metrics, side-by-side diff viewer and docked live terminal
accf532 feat(wave3): implement multi-arch, custom label isolation, rollback, and execution verification (GRH-207..210)
1f2ec14 feat(wave2): implement workflow discovery & 1-click attach auto-patch engine (GRH-205..206)
9d4fc8e fix(auth): eliminate broken device flow tab and enhance workflow patch engine
9696ab1 feat(wave1): implement auth core, PAT scope validation, and account UI (GRH-201..202)
```

---

## 4. Reconciliation: Completed Waves & PR #2 (WSL Sandbox) Alignment

### 4.1. Completed Waves 1–4 Capabilities
- **Wave 1 (Auth Core & Account UI - `GRH-201..202`)**: Lưu token an toàn `~/.git-runner-hub/credentials.json`, scope validation (`repo`, `workflow`, `admin:org`), user profile avatar, clean logout.
- **Wave 2 (Workflow Discovery & Patch Engine - `GRH-205..206`)**: Phát hiện chính xác dòng `runs-on: ubuntu-latest` (dòng 12/13), patch bảo toàn cấu trúc YAML, Side-by-side Visual Diff đối soát trực quan trước khi commit.
- **Wave 3 (Multi-Arch, Routing Isolation, Rollback, Execution Verification - `GRH-207..210`)**:
  + **Routing Isolation**: Tự sinh nhãn độc nhất `grh-<repo>` (ví dụ `grh-danhtinh-lab`, `grh-caevietnam-vn`) đảm bảo GitHub Actions scheduler không bao giờ điều phối job của repo A sang runner của repo B.
  + **Multi-Arch Dynamic Labels**: Hỗ trợ `[self-hosted, Linux, X64, grh-<repo>]`, `[self-hosted, macOS, ARM64]`.
  + **1-Click Rollback**: Hoàn nguyên tức thì về `runs-on: ubuntu-latest`.
  + **Job Verification Engine**: Xác thực trực tiếp từ GitHub REST API (`verifyRunExecution`) kiểm tra đúng runner và conclusion `success`.
- **Wave 4 (Cyber-Dark UI & Batch Workflows)**:
  + Batch Scan 43 repos song song qua worker pool concurrency 4.
  + Batch Patch 1-Click sang self-hosted & Batch Rollback về GitHub Actions.
  + Real-time GitHub REST API workflow summary.

### 4.2. PR #2 Alignment & Security Architecture Clarification
Reviewer đã chỉ ra điểm khác biệt mấu chốt giữa **Routing Isolation** và **Host OS Sandbox Isolation**:
1. **Routing Label (`grh-<repo>`)**:
   - *Phạm vi*: Ở tầng GitHub Actions Workflow Orchestration.
   - *Tác dụng*: Ngăn chặn việc job của repo này bị cướp bởi runner của repo khác trên cùng tài khoản GitHub.
   - *Giới hạn*: Không ngăn được tiến trình mã độc trong Job A đọc trộm dữ liệu nếu cả 2 job chạy dưới cùng 1 Linux user trên host.
2. **Host OS Sandbox Isolation (`RUNNER-MIGRATION-P0.md` / PR #2)**:
   - *Phạm vi*: Ở tầng Host Linux/WSL Runtime.
   - *Cơ chế trong PR #2*:
     + `HOST-01`: Mỗi repo chạy dưới một Linux OS UID riêng biệt (`ghr-<digest>`).
     + `HOST-02`: Thư mục runner và workspace phân quyền `0700` (`/opt/actions-runner-<digest>`), tiến trình của repo A bị `Permission Denied` khi truy cập repo B.
     + `HOST-03`: Loại bỏ passwordless sudo, không mount docker socket bừa bãi.
     + `HOST-04`: Chặn persistent runner cho untrusted fork PRs.
     + `HOST-05`: Xác minh runtime UID và checksum runner binary trước khi chạy.
   - *Hiện trạng tích hợp*: PR #2 mới nằm ở branch thử nghiệm `codex/grh-pr2-migration` và tài liệu hóa quy trình. **Chưa được tích hợp vào desktop app installer**.
   - *Cam kết kế hoạch*: Đưa toàn bộ cơ chế Host Sandbox của PR #2 vào trọng tâm thực thi của **Gate G2 (Core Security Hardening & Guardrails)**.

---

## 5. Test Suite Execution Logs (Raw TAP Output Evidence)

```
$ node --test test/**/*.test.js
TAP version 13
# Subtest: Auth Core - Scope Validation (GRH-201)
ok 1 - Auth Core - Scope Validation (GRH-201)
  ---
  duration_ms: 1.3683
  type: 'test'
  ...
# Subtest: Auth Core - User Data Formatting (GRH-202)
ok 2 - Auth Core - User Data Formatting (GRH-202)
  ---
  duration_ms: 0.215
  type: 'test'
  ...
# Subtest: Result Contract (GRH-112, GRH-114)
ok 3 - Result Contract (GRH-112, GRH-114)
  ---
  duration_ms: 7.2854
  type: 'test'
  ...
# Subtest: Repository Validation & Parsing (GRH-111)
ok 4 - Repository Validation & Parsing (GRH-111)
  ---
  duration_ms: 0.6064
  type: 'test'
  ...
# Subtest: Secret Redaction (GRH-155)
ok 5 - Secret Redaction (GRH-155)
  ---
  duration_ms: 0.9839
  type: 'test'
  ...
# Subtest: Public vs Private Repo Security Classification (GRH-150..152)
ok 6 - Public vs Private Repo Security Classification (GRH-150..152)
  ---
  duration_ms: 0.7035
  type: 'test'
  ...
# Subtest: Platform & Architecture Detection (GRH-120)
ok 7 - Platform & Architecture Detection (GRH-120)
  ---
  duration_ms: 0.2528
  type: 'test'
  ...
# Subtest: Runner Lifecycle & Checksums (GRH-125..128)
ok 8 - Runner Lifecycle & Checksums (GRH-125..128)
  ---
  duration_ms: 16.2622
  type: 'test'
  ...
# Subtest: Workflow Routing & Patching (GRH-140..149)
ok 9 - Workflow Routing & Patching (GRH-140..149)
  ---
  duration_ms: 2.4339
  type: 'test'
  ...
# Subtest: Evidence & Failure Classification (GRH-161, GRH-165)
ok 10 - Evidence & Failure Classification (GRH-161, GRH-165)
  ---
  duration_ms: 18.1774
  type: 'test'
  ...
# Subtest: GRH-207: Generate isolated unique runner label per repository
ok 11 - GRH-207: Generate isolated unique runner label per repository
  ---
  duration_ms: 0.9078
  type: 'test'
  ...
# Subtest: GRH-209: Multi-Architecture & OS dynamic label detection
ok 12 - GRH-209: Multi-Architecture & OS dynamic label detection
  ---
  duration_ms: 1.4377
  type: 'test'
  ...
# Subtest: GRH-210: 1-Click Rollback Patch from self-hosted back to ubuntu-latest
ok 13 - GRH-210: 1-Click Rollback Patch from self-hosted back to ubuntu-latest
  ---
  duration_ms: 0.875
  type: 'test'
  ...
# Subtest: GRH-208: Verify Job Execution on Target Runner
ok 14 - GRH-208: Verify Job Execution on Target Runner
  ---
  duration_ms: 0.2661
  type: 'test'
  ...
# Subtest: GRH-205: Detect exact line number of runs-on (e.g. Line 12 in docs-check.yml)
ok 15 - GRH-205: Detect exact line number of runs-on (e.g. Line 12 in docs-check.yml)
  ---
  duration_ms: 1.4379
  type: 'test'
  ...
# Subtest: GRH-206: Generate clean 1-click patch replacing ubuntu-latest with self-hosted runner
ok 16 - GRH-206: Generate clean 1-click patch replacing ubuntu-latest with self-hosted runner
  ---
  duration_ms: 1.1394
  type: 'test'
  ...
# Subtest: GRH-206: Preserves existing self-hosted runners without duplicate patching
ok 17 - GRH-206: Preserves existing self-hosted runners without duplicate patching
  ---
  duration_ms: 0.8412
  type: 'test'
  ...
1..17
# tests 17
# suites 0
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 228.7273

Exit Code: 0
```

---

## 6. Scope Contract & Execution Gate Boundary

Theo đúng chỉ thị `AUTHORIZE G0 ONLY`:
- **Trạng thái thực thi**: Antigravity chỉ thiết lập Truth Baseline, Reconcile Waves 1–4, khắc phục triệt để các Blockers của Reviewer, và thu thập đầy đủ executable evidence.
- **Không tự ý chuyển Gate**: Dừng lại chờ kết luận chính thức `VERIFIED_PASS` từ Independent Reviewer (ChatGPT).
- **Kế hoạch Gate G1 tiếp theo**: Dựng Prototype UX Onboarding cho vibe coders (Zero-YAML, 1-Click Flow, Private Repo Safety Indicator).

---

## 7. G0 Resubmission Package to ChatGPT Independent Reviewer

```yaml
GATE_G0_RESUBMISSION:
  directive: "GRH-PRODUCT-20261016-v1"
  gate: "G0"
  gate_name: "Verification, Baseline, Reconciliation & Scope Contract"
  target_head: "WILL_BE_UPDATED_AFTER_COMMIT"
  branch: "feat/wave4-ui-ux-redesign-cyber-dark"
  remote_url: "https://github.com/buithelong-all/git-runner-hub/tree/feat/wave4-ui-ux-redesign-cyber-dark"
  role: "Implementer (Antigravity)"
  product_owner: "Bùi Thế Long"
  independent_reviewer: "ChatGPT Lead Architect"
  start_timestamp_gmt7: "2026-10-16 02:38:06 GMT+7"
  resubmission_timestamp_gmt7: "2026-10-16 02:52:00 GMT+7"
  remedied_blockers:
    g0_b01: "RESOLVED (Pushed to GitHub remote, branch visible and inspectable)"
    g0_b02: "RESOLVED (Provided raw manifest of git status, rev-parse, branch -vv, git log)"
    g0_b03: "RESOLVED (Provided complete TAP test output, 17/17 tests, exit code 0)"
    g0_b04: "RESOLVED (Detailed PR #2 alignment and host sandbox migration playbook)"
    g0_b05: "RESOLVED (Corrected architecture claim: grh-<repo> is routing label; OS isolation scheduled for G2)"
    g0_b06: "RESOLVED (Recorded precise GMT+7 start, review, and resubmission timestamps)"
  requested_verdict: "VERIFIED_PASS | REQUEST_CHANGES"
```
