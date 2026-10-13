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
