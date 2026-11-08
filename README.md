# 🎤 搶票雷達

把喜歡的歌手／樂團加進關注名單，有新的演唱會、活動，或是**開賣／預售時間快到了**，就用瀏覽器通知你。

純前端的 PWA 網頁 App：不用架伺服器，資料只存在你自己的瀏覽器（IndexedDB）。

## 功能

- **搜尋歌手／樂團**：用 iTunes 資料庫搜尋（台灣區，中文名稱也找得到），或直接用輸入的名字加入；另外有熱門推薦可以一鍵加入
- **關注名單**：每位歌手可以設定「別名」（例如 五月天 → `Mayday`），國外售票系統通常用英文名稱，加了別名才找得到；每位歌手也有 KKTIX、拓元、Google 等快速搜尋連結
- **近期活動**：彙整所有關注對象即將舉行的活動，顯示日期、場地、預售／開賣時間，可以依地區篩選
- **搶票提醒**
  - 活動資料裡有開賣或預售時間時，會自動建立提醒（可以在設定裡關掉）
  - 也可以手動輸入開賣時間（拓元、KKTIX、ibon 這類台灣平台沒有公開 API，用這個方式最準）
  - 預設在開賣前 1 天、1 小時、10 分鐘和開賣當下通知，時間可以自己調整
- **通知**：一找到新活動就通知；第一次加入某位歌手時，只會通知一則「目前有 N 場活動」的摘要，不會一次跳一大堆
- 可以離線開啟，也能匯出／匯入關注名單

## 資料來源（要申請免費的 API key）

| 來源 | 申請方式 | 說明 |
|---|---|---|
| Ticketmaster Discovery API | <https://developer.ticketmaster.com/> 註冊後在「My Apps」取得 Consumer Key | 全球大型場館，**有開賣與預售時間** |
| Bandsintown API | <https://help.artists.bandsintown.com/> 申請 `app_id` | 全球巡演資料，獨立樂團比較多 |

把 key 填到 App 的「設定 → 資料來源」。還沒申請之前，可以先開「範例模式」體驗（資料是假的，標題會標示「範例」）。

> 台灣售票平台（拓元、KKTIX、ibon、年代、寬宏）都沒有公開 API，所以台灣場次常常抓不到。看到消息時，請在「提醒」頁手動新增開賣時間，App 就會準時提醒你。

## 使用／部署

隨便找一個能放靜態檔案的地方都可以，最簡單的是 **GitHub Pages**：

1. 到 repo 的 Settings → Pages，Source 選這個 branch、資料夾選 `/ (root)`
2. 用手機打開網址
   - **iPhone**：Safari →「分享」→「加入主畫面」，**從主畫面的圖示打開**才會出現通知權限（需要 iOS 16.4 以上）
   - **Android**：Chrome → 選單 →「安裝應用程式」
3. 到「設定」按「開啟通知」，再按「測試通知」確認收得到

本機測試：

```bash
python3 -m http.server 8000
# 打開 http://localhost:8000
```

## 通知的限制（請先了解）

這是不靠伺服器的版本，所以：

- **App 開著（或在背景分頁）時**：每 30 分鐘到 6 小時自動檢查新活動；搶票提醒每 30 秒檢查一次，可以準時通知
- **App 完全關掉時**：Android／桌面版 Chrome 安裝成 App 後，支援「背景定期同步」，瀏覽器大約每幾小時會在背景檢查一次，但時間由瀏覽器決定，不保證準時；iPhone 不支援背景檢查
- 所以**搶票當天，請把 App 開著**，才能確定收到開賣前 10 分鐘和開賣當下的提醒

如果之後需要「App 關掉也一定收得到」，可以再加一個定時檢查的伺服器（例如 GitHub Actions）搭配 Telegram 通知。

## 檔案結構

```
index.html            畫面
styles.css            樣式
js/store.js           IndexedDB 儲存（頁面與 Service Worker 共用）
js/sources.js         iTunes / Ticketmaster / Bandsintown / 範例資料
js/checker.js         比對新活動、搶票提醒（頁面與 Service Worker 共用）
js/app.js             介面邏輯
sw.js                 Service Worker：離線快取、背景同步、通知點擊
manifest.webmanifest  PWA 設定
```
