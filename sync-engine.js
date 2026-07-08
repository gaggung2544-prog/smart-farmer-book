// Smart Farmer Book - Sync Engine Module (Phase 5)

// Global State Variables (using var to attach to window scope for sharing across app.js)
var plots = [];
var pestReports = [];

// IndexedDB Database Manager
const SmartFarmerDB = {
    db: null,
    
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('SmartFarmerDB', 3);
            
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('plots')) {
                    db.createObjectStore('plots', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('pest_reports')) {
                    db.createObjectStore('pest_reports', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('audit_log')) {
                    db.createObjectStore('audit_log', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('data_queue')) {
                    db.createObjectStore('data_queue', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('send_log')) {
                    db.createObjectStore('send_log', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('chat_messages')) {
                    db.createObjectStore('chat_messages', { keyPath: 'id' });
                }
            };
            
            request.onsuccess = event => {
                this.db = event.target.result;
                console.log('[IndexedDB] Database initialized successfully.');
                // ถ้าแท็บอื่นเปิดฐานข้อมูลเวอร์ชันใหม่กว่า -> ปิด connection นี้เพื่อไม่ให้ค้าง (block) การอัปเกรด
                this.db.onversionchange = () => {
                    this.db.close();
                    console.warn('[IndexedDB] Version change from another tab — connection closed.');
                    if (typeof showToast === 'function') {
                        showToast('แอปถูกอัปเดตในแท็บอื่น กรุณารีเฟรชหน้านี้', 'warning');
                    }
                };
                resolve(this.db);
            };

            // เกิดเมื่อมีแท็บอื่นถือ connection เวอร์ชันเก่าค้างอยู่ ทำให้เปิด/อัปเกรดไม่ได้ (เคยทำแอปค้าง)
            request.onblocked = () => {
                console.warn('[IndexedDB] Open blocked by another tab holding an older version.');
                if (typeof showToast === 'function') {
                    showToast('กรุณาปิดแท็บ Smart Farmer อื่นๆ แล้วรีเฟรชหน้านี้', 'warning');
                }
            };

            request.onerror = event => {
                console.error('[IndexedDB] Database initialization failed:', event.target.error);
                reject(event.target.error);
            };
        });
    },
    
    get(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve(null);
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    },
    
    getAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve([]);
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    put(storeName, item) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("DB not initialized"));
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    delete(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("DB not initialized"));
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    clear(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("DB not initialized"));
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // DATA-LOSS FIX: replace-all แบบ atomic — clear + put ทั้งหมดใน transaction เดียว
    // เดิม saveDataQueue/saveSendLog ทำ clear() (commit ทันที) แล้ว put ทีละตัว (คนละ tx)
    // ถ้าแอปปิด/crash กลางคัน คิว sync ออฟไลน์หายถาวร วิธีนี้ถ้า tx ล้ม clear() จะถูก rollback ด้วย
    bulkReplace(storeName, items) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("DB not initialized"));
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('bulkReplace aborted: ' + storeName));
            store.clear();
            for (const item of (items || [])) {
                store.put(item);
            }
        });
    }
};
window.SmartFarmerDB = SmartFarmerDB;

// ==============================================================================
// DATA QUEUE & PREVIEW SYSTEM (ระบบคิวข้อมูลและดูรายงานก่อนส่ง)
// ==============================================================================

async function getDataQueue() {
    try {
        return await SmartFarmerDB.getAll('data_queue');
    } catch (e) {
        console.error('Error reading data queue:', e);
        return [];
    }
}

async function getSendLog() {
    try {
        return await SmartFarmerDB.getAll('send_log');
    } catch (e) {
        console.error('Error reading send log:', e);
        return [];
    }
}

async function saveDataQueue(queue) {
    try {
        // atomic clear+put — กันคิว sync หายถ้าแอปปิดกลางคัน (ดู bulkReplace)
        await SmartFarmerDB.bulkReplace('data_queue', queue);
        if (typeof updateNavBadges === 'function') updateNavBadges();
    } catch (e) {
        console.error('Error saving data queue:', e);
        if (typeof showToast === 'function') showToast('⚠️ บันทึกคิวข้อมูลไม่สำเร็จ ข้อมูลที่รอส่งอาจไม่ถูกเก็บ', 'warning');
    }
}

async function saveSendLog(log) {
    try {
        await SmartFarmerDB.bulkReplace('send_log', log);
    } catch (e) {
        console.error('Error saving send log:', e);
    }
}

let debouncedSyncTimeout = null;
function scheduleDebouncedAutoSync() {
    if (debouncedSyncTimeout) clearTimeout(debouncedSyncTimeout);
    debouncedSyncTimeout = setTimeout(() => {
        autoSyncPendingData(true);
    }, 2500);
}

function parseDate(dateStr) {
    if (!dateStr) return 0;
    let cleaned = String(dateStr).replace(/-/g, '/');
    let parts = cleaned.split(/[\s,]+/);
    if (parts.length > 0) {
        let dateParts = parts[0].split('/');
        if (dateParts.length === 3) {
            let day = parseInt(dateParts[0], 10);
            let month = parseInt(dateParts[1], 10) - 1;
            let year = parseInt(dateParts[2], 10);
            if (year > 2400) year -= 543;
            
            let timeParts = [0, 0, 0];
            if (parts[1]) {
                let t = parts[1].split(':');
                timeParts[0] = parseInt(t[0], 10) || 0;
                timeParts[1] = parseInt(t[1], 10) || 0;
                timeParts[2] = parseInt(t[2], 10) || 0;
            }
            return new Date(year, month, day, timeParts[0], timeParts[1], timeParts[2]).getTime();
        }
    }
    const parsed = Date.parse(dateStr);
    return isNaN(parsed) ? 0 : parsed;
}

// เพิ่มหรืออัปเดตข้อมูลในคิว (ป้องกันซ้ำด้วย plotId+type)
async function queueDataChange(action, data, type) {
    const queue = await getDataQueue();
    const plotId = data.id || data.quota || ('_' + type);
    
    // กรองหาตัวซ้ำเพื่อเขียนทับกรณีอัปเดตออฟไลน์ซ้อนออฟไลน์
    const existingIdx = queue.findIndex(q => q.plotId === plotId && q.type === type);
    
    const entry = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2,5),
        plotId: plotId,
        action: action,
        type: type,
        data: { ...JSON.parse(JSON.stringify(data)), _updaterRole: localStorage.getItem('smart_farmer_staff_id') ? 'STAFF' : 'FARMER' },
        addedAt: new Date().toLocaleString('th-TH'),
        sent: false
    };
    
    if (existingIdx >= 0) {
        queue[existingIdx] = entry;
    } else {
        queue.push(entry);
    }
    
    await saveDataQueue(queue);
    
    if (typeof updatePreviewFAB === 'function') updatePreviewFAB();
    
    // รันการซิงก์ข้อมูลออโต้เมื่อมีอินเทอร์เน็ต (Debounced)
    if (navigator.onLine) {
        scheduleDebouncedAutoSync();
    }
}

// ==============================================================================
// RESILIENT SYNC ENGINE - EXPONENTIAL BACK-OFF RETRY LOGIC
// ==============================================================================

let syncRetryCount = 0;
let syncTimeoutId = null;
let isSyncingNow = false; // ป้องกันรันซ้อน (online listener + interval + debounce + back-off ยิงพร้อมกัน = ส่งข้อมูลซ้ำ)

async function autoSyncPendingData(quiet = true) {
    // Re-entrancy guard: ถ้ากำลังซิงก์อยู่ ห้ามเริ่มรอบใหม่ทับ มิฉะนั้นอ่านคิวชุดเดิมแล้ว POST ซ้ำ = แถวซ้ำบน backend
    if (isSyncingNow) {
        console.log('[Sync Engine] Sync already in progress — skipping concurrent run.');
        return;
    }
    isSyncingNow = true;
    try {
    const url = localStorage.getItem('smart_farmer_sheet_url');
    const queue = await getDataQueue();
    const pending = queue.filter(q => !q.sent);
    
    if (pending.length === 0) {
        if (!quiet) alert('ไม่มีข้อมูลคงค้างที่รอการซิงก์ในเครื่องนี้');
        syncRetryCount = 0;
        if (syncTimeoutId) clearTimeout(syncTimeoutId);
        return;
    }
    
    if (!url) {
        if (!quiet) {
            if (confirm(`กรุณาเชื่อมต่อ Google Sheet URL ก่อนซิงก์ข้อมูล\nคุณต้องการเปิดเมนูตั้งค่าหรือไม่?`)) {
                const openSettingsBtn = document.getElementById('open-settings-btn');
                if (openSettingsBtn) openSettingsBtn.click();
            }
        }
        return;
    }
    
    if (!navigator.onLine) {
        if (!quiet) {
            if (typeof showToast === 'function') {
                showToast('อุปกรณ์ออฟไลน์อยู่ ไม่สามารถซิงก์ข้อมูลได้ในขณะนี้', 'error');
            }
        }
        return;
    }
    
    let successCount = 0;
    const nowStr = new Date().toLocaleString('th-TH');
    const log = await getSendLog();
    
    console.log(`[Sync Engine] Starting sync of ${pending.length} pending items...`);
    
    try {
        for (const entry of pending) {
            // ฉีดข้อมูลพารามิเตอร์ออนไลน์กำกับเพื่อแจ้ง Apps Script ว่านี่ไม่ใช่การแก้ไขภายหลังในคลาวด์
            const onlinePayload = {
                ...entry.data,
                offlineCreated: entry.data.offlineCreated || entry.addedAt,
                isOffline: true
            };
            
            const payload = {
                action: entry.action,
                type: entry.type,
                data: onlinePayload
            };
            
            const success = await sendToSheetReliable(url, payload);
            if (success) {
                successCount++;
                const idx = queue.findIndex(q => q.id === entry.id);
                if (idx >= 0) {
                    queue[idx].sent = true;
                    queue[idx].sentAt = nowStr;
                }
                log.push({
                    id: entry.id,
                    plotId: entry.plotId,
                    type: entry.type,
                    action: entry.action,
                    sentAt: nowStr
                });
            } else {
                throw new Error("Reliable send returned false");
            }
        }
        
        // ซิงก์สำเร็จทั้งหมด -> รีเซ็ตตรรกะ Back-off
        syncRetryCount = 0;
        if (syncTimeoutId) clearTimeout(syncTimeoutId);

        if (!quiet) {
            if (typeof showToast === 'function') {
                showToast(`ซิงก์ข้อมูลขึ้นคลาวด์สำเร็จ ${successCount} รายการ!`, 'success');
            } else {
                alert(`ซิงก์ข้อมูลขึ้นคลาวด์สำเร็จ ${successCount} รายการ!`);
            }
        }
    } catch (err) {
        console.error('[Sync Engine] Sync failed, scheduling retry with back-off:', err);
        scheduleSyncWithBackoff();
    } finally {
        // DUPLICATE-PREVENTION: บันทึกความคืบหน้า (flag sent) แม้ sync จะล้มกลางคัน
        // เดิม persist หลังจบ loop เท่านั้น -> ถ้า item ที่ 3 ล้ม items 1-2 ที่ส่งสำเร็จจะไม่ถูกมาร์ก
        // -> retry รอบหน้าส่งซ้ำ = ข้อมูลซ้ำบน backend
        if (successCount > 0) {
            await saveDataQueue(queue);
            await saveSendLog(log.slice(-200));
        }
        if (typeof updatePreviewFAB === 'function') updatePreviewFAB();
        if (typeof renderPreviewContent === 'function') {
            const activeTab = document.querySelector('.preview-tab.active');
            renderPreviewContent(activeTab ? activeTab.dataset.type : 'ALL');
        }
    }
    } finally {
        isSyncingNow = false; // ปลดล็อกให้รอบถัดไป (รวมถึง back-off retry) ทำงานได้
    }
}

function scheduleSyncWithBackoff() {
    if (syncTimeoutId) clearTimeout(syncTimeoutId);
    if (syncRetryCount >= 5) {
        console.warn("[Sync Engine] Max sync retries reached. Waiting for next connection/manual trigger.");
        if (typeof showToast === 'function') {
            showToast("⚠️ ซิงก์ล้มเหลวหลายครั้ง แอปจะพักการลองซิงก์ชั่วคราวและซิงก์ใหม่เมื่อเน็ตดีขึ้น", "warning");
        }
        return;
    }
    
    const delay = Math.min(2000 * Math.pow(2, syncRetryCount), 60000); // 2s, 4s, 8s, 16s, 32s (สูงสุด 60 วินาที)
    console.log(`[Sync Engine] Scheduling sync retry #${syncRetryCount + 1} in ${delay}ms`);
    syncRetryCount++;
    
    syncTimeoutId = setTimeout(() => {
        autoSyncPendingData(true);
    }, delay);
}

function syncToGoogleSheet(action, data, type = "REGISTRATION") {
    // ใส่ลงคิวออฟไลน์ก่อนเสมอเพื่อความทนทาน
    queueDataChange(action, data, type);
    
    // สำหรับการลบแปลงและการยืนยันตัวตน ให้พยายามส่งทันที
    if (action === 'DELETE' || type === 'IDENTITY') {
        const url = localStorage.getItem('smart_farmer_sheet_url');
        if (!url) return;
        
        const onlinePayload = {
            ...data,
            offlineCreated: new Date().toLocaleString('th-TH'),
            isOffline: false
        };
        
        const payload = { action, type, data: onlinePayload };
        sendToSheetReliable(url, payload)
            .then(() => console.log(`Immediate sync: ${action}/${type} done`))
            .catch(err => {
                console.warn('Immediate sync failed, kept in queue:', err);
            });
    }
}

// อ่าน auth token ที่ได้จากการล็อกอิน (ใช้แนบไปกับคำขอเพื่อให้ backend ตรวจสิทธิ์+กรองข้อมูลตามโควตา)
function getAuthToken() {
    try { return localStorage.getItem('smart_farmer_token') || ''; } catch (e) { return ''; }
}

// ต่อ ?t=<token> เข้ากับ URL (ใช้กับคำขออ่านแบบ GET เช่น pullAll/getUsers/get_chats)
function withAuthParam(url) {
    const t = getAuthToken();
    if (!t) return url;
    return url + (url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(t);
}

// เก็บ/ล้าง token
function setAuthToken(t) { try { if (t) localStorage.setItem('smart_farmer_token', t); } catch (e) {} }
function clearAuthToken() { try { localStorage.removeItem('smart_farmer_token'); } catch (e) {} }

// resolve URL ปลายทางของ backend (ใช้ค่าที่ตั้งไว้ หรือ DEFAULT_SHEET_URL จาก app.js)
function getBackendUrl() {
    return localStorage.getItem('smart_farmer_sheet_url') ||
           (typeof DEFAULT_SHEET_URL !== 'undefined' ? DEFAULT_SHEET_URL : '');
}

// ยิง action ผ่าน POST text/plain (ไม่มี CORS preflight, และไม่ทำให้รหัสผ่าน/OTP หลุดใน URL)
async function _postAuthAction(payload) {
    const base = getBackendUrl();
    if (!base) return { status: 'error', message: 'ยังไม่ได้ตั้งค่า URL เซิร์ฟเวอร์' };
    const res = await fetchWithTimeout(base, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
    }, 15000);
    return await res.json();
}

// ===== Auth API (ให้ UI ล็อกอินเรียกใช้) — ได้ token จริงจากเซิร์ฟเวอร์เมื่อออนไลน์ =====
// เจ้าหน้าที่: ล็อกอินด้วยรหัสพนักงาน + รหัสผ่าน (ตั้งใน Script Properties: STAFF_PASSCODES)
async function serverStaffLogin(staffId, passcode) {
    try {
        const data = await _postAuthAction({ action: 'staffLogin', staffId: staffId, passcode: passcode });
        if (data && data.status === 'success' && data.token) {
            setAuthToken(data.token);
            return { ok: true, token: data.token, role: 'staff' };
        }
        return { ok: false, message: (data && data.message) || 'เข้าสู่ระบบไม่สำเร็จ' };
    } catch (e) {
        return { ok: false, offline: true, message: e.message };
    }
}
// ชาวไร่: ขอ OTP (เซิร์ฟเวอร์สร้าง+ส่ง SMS ถ้าตั้งค่าไว้; โหมดทดสอบคืน devOtp เมื่อ ALLOW_DEV_OTP=true)
async function serverRequestOtp(quota, phone) {
    try {
        return await _postAuthAction({ action: 'requestOtp', quota: quota, phone: phone });
    } catch (e) {
        return { status: 'error', offline: true, message: e.message };
    }
}
// ชาวไร่: ยืนยัน OTP -> ได้ token
async function serverVerifyOtp(quota, otp) {
    try {
        const data = await _postAuthAction({ action: 'verifyOtp', quota: quota, otp: otp });
        if (data && data.status === 'success' && data.token) setAuthToken(data.token);
        return data;
    } catch (e) {
        return { status: 'error', offline: true, message: e.message };
    }
}

// ===== รหัสผ่าน = วันเกิด (พ.ศ., DDMMYYYY) — ใช้ได้ทั้งชาวไร่และเจ้าหน้าที่ =====
// role: 'farmer' | 'staff'; id: quota หรือ staffId; dob: '01012501'
async function serverCredentialLogin(role, id, dob) {
    try {
        const data = await _postAuthAction({ action: 'credentialLogin', role: role, id: id, dob: dob });
        if (data && data.status === 'success' && data.token) setAuthToken(data.token);
        return data;
    } catch (e) {
        return { status: 'error', offline: true, message: e.message };
    }
}
async function serverSetCredential(role, id, dob, oldDob) {
    try {
        return await _postAuthAction({ action: 'setCredential', role: role, id: id, dob: dob, oldDob: oldDob || '' });
    } catch (e) {
        return { status: 'error', offline: true, message: e.message };
    }
}
// เจ้าหน้าที่รีเซ็ตรหัสผ่านของผู้ใช้ (แนบ staff token; backend ตรวจว่าเป็น staff จริง)
async function serverResetCredential(targetRole, targetId) {
    try {
        return await _postAuthAction({ action: 'resetCredential', targetRole: targetRole, targetId: targetId, token: getAuthToken() });
    } catch (e) {
        return { status: 'error', offline: true, message: e.message };
    }
}

// ยิง fetch พร้อม timeout (ยกเลิกเองเมื่อเกินเวลา) กันคำขอค้างจนคิว/หน้าจอแฮงก์ตลอดไป
function fetchWithTimeout(resource, options = {}, timeoutMs = 20000) {
    if (typeof AbortController === 'undefined') {
        return fetch(resource, options); // เบราว์เซอร์เก่ามาก: ยิงแบบเดิม
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(resource, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

// ตรวจว่า text ที่ตอบกลับเป็นหน้า HTML / หน้า login ของ Google หรือไม่
// (Apps Script ที่ตั้งค่าผิดมักตอบ HTTP 200 พร้อมหน้า HTML แทน JSON -> ต้องถือว่า "ยังไม่สำเร็จ")
function looksLikeHtmlOrLogin(text) {
    if (!text || !text.trim()) return true; // ตอบว่างเปล่า = ไม่ยืนยันว่าเก็บข้อมูลแล้ว
    const t = text.trim().toLowerCase();
    return t.startsWith('<!doctype') || t.startsWith('<html') ||
           t.includes('<head') || t.includes('<body') ||
           t.includes('accounts.google.com') || t.includes('sign in to continue') ||
           t.includes('moved temporarily') || t.includes('temporary redirect') ||
           t.includes('authorization required');
}

async function sendToSheetReliable(url, payload) {
    // แนบ token เข้าไปใน payload (backend อ่านจาก data.token) — ไม่มี token = ส่งเหมือนเดิม
    const token = getAuthToken();
    if (token && payload && typeof payload === 'object' && !payload.token) {
        payload = { ...payload, token: token };
    }
    const jsonStr = JSON.stringify(payload);
    const hasImage = jsonStr.includes('data:image') || jsonStr.length > 6000;
    
    if (!hasImage) {
        try {
            const separator = url.includes('?') ? '&' : '?';
            const getUrl = url + separator + 'p=' + encodeURIComponent(jsonStr);
            const resp = await fetchWithTimeout(getUrl, { method: 'GET' }, 20000);
            if (resp.ok) {
                const text = await resp.text();
                console.log('[Sync GET] Response:', text.substring(0, 80));
                try {
                    const resJson = JSON.parse(text);
                    if (resJson.status === 'success' || resJson.status === 'ok') {
                        return true;
                    } else {
                        console.error('[Sync GET] Server returned failure:', resJson);
                        return false;
                    }
                } catch(jsonErr) {
                    // ตอบกลับไม่ใช่ JSON: ถ้าเป็นหน้า HTML/login ให้ถือว่า "ล้มเหลว" คงข้อมูลไว้ในคิว
                    // (เดิม return true -> ข้อมูลถูกมาร์กว่าส่งแล้วทั้งที่ backend ไม่ได้เก็บ = ข้อมูลหายเงียบ)
                    if (looksLikeHtmlOrLogin(text)) {
                        console.error('[Sync GET] Non-JSON HTML/login response -> treat as FAILURE, keeping in queue');
                        return false;
                    }
                    return true;
                }
            }
        } catch(e) {
            console.warn('[Sync GET] Failed, trying POST fallback:', e.message);
        }
    }
    
    // 1. พยายามส่งแบบ POST ด้วยโหมด CORS เพื่อให้อ่านสถานะตอบกลับจริงได้
    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: jsonStr
        }, 30000);

        if (response.ok) {
            const text = await response.text();
            try {
                const resJson = JSON.parse(text);
                if (resJson.status === 'success' || resJson.status === 'ok') {
                    console.log('[Sync POST CORS] ส่งสำเร็จจริง:', resJson.message || '');
                    return true;
                } else {
                    console.error('[Sync POST CORS] เซิร์ฟเวอร์ตอบกลับว่าล้มเหลว:', resJson);
                    return false; // รักษาข้อมูลในคิวไว้เนื่องจากหลังบ้านมีปัญหา
                }
            } catch (jsonErr) {
                // ตอบกลับไม่ใช่ JSON: หน้า HTML/login = ยังไม่สำเร็จจริง -> คงไว้ในคิวกันข้อมูลหาย
                if (looksLikeHtmlOrLogin(text)) {
                    console.error('[Sync POST CORS] Non-JSON HTML/login response -> treat as FAILURE, keeping in queue');
                    return false;
                }
                console.log('[Sync POST CORS] สำเร็จ (การตอบกลับไม่ใช่ JSON):', text.substring(0, 80));
                return true;
            }
        } else {
            console.error('[Sync POST CORS] เซิร์ฟเวอร์ตอบกลับด้วยรหัส HTTP:', response.status);
            return false;
        }
    } catch (e) {
        console.warn('[Sync POST CORS] ล้มเหลวหรือติดปัญหา CORS:', e.message);
        return false;
    }
}

// สังเกตการณ์เครือข่ายออนไลน์เพื่อรีซิงก์ออโต้
window.addEventListener('online', () => {
    console.log('[Network] Device back online. Resuming sync...');
    if (typeof showToast === 'function') {
        showToast('เชื่อมต่อเครือข่ายแล้ว กำลังซิงก์ข้อมูลค้างส่ง...', 'info');
    }
    autoSyncPendingData(true);
});

// ==============================================================================
// BIDIRECTIONAL SYNC - PULL & MERGE CENTRAL DATABASE (ระบบดึงข้อมูลสองทาง)
// ==============================================================================

// ฟังก์ชันดึงรายชื่อผู้ใช้/โควตาและจัดทำข้อมูลออฟไลน์ในเครื่อง (รวมทั้ง Bootstrap ขึ้นระบบคลาวด์หากว่างเปล่า)
async function syncUserDatabase() {
    const url = localStorage.getItem('smart_farmer_sheet_url');
    if (!url) return;
    
    try {
        console.log('[User Sync] Fetching user database from Sheets...');
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetchWithTimeout(withAuthParam(url + separator + 'action=getUsers'), {}, 20000);
        if (!response.ok) throw new Error('Failed to fetch user database');
        
        const result = await response.json();
        if (result && result.status === 'success') {
            const serverUsers = result.users || {};
            const serverUserCount = Object.keys(serverUsers).length;
            
            // กรณีที่ชีตบนคลาวด์ว่างเปล่า (พึ่งติดตั้งใหม่) ให้ทำการดันข้อมูลตัวแปรเริ่มต้นขึ้นไป (Bootstrap)
            if (serverUserCount === 0 && typeof QUOTA_TO_SUBZONE !== 'undefined' && Object.keys(QUOTA_TO_SUBZONE).length > 10) {
                console.log("[User Sync] Server user database is empty. Bootstrapping with local QUOTA_TO_SUBZONE...");
                
                const bootstrapPayload = {
                    action: 'INSERT',
                    type: 'BOOTSTRAP_USERS',
                    data: QUOTA_TO_SUBZONE
                };
                
                await fetchWithTimeout(url, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                    body: JSON.stringify(bootstrapPayload)
                }, 30000);
                console.log("[User Sync] Bootstrap request sent.");
            } else if (serverUserCount > 0) {
                // อัปเดตตารางเก็บผู้ใช้ในเครื่องและอัปเดตตัวแปรระบบ (และจัดรูปแบบสายย่อยให้เป็น 4 หลัก เช่น '0101' เสมอ)
                const formattedUsers = {};
                for (const key in serverUsers) {
                    let val = String(serverUsers[key]).trim();
                    if (/^\d+$/.test(val)) {
                        val = val.padStart(4, '0');
                    }
                    formattedUsers[key] = val;
                }
                localStorage.setItem('smart_farmer_quota_to_subzone', JSON.stringify(formattedUsers));
                if (typeof QUOTA_TO_SUBZONE !== 'undefined') {
                    // Merge server updates into offline defaults to preserve reference
                    Object.assign(QUOTA_TO_SUBZONE, formattedUsers);
                }
                console.log(`[User Sync] Synced ${serverUserCount} users from Google Sheets.`);
            }
        }
    } catch (e) {
        console.warn("[User Sync] Failed to sync user database, using offline cached version:", e);
    }
}

async function pullCloudData(isSilent = true) {
    const url = localStorage.getItem('smart_farmer_sheet_url');
    if (!url) {
        if (!isSilent) alert('❌ โปรดเชื่อมต่อ Google Sheet URL ในหน้าตั้งค่าก่อนซิงก์ข้อมูล');
        return;
    }
    
    if (!navigator.onLine) {
        if (!isSilent) {
            if (typeof showToast === 'function') showToast('❌ ไม่สามารถดึงข้อมูลได้เนื่องจากไม่มีอินเทอร์เน็ต', 'error');
        }
        return;
    }
    
    const statusText = document.getElementById('url-status-indicator');
    if (statusText && !isSilent) {
        statusText.style.color = '#0284c7';
        statusText.innerText = '⏳ กำลังซิงก์ดึงข้อมูลจากระบบคลาวด์...';
    }
    
    try {
        // ดึงข้อมูลบัญชีผู้ใช้ด้วยเพื่ออัปเดตสิทธิ์และสายส่งเสริมล่าสุด
        await syncUserDatabase();

        console.log('[Cloud Sync] Fetching data from Sheets backend...');
        
        // Find latest updatedAt timestamp from local plots to support delta sync
        const localPlots = await SmartFarmerDB.getAll('plots');
        let latestTime = 0;
        let latestTimeStr = '';
        localPlots.forEach(p => {
            if (p.updatedAt) {
                const t = parseDate(p.updatedAt);
                if (t > latestTime) {
                    latestTime = t;
                    latestTimeStr = p.updatedAt;
                }
            }
        });

        const separator = url.includes('?') ? '&' : '?';
        let fetchUrl = url + separator + 'action=pullAll';
        if (latestTimeStr) {
            fetchUrl += '&since=' + encodeURIComponent(latestTimeStr);
            console.log(`[Cloud Sync] Delta pull since: ${latestTimeStr}`);
        } else {
            console.log(`[Cloud Sync] Full pull (no local data or timestamps)`);
        }

        const response = await fetchWithTimeout(withAuthParam(fetchUrl), {}, 30000);
        if (!response.ok) throw new Error('Network response was not OK');
        
        const resJson = await response.json();
        if (resJson.status === 'success') {
            const cloudPlots = resJson.plots || [];
            const cloudPests = resJson.pestReports || [];
            const deletedItems = resJson.deleted || [];
            const isDeltaSync = !!latestTimeStr;
            
            console.log(`[Cloud Sync] Retrieved ${cloudPlots.length} plots, ${cloudPests.length} pest reports, and ${deletedItems.length} deleted items.`);
            await mergeCloudDataWithLocal(cloudPlots, cloudPests, deletedItems, isDeltaSync);
            mergeCloudAssetDebt(resJson.assetDebt); // F3: ผสานหลักทรัพย์/หนี้สิน

            // บันทึกเวลาที่ดึงข้อมูลสำเร็จ เพื่อโชว์ "อัปเดตล่าสุดเมื่อ..." ให้ผู้ใช้
            try { localStorage.setItem('smart_farmer_last_sync', String(Date.now())); } catch (e) {}

            if (statusText && !isSilent) {
                statusText.style.color = 'var(--brand-green)';
                statusText.innerText = '✅ ซิงก์ข้อมูลสองทิศทางสำเร็จเสร็จสิ้น!';
            }
            if (!isSilent) {
                if (typeof showToast === 'function') {
                    showToast('🔄 ซิงก์และผสานข้อมูลจากระบบคลาวด์แล้ว!', 'success');
                } else {
                    alert('🔄 ซิงก์และผสานข้อมูลจากระบบคลาวด์แล้ว!');
                }
            }
            
            // โหลดตัวแปรและข้อมูลส่วนกลางของระบบใหม่เพื่อให้มีผลกับอาร์เรย์ในทุกสคริปต์
            if (typeof SmartFarmerDB !== 'undefined') {
                window.plots = await SmartFarmerDB.getAll('plots');
                window.pestReports = await SmartFarmerDB.getAll('pest_reports');
            }
            
            // สั่งอัปเดต UI หน้าจอต่างๆ ของเกษตรกรชาวไร่และพนักงานสรุปสถิติใหม่
            if (typeof buildPlotFilterDropdown === 'function') buildPlotFilterDropdown();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof renderSupport === 'function') renderSupport();
            if (typeof renderEstimator === 'function') renderEstimator();
            if (typeof renderCostLogger === 'function') renderCostLogger();
            if (typeof renderHarvestLogger === 'function') renderHarvestLogger();
            if (typeof renderAllPlotsOnMap === 'function') renderAllPlotsOnMap();
            if (typeof renderAssetDebtHub === 'function') renderAssetDebtHub();
            if (typeof renderStaffDashboard === 'function') renderStaffDashboard();
            if (typeof renderFarmerPestHistory === 'function') renderFarmerPestHistory();
            if (typeof renderAnalyticsDashboard === 'function') renderAnalyticsDashboard();
            if (typeof fetchAndRenderWeather === 'function') fetchAndRenderWeather();
            if (typeof populatePlotDropdowns === 'function') populatePlotDropdowns();
        } else {
            throw new Error(resJson.message || 'API returned failure status');
        }
    } catch (e) {
        console.error('[Cloud Sync] Sync failed:', e);
        if (statusText && !isSilent) {
            statusText.style.color = 'var(--brand-red)';
            statusText.innerText = '❌ ซิงก์ดึงข้อมูลล้มเหลว: ' + e.message;
        }
        if (!isSilent) {
            if (typeof showToast === 'function') showToast('❌ ดึงข้อมูลล้มเหลว: ' + e.message, 'error');
        }
    }
}

// ตรวจว่าเป็นค่า "ว่าง" ที่ไม่ควรเอาไปทับข้อมูลเดิม (แต่ยอมให้ false / 0 ผ่านเพราะเป็นค่าจริง)
function isEmptyMergeVal(v) {
    if (v === undefined || v === null) return true;
    if (typeof v === 'string' && v.trim() === '') return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
}

// ผสานข้อมูลจาก cloud ทับ local โดย "ข้ามฟิลด์ที่ cloud ว่าง" เพื่อไม่ให้เซลล์ว่างในชีตลบข้อมูลดีในเครื่องทิ้ง
// (mapSheetPlotToLocalPlot เติม "" ให้ทุกฟิลด์ที่หาไม่เจอ -> {...local, ...cloud} เดิมทำให้ข้อมูลหายเงียบ)
function mergeCloudOverLocal(localObj, cloudObj) {
    const out = { ...localObj };
    for (const k in cloudObj) {
        if (!isEmptyMergeVal(cloudObj[k])) {
            out[k] = cloudObj[k];
        }
    }
    return out;
}

// ผสาน record หลักทรัพย์/หนี้สินจากคลาวด์ลง localStorage (F3) — latest updatedAt wins
function mergeCloudAssetDebt(records) {
    if (!Array.isArray(records) || records.length === 0) return;
    let assetsDB = {}, debtsDB = {};
    try { assetsDB = JSON.parse(localStorage.getItem('smart_farmer_assets_db') || '{}'); } catch (e) {}
    try { debtsDB = JSON.parse(localStorage.getItem('smart_farmer_debts_db') || '{}'); } catch (e) {}
    let changed = false;
    records.forEach(r => {
        if (!r || !r.key || !r.data) return;
        const target = (r.kind === 'debt') ? debtsDB : assetsDB;
        const local = target[r.key];
        const localT = local ? parseDate(local.lastUpdated) : 0;
        const cloudT = parseDate(r.updatedAt || (r.data && r.data.lastUpdated));
        // เอา cloud ถ้าไม่มี local หรือ cloud ใหม่กว่า/เท่ากัน
        if (!local || cloudT >= localT) {
            target[r.key] = r.data;
            changed = true;
        }
    });
    if (changed) {
        localStorage.setItem('smart_farmer_assets_db', JSON.stringify(assetsDB));
        localStorage.setItem('smart_farmer_debts_db', JSON.stringify(debtsDB));
        if (typeof loadAssetDebtDB === 'function') loadAssetDebtDB();       // รีเฟรช global ใน app.js
        if (typeof renderAssetDebtHub === 'function') renderAssetDebtHub();
        if (typeof renderStaffAssetDebtRequests === 'function') renderStaffAssetDebtRequests();
    }
}

async function mergeCloudDataWithLocal(cloudPlots, cloudPests, deletedItems = [], isDeltaSync = false) {
    const queue = await getDataQueue();
    const unsyncedPlotIds = new Set(queue.filter(q => !q.sent && q.type === 'REGISTRATION').map(q => q.plotId));
    const unsyncedPestIds = new Set(queue.filter(q => !q.sent && q.type === 'PEST').map(q => q.plotId));
    
    // 1. ผสาน ข้อมูลแปลงอ้อย (Plots)
    const localPlots = await SmartFarmerDB.getAll('plots');
    
    for (const rawPlot of cloudPlots) {
        const mappedPlot = mapSheetPlotToLocalPlot(rawPlot);
        if (!mappedPlot.id) continue;
        
        // กฎความปลอดภัย (Safe Merge Guard): ห้ามเขียนทับข้อมูลในเครื่องที่มีการแก้ไขออฟไลน์และยังไม่ได้ส่ง (Unsynced)
        if (unsyncedPlotIds.has(mappedPlot.id)) {
            console.log(`[Safe Merge] Skipped overwriting unsynced plot: ${mappedPlot.id}`);
            continue;
        }
        
        const existingPlot = await SmartFarmerDB.get('plots', mappedPlot.id);
        
        // ตรวจว่าเจ้าหน้าที่เพิ่งตอบคำขอของชาวไร่หรือไม่ (สำหรับแจ้งเตือน)
        // FIX (F1): เดิมพึ่ง staffReplyTime ที่ "ไม่เคยถูก sync" (ไม่มีคอลัมน์ในชีต+ไม่มีใน mapper)
        // -> newReplyTime เป็น '' เสมอ -> การแจ้งเตือนไม่เคยทำงานข้ามอุปกรณ์
        // แก้เป็นตรวจจาก supportStatus / staffNote ที่ round-trip จริงผ่านชีต
        const isFarmer = !localStorage.getItem('smart_farmer_staff_id');
        let hasReplyUpdate = false;
        if (isFarmer && existingPlot) {
            const oldStatus = existingPlot.supportStatus || '';
            const newStatus = mappedPlot.supportStatus || '';
            const oldNote = existingPlot.staffNote || '';
            const newNote = mappedPlot.staffNote || '';
            const replyChanged = (oldStatus !== newStatus) || (oldNote !== newNote);
            // แจ้งเตือนเมื่อมีการเปลี่ยนแปลง และสถานะไม่ใช่ "รอการตอบกลับ" (ตรงกับที่ UI จะแสดงคำตอบ)
            if (replyChanged && newStatus !== '' && newStatus !== 'รอการตอบกลับ') {
                hasReplyUpdate = true;
            }
        }

        // ผสานฟิลด์กับแปลงเดิมในเครื่อง โดยใช้กติกาล่าสุดชนะ (Conflict Resolution)
        let mergedPlot;
        if (existingPlot) {
            const localTime = parseDate(existingPlot.updatedAt);
            const cloudTime = parseDate(mappedPlot.updatedAt);
            // ถ้า local ใหม่กว่า หรือ cloud ไม่มี timestamp ที่อ่านได้ (cloudTime===0) ให้ยึด local เป็นหลัก
            // กัน bug เดิม: parseDate อ่านวันที่ไทยไม่ออก -> คืน 0 -> cloud ชนะเสมอ -> ทับงานที่เพิ่งแก้
            if (localTime > cloudTime || (cloudTime === 0 && localTime > 0)) {
                console.log(`[Conflict Resolution] Local is newer/มี timestamp ชัดกว่า. Keeping local for plot: ${mappedPlot.id}`);
                // ยึด local ชนะทุกฟิลด์ที่ local มีค่าจริง แต่ยังรับฟิลด์ที่ cloud เท่านั้นที่มี (เช่น staffNote/สถานะ)
                mergedPlot = mergeCloudOverLocal(mappedPlot, existingPlot);
            } else {
                // cloud ใหม่กว่า: เอา cloud ทับ local แต่ข้ามฟิลด์ที่ cloud ว่าง (กันเซลล์ว่างลบข้อมูลดีทิ้ง)
                mergedPlot = mergeCloudOverLocal(existingPlot, mappedPlot);
            }
        } else {
            mergedPlot = mappedPlot;
        }

        if (hasReplyUpdate) {
            mergedPlot.hasUnreadStaffReply = true;
            // เติมเวลาตอบกลับจาก updatedAt ของเซิร์ฟเวอร์ ให้หน้าจอชาวไร่แสดง "อัปเดตล่าสุด" ได้ข้ามอุปกรณ์
            if (!mergedPlot.staffReplyTime && mappedPlot.updatedAt) {
                mergedPlot.staffReplyTime = mappedPlot.updatedAt;
            }
            if (typeof showToast === 'function') {
                showToast(`🔊 เจ้าหน้าที่ตอบกลับคำขอสนับสนุนในแปลง ${mergedPlot.name || mergedPlot.id} แล้ว`, 'info');
            }
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification("อัปเดตสถานะสนับสนุน", {
                    body: `เจ้าหน้าที่ได้อัปเดตสถานะคำขอแปลง ${mergedPlot.name || mergedPlot.id} แล้ว`,
                    icon: 'smart_farmer_logo_192.png'
                });
            }
        }
        
        await SmartFarmerDB.put('plots', mergedPlot);
    }
    
    // จัดการลบแปลงตามที่ลบบนคลาวด์
    if (deletedItems && deletedItems.length > 0) {
        for (const del of deletedItems) {
            if (del.type === 'REGISTRATION' && del.id) {
                if (!unsyncedPlotIds.has(del.id)) {
                    console.log(`[Sync Delete] Deleting plot locally: ${del.id}`);
                    await SmartFarmerDB.delete('plots', del.id);
                }
            }
        }
    }
    
    // สำหรับกรณี Full Sync ลบแปลงในเครื่องที่ไม่มีในเซิร์ฟเวอร์
    // SAFETY: ถ้า cloud ตอบกลับมาว่างเปล่า (0 แปลง) ให้ "งดลบ" ทั้งหมด — เป็นสัญญาณของ response พัง/บางส่วน
    // (backend มีปัญหาแล้วตอบ success+empty) มิฉะนั้นจะกวาดลบแปลงจริงในเครื่องทิ้งหมด = ข้อมูลหายยับ
    if (!isDeltaSync && cloudPlots.length === 0) {
        console.warn('[Sync Delete] ข้ามการลบแบบ full-sync เพราะ cloud ส่งแปลงมา 0 รายการ (กันข้อมูลหายจาก response ที่ผิดปกติ)');
    } else if (!isDeltaSync) {
        const cloudPlotIds = new Set(cloudPlots.map(p => p.id || p["Plot ID"] || p["รหัสแปลง"]));
        for (const localPlot of localPlots) {
            if (!cloudPlotIds.has(localPlot.id) && !unsyncedPlotIds.has(localPlot.id)) {
                console.log(`[Sync Delete] Deleting local plot not on server: ${localPlot.id}`);
                await SmartFarmerDB.delete('plots', localPlot.id);
            }
        }
    }
    
    // อัปเดตตัวแปรระบบในเมมโมรี่
    plots = await SmartFarmerDB.getAll('plots');
    
    // 2. ผสาน ประวัติการวินิจฉัยโรคอ้อย (Pest Reports)
    const isFarmerForPest = !localStorage.getItem('smart_farmer_staff_id');
    let pestReplyNotified = false;
    for (const rawPest of cloudPests) {
        const mappedPest = mapSheetPestToLocalPest(rawPest);
        if (!mappedPest.id) continue;

        if (unsyncedPestIds.has(mappedPest.plotId)) {
            console.log(`[Safe Merge] Skipped overwriting unsynced pest report: ${mappedPest.id}`);
            continue;
        }

        const existingPest = await SmartFarmerDB.get('pest_reports', mappedPest.id);
        // D5: แจ้งเตือนชาวไร่เมื่อมีคำตอบใหม่จากเจ้าหน้าที่
        if (isFarmerForPest && mappedPest.staffReplyNote &&
            (!existingPest || (existingPest.staffReplyNote || '') !== mappedPest.staffReplyNote)) {
            pestReplyNotified = true;
        }
        // เอา cloud ทับ local แต่ข้ามฟิลด์ที่ cloud ว่าง กันข้อมูลรายงานโรคเดิมถูกเซลล์ว่างลบทิ้ง
        const mergedPest = existingPest ? mergeCloudOverLocal(existingPest, mappedPest) : mappedPest;
        await SmartFarmerDB.put('pest_reports', mergedPest);
    }
    if (pestReplyNotified && typeof showToast === 'function') {
        showToast('👨‍💼 เจ้าหน้าที่ตอบกลับรายงานแจ้งโรคของคุณแล้ว', 'info');
    }
    
    // อัปเดตตัวแปรระบบในเมมโมรี่
    pestReports = await SmartFarmerDB.getAll('pest_reports');
}

// ฟังก์ชันแมปข้อมูล แปลงอ้อย จาก Apps Script กลับสู่รูปแบบในเครื่อง
function mapSheetPlotToLocalPlot(sheetPlot) {
    const mappingKeywords = {
        "id": ["Plot ID", "รหัสแปลง"],
        "quota": ["Quota", "โควตา", "โควต้า"],
        "cn": ["CN", "รหัสชาวไร่"],
        "name": ["ชื่อชาวไร่", "ชื่อ-สกุล", "ชื่อ"],
        "location": ["GPS", "พิกัด"],
        "area": ["พื้นที่", "ไร่"],
        "phone": ["เบอร์", "phone", "ติดต่อ"],
        "hasIrrigation": ["ชลประทาน", "น้ำ"],
        "irrigationType": ["รูปแบบการให้น้ำ"],
        "wantsSupport": ["ขอทุน", "สนับสนุน"],
        "supportRejectReason": ["ปฏิเสธทุน"],
        "supportItems": ["รายการทุน"],
        "variety": ["พันธุ์", "variety"],
        "plantingDate": ["วันที่เริ่มปลูก", "วันที่ปลูก"],
        "regPhoto": ["รูปถ่ายแจ้งปลูก", "รูปภาพ"],
        "completedActivities": ["กิจกรรม"],
        "supportStatus": ["สถานะอนุมัติ", "สถานะ"],
        "staffNote": ["หมายเหตุพนักงาน", "บันทึก"],
        "staffId": ["รหัสพนักงานผู้ตอบ", "พนักงาน"],
        "updatedAt": ["อัปเดตล่าสุด"],
        "offlineCreated": ["เวลาบันทึกจริง"],
        "isOffline": ["แก้ไขออฟไลน์"],
        "polygonStatus": ["สถานะแผนที่", "polygonStatus"],
        "factoryPlotCode": ["รหัสแปลงโรงงาน", "factoryPlotCode"],
        "polygon": ["ข้อมูลขอบเขตแปลง", "ขอบเขตแปลง", "polygon"],
        "staffVisitDate": ["วันเวลาเข้าตรวจแปลง", "staffVisitDate"]
    };

    const mapping = {
        "รหัสแปลง (Plot ID)": "id",
        "เลขโควตา (Quota)": "quota",
        "รหัสชาวไร่ (CN.)": "cn",
        "ชื่อชาวไร่": "name",
        "พิกัดแปลง (GPS)": "location",
        "พื้นที่ (ไร่)": "area",
        "เบอร์ติดต่อ": "phone",
        "มีชลประทาน": "hasIrrigation",
        "รูปแบบการให้น้ำ": "irrigationType",
        "ขอทุนสนับสนุน": "wantsSupport",
        "เหตุผลที่ปฏิเสธทุน": "supportRejectReason",
        "รายการทุนที่ขอ": "supportItems",
        "สายพันธุ์อ้อย": "variety",
        "วันที่เริ่มปลูก": "plantingDate",
        "ลิงก์รูปถ่ายแจ้งปลูก": "regPhoto",
        "กิจกรรมที่ทำสำเร็จแล้ว": "completedActivities",
        "สถานะอนุมัติ": "supportStatus",
        "หมายเหตุพนักงาน": "staffNote",
        "รหัสพนักงานผู้ตอบ": "staffId",
        "อัปเดตล่าสุด": "updatedAt",
        "เวลาบันทึกจริง (Offline)": "offlineCreated",
        "แก้ไขออฟไลน์": "isOffline",
        "สถานะแผนที่ (Polygon)": "polygonStatus",
        "รหัสแปลงโรงงาน": "factoryPlotCode",
        "ข้อมูลขอบเขตแปลง (JSON)": "polygon",
        "วันเวลาเข้าตรวจแปลง": "staffVisitDate",
        "คำขอคิวรถตัด (JSON)": "harvesterRequest",
        "สถานะคิวรถตัด": "harvesterStatus",
        "เหตุผลปฏิเสธแนวเขต": "polygonRejectReason"
    };

    const localPlot = {};
    for (const [sheetKey, localKey] of Object.entries(mapping)) {
        let val = sheetPlot[sheetKey];
        if (val === undefined || val === null) {
            // Try fuzzy keyword mapping
            const kws = mappingKeywords[localKey];
            if (kws) {
                const rowKeys = Object.keys(sheetPlot);
                for (const kw of kws) {
                    const match = rowKeys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
                    if (match && sheetPlot[match] !== undefined && sheetPlot[match] !== null) {
                        val = sheetPlot[match];
                        break;
                    }
                }
            }
        }
        
        if (val === undefined || val === null) {
            val = "";
        }
        
        // จัดการแปลงชนิดตัวแปรประเภท Boolean และ Array
        if (localKey === "hasIrrigation") {
            localPlot[localKey] = (val === "มี" || val === "yes" || val === true);
        } else if (localKey === "wantsSupport") {
            localPlot[localKey] = (val === "ใช่" || val === "yes" || val === true);
        } else if (localKey === "isOffline") {
            localPlot[localKey] = (val === "ใช่" || val === "yes" || val === true);
        } else if (localKey === "supportItems") {
            localPlot[localKey] = (typeof val === 'string' && val.trim() !== '') ? val.split(", ").map(s => s.trim()) : (Array.isArray(val) ? val : []);
        } else if (localKey === "completedActivities") {
            localPlot[localKey] = (typeof val === 'string' && val.trim() !== '') ? val.split(", ").map(s => s.trim()) : (Array.isArray(val) ? val : []);
        } else if (localKey === "area") {
            localPlot[localKey] = parseFloat(val) || 0;
        } else if (localKey === "staffVisitDate") {
            localPlot[localKey] = val || "";
        } else if (localKey === "polygon") {
            if (typeof val === 'string' && val.trim() !== '') {
                try {
                    localPlot[localKey] = JSON.parse(val);
                } catch (e) {
                    console.error("Error parsing polygon JSON:", e);
                    localPlot[localKey] = [];
                }
            } else if (Array.isArray(val)) {
                localPlot[localKey] = val;
            } else {
                localPlot[localKey] = [];
            }
        } else if (localKey === "harvesterRequest") {
            if (typeof val === 'string' && val.trim() !== '') {
                try {
                    localPlot[localKey] = JSON.parse(val);
                } catch (e) {
                    localPlot[localKey] = null;
                }
            } else if (val && typeof val === 'object') {
                localPlot[localKey] = val;
            } else {
                localPlot[localKey] = null;
            }
        } else {
            localPlot[localKey] = val;
        }
    }

    // รวมสถานะคิวรถตัด (เจ้าหน้าที่เป็นเจ้าของ) กลับเข้า harvesterRequest.status ให้ client ใช้เหมือนเดิม
    if (localPlot.harvesterRequest && typeof localPlot.harvesterRequest === 'object' &&
        localPlot.harvesterStatus && String(localPlot.harvesterStatus).trim() !== '') {
        localPlot.harvesterRequest.status = String(localPlot.harvesterStatus).trim();
    }
    delete localPlot.harvesterStatus; // ฟิลด์ชั่วคราว ไม่ต้องเก็บบน plot
    
    // Format quota with zero padding helper if available
    if (localPlot.quota) {
        if (typeof formatQuota5Digit === 'function') {
            localPlot.quota = formatQuota5Digit(localPlot.quota);
        } else {
            const qStr = String(localPlot.quota).trim();
            if (/^\d+$/.test(qStr) && qStr !== '' && qStr !== '00000') {
                localPlot.quota = qStr.padStart(5, '0');
            } else {
                localPlot.quota = qStr;
            }
        }
    }
    
    // ตั้งค่าราคาทุนบำรุงแปลงอุดหนุนแบบคงที่
    if (!localPlot.customPrices || Object.keys(localPlot.customPrices).length === 0) {
        localPlot.customPrices = {
            'ค่าไถ': 500, 'ค่าปลูก': 400, 'ค่าพันธุ์': 800, 'ค่าปุ๋ย': 1200, 
            'ค่าสารเคมี': 600, 'ค่าดูแลรักษา': 500, 'ค่าเก็บเกี่ยว': 1500, 'อื่นๆ': 300
        };
    }
    return localPlot;
}

// ฟังก์ชันแมปข้อมูล รายงานโรคพืช จาก Apps Script กลับสู่รูปแบบในเครื่อง
function mapSheetPestToLocalPest(sheetPest) {
    const mappingKeywords = {
        "timestamp": ["วันที่-เวลา", "เวลา"],
        "quota": ["Quota", "โควตา", "โควต้า"],
        "plotName": ["ชื่อแปลงอ้อย", "แปลง"],
        "pestSymptoms": ["อาการผิดปกติที่พบ", "อาการ"],
        "pestDiagnoses": ["ผลวินิจฉัยโรค", "วินิจฉัย"],
        "pestLevels": ["ระดับความรุนแรง", "รุนแรง"],
        "pestRecipes": ["วิธีกำจัดและแนวทางการรักษา", "รักษา"],
        "pestLocation": ["พิกัดที่เกิดโรค", "พิกัด"],
        "pestPhoto": ["ภาพถ่ายจุดเกิดโรค", "ภาพถ่าย"],
        "offlineCreated": ["เวลาบันทึกจริง"],
        "isOffline": ["แก้ไขออฟไลน์"]
    };

    const mapping = {
        "วันที่-เวลา": "timestamp",
        "เลขโควตา (Quota)": "quota",
        "ชื่อแปลงอ้อย": "plotName",
        "อาการผิดปกติที่พบ": "pestSymptoms",
        "ผลวินิจฉัยโรค": "pestDiagnoses",
        "ระดับความรุนแรง": "pestLevels",
        "วิธีกำจัดและแนวทางการรักษา": "pestRecipes",
        "พิกัดที่เกิดโรค (Lat,Lng)": "pestLocation",
        "ภาพถ่ายจุดเกิดโรค (Base64)": "pestPhoto",
        "เวลาบันทึกจริง (Offline)": "offlineCreated",
        "แก้ไขออฟไลน์": "isOffline",
        "รหัสรายงาน (Pest ID)": "id",
        "รหัสแปลง (Plot ID)": "plotId",
        "สถานะการตอบกลับ": "staffReplyStatus",
        "คำแนะนำเจ้าหน้าที่": "staffReplyNote",
        "เจ้าหน้าที่ผู้ตอบ": "staffReplyBy",
        "เวลาตอบกลับ": "staffReplyTime"
    };

    const localPest = {};
    for (const [sheetKey, localKey] of Object.entries(mapping)) {
        let val = sheetPest[sheetKey];
        if (val === undefined || val === null) {
            // Try fuzzy keyword mapping
            const kws = mappingKeywords[localKey];
            if (kws) {
                const rowKeys = Object.keys(sheetPest);
                for (const kw of kws) {
                    const match = rowKeys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
                    if (match && sheetPest[match] !== undefined && sheetPest[match] !== null) {
                        val = sheetPest[match];
                        break;
                    }
                }
            }
        }
        
        if (val === undefined || val === null) {
            val = "";
        }
        
        if (localKey === "isOffline") {
            localPest[localKey] = (val === "ใช่" || val === "yes" || val === true);
        } else {
            localPest[localKey] = val;
        }
    }
    
    // Format quota with zero padding helper if available
    if (localPest.quota) {
        if (typeof formatQuota5Digit === 'function') {
            localPest.quota = formatQuota5Digit(localPest.quota);
        } else {
            const qStr = String(localPest.quota).trim();
            if (/^\d+$/.test(qStr) && qStr !== '' && qStr !== '00000') {
                localPest.quota = qStr.padStart(5, '0');
            } else {
                localPest.quota = qStr;
            }
        }
    }
    
    // จำลองสร้าง ID เฉพาะหากในคอลัมน์ของ Google Sheet ไม่มีส่งมา
    localPest.plotId = sheetPest["id"] || ('pest_' + new Date(localPest.offlineCreated || localPest.timestamp || Date.now()).getTime());
    localPest.id = localPest.plotId;
    return localPest;
}
