# ⚡ GitRunnerHub

> **1-Click GitHub Actions Self-Hosted Runner Manager for Windows & macOS**  
> *Hạ tầng Local CI dùng chung cho mọi Coding Agent (Antigravity, Codex, Claude Code, Cursor...) — Hoàn toàn miễn phí, 0 phút quota GitHub.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20(WSL2)%20%7C%20macOS%20(Apple%20Silicon%20%26%20Intel)-cyan.svg)]()
[![Cloud Cost](https://img.shields.io/badge/GitHub%20CI%20Cost-%240%20(Unlimited)-10b981.svg)]()

---

## 💡 Bối cảnh & Vấn đề giải quyết

Khi sử dụng nhiều coding agent (Antigravity, Codex, Claude Code...), mỗi lượt push và pull request đều kích hoạt CI kiểm thử. Tài khoản cá nhân trên GitHub nhanh chóng **hết quota phút miễn phí**.

**GitRunnerHub** ra đời để giải quyết triệt để vấn đề này:
- Biến chiếc máy tính cá nhân của bạn (PC Windows hoặc MacBook) thành **hạ tầng GitHub Actions Runner chuyên dụng**.
- Mọi coding agent chỉ cần push code lên GitHub, GitHub sẽ tự động bắn job kiểm thử về máy của bạn để chạy ngầm hoàn toàn miễn phí.
- **Không bao giờ tốn thêm 1 đồng ngân sách nào cho GitHub Actions.**

---

## ✨ Tính năng nổi bật

- 🖥️ **Đa nền tảng (Cross-Platform):** Hỗ trợ xuất sắc cả **Windows (qua WSL2 Ubuntu)** và **macOS (Apple Silicon M1/M2/M3/M4 & Intel x64)**.
- 🔄 **Tự động quét & nạp Repository:** 1-Click nạp toàn bộ danh sách repos từ tài khoản GitHub thông qua `gh CLI`.
- ⚡ **1-Click Kích hoạt Runner:** Tự động xin token từ GitHub API, tải bản binary runner chính thức, và đăng ký service hệ thống (`systemd` trên Linux/WSL2, `launchd` trên macOS).
- 🔒 **Ghi nhớ vĩnh viễn:** Một khi đã kích hoạt, runner chạy như một background daemon thường trực. Bạn không bao giờ phải nhập lại!
- 🛡️ **Khóa tương tranh an toàn (Linux Kernel `flock`):** Đảm bảo nhiều agent không làm quá tải CPU/RAM của máy.

---

## 🚀 Hướng dẫn bắt đầu nhanh

### 1. Yêu cầu tiên quyết
- Đã cài đặt [GitHub CLI (`gh`)](https://cli.github.com/) và đăng nhập tài khoản:
  ```bash
  gh auth login
  ```
- **Trên Windows:** Đã bật WSL2 (Ubuntu).
- **Trên macOS:** Sẵn sàng Terminal bash/zsh.

### 2. Cài đặt và chạy GitRunnerHub (Desktop App)
```bash
# Clone repo
git clone https://github.com/buithelong-all/git-runner-hub.git
cd git-runner-hub

# Cài đặt dependencies
pnpm install # hoặc npm install

# Chạy ở chế độ phát triển
pnpm start

# Đóng gói bản Portable Windows (.exe)
pnpm dist:win

# Đóng gói bản macOS (.dmg)
pnpm dist:mac
```

---

## 🛠️ Cấu hình trong Repository của bạn

Sau khi bấm **`⚡ Gắn Local CI`** trên GitRunnerHub cho repository (ví dụ `caevietnam.vn`), trong repo đó bạn chỉ cần cấu hình file `.github/workflows/ci.yml`:

```yaml
name: Local CI Verification

on:
  push:
    branches: ["main", "codex/**"]
  pull_request:

jobs:
  validate:
    name: Test & Build on Local Runner
    # Trỏ về nhãn tự động do GitRunnerHub tạo ra:
    runs-on: [self-hosted, Linux, X64]
    
    steps:
      - name: Checkout Source
        uses: actions/checkout@v4

      - name: Run Validation Suite
        run: |
          bash scripts/ci/validate.sh --ci
```

---

## 👥 Dành cho các Coding Agent (Antigravity, Codex, Claude Code)

Mọi coding agent khi làm việc trong repo đã kích hoạt runner đều có thể kiểm thử trước bằng terminal:

```bash
# Kiểm tra môi trường
bash scripts/ci/doctor.sh

# Chạy bộ test đầy đủ trước khi commit
bash scripts/ci/validate.sh
```

---

## 📄 License
Phát hành theo giấy phép [MIT License](LICENSE).
Được xây dựng bởi **Bùi Thế Long** (CAE Vietnam).
