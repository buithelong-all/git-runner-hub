# 🩺 GitRunnerHub Troubleshooting Guide [GRH-183]

Hướng dẫn giải quyết các sự cố thường gặp khi vận hành GitRunnerHub.

---

## 1. Runner hiển thị Offline trên GitHub
- **Nguyên nhân 1: Máy tính Windows ngủ (Sleep) hoặc WSL2 bị ngắt.**
  - *Khắc phục:* Mở lại máy tính, khởi động terminal WSL (`wsl.exe`), service systemd sẽ tự động kết nối lại trong 10-15 giây.
- **Nguyên nhân 2: Service bị dừng.**
  - *Khắc phục:* Bấm nút `🔄` trên giao diện GitRunnerHub để khởi động lại service.

---

## 2. Lỗi `Registration Token Expired` hoặc `gh auth status` thất bại
- **Nguyên nhân:** Token đăng ký runner chỉ có giá trị trong 60 phút hoặc tài khoản GitHub CLI bị hết hạn phiên.
- **Khắc phục:** Chạy lệnh `gh auth login` trên terminal để làm mới phiên đăng nhập, sau đó bấm lại nút gắn runner.

---

## 3. Lỗi Concurrency Lock (`flock: Timeout`)
- **Nguyên nhân:** Có một tiến trình kiểm thử nặng trước đó bị crash hoặc đang chiếm dụng file lock `/tmp/git_runner_hub_ci.lock`.
- **Khắc phục:** Kiểm tra tiến trình đang chạy (`ps aux | grep validate.sh`). Nếu tiến trình đã chết nhưng lock chưa nhả, xóa file lock: `rm -f /tmp/git_runner_hub_ci.lock`.
