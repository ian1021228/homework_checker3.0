# 親師作業點收X聯絡簿系統 — 家長端系統與資料庫規範 (給另一個 AI 的開發注意事項)

本文件專門提供給維護或開發**家長端系統 (Parent Portal / `parent.html`)** 的工程師與 AI 助手，以確保教師端 (`index.html`) 與家長端系統能夠無縫且安全地協同運作，**杜絕資料庫覆寫或衝突**。

---

## 一、系統架構與單向權限核心原則 (最重要！)

### 1. 唯一資料寫入方 (Single Writer Principle)
- **教師端 (Teacher App)** 是全系統 **唯一具有資料庫寫入、更新與刪除權限的系統**。
- **家長端 (Parent Portal)** 必須是 **100% 純唯讀 (Read-Only)** 系統。
- **絕對嚴禁事項**：家長端切勿執行任何對 `parentClasses/{accessCode}` 文件的 `setDoc`、`updateDoc` 或 `deleteDoc`！否則會覆蓋教師端即時批改的學生作業狀態與聯絡簿內容。

### 2. Firestore 資料路徑結構
- **根路徑**：
  ```
  /artifacts/homework-checker-pro/public/data/parentClasses/{accessCode}
  ```
  - `accessCode`：班級權限碼，由英文字母與數字組成（例如 `6A89F2`）。
  - **重要**：在資料庫 Document ID 中一律強制轉為**大寫** (`toUpperCase()`)。家長端查詢或監聽時請務必使用 `cleanCode.trim().toUpperCase()`。

### 3. Firestore 安全規則 (Security Rules)
請確保 Firebase Firestore 規則設置如下：
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 家長端班級公開查詢節點
    match /artifacts/homework-checker-pro/public/data/parentClasses/{accessCode} {
      // 任何家長憑權限碼皆可即時讀取
      allow read: if true;
      // 僅限登入的教師端進行寫入
      allow write: if request.auth != null;
    }
  }
}
```

---

## 二、`parentClasses` 文件資料結構規格 (Schema Specification)

教師端在作業點收、新增/修改聯絡簿或更改班級設定時，會自動同步以下欄位結構至 Firestore：

```typescript
interface ParentClassDocument {
  // 班級基本資訊
  classId: string;           // 教師端班級內部 ID (如 "class_1710000000000")
  className: string;         // 班級名稱 (如 "六年忠班")
  accessCode: string;        // 班級專屬權限碼 (大寫，如 "6A89F2")
  teacherName: string;       // 導師姓名或稱謂 (如 "王老師")
  teacherEmail: string;      // 導師電子信箱 (如 "teacher@school.edu.tw")
  teacherUid: string;        // 導師 Firebase Auth UID
  updatedAt: string;         // 最後更新時間 (ISO 8601，如 "2026-09-06T11:00:00.000Z")

  // 座號配置
  lastMaxSeat: number;       // 全班最高座號 (預設 30 ~ 35)
  lastMissingSeats: string;  // 缺號清單字串 (如 "5, 12"，家長端需解析過濾)

  // 自訂作業類別定義 (含色彩與狀態定義)
  homeworkTypes: HomeworkType[];

  // 今日作業清單與每位學生點收狀態
  homeworks: ClassHomework[];

  // 聯絡簿紀錄 (最近 7 天或歷史紀錄)
  contactBook: Record<string, string[]>;

  // 雙相容備用字串 (部分舊版使用字串序列化)
  data: string; // JSON.stringify(parentPayload)
}

interface HomeworkType {
  id: string;                // 類別識別碼 (如 "hw_type_math", "default")
  name: string;              // 類別名稱 (如 "數學作業", "國語課堂")
  defaultStatus: string;     // 預設狀態 key
  statuses: HomeworkStatus[];
}

interface HomeworkStatus {
  key: string;               // 狀態標識 (如 "completed", "needs-correction", "not-submitted")
  text: string;              // 顯示文字 (如 "已繳交", "訂正中", "缺交")
  color: string;             // Tailwind CSS 背景色 class (如 "bg-emerald-500", "bg-amber-400")
  textColor?: string;        // Tailwind CSS 文字色 class (如 "text-white")
  isCompleted?: boolean;     // 是否視為已完成
}

interface ClassHomework {
  id: string;                // 作業 ID
  name: string;              // 作業名稱 (如 "數習 P.42~P.43")
  typeId: string;            // 對應 homeworkTypes 中的 id
  createdAt: string;         // 建立時間 (ISO 字串)
  studentCount: number;      // 應繳學生人數
  students: {
    seat: number;            // 學生座號 (1 ~ lastMaxSeat)
    status: string;          // 學生當前狀態 key (如 "completed", "needs-correction")
  }[];
}
```

---

## 三、聯絡簿 (`contactBook`) 的資料協議

- `contactBook` 是一個 Object / Map，Key 為西元年月日字串：`"YYYY-MM-DD"`（例如 `"2026-09-06"`）。
- Value 為陣列 `string[]`，代表當天所有條目事項（例如 `["1. 國語第十課生字語詞", "2. 數學習作 P.50", "3. 帶美勞用具"]`）。
- **注意事項**：
  - 家長端渲染時，若當天陣列為空或不存在，應顯示「本日無登記事項」，不得拋出 JavaScript 異常。
  - 家長端日期選單應顯示包括今天在內的最近 7 天，日期應按時間先後排列（最舊在左、今天在最右）。

---

## 四、家長端開發注意事項與相容性保障

1. **雙模解析（Dual-Parsing）相容性**：
   - 教師端寫入時同時包含扁平化欄位與 `data` JSON 字串。
   - 家長端讀取時，建議採取如下安全解碼邏輯：
     ```javascript
     function parseClassData(rawData) {
       if (!rawData) return null;
       let finalData = { ...rawData };
       if (rawData.data && typeof rawData.data === 'string') {
         try {
           const parsed = JSON.parse(rawData.data);
           finalData = { ...parsed, ...finalData };
         } catch(e) {}
       }
       return finalData;
     }
     ```
2. **缺號過濾邏輯**：
   - 務必將 `lastMissingSeats` 解析為 `Set<number>`（支援英文半形逗號 `,`、中文全形逗號 `，` 與空格）。
   - 在座號選單與點收矩陣中，缺號座號不計入應繳總人數，且在矩陣中標記為「缺號」反灰。
3. **若家長端未來需要「家長簽名」或「家長留言」功能**：
   - **切勿直接更新 `parentClasses/{accessCode}`**！
   - 請在同目錄建立獨立子集合，例如：
     `/artifacts/homework-checker-pro/public/data/parentClasses/{accessCode}/signatures/{date_seat}`
     或
     `/artifacts/homework-checker-pro/public/data/parentClasses/{accessCode}/feedback/{messageId}`
   - 這樣教師端拉取與寫入班級主要進度時，絕不會與家長端回傳的簽名或訊息產生資料衝突或覆寫！
