# Bàn giao dự án Roadie (Qloo Agentic Hackathon)

Trên máy mới, mở thư mục này bằng Claude Code rồi nói: "Đọc HANDOFF.md và làm tiếp".

## Mốc thời gian

- **Hạn nộp gốc đã qua: 31/10/2026 lúc 10:45 giờ VN** (30/10, 23:45 giờ ET).
- Lúc 16:11 ngày 31/10, người dùng thấy Devpost vẫn cho cập nhật, nhưng **chưa xác nhận** đó là
  bài nộp hay chỉ là project trong portfolio. Luật cho sửa portfolio sau hạn, không cho sửa bài nộp.
- Việc đầu tiên trên máy mới: hỏi người dùng trang Devpost đang hiện trạng thái và deadline nào,
  và đơn nộp muộn có được chấp nhận không. Kiểm tra lại giờ hiện tại trước khi lập kế hoạch.
- Top 3 phải rảnh để lên sóng cùng giám khảo ngày 5/11.

## Trạng thái

Roadie là agent lên lịch tour cho nghệ sĩ indie: tìm thành phố hợp gu khán giả, chọn venue,
nghệ sĩ diễn cùng, brand, rồi tính lộ trình. Stack: Next.js 15.5.28, TypeScript, Gemini.

| Hạng mục | Trạng thái |
| --- | --- |
| Agent với Gemini thật, gọi tool đến `submit_tour` | Chạy được, 4,4 giây với dữ liệu mẫu |
| Bộ lập lịch cố định khi LLM lỗi | Chạy được |
| Build và typecheck | Đạt |
| Dữ liệu thật từ Qloo | **Chưa test, chưa có key** |
| Giao diện trên trình duyệt | Chưa bấm thử |
| Bước từ chối tên do model tự nghĩ ra | Chưa gặp trường hợp thực tế |
| Hạn mức miễn phí của Gemini | Chưa rõ |
| GitHub | Xong: repo public, GitHub nhận license MIT |
| Vercel và link demo | Chưa làm, người dùng cần tạo tài khoản Vercel |
| Bài mô tả trên Devpost | Chưa viết |

Repo: https://github.com/AIVIETNAM-AIO-felixdoit/roadie

Form xin key Qloo đã gửi, nhưng đến 16:11 ngày 31/10 vẫn chưa có key. Key gửi về email đã điền
trong form. Nếu chưa có, hỏi lại trên Discord (#api-help).

## Thiết lập trên máy mới

1. Cài Node.js 22.19 trở lên. Chạy `npm install`.
2. Tạo `.env.local` (git đã bỏ qua file này):

   ```
   QLOO_API_KEY=
   GEMINI_API_KEY=
   GEMINI_MODEL=gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash
   ```

3. Chạy `npm run dev`, mở http://localhost:3000.

Không dán key vào chat, repo hay trình duyệt. Tài liệu của Qloo cấm việc này, và `QLOO_API_KEY`
tuyệt đối không được có tiền tố `NEXT_PUBLIC_`.

## Việc tiếp theo, theo thứ tự

1. Khi có key Qloo, thêm vào `.env.local` rồi test một nghệ sĩ thật.
2. Sửa `src/lib/qloo.ts` theo response thật. Các điểm mới là phỏng đoán:
   - Tên tham số của `/search` (`query`, `types`, `take`).
   - Tham số của `/v2/tags` (`filter.query`), và cấu trúc `results.tags`. Đây là chỗ dễ sai nhất.
     Nếu không lọc đúng tag, `find_venues` sẽ trả về nhà hàng thay vì venue âm nhạc.
   - Trường `query.affinity`, tọa độ `location.lat/lon`, và `properties.address`.
   - Liệu `signal.interests.entities` có nhận nhiều id cách nhau bằng dấu phẩy không.
3. Kiểm tra nghệ sĩ nhỏ có trong Qloo không, và dữ liệu theo địa lý có đủ dùng không.
4. Bấm thử giao diện trên trình duyệt, cả ở độ rộng điện thoại.
5. Deploy lên Vercel gói Hobby, thêm biến môi trường trên Vercel, test link công khai.
6. Viết mô tả tiếng Anh trên Devpost: tính năng, và vì sao bỏ Qloo thì app không chạy được.
7. Xóa `HANDOFF.md` khỏi repo trước khi nộp bài.

Nếu còn thời gian: làm vài lịch tour mẫu từ dữ liệu thật để giám khảo vẫn xem được khi hết hạn
mức Gemini, và so sánh với kết quả của LLM không có Qloo.

## Yêu cầu nộp bài

- Link demo chạy thật, host bên ngoài, ai cũng dùng được miễn phí đến hết thời gian chấm.
- Repo public, đủ mã nguồn và hướng dẫn, có file license nhận diện được.
- Mô tả bằng tiếng Anh. Không bắt buộc có video.
- Điểm chia đều cho bốn tiêu chí: triển khai kỹ thuật, thiết kế, tác động tiềm năng, chất lượng ý tưởng.

## Thông tin kỹ thuật cần nhớ

- Base URL `https://hackathon.api.qloo.com`, gửi key qua header `X-Api-Key`, dùng GET.
- `urn:entity:destination` bắt buộc có `signal.interests.entities`.
- Tham số sai thường bị bỏ qua âm thầm, nên nhận 200 với `entities` rỗng thì kiểm tra tham số trước.
- Không dùng endpoint `/recommendations` hay `/recs`.
- `gemini-2.5-flash` không còn cấp cho người dùng mới. Khi test, `gemini-3.8-flash` bị treo và
  `gemini-3.5-flash` báo 503 lúc quá tải, còn hai model flash-lite phản hồi khoảng 1,5 giây.
- `npm audit` còn lỗi ở `postcss` và `sharp`. App không xử lý ảnh hay CSS từ người dùng nên rủi ro
  thấp. Không nâng lên Next 16 sát hạn.
- `src/lib/mock.ts` chỉ dùng để test. Bản nộp phải chạy bằng dữ liệu Qloo thật.
