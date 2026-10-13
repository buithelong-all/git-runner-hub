# 🛡️ GitRunnerHub Security Model & Threat Boundary [GRH-150..157]

Tài liệu này xác định các ranh giới bảo mật, chính sách kiểm soát quyền hạn và giải pháp phòng vệ khi biến máy cá nhân thành GitHub Actions Self-Hosted Runner.

---

## 1. Phân loại Rủi ro Repository [GRH-150..152]

| Loại Repo | Đánh giá | Rủi ro chính | Chính sách thực thi |
|---|---|---|---|
| **Private Repository** | 🟢 **SAFE** | Thấp — Chỉ các thành viên được ủy quyền mới có thể tạo PR và push code. | Cho phép tự động chạy runner kiểm thử. |
| **Public Repository** | 🟡 **WARNING / BLOCKED** | **CỰC KỲ CAO** — Bất kỳ ai trên internet đều có thể fork repo và tạo Pull Request chứa mã độc để chiếm quyền máy tính. | **MẶC ĐỊNH CHẶN** chạy workflow từ các fork PR chưa được phê duyệt. Yêu cầu xác nhận thủ công từ chủ sở hữu. |

---

## 2. Nguyên tắc Đặc quyền Tối thiểu (Principle of Least Privilege) [GRH-153, GRH-154]

1. **Non-Root Execution:** Toàn bộ runner jobs chạy dưới tài khoản dịch vụ chuyên dụng `actions-runner` (UID 1000). Tuyệt đối không chạy job dưới quyền `root`.
2. **Không Passwordless Sudo:** Tài khoản `actions-runner` **KHÔNG** được cấp quyền `sudo ALL=(ALL) NOPASSWD: ALL`. Nếu một tiến trình cố tình chạy `sudo`, nó sẽ bị chặn do đòi mật khẩu.
3. **Không chia sẻ Docker Socket:** Không gắn quyền truy cập `/var/run/docker.sock` hoặc cờ `--privileged` cho runner mặc định, tránh privilege escalation.
4. **Cô lập SSH & Credential Cá nhân:** Thư mục home của tài khoản runner (`/home/actions-runner`) hoàn toàn tách biệt với thư mục home của user cá nhân trên host (`~/.ssh`, `~/.aws`, `~/.kube`).

---

## 3. Cô lập Không gian làm việc giữa các Repository [GRH-156]

- Mỗi repository được cấp một thư mục runner và workspace riêng biệt:
  - Cài đặt: `/opt/actions-runner-<owner>-<repo>` (Phân quyền `700`)
  - Workspace: `/home/actions-runner/work-<owner>-<repo>` (Phân quyền `700`)
- **Ngăn chặn lây nhiễm chéo:** Tiến trình của Repository A không có quyền can thiệp vào mã nguồn hoặc artifact của Repository B.

---

## 4. Kiểm duyệt & Loại bỏ Dữ liệu Nhạy cảm khỏi Logs (Redaction) [GRH-155]

- Bộ lọc `redactSecrets()` trong `src/core/security.js` tự động quét và che giấu:
  - GitHub Personal Access Tokens (`ghp_*`, `github_pat_*`)
  - GitHub Actions Runner Registration Tokens (29-32 ký tự alphanumeric)
  - Bearer headers và các mật khẩu dạng chuỗi kết nối.
- Tuyệt đối không lưu trữ các registration token vào file cấu hình vĩnh viễn hoặc git commits. Token chỉ được truyền qua bộ nhớ trong lúc đăng ký.
