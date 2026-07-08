/**
 * ==============================================================================
 * Smart Farmer Book — Google Apps Script Backend (Code.gs)
 * เวอร์ชันเสริมความปลอดภัย: เพิ่มชั้นยืนยันตัวตน (Auth) แบบ Token ที่เซิร์ฟเวอร์ลงนาม
 * ------------------------------------------------------------------------------
 *
 * ⚠️ อ่านก่อน DEPLOY (สำคัญมากสำหรับระบบจริง 15,000 คน):
 *
 *   ชั้น Auth นี้ "ปิดอยู่โดยค่าเริ่มต้น" (ENFORCE_AUTH = false)
 *   -> วางทับโค้ดเดิมแล้ว deploy ได้เลย พฤติกรรมทุกอย่างเหมือนเดิม 100% ไม่มีใครถูกล็อก
 *
 *   ลำดับการเปิดใช้งานที่ปลอดภัย (ทำทีละขั้น อย่าข้าม):
 *   1) วางโค้ดนี้ทับของเดิม -> บันทึก
 *   2) รันฟังก์ชัน `setupAuthSecret` หนึ่งครั้ง (เมนู Run) เพื่อสร้างกุญแจลับ AUTH_SECRET
 *   3) (ทางเลือก) ตั้งรหัสผ่านเจ้าหน้าที่: รัน `setupStaffPasscodesExample` แล้วแก้ค่าใน
 *      Project Settings > Script Properties (STAFF_PASSCODES / STAFF_MASTER_PASSCODE)
 *   4) Deploy เวอร์ชันใหม่ (Manage deployments > แก้ไข > New version > Anyone)
 *   5) อัปเดตฝั่งแอป (client) ให้ล็อกอินผ่าน requestOtp/verifyOtp/staffLogin และแนบ token
 *      -> ตอนนี้ token ถูกส่งแล้วแต่ backend ยังไม่บังคับ (ปลอดภัย) ทดสอบให้ครบ
 *   6) เมื่อมั่นใจว่า client ใหม่แพร่ถึงผู้ใช้ส่วนใหญ่แล้ว (SW cache อัปเดต) ค่อยตั้ง
 *      Script Property `ENFORCE_AUTH = true` -> ระบบเริ่มบังคับสิทธิ์และกรองข้อมูลตามโควตา
 *   7) ถ้ามีปัญหา: ตั้ง ENFORCE_AUTH = false กลับได้ทันที (rollback ไม่ต้อง deploy ใหม่)
 *
 *   AI แชทที่ปรึกษา: ตั้ง Script Property `GEMINI_API_KEY` = คีย์ Gemini ของคุณ
 *   (client จะเรียกผ่าน proxy นี้ ไม่ต้องมีคีย์ที่เครื่องผู้ใช้อีกต่อไป)
 *
 *   หมายเหตุ OTP: ถ้ายังไม่ได้เชื่อมผู้ให้บริการ SMS ให้ตั้ง Script Property
 *   `ALLOW_DEV_OTP = true` ชั่วคราวเพื่อให้ requestOtp คืนรหัส OTP กลับมาทดสอบได้
 *   (อย่าเปิด ALLOW_DEV_OTP บน production จริง)
 * ==============================================================================
 */

// ==============================================================================
// ⚙️ ตัวช่วยกลาง (Config / Spreadsheet)
// ==============================================================================
var FALLBACK_SHEET_ID = "1ckLwOvgc8gMloGaj9rpoJ2keH0Ivt0c2l6SX_2g4N9o";

function getSS_() {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    console.warn("Could not get active spreadsheet: " + err.toString());
  }
  if (!ss) ss = SpreadsheetApp.openById(FALLBACK_SHEET_ID);
  return ss;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ขยายจำนวนคอลัมน์ + เติมหัวตารางที่ยังไม่มี (ใช้เวลาเพิ่มคอลัมน์ใหม่ให้ชีตเดิมที่มีอยู่แล้ว)
// เติมเฉพาะเซลล์หัวที่ "ว่าง" เท่านั้น ไม่ทับหัวเดิม -> ปลอดภัย/idempotent
function ensureHeaders_(sheet, headers) {
  if (!sheet || !headers || !headers.length) return;
  var maxCols = sheet.getMaxColumns();
  if (maxCols < headers.length) sheet.insertColumnsAfter(maxCols, headers.length - maxCols);
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    if (headers[c] && String(current[c] || '').trim() === '') {
      sheet.getRange(1, c + 1).setValue(headers[c]);
    }
  }
}

function props_() {
  return PropertiesService.getScriptProperties();
}

// ==============================================================================
// 🔐 ชั้นยืนยันตัวตน (AUTH) — Token แบบ HMAC-SHA256 ที่เซิร์ฟเวอร์ลงนาม
// ==============================================================================

// เปิด/ปิดการบังคับสิทธิ์ (ค่าเริ่มต้น = ปิด เพื่อ backward compatibility)
function isAuthEnforced_() {
  return props_().getProperty('ENFORCE_AUTH') === 'true';
}

// รันครั้งเดียวหลังวางโค้ด: สร้างกุญแจลับสำหรับลงนาม token
function setupAuthSecret() {
  var p = props_();
  if (!p.getProperty('AUTH_SECRET')) {
    p.setProperty('AUTH_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  if (p.getProperty('ENFORCE_AUTH') === null) {
    p.setProperty('ENFORCE_AUTH', 'false'); // เริ่มด้วยโหมดไม่บังคับเสมอ
  }
  return 'พร้อมแล้ว: AUTH_SECRET ถูกสร้าง, ENFORCE_AUTH=' + p.getProperty('ENFORCE_AUTH');
}

// ตัวอย่างการตั้งรหัสผ่านเจ้าหน้าที่ (แก้ค่าแล้วรันครั้งเดียว หรือไปตั้งใน Script Properties เอง)
function setupStaffPasscodesExample() {
  // คีย์ = รหัสพนักงาน (Subzone), ค่า = รหัสผ่านเฉพาะคนนั้น
  var passcodes = {
    // "0101": "เปลี่ยนรหัสนี้",
    // "0102": "เปลี่ยนรหัสนี้"
  };
  props_().setProperty('STAFF_PASSCODES', JSON.stringify(passcodes));
  // รหัสผ่านกลางสำรอง (ใช้เมื่อไม่มีรหัสเฉพาะของ staffId นั้น) — แนะนำให้ตั้งไว้ชั่วคราวเท่านั้น
  // props_().setProperty('STAFF_MASTER_PASSCODE', 'เปลี่ยนรหัสกลางนี้');
  return 'ตั้ง STAFF_PASSCODES แล้ว';
}

function b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

// ลงนาม payload -> "payloadB64.signatureB64"
function signToken_(payloadObj) {
  var secret = props_().getProperty('AUTH_SECRET');
  if (!secret) throw new Error('AUTH_SECRET ยังไม่ถูกตั้ง — รัน setupAuthSecret() ก่อน');
  var payloadStr = JSON.stringify(payloadObj);
  var payloadB64 = b64url_(Utilities.newBlob(payloadStr).getBytes());
  var sig = Utilities.computeHmacSha256Signature(payloadB64, secret);
  return payloadB64 + '.' + b64url_(sig);
}

// ตรวจ token -> คืน payload {sub, role, exp} ถ้าถูกต้องและไม่หมดอายุ, มิฉะนั้นคืน null
function verifyToken_(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  var secret = props_().getProperty('AUTH_SECRET');
  if (!secret) return null;
  var parts = token.split('.');
  if (parts.length !== 2) return null;
  var payloadB64 = parts[0], sigB64 = parts[1];
  var expectedSig = b64url_(Utilities.computeHmacSha256Signature(payloadB64, secret));
  // เทียบลายเซ็น (ความยาวเท่ากันเสมอจึงเทียบตรงๆ ได้)
  if (expectedSig !== sigB64) return null;
  var payload;
  try {
    var bytes = Utilities.base64DecodeWebSafe(payloadB64);
    payload = JSON.parse(Utilities.newBlob(bytes).getDataAsString());
  } catch (e) {
    return null;
  }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

// ดึง token จากคำขอ (รองรับทั้ง body JSON, พารามิเตอร์ ?t=, และภายใน p=)
function resolveAuth_(e, data) {
  var token = null;
  if (data && data.token) token = data.token;
  if (!token && e && e.parameter && e.parameter.t) token = e.parameter.t;
  return token ? verifyToken_(token) : null;
}

// hash OTP ก่อนเก็บใน cache (ไม่เก็บ OTP ดิบ)
function hashOtp_(quota, otp) {
  var secret = props_().getProperty('AUTH_SECRET') || 'fallback';
  return b64url_(Utilities.computeHmacSha256Signature(quota + ':' + otp, secret));
}

function quotaExists_(quota) {
  var sheet = getSS_().getSheetByName("ข้อมูลบัญชีผู้ใช้");
  if (!sheet) return true; // ยังไม่มีชีตผู้ใช้ -> อย่าบล็อก (OTP ยังเป็นด่านอยู่)
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === quota) return true;
  }
  return false;
}

function getSubzoneByQuota_(quota) {
  var sheet = getSS_().getSheetByName("ข้อมูลบัญชีผู้ใช้");
  if (!sheet) return '';
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === String(quota).trim()) return String(vals[i][1]).trim();
  }
  return '';
}

// ส่ง OTP ผ่าน SMS (ถ้าตั้งค่าผู้ให้บริการไว้ใน Script Properties) — คืน true ถ้าส่งจริง
function sendOtpSms_(phone, otp) {
  try {
    var endpoint = props_().getProperty('SMS_ENDPOINT');
    var apiKey = props_().getProperty('SMS_API_KEY');
    var apiSecret = props_().getProperty('SMS_API_SECRET');
    var sender = props_().getProperty('SMS_SENDER') || 'SmartFarmer';
    if (!endpoint || !apiKey || !phone) return false;
    var msg = 'รหัส OTP Smart Farmer ของคุณคือ ' + otp + ' (หมดอายุใน 5 นาที)';
    var options = {
      method: 'post',
      headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(apiKey + ':' + (apiSecret || '')) },
      payload: { msisdn: phone, message: msg, sender: sender },
      muteHttpExceptions: true
    };
    var resp = UrlFetchApp.fetch(endpoint, options);
    return resp.getResponseCode() >= 200 && resp.getResponseCode() < 300;
  } catch (err) {
    console.warn('sendOtpSms_ failed: ' + err.toString());
    return false;
  }
}

// ----- Login endpoints -----

function handleRequestOtp_(data) {
  var quota = String((data && data.quota) || '').trim();
  if (!/^\d{5}$/.test(quota)) return jsonOut_({ status: 'error', message: 'เลขโควตาต้องเป็นตัวเลข 5 หลัก' });
  if (!quotaExists_(quota)) return jsonOut_({ status: 'error', message: 'ไม่พบเลขโควตานี้ในระบบ' });

  var otp = String(Math.floor(100000 + Math.random() * 900000));
  // เก็บ hash ของ OTP ใน cache 5 นาที (ผูกกับโควตา)
  CacheService.getScriptCache().put('otp_' + quota, hashOtp_(quota, otp), 300);

  var sent = sendOtpSms_((data && data.phone) || '', otp);
  var resp = {
    status: 'success',
    message: sent ? 'ส่งรหัส OTP ไปยังเบอร์ที่ลงทะเบียนแล้ว' : 'สร้างรหัส OTP แล้ว (ยังไม่ได้ตั้งค่าส่ง SMS)'
  };
  // โหมดทดสอบเท่านั้น: คืน OTP กลับมาเมื่อ ALLOW_DEV_OTP=true (ห้ามเปิดบน production)
  if (props_().getProperty('ALLOW_DEV_OTP') === 'true') resp.devOtp = otp;
  return jsonOut_(resp);
}

function handleVerifyOtp_(data) {
  var quota = String((data && data.quota) || '').trim();
  var otp = String((data && data.otp) || '').trim();
  if (!/^\d{5}$/.test(quota) || !/^\d{6}$/.test(otp)) {
    return jsonOut_({ status: 'error', message: 'ข้อมูลไม่ถูกต้อง' });
  }
  var cached = CacheService.getScriptCache().get('otp_' + quota);
  if (!cached || cached !== hashOtp_(quota, otp)) {
    return jsonOut_({ status: 'error', message: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  }
  CacheService.getScriptCache().remove('otp_' + quota); // ใช้ครั้งเดียว
  var token = signToken_({ sub: quota, role: 'farmer', exp: Date.now() + 30 * 24 * 3600 * 1000 }); // 30 วัน
  return jsonOut_({ status: 'success', token: token, role: 'farmer', quota: quota });
}

function handleStaffLogin_(data) {
  var staffId = String((data && data.staffId) || '').trim();
  var passcode = String((data && data.passcode) || '');
  if (!/^\d{3,5}$/.test(staffId)) return jsonOut_({ status: 'error', message: 'รหัสพนักงานไม่ถูกต้อง' });

  var map = {};
  try { map = JSON.parse(props_().getProperty('STAFF_PASSCODES') || '{}'); } catch (e) {}
  var expected = map[staffId] || props_().getProperty('STAFF_MASTER_PASSCODE') || '';
  if (!expected) return jsonOut_({ status: 'error', message: 'ระบบยังไม่ได้ตั้งรหัสผ่านเจ้าหน้าที่' });
  if (passcode !== expected) return jsonOut_({ status: 'error', message: 'รหัสผ่านเจ้าหน้าที่ไม่ถูกต้อง' });

  var token = signToken_({ sub: staffId, role: 'staff', exp: Date.now() + 7 * 24 * 3600 * 1000 }); // 7 วัน
  return jsonOut_({ status: 'success', token: token, role: 'staff', staffId: staffId });
}

// ===== รหัสผ่าน = วันเกิด (พ.ศ. รูปแบบ DDMMYYYY เช่น 01012501) — ต่อผู้ใช้ =====
var CRED_SHEET = "รหัสผ่านผู้ใช้";

function normalizeRole_(role) {
  var r = String(role || '').toLowerCase();
  return (r === 'staff' || r === 'เจ้าหน้าที่') ? 'staff' : 'farmer';
}
function normalizeDob_(dob) {
  var d = String(dob || '').replace(/\D/g, '');
  return /^\d{8}$/.test(d) ? d : '';
}
function hashCredential_(role, id, dob) {
  var secret = props_().getProperty('AUTH_SECRET') || 'fallback';
  return b64url_(Utilities.computeHmacSha256Signature(role + ':' + id + ':' + dob, secret));
}
function getCredSheet_() {
  var ss = getSS_();
  var sheet = ss.getSheetByName(CRED_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CRED_SHEET);
    sheet.appendRow(["บทบาท (Role)", "รหัส (ID)", "แฮชรหัสผ่าน (Hash)", "อัปเดตล่าสุด"]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f4cccc");
  }
  return sheet;
}
function findCredRow_(sheet, role, id) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === role && String(values[i][1]).trim() === String(id).trim()) {
      return { rowIndex: i + 1, hash: String(values[i][2]).trim() };
    }
  }
  return null;
}

// ตั้ง/เปลี่ยนรหัสผ่าน (วันเกิด) — ครั้งแรกตั้งได้เลย (trust-on-first-use); เปลี่ยนต้องรู้วันเกิดเดิม
function handleSetCredential_(data) {
  var role = normalizeRole_(data.role);
  var id = String(data.id || '').trim();
  var dob = normalizeDob_(data.dob);
  if (!id || !dob) return jsonOut_({ status: 'error', message: 'ข้อมูลไม่ครบ (ต้องมีรหัสและวันเกิด 8 หลัก)' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonOut_({ status: 'error', message: 'ระบบไม่ว่าง กรุณาลองใหม่' }); }
  try {
    var sheet = getCredSheet_();
    var found = findCredRow_(sheet, role, id);
    var newHash = hashCredential_(role, id, dob);
    if (!found) {
      sheet.appendRow([role, id, newHash, new Date().toLocaleString('th-TH')]);
      return jsonOut_({ status: 'success', message: 'ตั้งรหัสผ่าน (วันเกิด) สำเร็จ' });
    }
    if (found.hash === newHash) {
      return jsonOut_({ status: 'success', message: 'รหัสผ่านเหมือนเดิม' });
    }
    var oldDob = normalizeDob_(data.oldDob);
    if (oldDob && hashCredential_(role, id, oldDob) === found.hash) {
      sheet.getRange(found.rowIndex, 3).setValue(newHash);
      sheet.getRange(found.rowIndex, 4).setValue(new Date().toLocaleString('th-TH'));
      return jsonOut_({ status: 'success', message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    }
    return jsonOut_({ status: 'error', code: 'ALREADY_SET', message: 'บัญชีนี้ตั้งรหัสผ่านไว้แล้ว หากต้องการเปลี่ยนต้องระบุวันเกิดเดิมให้ถูกต้อง หรือติดต่อเจ้าหน้าที่' });
  } finally {
    lock.releaseLock();
  }
}

// ล็อกอินด้วยวันเกิด -> ออก token
function handleCredentialLogin_(data) {
  var role = normalizeRole_(data.role);
  var id = String(data.id || '').trim();
  var dob = normalizeDob_(data.dob);
  if (!id || !dob) return jsonOut_({ status: 'error', code: 'BAD_INPUT', message: 'ข้อมูลไม่ครบ' });

  var sheet = getCredSheet_();
  var found = findCredRow_(sheet, role, id);
  if (!found) return jsonOut_({ status: 'error', code: 'NO_CREDENTIAL', message: 'ยังไม่ได้ตั้งรหัสผ่าน (วันเกิด)' });
  if (hashCredential_(role, id, dob) !== found.hash) {
    return jsonOut_({ status: 'error', code: 'BAD_CREDENTIAL', message: 'วันเกิดไม่ถูกต้อง' });
  }
  var exp = Date.now() + (role === 'staff' ? 7 : 30) * 24 * 3600 * 1000;
  var token = signToken_({ sub: id, role: role, exp: exp });
  return jsonOut_({ status: 'success', token: token, role: role, id: id });
}

// พร็อกซี AI (แชทที่ปรึกษา): เรียก Gemini ด้วยคีย์ที่เก็บใน Script Property `GEMINI_API_KEY`
// -> client ไม่ต้องถือคีย์อีกต่อไป (เดิมคีย์อยู่ใน localStorage + หลุดใน URL)
function handleAiChat_(data) {
  // เปิดโหมดบังคับสิทธิ์แล้วต้องมี token (กันคนนอกยิงใช้จนเปลืองโควตา/ค่าใช้จ่าย)
  if (isAuthEnforced_()) {
    var authCtx = resolveAuth_(null, data);
    if (!authCtx) return jsonOut_({ status: 'error', code: 'AUTH_REQUIRED', message: 'กรุณาเข้าสู่ระบบก่อนใช้ AI' });
  }
  var apiKey = props_().getProperty('GEMINI_API_KEY');
  if (!apiKey) return jsonOut_({ status: 'error', message: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบหลังบ้าน' });
  var contents = data.contents;
  if (!contents) return jsonOut_({ status: 'error', message: 'ไม่มีเนื้อหาคำถาม' });
  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ contents: contents }),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var body = JSON.parse(resp.getContentText());
    if (code >= 200 && code < 300 && body.candidates && body.candidates[0] && body.candidates[0].content) {
      return jsonOut_({ status: 'success', text: body.candidates[0].content.parts[0].text });
    }
    return jsonOut_({ status: 'error', message: (body.error && body.error.message) || ('AI error ' + code) });
  } catch (e) {
    return jsonOut_({ status: 'error', message: e.toString() });
  }
}

// รีเซ็ตรหัสผ่านของผู้ใช้ (ลบแถว) — เฉพาะเจ้าหน้าที่ที่มี token เท่านั้น
// หลังรีเซ็ต ผู้ใช้จะตั้งวันเกิดใหม่ได้เองตอนล็อกอินครั้งถัดไป (TOFU)
function handleResetCredential_(data, e) {
  var authCtx = resolveAuth_(e, data);
  if (!authCtx || authCtx.role !== 'staff') {
    return jsonOut_({ status: 'error', code: 'FORBIDDEN', message: 'เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบแล้วเท่านั้นที่รีเซ็ตรหัสผ่านได้' });
  }
  var role = normalizeRole_(data.targetRole);
  var id = String(data.targetId || '').trim();
  if (!id) return jsonOut_({ status: 'error', message: 'ไม่ได้ระบุผู้ใช้ที่จะรีเซ็ต' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e2) { return jsonOut_({ status: 'error', message: 'ระบบไม่ว่าง กรุณาลองใหม่' }); }
  try {
    var sheet = getCredSheet_();
    var found = findCredRow_(sheet, role, id);
    if (!found) {
      return jsonOut_({ status: 'success', message: 'ผู้ใช้รายนี้ยังไม่ได้ตั้งรหัสผ่าน (ไม่ต้องรีเซ็ต)' });
    }
    sheet.deleteRow(found.rowIndex);
    return jsonOut_({ status: 'success', message: 'รีเซ็ตรหัสผ่านสำเร็จ ผู้ใช้จะตั้งวันเกิดใหม่ตอนล็อกอินครั้งถัดไป' });
  } finally {
    lock.releaseLock();
  }
}

// ==============================================================================
// 📥 doGet — เส้นทางอ่านข้อมูล + fallback ส่งข้อมูลผ่าน ?p=
// ==============================================================================
function doGet(e) {
  // --- Login (อ่านผ่าน GET ได้เพื่อเลี่ยงปัญหา CORS preflight) ---
  if (e && e.parameter && e.parameter.action === "requestOtp") return handleRequestOtp_(e.parameter);
  if (e && e.parameter && e.parameter.action === "verifyOtp") return handleVerifyOtp_(e.parameter);
  if (e && e.parameter && e.parameter.action === "staffLogin") return handleStaffLogin_(e.parameter);

  if (e && e.parameter && e.parameter.action === "summary") {
    return handleSummaryRequest();
  }
  if (e && e.parameter && e.parameter.action === "getAll") {
    return getAllPlots();
  }
  if (e && e.parameter && e.parameter.action === "pullAll") {
    var authCtx = resolveAuth_(e, null);
    if (isAuthEnforced_() && !authCtx) {
      return jsonOut_({ status: 'error', code: 'AUTH_REQUIRED', message: 'กรุณาเข้าสู่ระบบก่อนดึงข้อมูล' });
    }
    return pullAllData(authCtx);
  }
  if (e && e.parameter && e.parameter.action === "getUsers") {
    // getUsers เปิดให้อ่านได้ (เป็น mapping โควตา->สาย ไม่ใช่ PII ละเอียด) แต่ยังบังคับ token เมื่อเปิดโหมด
    var authU = resolveAuth_(e, null);
    if (isAuthEnforced_() && !authU) {
      return jsonOut_({ status: 'error', code: 'AUTH_REQUIRED', message: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    return getUsersList();
  }
  if (e && e.parameter && e.parameter.action === "get_chats") {
    var authC = resolveAuth_(e, null);
    if (isAuthEnforced_() && !authC) {
      return jsonOut_({ status: 'error', code: 'AUTH_REQUIRED', message: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    return getChatMessages(authC);
  }

  // ถ้ามี parameter 'p' หมายความว่าเป็นการส่งข้อมูล (write ผ่าน GET fallback)
  if (e && e.parameter && e.parameter.p) {
    try {
      var rawP = e.parameter.p;
      var decodedP;
      try {
        decodedP = decodeURIComponent(rawP);
      } catch (uriErr) {
        decodedP = rawP; // Google อาจ decode ให้แล้ว
      }
      var data = JSON.parse(decodedP);
      return processData(data, e);
    } catch (err) {
      return jsonOut_({ status: "error", message: "Invalid JSON in parameter: " + err.toString() });
    }
  }

  return jsonOut_({ status: "ok", message: "Smart Farmer Book API is running! (v4 - auth-ready)" });
}

function getAllPlots() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('REGISTRATION') || SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลแปลงอ้อย');
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const plots = values
    .filter(row => row[0] !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
          try { v = JSON.parse(v); } catch (err) {}
        }
        obj[h] = v;
      });
      return obj;
    });
  return jsonOut_({ status: 'success', plots: plots });
}

function getChatMessages(authCtx) {
  var ss = getSS_();
  var sheet = ss.getSheetByName("ข้อความแชท");
  if (!sheet) {
    return jsonOut_({ status: "success", messages: [] });
  }
  var values = sheet.getDataRange().getValues();
  var headers = values.shift();
  var messages = values.filter(function (row) { return row[0] !== ''; }).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return {
      id: obj["รหัสข้อความ (Message ID)"],
      timestamp: new Date(obj["วันที่-เวลาส่ง (Timestamp)"]).getTime(),
      senderId: obj["รหัสผู้ส่ง (Sender ID)"],
      senderName: obj["ชื่อผู้ส่ง (Sender Name)"],
      role: obj["สถานะ (Role)"],
      message: obj["ข้อความ (Message)"],
      type: obj["ประเภทข้อความ (Type)"],
      mediaData: obj["ข้อมูลสื่อ (Media Data)"] || "",
      targetGroup: obj["กลุ่มเป้าหมาย (Target Group)"]
    };
  });

  // เมื่อบังคับสิทธิ์: ชาวไร่เห็นเฉพาะแชทกลาง (global) และกลุ่มของสายตัวเอง
  if (isAuthEnforced_() && authCtx && authCtx.role === 'farmer') {
    var myGroup = getSubzoneByQuota_(authCtx.sub);
    messages = messages.filter(function (m) {
      var g = String(m.targetGroup || '').trim();
      // F4: ตัด g === '' ออก — targetGroup ว่าง (mislabel) ไม่ควรมองเป็น "เห็นได้ทุกคน"
      return g === 'global' || g === myGroup || g === authCtx.sub;
    });
  }

  return jsonOut_({ status: "success", messages: messages });
}

function pullAllData(authCtx) {
  var ss = getSS_();
  var plotsSheet = ss.getSheetByName("ข้อมูลแปลงอ้อย") || ss.getSheetByName("REGISTRATION");
  var pestsSheet = ss.getSheetByName("การวินิจฉัยโรคอ้อย") || ss.getSheetByName("การวินิจฉัยโรคและแมลงศัตรูพืช") || ss.getSheetByName("PEST");

  var plotsList = [];
  if (plotsSheet) {
    var values = plotsSheet.getDataRange().getValues();
    var headers = values.shift();
    plotsList = values
      .filter(row => row[0] !== '')
      .map(row => {
        var obj = {};
        headers.forEach((h, i) => {
          var v = row[i];
          if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
            try { v = JSON.parse(v); } catch (err) {}
          }
          obj[h] = v;
        });
        return obj;
      });
  }

  var pestsList = [];
  if (pestsSheet) {
    var values = pestsSheet.getDataRange().getValues();
    var headers = values.shift();
    pestsList = values
      .filter(row => row[0] !== '')
      .map(row => {
        var obj = {};
        headers.forEach((h, i) => {
          var v = row[i];
          if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
            try { v = JSON.parse(v); } catch (err) {}
          }
          obj[h] = v;
        });
        return obj;
      });
  }

  // 🔐 กรองข้อมูลตามสิทธิ์: ถ้ามี token ของชาวไร่ ให้คืนเฉพาะแปลง/รายงานของโควตาตัวเอง
  // (ทำงานเมื่อมี token เสมอ ไม่ว่าจะเปิด ENFORCE_AUTH หรือไม่ — client ใหม่จะได้ข้อมูลที่ถูก scope)
  if (authCtx && authCtx.role === 'farmer') {
    var myQuota = String(authCtx.sub).trim();
    var quotaKeys = ["เลขโควตา (Quota)", "Quota", "โควตา", "quota"];
    var matchQuota = function (obj) {
      for (var k = 0; k < quotaKeys.length; k++) {
        if (obj[quotaKeys[k]] !== undefined && String(obj[quotaKeys[k]]).trim() === myQuota) return true;
      }
      return false;
    };
    plotsList = plotsList.filter(matchQuota);
    pestsList = pestsList.filter(matchQuota);
  }
  // staff token: คืนทั้งหมด (การจำกัดตามสายย่อยทำที่ client อยู่แล้ว; จะย้ายมาทำที่นี่ในเฟสถัดไป)

  // หลักทรัพย์/หนี้สิน (F3): อ่าน record ทั้งหมด (scope ตามโควตาถ้าเป็นชาวไร่)
  var assetDebt = [];
  var adSheet = ss.getSheetByName("หลักทรัพย์และหนี้สิน");
  if (adSheet) {
    var adv = adSheet.getDataRange().getValues();
    for (var ai = 1; ai < adv.length; ai++) {
      if (!adv[ai][0]) continue;
      var adQuota = String(adv[ai][2] || '').trim();
      if (authCtx && authCtx.role === 'farmer' && adQuota !== String(authCtx.sub).trim()) continue;
      var adData = {};
      try { adData = JSON.parse(adv[ai][4]); } catch (e) {}
      var adCrop = String(adv[ai][3] || '');
      assetDebt.push({
        kind: adv[ai][1],
        key: adQuota + '_' + adCrop,
        quota: adQuota,
        cropYear: adCrop,
        data: adData,
        updatedAt: adv[ai][5]
      });
    }
  }

  return jsonOut_({ status: 'success', plots: plotsList, pestReports: pestsList, assetDebt: assetDebt });
}

// ฟังก์ชันดึงข้อมูลสรุปจากชีตหลังบ้านทั้งหมดเพื่อนำไปวิเคราะห์แบบ Real-time
function handleSummaryRequest() {
  var ss = getSS_();

  try {
    var summary = {
      status: "success",
      totalPlots: 0,
      totalArea: 0,
      totalExpectedYield: 0,
      totalCost: 0,
      totalActualYield: 0,
      pendingSupportCount: 0,
      plots: []
    };

    // 1. ดึงข้อมูลจากชีต "ข้อมูลแปลงอ้อย"
    var regSheet = ss.getSheetByName("ข้อมูลแปลงอ้อย");
    if (regSheet) {
      var data = regSheet.getDataRange().getValues();
      if (data.length > 1) {
        var header = data[0];
        var idxId = header.indexOf("รหัสแปลง (Plot ID)");
        var idxQuota = header.indexOf("เลขโควตา (Quota)");
        var idxName = header.indexOf("ชื่อชาวไร่");
        var idxArea = header.indexOf("พื้นที่ (ไร่)");
        var idxVariety = header.indexOf("สายพันธุ์อ้อย");
        var idxSupport = header.indexOf("ขอทุนสนับสนุน");
        var idxStatus = header.indexOf("สถานะอนุมัติ");

        if (idxId === -1) idxId = 0;
        if (idxQuota === -1) idxQuota = 1;
        if (idxName === -1) idxName = 3;
        if (idxArea === -1) idxArea = 5;
        if (idxVariety === -1) idxVariety = 12;
        if (idxSupport === -1) idxSupport = 9;
        if (idxStatus === -1) idxStatus = 16;

        summary.totalPlots = data.length - 1;
        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          var areaVal = parseFloat(row[idxArea]) || 0;
          summary.totalArea += areaVal;

          var wantsSupport = row[idxSupport] === "ใช่" || row[idxSupport] === true;
          var supportStatus = row[idxStatus] || "รอการตอบกลับ";
          if (wantsSupport && supportStatus === "รอการตอบกลับ") {
            summary.pendingSupportCount++;
          }

          summary.plots.push({
            id: row[idxId],
            quota: row[idxQuota],
            name: row[idxName],
            area: areaVal,
            variety: row[idxVariety] || "-",
            supportStatus: supportStatus
          });
        }
      }
    }

    // 2. ดึงข้อมูลการคาดการณ์จากชีต "การประเมินผลผลิต"
    var estSheet = ss.getSheetByName("การประเมินผลผลิต");
    if (estSheet) {
      var data = estSheet.getDataRange().getValues();
      if (data.length > 1) {
        var header = data[0];
        var idxId = header.indexOf("รหัสแปลง (Plot ID)");
        var idxExpYield = header.indexOf("คาดการณ์ผลผลิตรวม (ตัน)");
        if (idxId === -1) idxId = 1;
        if (idxExpYield === -1) idxExpYield = 8;

        var latestEst = {};
        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          latestEst[row[idxId]] = parseFloat(row[idxExpYield]) || 0;
        }
        for (var pId in latestEst) summary.totalExpectedYield += latestEst[pId];
      }
    }

    // 3. ดึงต้นทุนจากชีต "บันทึกต้นทุนและงบดุล"
    var costSheet = ss.getSheetByName("บันทึกต้นทุนและงบดุล");
    if (costSheet) {
      var data = costSheet.getDataRange().getValues();
      if (data.length > 1) {
        var header = data[0];
        var idxId = header.indexOf("รหัสแปลง (Plot ID)");
        var idxTotalCost = header.indexOf("ต้นทุนรวมแปลง (บาท)");
        if (idxId === -1) idxId = 1;
        if (idxTotalCost === -1) idxTotalCost = 4;

        var latestCost = {};
        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          latestCost[row[idxId]] = parseFloat(row[idxTotalCost]) || 0;
        }
        for (var pId in latestCost) summary.totalCost += latestCost[pId];
      }
    }

    // 4. ดึงข้อมูลจริงจากชีต "บันทึกการเก็บเกี่ยว"
    var harvSheet = ss.getSheetByName("บันทึกการเก็บเกี่ยว");
    if (harvSheet) {
      var data = harvSheet.getDataRange().getValues();
      if (data.length > 1) {
        var header = data[0];
        var idxId = header.indexOf("รหัสแปลง (Plot ID)");
        var idxActualYield = header.indexOf("น้ำหนักเก็บเกี่ยวจริง (ตัน)");
        if (idxId === -1) idxId = 1;
        if (idxActualYield === -1) idxActualYield = 12;

        var latestHarv = {};
        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          latestHarv[row[idxId]] = parseFloat(row[idxActualYield]) || 0;
        }
        for (var pId in latestHarv) summary.totalActualYield += latestHarv[pId];
      }
    }

    return jsonOut_(summary);
  } catch (err) {
    return jsonOut_({ status: "error", message: "เกิดข้อผิดพลาดในการคำนวณข้อมูลสรุป: " + err.toString() });
  }
}

// ==============================================================================
// 📤 doPost — รับข้อมูลเขียนแบบ POST
// ==============================================================================
function doPost(e) {
  try {
    var jsonString = e.postData ? e.postData.contents : (e.parameter ? e.parameter.p : '');
    var data = JSON.parse(jsonString);
    return processData(data, e);
  } catch (error) {
    return jsonOut_({ status: "error", message: error.toString() });
  }
}

// ==============================================================================
// 🧠 processData — ประมวลผลการเขียน (ใช้ร่วมกันระหว่าง doPost และ doGet)
// ==============================================================================
function processData(data, e) {
  // --- Login actions ก็รับผ่าน POST ได้เช่นกัน ---
  if (data && data.action === "requestOtp") return handleRequestOtp_(data);
  if (data && data.action === "verifyOtp") return handleVerifyOtp_(data);
  if (data && data.action === "staffLogin") return handleStaffLogin_(data);
  if (data && data.action === "setCredential") return handleSetCredential_(data);
  if (data && data.action === "credentialLogin") return handleCredentialLogin_(data);
  if (data && data.action === "resetCredential") return handleResetCredential_(data, e);
  if (data && data.action === "aiChat") return handleAiChat_(data);

  // 🔐 ตรวจสิทธิ์การเขียน
  var authCtx = resolveAuth_(e, data);
  var action0 = data.action;
  var type0 = (data.type || "REGISTRATION").toString().toUpperCase();
  var plot0 = data.data || {};

  if (isAuthEnforced_()) {
    if (!authCtx) {
      return jsonOut_({ status: 'error', code: 'AUTH_REQUIRED', message: 'กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล' });
    }
    // ชาวไร่: เขียนได้เฉพาะข้อมูลของโควตาตัวเอง และห้ามเขียนข้อมูลระบบ (บัญชีผู้ใช้)
    if (authCtx.role === 'farmer') {
      if (type0 === 'BOOTSTRAP_USERS') {
        return jsonOut_({ status: 'error', code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ดำเนินการนี้' });
      }
      var recQuota = String(plot0.quota || '').trim();
      if (recQuota && recQuota !== String(authCtx.sub).trim()) {
        return jsonOut_({ status: 'error', code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์แก้ไขข้อมูลของโควตาอื่น' });
      }
    }
    // staff: อนุญาตให้เขียน (การจำกัดตามสายย่อยจะเพิ่มในเฟสถัดไป)
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e2) {
    return jsonOut_({ status: "error", message: "ระบบหลังบ้านหนาแน่นเกินไป (Lock Timeout) กรุณากดซิงก์ใหม่อีกครั้งในภายหลังครับ: " + e2.toString() });
  }
  try {
    var action = action0;
    var type = type0;
    var plot = plot0;

    var ss = getSS_();

    if (action === "save_chat") {
      var sheetName = "ข้อความแชท";
      var headers = ["รหัสข้อความ (Message ID)", "วันที่-เวลาส่ง (Timestamp)", "รหัสผู้ส่ง (Sender ID)", "ชื่อผู้ส่ง (Sender Name)", "สถานะ (Role)", "ข้อความ (Message)", "ประเภทข้อความ (Type)", "ข้อมูลสื่อ (Media Data)", "กลุ่มเป้าหมาย (Target Group)"];
      var rowValues = [
        data.id,
        new Date(Number(data.timestamp)).toISOString(),
        data.senderId,
        data.senderName,
        data.role,
        data.message,
        data.type,
        data.mediaData || "",
        data.targetGroup
      ];
      // F4 security: ชาวไร่ส่งได้เฉพาะกลุ่ม global หรือสายของตัวเอง + ปักผู้ส่งตาม token (กันปลอม)
      if (isAuthEnforced_() && authCtx && authCtx.role === 'farmer') {
        var myGroup = getSubzoneByQuota_(authCtx.sub);
        var tg = String(data.targetGroup || '').trim();
        if (tg !== 'global' && tg !== myGroup) {
          rowValues[8] = myGroup || 'global'; // บังคับกลับเข้าสายตัวเอง
        }
        rowValues[2] = authCtx.sub; // senderId = quota จาก token
      }
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2f0d9");
      }
      sheet.appendRow(rowValues);
      return jsonOut_({ status: "success", message: "Saved chat message successfully" });
    }

    // หลักทรัพย์/หนี้สิน (F3): เก็บเป็น 1 แถวต่อ record (upsert ตาม kind|key) เพื่อ sync ข้ามอุปกรณ์
    if (type === "ASSET_DEBT") {
      var rec = data.data || {};
      // ชาวไร่แก้ได้เฉพาะของโควตาตัวเอง
      if (isAuthEnforced_() && authCtx && authCtx.role === 'farmer') {
        var rq = String(rec.quota || '').trim();
        if (rq && rq !== String(authCtx.sub).trim()) {
          return jsonOut_({ status: "error", code: 'FORBIDDEN', message: "ไม่มีสิทธิ์แก้ไขข้อมูลของโควตาอื่น" });
        }
      }
      var adSheetName = "หลักทรัพย์และหนี้สิน";
      var adHeaders = ["คีย์ (kind|key)", "ประเภท (asset/debt)", "เลขโควตา (Quota)", "ปีการผลิต", "ข้อมูล (JSON)", "อัปเดตล่าสุด"];
      var adSheet = ss.getSheetByName(adSheetName);
      if (!adSheet) {
        adSheet = ss.insertSheet(adSheetName);
        adSheet.appendRow(adHeaders);
        adSheet.getRange(1, 1, 1, adHeaders.length).setFontWeight("bold").setBackground("#e2f0d9");
      }
      ensureHeaders_(adSheet, adHeaders);
      var rowKey = String(rec.kind || '') + '|' + String(rec.key || '');
      var adRow = [rowKey, rec.kind || '', rec.quota || '', rec.cropYear || '', JSON.stringify(rec.data || {}), rec.lastUpdated || new Date().toLocaleString('th-TH')];
      var adVals = adSheet.getDataRange().getValues();
      var adIdx = -1;
      for (var ai = 1; ai < adVals.length; ai++) {
        if (String(adVals[ai][0]) === rowKey) { adIdx = ai + 1; break; }
      }
      if (adIdx !== -1) adSheet.getRange(adIdx, 1, 1, adRow.length).setValues([adRow]);
      else adSheet.appendRow(adRow);
      return jsonOut_({ status: "success", message: "Saved asset/debt record" });
    }

    var sheetName = "";
    var headers = [];
    var rowValues = [];

    if (type === "IDENTITY") {
      sheetName = "ยืนยันตัวตน";
      headers = ["วันที่-เวลา", "เลขโควตา (Quota)", "พิกัด (GPS)", "ลิงก์รูปใบหน้า", "ความยินยอม PDPA", "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์"];

      var facePhotoUrl = saveBase64ImageToDrive(plot.facePhoto, "ยืนยันตัวตน_" + (plot.quota || "00000") + "_" + Date.now() + ".jpg");
      rowValues = [
        new Date().toLocaleString("th-TH"),
        plot.quota || "00000",
        plot.gps || "-",
        facePhotoUrl,
        plot.consent || "ยินยอม (Agreed)",
        plot.offlineCreated || "-",
        plot.isOffline ? "ใช่" : "ไม่ใช่"
      ];

    } else if (type === "REGISTRATION") {
      sheetName = "ข้อมูลแปลงอ้อย";
      headers = [
        "รหัสแปลง (Plot ID)", "เลขโควตา (Quota)", "รหัสชาวไร่ (CN.)", "ชื่อชาวไร่", "พิกัดแปลง (GPS)",
        "พื้นที่ (ไร่)", "เบอร์ติดต่อ", "มีชลประทาน", "รูปแบบการให้น้ำ", "ขอทุนสนับสนุน",
        "เหตุผลที่ปฏิเสธทุน", "รายการทุนที่ขอ", "สายพันธุ์อ้อย", "วันที่เริ่มปลูก",
        "ลิงก์รูปถ่ายแจ้งปลูก", "กิจกรรมที่ทำสำเร็จแล้ว", "สถานะอนุมัติ", "หมายเหตุพนักงาน", "รหัสพนักงานผู้ตอบ", "อัปเดตล่าสุด",
        "สถานะแผนที่ (Polygon)", "รหัสแปลงโรงงาน", "ข้อมูลขอบเขตแปลง (JSON)",
        "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์", "วันเวลาเข้าตรวจแปลง",
        "คำขอคิวรถตัด (JSON)", "สถานะคิวรถตัด", "เหตุผลปฏิเสธแนวเขต",
        "ชาวไร่ยืนยันเข้าพบ", "หมายเหตุยืนยันเข้าพบ", "รูปยืนยันเข้าพบ", "เวลายืนยันเข้าพบ"
      ];

      if (action === "DELETE") {
        var sheet = ss.getSheetByName(sheetName);
        if (sheet) {
          var sheetData = sheet.getDataRange().getValues();
          for (var i = 1; i < sheetData.length; i++) {
            if (sheetData[i][0] == plot.id) {
              // 🔐 เมื่อบังคับสิทธิ์: ชาวไร่ลบได้เฉพาะแปลงของโควตาตัวเอง (กันลบข้ามคน)
              if (isAuthEnforced_() && authCtx && authCtx.role === 'farmer') {
                var rowQuota = String(sheetData[i][1] || '').trim();
                if (rowQuota && rowQuota !== String(authCtx.sub).trim()) {
                  return jsonOut_({ status: "error", code: 'FORBIDDEN', message: "ไม่มีสิทธิ์ลบแปลงของโควตาอื่น" });
                }
              }
              sheet.deleteRow(i + 1);
              return jsonOut_({ status: "success", message: "Deleted plot successfully" });
            }
          }
        }
        return jsonOut_({ status: "not_found", message: "Plot not found for deletion" });
      }

      var regPhotoUrl = saveBase64ImageToDrive(plot.regPhoto, "แจ้งปลูก_" + plot.cn + "_" + (plot.quota || "00000") + ".jpg");
      // รูปยืนยันการเข้าพบของชาวไร่ → เก็บเป็นลิงก์ Drive (กันชน ~50k ตัวอักษร/เซลล์) เหมือน regPhoto
      var visitConfirmPhotoUrl = plot.visitConfirmPhoto ? saveBase64ImageToDrive(plot.visitConfirmPhoto, "ยืนยันเข้าพบ_" + (plot.quota || "00000") + "_" + plot.id + ".jpg") : "";
      rowValues = [
        plot.id,
        plot.quota || "00000",
        plot.cn,
        plot.name,
        plot.location,
        plot.area,
        plot.phone,
        plot.hasIrrigation ? "มี" : "ไม่มี",
        plot.irrigationType || "-",
        plot.wantsSupport ? "ใช่" : "ไม่ใช่",
        plot.supportRejectReason || "-",
        plot.supportItems ? plot.supportItems.join(", ") : "",
        plot.variety || "ขอนแก่น 3",
        plot.plantingDate || "-",
        regPhotoUrl,
        plot.completedActivities ? plot.completedActivities.join(", ") : "-",
        plot.supportStatus || "รอการตอบกลับ",
        plot.staffNote || "-",
        plot.staffId || "-",
        new Date().toLocaleString("th-TH"),
        plot.polygonStatus || "none",
        plot.factoryPlotCode || "-",
        plot.polygon && plot.polygon.length > 0 ? JSON.stringify(plot.polygon) : "[]",
        plot.offlineCreated || "-",
        plot.isOffline ? "ใช่" : "ไม่ใช่",
        plot.staffVisitDate || "-",
        plot.harvesterRequest ? JSON.stringify(plot.harvesterRequest) : "",
        plot.harvesterRequest ? (plot.harvesterRequest.status || "") : "",
        plot.polygonRejectReason || "",
        plot.visitConfirmed ? "ยืนยันแล้ว" : "",
        plot.visitConfirmNote || "",
        visitConfirmPhotoUrl,
        plot.visitConfirmTime || ""
      ];

    } else if (type === "SUPPORT") {
      sheetName = "คำขอการสนับสนุน";
      headers = ["วันที่-เวลา", "รหัสแปลง (Plot ID)", "เลขโควตา (Quota)", "ชื่อชาวไร่", "รายการสนับสนุนที่ขอ", "วงเงินสนับสนุนรวม (บาท)", "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์"];

      var totalSupportVal = 0;
      if (plot.supportItems && plot.customPrices) {
        plot.supportItems.forEach(function (item) {
          totalSupportVal += (plot.customPrices[item] || 0) * plot.area;
        });
      }

      rowValues = [
        new Date().toLocaleString("th-TH"),
        plot.id,
        plot.quota || "00000",
        plot.name,
        plot.supportItems ? plot.supportItems.join(", ") : "-",
        totalSupportVal,
        plot.offlineCreated || "-",
        plot.isOffline ? "ใช่" : "ไม่ใช่"
      ];

    } else if (type === "ESTIMATE") {
      sheetName = "การประเมินผลผลิต";
      headers = [
        "วันที่-เวลา", "รหัสแปลง (Plot ID)", "เลขโควตา (Quota)", "ระยะร่อง (ม.)", "ลำต่อเมตร",
        "ขนาดลำ (ซม.)", "ความสูง (ม.)", "คาดการณ์ผลผลิตต่อไร่ (ตัน)", "คาดการณ์ผลผลิตรวม (ตัน)",
        "จุดคุ้มทุน (ตัน/ไร่)", "ประมาณการกำไร/ขาดทุนสุทธิ (บาท)", "ลิงก์รูปถ่ายประเมิน",
        "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์"
      ];

      var rowLengthPerRai = 1600 / plot.spacing;
      var stalksPerRai = Math.round(rowLengthPerRai * plot.stalksPerMeter);
      var radiusCm = plot.diameter / 2;
      var stalkWeight = Math.PI * Math.pow(radiusCm, 2) * plot.height * plot.density;
      var expectedYieldPerRai = (stalksPerRai * stalkWeight) / 1000;
      var totalExpectedYield = expectedYieldPerRai * plot.area;
      var expectedRevenuePerRai = expectedYieldPerRai * plot.buyingPrice;
      var expectedProfitPerRai = expectedRevenuePerRai - plot.costPerRai;
      var totalExpectedProfit = expectedProfitPerRai * plot.area;
      var breakEvenYield = plot.costPerRai / plot.buyingPrice;

      var estPhotoUrl = saveBase64ImageToDrive(plot.estPhoto, "ประเมิน_" + plot.cn + "_" + (plot.quota || "00000") + ".jpg");

      rowValues = [
        new Date().toLocaleString("th-TH"),
        plot.id,
        plot.quota || "00000",
        plot.spacing,
        plot.stalksPerMeter,
        plot.diameter,
        plot.height,
        expectedYieldPerRai.toFixed(2),
        totalExpectedYield.toFixed(2),
        breakEvenYield.toFixed(2),
        Math.round(totalExpectedProfit),
        estPhotoUrl,
        plot.offlineCreated || "-",
        plot.isOffline ? "ใช่" : "ไม่ใช่"
      ];

    } else if (type === "COST") {
      sheetName = "บันทึกต้นทุนและงบดุล";
      headers = [
        "วันที่-เวลา", "รหัสแปลง (Plot ID)", "เลขโควตา (Quota)", "ต้นทุนเฉลี่ย (บาท/ไร่)", "ต้นทุนรวมแปลง (บาท)",
        "ประเภทดิน", "ช่วงการใส่ปุ๋ย", "สูตรปุ๋ยแนะนำ", "จำนวนปุ๋ยที่ใช้ (กระสอบ)", "ประมาณการราคารวมปุ๋ย (บาท)",
        "อัตราผลตอบแทนคาดการณ์ ROI%", "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์"
      ];

      rowValues = [
        new Date().toLocaleString("th-TH"),
        plot.id,
        plot.quota || "00000",
        plot.costPerRai,
        plot.costPerRai * plot.area,
        plot.fertSoilType || "-",
        plot.fertStage || "-",
        plot.fertFormula || "-",
        plot.fertBags || "-",
        plot.fertCost || "-",
        plot.expectedROI || "0%",
        plot.offlineCreated || "-",
        plot.isOffline ? "ใช่" : "ไม่ใช่"
      ];

    } else if (type === "HARVEST") {
      sheetName = "บันทึกการเก็บเกี่ยว";
      headers = [
        "วันที่-เวลา", "รหัสแปลง (Plot ID)", "เลขโควตา (Quota)", "สถานะตัดอ้อย", "วันตัดอ้อย",
        "วิธีการตัด", "อุปกรณ์ที่ใช้", "น้ำหนักแปลง (ขนส่ง)", "น้ำหนักลานกลาง (ขนส่ง)", "น้ำหนักดัมโรงงาน (ขนส่ง)",
        "น้ำหนักสูญเสียขนส่ง", "มูลค่าความสูญเสียขนส่ง", "น้ำหนักเก็บเกี่ยวจริง (ตัน)", "CCS จริง", "กำไร/ขาดทุนจริง (บาท)",
        "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์"
      ];

      var basePrice = plot.buyingPrice || 890;
      var ccsPrice = plot.ccsPrice !== undefined ? plot.ccsPrice : (basePrice * 0.06);
      var adjustedPrice = basePrice + ccsPrice * (plot.actualHarvestCCS - 10);
      var methodAdjustment = (plot.harvestMethod === "ตัดสด") ? 120 : -30;
      var netCanePrice = adjustedPrice + methodAdjustment;

      var actualRevenue = plot.actualHarvestTons * netCanePrice;
      var totalCost = plot.costPerRai * plot.area;
      var finalProfit = actualRevenue - totalCost;

      var transportLossWeight = 0;
      var transportLossCost = 0;
      if (plot.transportPlotWeight && plot.transportFactoryWeight) {
        transportLossWeight = plot.transportPlotWeight - plot.transportFactoryWeight;
        transportLossCost = transportLossWeight * (netCanePrice > 0 ? netCanePrice : basePrice);
      }

      rowValues = [
        new Date().toLocaleString("th-TH"),
        plot.id,
        plot.quota || "00000",
        plot.isHarvested ? "ตัดอ้อยส่งโรงงานแล้ว" : "ยังไม่ได้ตัดอ้อย",
        plot.isHarvested ? plot.actualHarvestDate : "-",
        plot.harvestMethod || "ตัดสด",
        plot.harvestEquipment || "คนตัด",
        plot.transportPlotWeight || 0,
        plot.transportYardWeight || 0,
        plot.transportFactoryWeight || 0,
        transportLossWeight.toFixed(2),
        Math.round(transportLossCost),
        plot.isHarvested ? plot.actualHarvestTons : 0,
        plot.isHarvested ? plot.actualHarvestCCS : 0,
        plot.isHarvested ? Math.round(finalProfit) : 0,
        plot.offlineCreated || "-",
        plot.isOffline ? "ใช่" : "ไม่ใช่"
      ];

    } else if (type === "PEST") {
      sheetName = "การวินิจฉัยโรคอ้อย";
      headers = [
        "วันที่-เวลา",
        "เลขโควตา (Quota)",
        "ชื่อแปลงอ้อย",
        "อาการผิดปกติที่พบ",
        "ผลวินิจฉัยโรค",
        "ระดับความรุนแรง",
        "วิธีกำจัดและแนวทางการรักษา",
        "พิกัดที่เกิดโรค (Lat,Lng)",
        "ภาพถ่ายจุดเกิดโรค (Base64)",
        "เวลาบันทึกจริง (Offline)",
        "แก้ไขออฟไลน์",
        "รหัสรายงาน (Pest ID)", "รหัสแปลง (Plot ID)",
        "สถานะการตอบกลับ", "คำแนะนำเจ้าหน้าที่", "เจ้าหน้าที่ผู้ตอบ", "เวลาตอบกลับ"
      ];

      rowValues = [
        new Date().toLocaleString("th-TH"),
        plot.quota || "00000",
        plot.plotName || "-",
        plot.pestSymptoms || "-",
        plot.pestDiagnoses || "-",
        plot.pestLevels || "-",
        plot.pestRecipes || "-",
        plot.pestLocation || "-",
        plot.pestPhoto || "-",
        plot.offlineCreated || "-",
        plot.isOffline ? "ใช่" : "ไม่ใช่",
        plot.id || "",
        plot.plotId || "",
        plot.staffReplyStatus || "",
        plot.staffReplyNote || "",
        plot.staffReplyBy || "",
        plot.staffReplyTime || ""
      ];
    } else if (type === "AUDIT_LOG") {
      sheetName = "ประวัติการใช้งานระบบ";
      headers = [
        "วันที่-เวลา", "เลขโควตา/เจ้าหน้าที่", "การกระทำ (Action)", "ประเภทข้อมูล (Type)",
        "รหัสอ้างอิง (ID)", "รายละเอียดความเปลี่ยนแปลง", "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์"
      ];

      rowValues = [
        new Date().toLocaleString("th-TH"),
        plot.quota || "ไม่ระบุ",
        plot.action || "-",
        plot.recordType || "-",
        plot.recordId || "-",
        plot.details || "-",
        plot.offlineCreated || "-",
        plot.isOffline ? "ใช่" : "ไม่ใช่"
      ];
    } else if (type === "BOOTSTRAP_USERS") {
      sheetName = "ข้อมูลบัญชีผู้ใช้";
      headers = ["เลขโควตา (Quota)", "รหัสสาย/พนักงาน (Subzone)"];

      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#d9e1f2");
      }

      var existingData = sheet.getDataRange().getValues();
      if (existingData.length <= 1) {
        var rows = [];
        for (var q in plot) {
          rows.push([q, String(plot[q])]);
        }
        if (rows.length > 0) {
          sheet.getRange(2, 1, rows.length, 2).setValues(rows);
        }
        return jsonOut_({ status: "success", message: "สร้างบัญชีผู้ใช้เริ่มต้นสำเร็จแล้ว" });
      } else {
        return jsonOut_({ status: "ignored", message: "ชีตบัญชีผู้ใช้มีข้อมูลอยู่แล้ว ข้ามการบันทึกทับ" });
      }
    }

    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2f0d9");
    }

    if (type === "REGISTRATION") {
      ensureHeaders_(sheet, headers); // เผื่อชีตเดิมยังไม่มีคอลัมน์คิวรถตัด 2 คอลัมน์ใหม่
      var sheetData = sheet.getDataRange().getValues();
      var rowIndex = -1;
      for (var i = 1; i < sheetData.length; i++) {
        if (sheetData[i][0] == plot.id) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex !== -1) {
        var existingRow = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];

        // 🔐 เมื่อบังคับสิทธิ์: ชาวไร่แก้ได้เฉพาะแปลงของโควตาตัวเอง (กันเขียนทับแปลงคนอื่นด้วย id เดียวกัน)
        if (isAuthEnforced_() && authCtx && authCtx.role === 'farmer') {
          var existingQuota = String(existingRow[1] || '').trim();
          if (existingQuota && existingQuota !== String(authCtx.sub).trim()) {
            return jsonOut_({ status: "error", code: 'FORBIDDEN', message: "ไม่มีสิทธิ์แก้ไขแปลงของโควตาอื่น" });
          }
        }

        // Preserve STAFF-controlled fields if update is from FARMER
        if (plot._updaterRole !== 'STAFF') {
          rowValues[16] = (existingRow[16] !== "" && existingRow[16] !== undefined) ? existingRow[16] : rowValues[16]; // supportStatus
          rowValues[17] = (existingRow[17] !== "" && existingRow[17] !== undefined) ? existingRow[17] : rowValues[17]; // staffNote
          rowValues[18] = (existingRow[18] !== "" && existingRow[18] !== undefined) ? existingRow[18] : rowValues[18]; // staffId
          rowValues[20] = (existingRow[20] !== "" && existingRow[20] !== undefined) ? existingRow[20] : rowValues[20]; // polygonStatus
          rowValues[21] = (existingRow[21] !== "" && existingRow[21] !== undefined) ? existingRow[21] : rowValues[21]; // factoryPlotCode
          // สถานะคิวรถตัด (idx 27) เป็นของเจ้าหน้าที่ -> ชาวไร่อัปเดตไม่ทับ (แต่คอลัมน์คำขอ JSON idx 26 ชาวไร่แก้ได้)
          rowValues[27] = (existingRow[27] !== "" && existingRow[27] !== undefined) ? existingRow[27] : rowValues[27]; // harvesterStatus
          rowValues[28] = (existingRow[28] !== "" && existingRow[28] !== undefined) ? existingRow[28] : rowValues[28]; // polygonRejectReason (staff)
        }

        // Preserve FARMER-owned visit-confirmation fields if update is from STAFF
        // (กันเจ้าหน้าที่แก้แปลง (เช่น นัดใหม่) แล้วลบการยืนยันของชาวไร่ที่ยังไม่ได้ pull)
        if (plot._updaterRole === 'STAFF') {
          rowValues[29] = (existingRow[29] !== "" && existingRow[29] !== undefined) ? existingRow[29] : rowValues[29]; // visitConfirmed
          rowValues[30] = (existingRow[30] !== "" && existingRow[30] !== undefined) ? existingRow[30] : rowValues[30]; // visitConfirmNote
          rowValues[31] = (existingRow[31] !== "" && existingRow[31] !== undefined) ? existingRow[31] : rowValues[31]; // visitConfirmPhoto (Drive URL)
          rowValues[32] = (existingRow[32] !== "" && existingRow[32] !== undefined) ? existingRow[32] : rowValues[32]; // visitConfirmTime
        }

        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
    } else if (type === "PEST") {
      // D5: upsert รายงานโรคตาม id (คอลัมน์ 11) เพื่อให้เจ้าหน้าที่ตอบกลับทับแถวเดิมได้
      ensureHeaders_(sheet, headers);
      var pestVals = sheet.getDataRange().getValues();
      var pestRowIdx = -1;
      var pestId = String(plot.id || '');
      if (pestId) {
        for (var pi = 1; pi < pestVals.length; pi++) {
          if (String(pestVals[pi][11]) === pestId) { pestRowIdx = pi + 1; break; }
        }
      }
      if (pestRowIdx !== -1) {
        var pestExisting = sheet.getRange(pestRowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];
        // ชาวไร่รีเขียนรายงาน -> คงฟิลด์ตอบกลับของเจ้าหน้าที่ (idx 13-16)
        if (plot._updaterRole !== 'STAFF') {
          for (var rc = 13; rc <= 16; rc++) {
            rowValues[rc] = (pestExisting[rc] !== "" && pestExisting[rc] !== undefined) ? pestExisting[rc] : rowValues[rc];
          }
        }
        sheet.getRange(pestRowIdx, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
    } else {
      sheet.appendRow(rowValues);
    }

    return jsonOut_({ status: "success", message: "Synced successfully to sheet: " + sheetName });

  } catch (error) {
    return jsonOut_({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ==============================================================================
// 🖼️ บันทึกรูป Base64 ลง Google Drive
// ==============================================================================
// ⚠️ หมายเหตุความปลอดภัย: ปัจจุบันตั้งสิทธิ์รูปเป็น ANYONE_WITH_LINK เพื่อให้ <img src>
// แสดงผลได้ การเปลี่ยนเป็นแบบส่วนตัวจะทำให้รูปไม่แสดงจนกว่าจะมี proxy รูปฝั่ง backend
// -> เลื่อนไปทำพร้อมเฟสที่มี image-proxy (ดูแผนใน memory: weakness-audit-dev-plan)
function saveBase64ImageToDrive(base64Data, filename) {
  try {
    if (!base64Data) return "";
    if (base64Data.indexOf("http") === 0) return base64Data; // เป็นลิงก์เดิมอยู่แล้ว
    if (base64Data.indexOf("data:image") === -1) return "";

    var parts = base64Data.split(",");
    var contentType = parts[0].match(/:(.*?);/)[1];
    var rawData = parts[1];

    var decoded = Utilities.base64Decode(rawData);
    var blob = Utilities.newBlob(decoded, contentType, filename);

    var folderName = "รูปภาพแปลงอ้อย Smart Farmer";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    console.error("Failed to save image to Drive: " + err.toString());
    return "Error saving image: " + err.toString();
  }
}

// ==============================================================================
// 🧹 PDPA: ล้างข้อมูลยืนยันตัวตน + รูปใบหน้าที่เกิน 90 วัน (ตั้ง Trigger รายวันได้)
// ==============================================================================
function purgeExpiredIdentityLogs() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("ยืนยันตัวตน");
    if (!sheet) return "Sheet 'ยืนยันตัวตน' not found.";

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return "No data to purge.";

    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    var rowsDeleted = 0;
    var now = new Date();
    var retentionPeriodMs = 90 * 24 * 60 * 60 * 1000;

    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var dateStr = row[0];
      var imageUrl = row[3];
      var rowIndex = i + 2;
      var rowDate = new Date(dateStr);

      if (!isNaN(rowDate.getTime()) && (now.getTime() - rowDate.getTime() > retentionPeriodMs)) {
        if (imageUrl && imageUrl.indexOf("id=") !== -1) {
          try {
            var fileId = imageUrl.split("id=")[1].split("&")[0];
            var file = DriveApp.getFileById(fileId);
            if (file) file.setTrashed(true);
          } catch (fileErr) {
            console.warn("Failed to delete file from Drive for row " + rowIndex + ": " + fileErr.toString());
          }
        }
        sheet.deleteRow(rowIndex);
        rowsDeleted++;
      }
    }

    console.log("PDPA Purge Success: Deleted " + rowsDeleted + " expired identity logs and associated files.");
    return "PDPA Purge completed. Rows deleted: " + rowsDeleted;
  } catch (err) {
    console.error("PDPA Purge Error: " + err.toString());
    return "Error during purge: " + err.toString();
  }
}

// ==============================================================================
// 👥 ดึงรายชื่อผู้ใช้/โควตา -> สายส่งเสริม
// ==============================================================================
function getUsersList() {
  var ss = getSS_();
  try {
    var sheet = ss.getSheetByName("ข้อมูลบัญชีผู้ใช้");
    var users = {};
    if (sheet) {
      var values = sheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        var quota = String(values[i][0]).trim();
        var subzone = String(values[i][1]).trim();
        if (quota && quota !== "") users[quota] = subzone;
      }
    }
    return jsonOut_({ status: "success", users: users });
  } catch (err) {
    return jsonOut_({ status: "error", message: "เกิดข้อผิดพลาดในการดึงรายชื่อผู้ใช้: " + err.toString() });
  }
}
