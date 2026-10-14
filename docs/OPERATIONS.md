# 🛠️ GitRunnerHub Operations Guide [GRH-182]

Hướng dẫn quản trị, vận hành dịch vụ nền và xử lý vòng đời của các Runner.

---

## 1. Cấu trúc Quản lý Dịch vụ

- **Trên Windows / Linux (WSL2):** Quản lý qua `systemd`:
  - Đơn vị dịch vụ: `actions.runner.<owner>-<repo>.<runner-name>.service`
  - Thư mục cài đặt: `/opt/actions-runner-<slug>/`
  - Thư mục làm việc: `/home/actions-runner/work-<slug>/`
- **Trên macOS:** Quản lý qua `launchd`:
  - Đơn vị dịch vụ: `~/Library/LaunchAgents/actions.runner.*.plist`
  - Thư mục cài đặt: `~/actions-runner-<slug>/`

---

## 2. Các Lệnh Vận hành Thường gặp

> Các đường dẫn legacy dưới đây chỉ dành cho vận hành runner cũ. Migration UID riêng phải theo `docs/RUNNER-MIGRATION-P0.md`; không dùng nút detach để chuyển đổi.

### Xem trạng thái runner:
```bash
# Linux / WSL:
sudo bash scripts/runner-lifecycle-linux.sh status <owner/repo>

# macOS:
bash scripts/runner-lifecycle-mac.sh status <owner/repo>
```

### Khởi động lại runner:
```bash
# Linux / WSL:
sudo bash scripts/runner-lifecycle-linux.sh restart <owner/repo>

# macOS:
bash scripts/runner-lifecycle-mac.sh restart <owner/repo>
```

### Gỡ bỏ hoàn toàn (Detach & Cleanup):
```bash
# Linux / WSL:
sudo bash scripts/runner-lifecycle-linux.sh detach <owner/repo> <remove_token>

# macOS:
bash scripts/runner-lifecycle-mac.sh detach <owner/repo> <remove_token>
```
*(Trên giao diện GitRunnerHub Desktop, chỉ cần bấm biểu tượng thùng rác 🗑️ trên thẻ repo là app tự động hoàn tất toàn bộ quy trình này).*

## 3. Migration UID riêng (staging không gián đoạn)

```bash
# Chỉ đọc
bash scripts/runner-migration-linux.sh plan <owner/repo>

# Sau khi Owner duyệt backup + tác động; token không nằm trong argv
gh api --method POST repos/<owner/repo>/actions/runners/registration-token --jq .token \
  | sudo bash scripts/runner-setup-linux.sh --stage-migration <owner/repo> -

# Chỉ sau hai run đúng SHA trên label riêng và busy=false
sudo bash scripts/runner-migration-linux.sh cutover <owner/repo> --verified-runs 2

# Rollback giữ nguyên file và registration của cả hai runner
sudo bash scripts/runner-migration-linux.sh rollback <owner/repo>
```

Không có lệnh cleanup tự động trong migration controller. Việc unregister/xóa runner cũ là một phê duyệt phá hủy riêng sau khi rollback window kết thúc.
