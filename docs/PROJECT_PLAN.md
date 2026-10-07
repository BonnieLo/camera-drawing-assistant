# Paper — Camera-based Drawing Assistant

Trace the structure. Create the rest.

## 產品定義

個人使用的 Web App / PWA，直接在 iPhone / iPad Safari 開啟。目的為構圖、輪廓、比例與主要特徵位置的手繪輔助；完成輪廓後關閉工具，由使用者自行處理顏色、筆觸與細節。第一版不使用 ARKit、AI 偵測或 3D tracking。

紙張是持久座標；相機影像是短暫觀察。MVP 不宣稱精密複製、持續自動追蹤或絕對毫米精度。

## 當前交付：M0 + M1 + M2

- M0：產品、架構、UX、repository、驗收與後續 milestones。
- M1：後鏡頭偏好、inline video、contain 預覽、手動四角、拖動微調、Homography、透視網格、模擬角度切換、專注版面、相機失敗提示與離開頁面後重新校準。
- M2：照片匯入與降採樣、CSS matrix3d 透視疊加、紙上移動/雙指縮放與旋轉、透明度、寬度與角度微調、Lock/Unlock、顯示/隱藏、置中、紙面裁切、內建花瓶範例。
- 未開放：保存 Session、PWA 安裝與離線。
- 已驗證：22 項 Node 測試（幾何、Reference composition、手勢、renderer 狀態、相機 race 與 permission denial、DOM stub 操作流程）及 6 個 JS 模組的語法與靜態引用檢查。
- 待驗證：真實 Safari 相機、手指選角、照片 EXIF/HEIC 解碼、CSS perspective 實際渲染、雙指操作、前後景切換、版面與裝置旋轉。本環境未進行瀏覽器 UI QA，不把數學測試視為完整使用流程通過。

## 技術架構

使用 buildless HTML / CSS / ES modules，以 Web 標準實作。當前不需要後端、外部 JS CDN 或框架。純數學模块與 DOM/相機分離，之後增加 renderer、reference、gestures、sessions、lifecycle modules，避免所有能力擠在單一 UI 檔。

### 四個座標層

1. Image-local：圖片像素，含 EXIF 方向校正後的尺寸。
2. Paper：以使用者指定的紙張寬高為物理比例，持久保存位置與尺寸。
3. Camera：未鏡像的 video 原始影像；角落保存為 x/videoWidth、y/videoHeight。
4. Viewport：CSS pixels；僅負責顯示與觸控，Canvas backing store 另外乘 DPR。

M1 投影鏈：normalized paper → Homography → normalized camera → contain rectangle → viewport。

M2 完整鏈：image-local → reference transform in paper → Homography → camera → viewport。

相機影像使用 contain，不 crop，也不鏡像。Pointer 要先扣掉影像留白，然後轉回 normalized camera。CSS pixels、video pixels 與 Canvas DPR 不可混用。

### Homography

四角順序 A=(0,0)、B=(1,0)、C=(1,1)、D=(0,1)，映射到 camera 上的四個點。h33=1，解八個未知数，以 pivoted Gaussian elimination 得到 3×3 matrix。透視除法後得到 camera point。

H 在當次校準有效；Session 的持久真實資料是 paper 與 reference transform。Resume 使用新四角重算 H，不能重用舊 H 對齊新相機。舊角落與 H 只能作為診斷／歷史快照。

四角必須構成有面積的順時針凸四邊形。檢查 non-finite、超出範圍、角落重疊、近共線及區域過小。M1 網格呈現是精確 projective line mapping，不是 affine 拉伸。

### 紙張比例與旋轉

四角不能唯一推定真實紙張長寬比；使用者必须先指定 A4／正方形／M2 自訂寬高。紙張應平整，四角可見。相機鏡頭畸變、紙張彎曲、選角誤差不會被單一 Homography 完全消除。

持久座標定義：centerU=x/paperWidth，centerV=y/paperHeight，widthU=referenceWidth/paperWidth。Reference height 由圖片自身長寬比計算。

旋轉與 pinch 必須在等距的 paper metric 上計算：先用 (u×paperWidth, v×paperHeight)，再繞 reference center 旋轉。不可直接在 normalized unit square 上旋轉，否則非正方形紙張會扭曲形狀。

### M2 renderer 與手勢決策

M2 已實作 CSS matrix3d 的 planar projective image overlay，與 camera 共用 contain rectangle；圖片透明度單獨調整。將 3×3 H 轉成 CSS 4×4 matrix，與 reference-to-paper transform 組合。真實 Safari 視覺驗證未通過前，不視為選型完成；必要時改用 WebGL projective texture rendering。

Reference layer 不攔截 pointer，由統一 gesture surface 處理。移動：觸控 viewport → camera → inverse(H) → paper。雙指縮放/旋轉：兩觸點同樣轉成 paper metric，基於距離與角度更新 transform，保持手勢中心。touch-action:none 僅限 drawing surface，工具區仍正常捲動。Lock 禁止 reference 修改，但允許重新校準。

## Session Schema（M3，尚未實作）

```json
{
  "schemaVersion": 1,
  "id": "uuid",
  "name": "My drawing",
  "createdAt": "ISO-8601 UTC",
  "updatedAt": "ISO-8601 UTC",
  "paper": {"width": 210, "height": 297, "unit": "mm", "orientationAnchor": "A"},
  "reference": {
    "assetId": "IndexedDB blob key",
    "pixelWidth": 1600,
    "pixelHeight": 1200,
    "mimeType": "image/jpeg",
    "centerU": 0.31,
    "centerV": 0.22,
    "widthU": 0.46,
    "rotationRad": 0,
    "opacity": 0.45,
    "locked": true
  },
  "lastRegistration": {
    "cornersNormalizedCamera": [[0.1,0.1],[0.9,0.1],[0.9,0.9],[0.1,0.9]],
    "cameraFrame": {"width": 1920, "height": 1080},
    "capturedAt": "ISO-8601 UTC",
    "diagnosticOnly": true
  }
}
```

IndexedDB 儲存 metadata 與 image Blob，使用 transaction 保證一致；不儲存暫時 object URL，不使用 localStorage 放 base64 大圖。匯入時處理方向、圖片解碼失敗與合理降採樣，維持長寬比。先做明確 Save，再增加變更後短延遲 autosave；不能只依賴 page unload 保存。

Resume：讀取 Session → 顯示參考與紙張設定 → 啟動相機 → 指定相同實體 A–D 四角 → 建立新 H → 保留 reference 的紙上 transform → 顯示 overlay。未校準前不展示為已對齊。

資料只存在當前裝置/瀏覽器的本站儲存；Safari 與主畫面模式共享情況須實測，不預設跨裝置同步。Safari 清除網站資料會使 Session 遺失；M3 一併提供 Session 匯出/匯入作為備份。IndexedDB 失敗／quota 滿必須明確顯示保存失敗，不能假裝成功。

## 相機、Lifecycle 與 PWA

- HTTPS top-level Safari 網址，audio:false，只請求 video。
- facingMode ideal:environment 為偏好而非保證；M1 可顯示已取得前鏡頭，M4 視實機結果補鏡頭選擇。
- video muted、autoplay、playsinline，從明確點擊啟動。
- document hidden / pagehide 時停止 tracks，捨棄 active registration；回到前景讓使用者重新開啟與校準。
- request token 防止權限等待中切換頁面後，延遲回傳的 stream 繼續佔用相機。
- 相機 frame 尺寸／裝置方向改變使校準失效；單純 viewport resize 或專注版面切換只重算 contain mapping，不清除 normalized camera registration。
- 描圖時需要支架或固定裝置。未來「鎖定參考圖」不代表 camera tracking，也不會消除手抖。
- M1「專注画面」是版面切換。M4 以主畫面 standalone + safe-area + dynamic viewport 提供全螢幕體驗；支援 Fullscreen API 時僅作 enhancement，不把 video fullscreen 當 drawing fullscreen。
- M4 只 cache app shell，排除登入、個人化與授權路由，驗證私密站點認證與離線開啟能否共存。若需要調整部署才能完成離線，另行解決，不假稱私密登入頁面離線可用。

## UX

開始／恢復 → 紙張配置 → 相機 → 四角校準 → 參考圖編輯 → Lock → 專注描圖 → Save。

當前版本提供模擬畫紙，可不授權相機即練習選角。四角有明確 A–D 標記、撤回一角、拖動微調與確認。網格含四邊、中心與對角線，用來驗證當次紙面投影。

M2 drawing UI：相機為主，校準與參考圖片兩個工具分頁，畫面下方提供 Lock / Hide / Align 快捷工具。Opacity 與細調放在參考圖片工具區。Save 尚未開放。提醒文字講使用者下一步，不在主要流程展示矩陣或計算數值。

## Repository Structure

```text
dist/
  index.html
  style.css
  app.js                  M2 UI / lifecycle orchestration
  assets/vase.svg         自製 code-native 花瓶範例
  lib/camera.js           camera permission / lifecycle
  lib/reference.js        image import / paper transform
  lib/gestures.js         physical-paper gestures
  lib/renderer.js         CSS projective image layer
  lib/homography.js       純幾何 / contain mapping
  project-plan.md         網站可讀專案規格副本
docs/
  PROJECT_PLAN.md
  M1_DEVICE_CHECKLIST.md
  M2_DEVICE_CHECKLIST.md
tests/
  homography.test.mjs
  reference.test.mjs
  camera.test.mjs
  app-runtime.test.mjs
package.json
.openai/hosting.json       私密站點部署設定
```

M2 已拆分 reference、gestures、renderer、camera；M3 才新增 sessions。不提前加入未驗證的完整系統。每個 milestone 以 git commit / Site version 保留回復點。

## Milestones 與 Gates

| Milestone | 範圍 | 驗收 |
|---|---|---|
| M0 | 產品、架構、UX、schema、測試與目錄 | 決策可支持核心 workflow；規格已形成 |
| M1 | Camera、四角、透視網格 | 數學測試通過 + iPhone/iPad 四角與 camera 實測；未通過先修正 |
| M2 | Reference 匯入、opacity、move、pinch、rotate、lock | 非正方形紙上旋轉比例正確；斜角 overlay 與網格吻合；lock 禁止編輯 |
| M3 | IndexedDB、Save/Resume、匯出/匯入 | 關頁、休眠、隔天、新拍攝角度下重新對位仍保留原 paper transform；儲存失敗可辨識 |
| M4 | PWA、standalone、專注 UI、離線與實機回歸 | Safari 與主畫面模式；縱/橫向、切 App、拒絕權限、大照片、iPhone/iPad 皆驗證 |

每個 gate 應有明確通過記錄。依使用者 2026-10-07 的指示，GitHub 授權稍後處理，先推進 M2 實作；M1 的實機 gate 尚未通過，M2 也標記待實機驗收。此次止於 M2，不繼續生成 M3/M4。

後續才是 Phase 2 自動紙張偵測/對位快照、Phase 3 適合手繪的簡化輪廓、Phase 4 按實際需求評估 ARKit/depth/AI。

## 官方技術參考

- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode
- https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari

2026-10-07 更新。當前為 M2 實作版本；M1/M2 實機驗收待完成，M3/M4 尚未實作。

## M2 資料與相容性限制

Reference 圖片只在瀏覽器中解碼並以 Blob/object URL 顯示，沒有圖片上傳 API。長邊最多 2048 px；檔案超過 40 MB、解碼後超過 60 MP 或無法讀取的格式會拒絕。createImageBitmap 使用 from-image 解碼方向，失敗時退回原生 Image；Safari 真實 EXIF/HEIC 行為仍需實測。圖片替換與移除時釋放 object URL。

本階段沒有持久保存：頁面存活時重新校準會保留 paper transform，重新整理、關閉或 OS 回收頁面後會遺失。M2 的 re-alignment 不能當作 M3 的跨日 Resume。

圖片中心限制在紙面，寬度限制為紙寬的 2%–300%；超出紙面部分裁切。若圖片跨越 projective horizon，拒絕該次變形。新校準若使原構圖失效，先提示解鎖後置中，不默默修改原 transform。

GitHub 上傳暫停，等待使用者完成 repository 授權再同步最新版本。Sites 私密部署與 GitHub repository 可見性分別管理。
