# 📜 Local CI Contract for Coding Agents [GRH-180, GRH-185]

Tài liệu này xác định giao diện chuẩn mực để **mọi coding agent** (Antigravity, Codex, Claude Code, Cursor...) tương tác với hệ thống Local CI của GitRunnerHub một cách nhất quán.

---

## 1. Hợp đồng 2 Lệnh Thống Nhất (Two-Command Contract)

Mỗi repository tham gia hệ thống Local CI đều tuân thủ hợp đồng tối thiểu gồm 2 tệp kịch bản:

```bash
# 1. Chẩn đoán điều kiện môi trường & tài nguyên
bash scripts/ci/doctor.sh

# 2. Thực thi chuỗi kiểm thử xác thực
bash scripts/ci/validate.sh
```

---

## 2. Quy tắc đối với `doctor.sh`
- **Kiểm tra công cụ:** Đảm bảo các runtime bắt buộc (Node, pnpm/npm, Python, compiler) có sẵn và đúng phiên bản.
- **Kiểm tra quyền truy cập:** Đảm bảo các thư mục làm việc và cache có quyền ghi.
- **Không thay đổi mã nguồn:** Tuyệt đối không tự động sửa code hoặc thay đổi git status khi chạy doctor.
- **Mã thoát (Exit Code):** Trả về `0` nếu môi trường khỏe mạnh; trả về `1` kèm thông báo lỗi cụ thể nếu thiếu công cụ.

---

## 3. Quy tắc đối với `validate.sh`
- **Thực thi bộ test thật:** Chạy đầy đủ test suite, typecheck, lint, build preview theo tiêu chuẩn của repo.
- **Chế độ kiểm thử:**
  - `bash scripts/ci/validate.sh` $\rightarrow$ Chạy trên working tree hiện tại (cho phép dirty).
  - `bash scripts/ci/validate.sh --ci` $\rightarrow$ Bắt buộc working tree sạch, commit rõ ràng.
- **Kiểm soát Concurrency:** Sử dụng Linux kernel `flock` để ngăn chặn việc nhiều agent chạy kiểm thử đồng thời làm nghẽn RAM/CPU.
- **Ghi log truy vết:** Toàn bộ output được ghi nhận luân phiên vào thư mục `.ci-logs/`.

---

## 4. Chỉ dẫn dành cho Coding Agents (Antigravity, Codex, Claude Code)

1. **Trước khi commit:** Bắt buộc chạy `bash scripts/ci/doctor.sh` rồi đến `bash scripts/ci/validate.sh`.
2. **Không tự ý sửa hạ tầng Runner:** Trừ khi nhận được task chuyên trách về hạ tầng CI, agent tuyệt đối không tự ý gỡ hoặc sửa đổi cấu hình runner daemon.
3. **Phân biệt lỗi:**
   - Lỗi test sản phẩm (`AssertionError`): Sửa code logic của sản phẩm.
   - Lỗi hạ tầng (hết disk, thiếu quyền): Báo cáo đúng phân loại hạ tầng, không sửa acceptance criteria để lách bài test.
