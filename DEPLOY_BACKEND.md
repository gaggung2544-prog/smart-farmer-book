# คู่มือ Deploy Backend (Google Apps Script) — Smart Farmer

> โค้ด backend อยู่ในไฟล์ **`google_apps_script.gs`** ในโปรเจกต์นี้
> ระบบ auth **ปิดอยู่โดยค่าเริ่มต้น** (`ENFORCE_AUTH=false`) → วาง+deploy ได้เลย ผู้ใช้ไม่ถูกล็อก
> เปิดบังคับ auth เป็น **ขั้นตอนสุดท้าย** หลังทดสอบครบเท่านั้น

---

## ✅ Phase 1 — วางโค้ด + ตั้งค่า (ยังไม่กระทบผู้ใช้)

- [ ] **1. เปิด Apps Script**
  เปิด Google Sheet ฐานข้อมูล → เมนู **ส่วนขยาย (Extensions) → Apps Script**

- [ ] **2. วางโค้ดใหม่**
  เปิดไฟล์ `google_apps_script.gs` (ในโปรเจกต์นี้) → คัดลอก **ทั้งหมด** → วางทับโค้ดเดิมใน `Code.gs` → กดบันทึก 💾

- [ ] **3. สร้างกุญแจลับ (รันครั้งเดียว)**
  - เลือกฟังก์ชัน **`setupAuthSecret`** จาก dropdown ด้านบน → กด **Run ▶**
  - ครั้งแรกจะขอสิทธิ์ → **Review permissions → เลือกบัญชีเจ้าของชีต → Allow**
  - ดู Execution log ต้องขึ้น: `พร้อมแล้ว: AUTH_SECRET ถูกสร้าง, ENFORCE_AUTH=false`

- [ ] **4. ตั้งค่า Script Properties**
  ไปที่ **⚙️ Project Settings → Script Properties → Add script property**
  | ชื่อ (Property) | ค่า (Value) | จำเป็นไหม |
  |---|---|---|
  | `GEMINI_API_KEY` | คีย์ Gemini ของคุณ (จาก [aistudio.google.com](https://aistudio.google.com) → Get API key) | ต้องมี ถ้าจะใช้ AI chat จริง |
  | `ALLOW_DEV_OTP` | `true` | เฉพาะถ้าจะทดสอบ OTP (ไม่จำเป็น เพราะใช้ล็อกอินวันเกิด) |

  > หมายเหตุ: `STAFF_PASSCODES` / `STAFF_MASTER_PASSCODE` **ไม่ต้องตั้ง** — ระบบใช้ล็อกอินด้วยวันเกิด (DOB) แทนแล้ว

- [ ] **5. Deploy เวอร์ชันใหม่**
  - **Deploy → Manage deployments → ✏️ (แก้ไข deployment เดิม)**
  - Version: **New version**
  - Who has access: **Anyone**
  - กด **Deploy**
  - ✅ ลิงก์ `/exec` เดิมใช้ได้ทันที **ไม่ต้องแก้ URL ในแอป**

---

## ✅ Phase 2 — ทดสอบ (auth ยังไม่บังคับ ปลอดภัย)

- [ ] **6. เปิดแอปบนมือถือ/เบราว์เซอร์** (บังคับรีเฟรช/อัปเดตให้ได้ cache v66 ล่าสุด)
- [ ] **7. ทดสอบล็อกอินชาวไร่:** โควตา 5 หลัก + วันเกิด (วัน/เดือน/ปี พ.ศ.) → ครั้งแรกระบบตั้งให้อัตโนมัติ → เข้าได้
- [ ] **8. ทดสอบล็อกอินเจ้าหน้าที่:** รหัสพนักงาน + วันเกิด
- [ ] **9. ทดสอบ AI chat** (ถ้าตั้ง `GEMINI_API_KEY`) → ควรได้คำตอบจริง (ไม่ใช่คำตอบจำลอง)
- [ ] **10. ทดสอบรีเซ็ตรหัสผ่าน** ในหน้าเจ้าหน้าที่ → ผู้ใช้ที่ถูกรีเซ็ตตั้งวันเกิดใหม่ได้
- [ ] **11. เปิด Google Sheet** → ต้องเห็นแท็บใหม่ **`รหัสผ่านผู้ใช้`** มีคอลัมน์ hash (อ่านรหัสจริงไม่ได้ = ถูกต้อง)

---

## ⚠️ Phase 3 — เปิดบังคับ auth (ทำเป็นขั้นสุดท้าย)

> **ก่อนเปิด อ่าน 2 ข้อนี้:**
> 1. **SW cache:** ผู้ใช้ที่ยังใช้แอปเวอร์ชันเก่า (ไม่มี token) จะถูกล็อกเมื่อเปิดบังคับ → รอให้ client ใหม่ (v66) แพร่ถึงผู้ใช้ส่วนใหญ่ก่อน
> 2. **TOFU risk:** คนแรกที่ล็อกอินด้วยโควตาที่ยังไม่ตั้งรหัส = ตั้งวันเกิดนั้นเป็นรหัสเลย → ควรให้เกษตรกร/เจ้าหน้าที่ตัวจริงล็อกอินตั้งรหัสให้ครบก่อน หรือยอมรับความเสี่ยงระดับเดียวกับตอนนี้

- [ ] **12. เปิด flag:** Project Settings → Script Properties → ตั้ง **`ENFORCE_AUTH` = `true`**
  (ไม่ต้อง redeploy — มีผลทันที)
- [ ] **13. ทดสอบอีกรอบ:** ชาวไร่เห็นเฉพาะแปลงของตัวเอง, แก้/ลบข้ามคนไม่ได้, AI ต้องล็อกอินก่อน
- [ ] **14. ถ้ามีปัญหา → rollback ทันที:** ตั้ง `ENFORCE_AUTH` = `false` (ไม่ต้อง redeploy)

---

## 🔑 สรุป Script Properties ทั้งหมด
| Property | หน้าที่ | ตั้งเมื่อ |
|---|---|---|
| `AUTH_SECRET` | กุญแจลงนาม token | อัตโนมัติจาก `setupAuthSecret` |
| `ENFORCE_AUTH` | เปิด/ปิดบังคับสิทธิ์ (`true`/`false`) | เริ่ม `false`, เปิด `true` ที่ Phase 3 |
| `GEMINI_API_KEY` | คีย์ AI chat (ฝั่ง server) | Phase 1 |
| `ALLOW_DEV_OTP` | คืน OTP ทดสอบ (ถ้าใช้ OTP) | ทางเลือก |
| `SMS_ENDPOINT`/`SMS_API_KEY`/`SMS_API_SECRET`/`SMS_SENDER` | ส่ง OTP จริงผ่าน SMS | ทางเลือก (ถ้าจะใช้ OTP) |

## 🔄 Rollback ทุกกรณี
- Auth มีปัญหา → `ENFORCE_AUTH=false`
- โค้ด backend มีปัญหา → Manage deployments → เลือก version เก่ากลับ
