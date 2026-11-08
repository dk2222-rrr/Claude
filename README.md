# 🐹 一起養倉鼠

兩個人一起照顧一隻 3D 小倉鼠的 iPhone 網頁 App（PWA）。不需要 Mac，用 Safari 加到主畫面就像一般 App。

## 功能（第一版）

| | |
|---|---|
| 🐹 3D 倉鼠 | 會自己在籠子裡跑來跑去、嗅嗅、洗臉、跑滾輪，累了回棉花窩睡覺 |
| 🌻 餵食 | 跑去飼料碗吃瓜子，頰囊會鼓起來 |
| 🎡 滾輪 | 叫牠去跑滾輪（心情 +） |
| 💤 哄睡 | 回窩裡睡覺；點牠會被吵醒 |
| ✋ 摸摸 | 點倉鼠或在牠身上滑動 |
| 💞 一起摸摸 | 兩人 15 秒內都摸了 → 心情大加成 |
| 💌 傳話 | 透過倉鼠留一句話給對方 |
| 📒 分工紀錄 | 今天誰照顧了幾次、誰該多陪陪牠 |
| 🎂 紀念日 | 紀念日＝倉鼠生日，顯示在一起第幾天 |

飽足、心情會隨時間慢慢下降，但**倉鼠不會死**，只會難過、肚子餓。

## 一、先在電腦上試玩（單機模式）

```bash
python3 -m http.server 8080
```

打開 http://localhost:8080 。想模擬兩個人：再開一個分頁 `http://localhost:8080/?as=2`，用家庭碼加入。

## 二、設定 Firebase（兩支手機即時同步）

1. 到 https://console.firebase.google.com 建立專案（Google Analytics 可關掉）
2. **Authentication → 開始使用 → 登入方式 → 匿名 → 啟用**
3. **Firestore Database → 建立資料庫 → 正式版模式**，地區選 `asia-east1`（台灣）
4. Firestore → **規則**，把本 repo 的 `firestore.rules` 內容貼上 → 發布
5. 專案設定 ⚙️ → 一般 → 你的應用程式 → 新增 **網頁 `</>`** → 複製 `firebaseConfig`
6. 貼到 `js/config.js`：

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "xxx.firebaseapp.com",
  projectId: "xxx",
  storageBucket: "xxx.appspot.com",
  messagingSenderId: "...",
  appId: "...",
};
```

> Firebase 網頁金鑰本來就是公開的，安全性由 `firestore.rules` 保護（只有家裡的兩個人能讀寫）。
> 免費額度對兩個人綽綽有餘。

## 三、部署到 GitHub Pages

1. 把程式合併到 `main` 分支
2. GitHub repo → **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**
3. 幾分鐘後網址會是 `https://<你的帳號>.github.io/<repo 名稱>/`
4. Firebase → Authentication → 設定 → **授權網域** 加上 `<你的帳號>.github.io`

## 四、裝到 iPhone

1. 用 **Safari** 打開網址
2. 分享按鈕 → **加入主畫面**
3. 一個人「建立新家」，在 ⚙️ 設定裡按「複製邀請」傳給另一半
4. 另一半打開連結 →「加入另一半的家」→ 完成 💕

## 檔案結構

```
index.html          畫面
style.css           樣式
js/main.js          介面、互動、同步事件
js/world.js         3D 籠子場景與倉鼠的自主行為
js/hamster.js       3D 倉鼠模型與動畫
js/state.js         數值、衰退、動作規則
js/sync.js          Firebase / 單機資料同步
js/config.js        Firebase 設定（貼在這裡）
firestore.rules     Firestore 安全規則
sw.js               離線快取
```

## 下一步可以加

- 📸 共同相簿／回憶（Firebase Storage）
- 🔔 推播提醒（倉鼠餓了、對方傳話）— iOS 16.4+ 加到主畫面的 PWA 可收推播
- 🎮 小遊戲（藏瓜子、迷宮）、換裝、更多倉鼠品種
- 🌙 依照現實時間白天睡覺、晚上活動（真的倉鼠是夜行性的）
