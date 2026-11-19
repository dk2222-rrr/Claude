# 🚀 太空雷達

火箭發射倒數與提醒、太空新聞、任務追蹤、太空站過境和天象，全部放在一個 App 裡。

純前端的 PWA 網頁 App：不用架伺服器，**不用申請任何 API key**，資料只存在你自己的瀏覽器（IndexedDB）。

## 功能

### 🚀 發射
- 下一次發射的大倒數，加上之後約 40 次發射的列表（火箭、發射商、發射場、任務類型）
- 篩選：已關注、追蹤主題、載人任務、美國、中國、其他國家；也可以看「最近發射」的結果
- 點進去看詳細資料：任務介紹（可一鍵 Google 翻譯）、目標軌道、天氣許可機率、**直播連結**、最新動態、相關新聞
- 按 ☆ 關注，發射前提醒（預設 1 小時前、10 分鐘前，可以在設定調整）

### 📰 新聞
- 彙整 NASA、SpaceNews、Spaceflight Now、NASASpaceflight、Ars Technica 等 40 多個來源
- 可以只看「我的主題」或某個主題，也可以搜尋
- 新聞是英文原文，每則都有「中文翻譯」按鈕（用 Google 翻譯打開）

### 🎯 追蹤
- 追蹤主題：星艦、阿提米絲登月、台灣太空、國際太空站、中國太空站、嫦娥、火星、藍色起源、JAXA、ISRO……也可以自訂英文關鍵字
- 追蹤主題有**新的發射排程**或**新聞**時通知你，相關的發射會自動加入關注
- 近期太空事件：對接、太空漫步、探測器飛掠、著陸等

### 🌌 天象
- 觀測地點：選城市（台灣各縣市、港澳、東京、首爾、新加坡……）或用目前位置
- 今天的月相、下次滿月和新月
- **國際太空站、天宮太空站**未來 10 天肉眼看得到的過境：幾點、從哪個方向出現、最高仰角，按 🔔 在出現前 10 分鐘通知
- 今晚的行星：什麼時候、在哪個方向看得到
- 一年內的天象行事曆：日食、月食（會判斷你的位置看不看得到）、流星雨極大期（含月光干擾程度）、超級月亮、行星衝日、金星／水星大距；重要天象前一天提醒

## 通知

| 什麼時候 | 預設 |
|---|---|
| 關注的發射：發射前（1 天／3 小時／1 小時／30 分／10 分／發射時，可複選） | 1 小時前、10 分鐘前 |
| 關注的發射：時間變更、確定發射 | 開 |
| 關注的發射：成功、失敗、暫停倒數 | 開 |
| 追蹤主題有新的發射排程 | 開 |
| 追蹤主題有新聞 | 開 |
| 日月食、流星雨等重要天象前一天 18:00（日月食另外在開始前提醒） | 開 |
| 太空站明亮過境（最高仰角 ≥ 40°）出現前 10 分鐘 | 關（可以個別按 🔔） |

## 資料來源（都免費、不需要 key）

| 資料 | 來源 | 備註 |
|---|---|---|
| 發射、太空事件 | [Launch Library 2](https://thespacedevs.com/llapi)（The Space Devs） | 免費版每個 IP 每小時 15 次，App 會自己控制在 12 次內 |
| 新聞 | [Spaceflight News API](https://spaceflightnewsapi.net/) | |
| 太空站軌道（TLE） | [CelesTrak](https://celestrak.org/) | 每 12 小時更新一次 |
| 天文計算 | [Astronomy Engine](https://github.com/cosinekitty/astronomy)、[satellite.js](https://github.com/shashwatak/satellite-js)（MIT） | 放在 `vendor/`，在裝置上計算，離線也能用 |

## 使用／部署

這個資料夾是獨立的 App，可以跟 repo 根目錄的「搶票雷達」一起放在 **GitHub Pages**：

1. repo 的 Settings → Pages，Source 選這個 branch、資料夾選 `/ (root)`
2. 用手機打開 `https://<你的帳號>.github.io/<repo 名稱>/space/`
   - **iPhone**：Safari →「分享」→「加入主畫面」，**從主畫面的圖示打開**才會出現通知權限（需要 iOS 16.4 以上）
   - **Android**：Chrome → 選單 →「安裝應用程式」
3. 第一次打開按「開啟通知」，再到「設定」按「測試通知」確認收得到

本機測試：

```bash
python3 -m http.server 8000
# 打開 http://localhost:8000/space/
```

## 通知的限制（請先了解）

這是不靠伺服器的版本，所以：

- **App 開著（或在背景分頁）時**：發射資料每小時更新、新聞每 30 分鐘更新；提醒每 30 秒檢查一次，可以準時通知。快發射（3 小時內）的關注項目每 15 分鐘抓一次最新狀態，延期或取消會通知
- **App 完全關掉時**：Android／桌面版 Chrome 安裝成 App 後，支援「背景定期同步」，瀏覽器大約每幾小時會在背景檢查一次，但時間由瀏覽器決定，不保證準時；iPhone 不支援背景檢查
- 所以**想看的發射快到時，請把 App 開著**，才能確定收到 10 分鐘前的提醒
- 太空站過境是在 App 裡計算的，要打開過 App（天象分頁）才會排好提醒

如果之後需要「App 關掉也一定收得到」，可以再加一個定時檢查的伺服器（例如 GitHub Actions）搭配 Telegram 或 Web Push。

## 檔案結構

```
index.html             畫面
styles.css             樣式
js/store.js            IndexedDB 儲存（頁面與 Service Worker 共用）
js/data.js             中文對照表、追蹤主題預設、關鍵字比對、時間格式
js/api.js              Launch Library 2 / Spaceflight News API / CelesTrak
js/checker.js          更新資料、判斷要發哪些通知（頁面與 Service Worker 共用）
js/sky.js              月相、日月食、流星雨、行星、太空站過境計算
js/app.js              介面邏輯
vendor/                Astronomy Engine、satellite.js
sw.js                  Service Worker：離線快取、背景同步、通知點擊
manifest.webmanifest   PWA 設定
```
