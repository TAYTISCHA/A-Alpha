# ChemSheet — คลังชีทเรียนสายรหัส
**KMUTT | ภาควิชาเคมี**

---

## โครงสร้างโปรเจกต์

```
kmutt-cheatsheet/
├── index.html          ← redirect อัตโนมัติ
├── login.html          ← Login + Register (หน้าเดียว)
├── dashboard.html      ← Junior Dashboard
├── admin.html          ← Senior Admin Panel
├── profile.html        ← โปรไฟล์ส่วนตัว
├── css/
│   └── style.css       ← Design System ทั้งหมด
├── js/
│   ├── config.js       ← App Config & Constants
│   ├── auth.js         ← Authentication & Session
│   ├── drive.js        ← Google Drive API calls
│   └── ui.js           ← Toast, Modal, Theme, Sidebar
└── backend/
    └── appsscript.gs   ← Google Apps Script Backend
```

---

## วิธี Setup (ทำตามลำดับ)

### ขั้น 1: สร้าง Google Sheet

1. ไปที่ [sheets.google.com](https://sheets.google.com) → สร้าง Spreadsheet ใหม่
2. Copy **Spreadsheet ID** จาก URL: `https://docs.google.com/spreadsheets/d/**[ID นี้]**/edit`

### ขั้น 2: สร้าง Google Drive Folder

1. สร้างโฟลเดอร์ root ใน Google Drive ชื่อ "ChemSheet Files"
2. Copy **Folder ID** จาก URL เมื่อเปิดโฟลเดอร์

### ขั้น 3: Deploy Google Apps Script

1. ไปที่ [script.google.com](https://script.google.com) → New Project
2. วางโค้ดจาก `backend/appsscript.gs` ใน Code.gs
3. แก้ค่าในตอนต้นไฟล์:
   ```js
   SHEET_ID: "วาง Spreadsheet ID ของคุณ",
   DRIVE_ROOT_FOLDER_ID: "วาง Drive Folder ID ของคุณ",
   ```
4. **Run `setupProject()`** ครั้งแรก (ผ่าน Editor > Run) เพื่อสร้าง Sheets + Senior account
   - แก้ `DEFAULT_SENIOR_ID` และ `DEFAULT_SENIOR_PASS` ก่อน run
5. Deploy: **Deploy > New Deployment**
   - Type: Web App
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy **Deployment URL**

### ขั้น 4: ใส่ GAS URL ในโปรเจกต์

แก้ไฟล์ `js/config.js`:
```js
GAS_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
```

### ขั้น 5: Deploy บน Vercel

1. Push โปรเจกต์ขึ้น GitHub
2. ไปที่ [vercel.com](https://vercel.com) → Import Project
3. Root Directory: เลือกโฟลเดอร์ `kmutt-cheatsheet/`
4. Framework: **Other** (Static HTML)
5. Deploy ✅

---

## ระบบ Role

| Role | Login | ดูไฟล์ | Upload/Delete | Admin Panel | ตั้งรหัสน้อง |
|------|-------|---------|---------------|-------------|-------------|
| Senior | รหัสถาวร | ✅ | ✅ | ✅ | ✅ |
| Junior | รหัส 24h | ✅ | ❌ | ❌ | ❌ |

### การตั้งรหัสผ่านรุ่นน้อง
- Senior ไปที่ Admin Panel → "รหัสผ่านรุ่นน้อง"
- ตั้งรหัสใหม่ + กำหนดเวลาหมดอายุ (6/12/24/48 ชม.)
- รุ่นน้องทุกคนใช้รหัสเดียวกัน
- เมื่อสมัครสมาชิก ต้องใส่ inviteCode (จากรุ่นพี่) + รหัสผ่าน ณ ตอนนั้น

---

## Google Sheets Schema

| Sheet | Columns |
|-------|---------|
| Users | studentId, passwordHash, name, year, role, active, joinedAt, lastLogin, passwordExpiresAt, avatarUrl |
| Sessions | token, studentId, deviceId, role, createdAt, expiresAt, status |
| Files | id, name, year, subject, type, size, createdAt, uploadedBy, pinned, category |
| Settings | key, value |
| Invites | code, createdBy, createdAt, used, usedBy |
| Analytics | event, studentId, timestamp, fileId |

---

## โครงสร้าง Google Drive

```
ChemSheet Files/
├── ปีที่ 1/
│   ├── CHE111/
│   │   ├── Lecture/
│   │   ├── Lab/
│   │   ├── Midterm/
│   │   └── Final/
├── ปีที่ 2/
│   └── CHE212/
│       └── ...
└── Avatars/   ← รูปโปรไฟล์
```

---

## Security

- Password: SHA-256 + salt
- Session: UUID token, 8h TTL, device-locked
- Rate limit: 5 attempts → lockout 15 นาที
- Input sanitization: XSS prevention ทุก field
- Role-based: ทุก API call validate role ก่อน
- Drive links: hidden จาก user, ดึงผ่าน GAS เท่านั้น
