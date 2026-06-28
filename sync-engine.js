// Smart Farmer Book - Sync Engine Module (Phase 5)

// Global State Variables (using var to attach to window scope for sharing across app.js)
var plots = [];
var pestReports = [];

// IndexedDB Database Manager
const SmartFarmerDB = {
    db: null,
    
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('SmartFarmerDB', 1);
            
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
            };
            
            request.onsuccess = event => {
                this.db = event.target.result;
                console.log('[IndexedDB] Database initialized successfully.');
                resolve(this.db);
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
    }
};

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
        await SmartFarmerDB.clear('data_queue');
        for (const item of queue) {
            await SmartFarmerDB.put('data_queue', item);
        }
        if (typeof updateNavBadges === 'function') updateNavBadges();
    } catch (e) {
        console.error('Error saving data queue:', e);
    }
}

async function saveSendLog(log) {
    try {
        await SmartFarmerDB.clear('send_log');
        for (const item of log) {
            await SmartFarmerDB.put('send_log', item);
        }
    } catch (e) {
        console.error('Error saving send log:', e);
    }
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
        data: JSON.parse(JSON.stringify(data)),
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
    
    // รันการซิงก์ข้อมูลออโต้เมื่อมีอินเทอร์เน็ต
    if (navigator.onLine) {
        autoSyncPendingData(true);
    }
}

// ==============================================================================
// RESILIENT SYNC ENGINE - EXPONENTIAL BACK-OFF RETRY LOGIC
// ==============================================================================

let syncRetryCount = 0;
let syncTimeoutId = null;

async function autoSyncPendingData(quiet = true) {
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
        
        await saveDataQueue(queue);
        await saveSendLog(log.slice(-200));
        
        if (typeof updatePreviewFAB === 'function') updatePreviewFAB();
        if (typeof renderPreviewContent === 'function') {
            const activeTab = document.querySelector('.preview-tab.active');
            renderPreviewContent(activeTab ? activeTab.dataset.type : 'ALL');
        }
        
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

async function sendToSheetReliable(url, payload) {
    const jsonStr = JSON.stringify(payload);
    const hasImage = jsonStr.includes('data:image') || jsonStr.length > 6000;
    
    if (!hasImage) {
        try {
            const separator = url.includes('?') ? '&' : '?';
            const getUrl = url + separator + 'p=' + encodeURIComponent(jsonStr);
            const resp = await fetch(getUrl, { method: 'GET' });
            if (resp.ok) {
                const text = await resp.text();
                console.log('[Sync GET] Success:', text.substring(0, 80));
                return true;
            }
        } catch(e) {
            console.warn('[Sync GET] Failed, trying POST fallback:', e.message);
        }
    }
    
    try {
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: jsonStr
        });
        console.log('[Sync POST] Sent successfully (no-cors mode)');
        return true;
    } catch(e) {
        console.error('[Sync POST] Failed:', e);
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
        console.log('[Cloud Sync] Fetching all data from Sheets backend...');
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(url + separator + 'action=pullAll');
        if (!response.ok) throw new Error('Network response was not OK');
        
        const resJson = await response.json();
        if (resJson.status === 'success') {
            const cloudPlots = resJson.plots || [];
            const cloudPests = resJson.pestReports || [];
            
            console.log(`[Cloud Sync] Retrieved ${cloudPlots.length} plots and ${cloudPests.length} pest reports.`);
            await mergeCloudDataWithLocal(cloudPlots, cloudPests);
            
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

async function mergeCloudDataWithLocal(cloudPlots, cloudPests) {
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
        
        // ผสานฟิลด์กับแปลงเดิมในเครื่องเพื่อป้องกันการสูญหายของข้อมูลวิเคราะห์ต้นทุน/ประมาณการ/ผลผลิตจริง
        const existingPlot = await SmartFarmerDB.get('plots', mappedPlot.id);
        const mergedPlot = existingPlot ? { ...existingPlot, ...mappedPlot } : mappedPlot;
        await SmartFarmerDB.put('plots', mergedPlot);
    }
    
    // อัปเดตตัวแปรระบบในเมมโมรี่
    plots = await SmartFarmerDB.getAll('plots');
    
    // 2. ผสาน ประวัติการวินิจฉัยโรคอ้อย (Pest Reports)
    for (const rawPest of cloudPests) {
        const mappedPest = mapSheetPestToLocalPest(rawPest);
        if (!mappedPest.id) continue;
        
        if (unsyncedPestIds.has(mappedPest.plotId)) {
            console.log(`[Safe Merge] Skipped overwriting unsynced pest report: ${mappedPest.id}`);
            continue;
        }
        
        const existingPest = await SmartFarmerDB.get('pest_reports', mappedPest.id);
        const mergedPest = existingPest ? { ...existingPest, ...mappedPest } : mappedPest;
        await SmartFarmerDB.put('pest_reports', mergedPest);
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
        "isOffline": ["แก้ไขออฟไลน์"]
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
        "แก้ไขออฟไลน์": "isOffline"
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
        } else {
            localPlot[localKey] = val;
        }
    }
    
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
        "แก้ไขออฟไลน์": "isOffline"
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
