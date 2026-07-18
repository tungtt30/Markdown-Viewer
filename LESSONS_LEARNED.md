# Lessons Learned

Ghi chép các lỗi đã gặp phải khi phát triển **mdTool** (Node core + Tauri desktop
shell), nguyên nhân gốc rễ (root cause) và phương pháp giải quyết (fix). Mục đích:
tránh lặp lại và làm tài liệu tham khảo cho các lần build/bundle sau.

Môi trường gặp lỗi: macOS 26 (Tahoe, build `26.5.2`), Node v22.23.1, Rust + Tauri 2.11.4,
tauri CLI 2.11.4, target `aarch64-apple-darwin`.

---

## 1. Tauri build thất bại ở bước tạo DMG (`Resource busy`)

**Triệu chứng**
```
Bundling mdTool_0.1.0_aarch64.dmg
     Running bundle_dmg.sh
failed to bundle project: error running bundle_dmg.sh: ...
     hdiutil: couldn't unmount "diskN" - Resource busy (os error 16)
```

**Root cause**
- Bước compile Rust và tạo `.app` thành công. Lỗi chỉ ở bước cuối tạo `.dmg`.
- Trên macOS 15 / 26 (Tahoe), script `create-dmg` được Tauri nhúng (vendored,
  `create-dmg 1.2.1`) mở một cửa sổ Finder trên volume đã mount, đồng thời
  QuickLook/Spotlight giữ volume đó → `hdiutil detach` không unmount được →
  thoát với mã lỗi 16 (EBUSY). Đây là lỗi đã biết của macOS 15/26.
- Script `bundle_dmg.sh` được Tauri **tái sinh (regenerate) mỗi lần build**, nên mọi
  patch trực tiếp lên file này đều bị xoá sau build tiếp theo.

**Phương pháp giải quyết**
- Cách tạm thời: patch `bundle_dmg.sh` để đóng mọi cửa sổ Finder
  (`osascript -e 'tell application "Finder" to close every window'`) trước khi
  `hdiutil detach ... -force`, nhưng bị ghi đè mỗi lần `tauri build`.
- Cách bền vững: tạo `make-dmg.sh` (đã commit) tự build `.dmg` từ `.app` đã có,
  không dùng AppleScript mở Finder window → tránh lock. Gọi qua `npm run make-dmg`.
- Thêm `npm run make-dmg` vào `package.json` và tài liệu vào `README.md`.
- Windows không bị ảnh hưởng (NSIS/MSI không dùng `create-dmg`).

**Quy trình build đúng**
```bash
npm run tauri build     # .app build OK; bước dmg có thể lỗi - không sao
npm run make-dmg        # tạo .dmg tin cậy từ .app đã build
```

---

## 2. App bản production báo: `failed to launch mdTool core: No such file or directory (os error 2)`

**Triệu chứng**
App chạy được ở dev (frontend + `node --import tsx`), nhưng khi build xong và chạy
`.app` ở production thì lỗi không tìm thấy file khi Rust shell-out ra CLI.

**Root cause**
- Rust command gọi `node --import tsx src/cli.ts`. Hàm `workspace_root()` duyệt ngược
  từ binary, nhưng trong bản bundle binary nằm ở
  `mdTool.app/Contents/MacOS/mdtool-tauri` → hàm trả về chính `mdTool.app` → resolve
  thành `mdTool.app/src/cli.ts` (không tồn tại) → OS error 2.
- Ngoài ra, bản `.app` chỉ bundle mỗi binary Rust + icon; **không** chứa `src/`,
  `node_modules/`, hay `tsx`. Nên dù path đúng, app cũng không có core để chạy.

**Phương pháp giải quyết** (theo lựa chọn: bundle Node binary + core vào Resources)
- `src-tauri/src/main.rs`:
  - Thêm `bundled_core_dir()` tính `<Resources>/mdTool` từ đường dẫn exe
    (`MacOS` → `Resources` trên macOS; `resources` trên Windows/Linux), aware `node.exe`.
  - `core_root()` ưu tiên `bundled_core_dir()`, fallback `workspace_root()` ở dev.
  - `core_cli()` dùng `bin/node` + `dist/src/cli.js` ở bản bundle; ở dev dùng system
    `node` + `tsx src/cli.ts`.
- `bundle-core.sh`: stage `dist/`, `node_modules/`, `package.json`, theme CSS và một
  Node binary (`bin/node`) vào `bundle-staging/mdTool/`.
- `tauri.conf.json`: `bundle.resources` map `../../bundle-staging/mdTool` → `mdTool`
  (nhúng vào app Resources); `beforeBuildCommand` chạy `bundle-core`.
- `Cargo.toml`: `tauri` features giữ `[]` (xem lỗi #4).

**Kết quả**: `.app` kích thước ~413MB (gồm Node 113MB), app chạy offline, không cần
system Node. Verify: gọi trực tiếp
`$APP/Contents/Resources/mdTool/bin/node .../dist/src/cli.js` sinh PDF thành công.

---

## 3. Theme CSS bị thiếu trong bản bundle (`ENOENT .../themes/github.css`)

**Triệu chứng**
Bản bundle chạy CLI được, nhưng render/export PDF lỗi: không tìm thấy file theme.

**Root cause**
- `loadThemeCss()` trong `src/theme/registry.ts` resolve theme CSS tại
  `dist/src/theme/themes/<name>.css` (dựa vào `__dirname`).
- `tsc` chỉ compile `.ts` → `.js`, **không** copy file `.css`. Ở dev không lỗi vì
  `__dirname` = `src/theme` (có `themes/*.css` source). Ở bản bundle `dist/` không
  có thư mục `themes/`.

**Phương pháp giải quyết**
- Trong `bundle-core.sh` thêm bước copy theme CSS:
  `cp -R "$SCRIPT_DIR/src/theme/themes" "$STAGE/dist/src/theme/themes"`.
- Verify: `dist/src/theme/themes/github.css` xuất hiện trong staging và trong
  `.app/Contents/Resources/mdTool/dist/src/theme/themes/`.

---

## 4. Compile Rust lỗi: `tauri` crate không có feature `path`

**Triệu chứng**
```
error: none of the selected packages contains these features: path
```
khi dùng `tauri::api::path::resource_dir()` với `features = ["path"]`.

**Root cause**
- Tauri 2.11.4 không có feature tên `path`; `resource_dir()` nằm ở module khác /
  bị gated khác. Feature name sai.

**Phương pháp giải quyết**
- Bỏ feature `path`: `tauri = { version = "2", features = [] }`.
- Đổi cách resolve resource dir: tính từ `std::env::current_exe()` theo layout
  `.app` (exe → `Contents/Resources/mdTool`) thay vì dùng `resource_dir()`. Cách này
  không phụ thuộc feature và hoạt động đa nền tảng (có `#[cfg]` macOS vs other).

---

## 5. Compile Rust lỗi: closure `E0593` (takes 0 arguments, expected 1)

**Triệu chứng**
```
error[E0593]: closure is expected to take 1 argument, but it takes 0 arguments
  --> src/main.rs:96:43
    let cli = std::env::var("MDTOOL_CLI").unwrap_or_else(|| {
```

**Root cause**
- `std::env::var(...).unwrap_or_else(...)` expects a closure nhận 1 tham số (error),
  nhưng viết `|| { ... }` (0 tham số).

**Phương pháp giải quyết**
- Sửa thành `unwrap_or_else(|_| { ... })`.

---

## 6. `npm run tauri build` lỗi: `ENOENT .../Code/package.json`

**Triệu chứng**
```
npm error path /Users/trinhtung/UserData/Code/package.json
npm error ENOENT: no such file or directory
beforeBuildCommand `npm run build && npm --prefix .. run bundle-core` failed
```

**Root cause**
- `beforeBuildCommand` dùng `npm --prefix ..`. `..` được resolve relative to thư mục
  làm việc (cwd) của Tauri khi chạy command này. Cwd **không nhất quán** giữa các
  lần chạy (lúc là `tauri-app/`, lúc là repo root) → `..` đôi khi vượt quá repo,
  trỏ lên `/Users/trinhtung/UserData/Code` (không có `package.json`).

**Phương pháp giải quyết**
- Tạo `before-build.sh` tại repo root, tính mọi đường dẫn từ `BASH_SOURCE`
  (`ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`) → cwd-independent.
- `beforeBuildCommand` = `bash before-build.sh || bash ../before-build.sh` (tìm được
  script dù Tauri chạy từ repo root hay từ `tauri-app/`).
- Script chạy: (1) vite build frontend trong `tauri-app/`, (2) `npm run bundle-core`
  ở repo root.
- Verify: build từ repo root chạy đúng vite + tsc + bundle-core; sinh `.app` + `.dmg`.

---

## Tổng kết quy trình build chuẩn (macOS)

```bash
npm install && cd tauri-app && npm install && cd ..
npx playwright install chromium      # 1 lần cho export PDF
npm run tauri build                  # build Rust + .app (+ stage core tự động)
npm run make-dmg                     # tạo .dmg (tránh lỗi Resource busy của Tauri)
```

File liên quan:
- `make-dmg.sh`, `bundle-core.sh`, `before-build.sh` — các bước build/bundle.
- `tauri-app/src-tauri/src/main.rs` — resolve core path (dev vs bundle).
- `tauri-app/src-tauri/tauri.conf.json` — `bundle.resources`, `beforeBuildCommand`.
- `README.md`, `.gitignore` — tài liệu & ignore `bundle-staging/`.
