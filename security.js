// Smart Farmer Book - Security Module (Phase 5)

// Helper to pad quota code to exactly 5 digits with leading zeros
function formatQuota5Digit(q) {
    if (q === undefined || q === null) return '';
    const qStr = String(q).trim();
    if (qStr === '' || qStr === '00000') return qStr;
    if (/^\d+$/.test(qStr)) {
        return qStr.padStart(5, '0');
    }
    return qStr;
}

let passcodeResolve = null;

function isPasscodeProtected() {
    return !!localStorage.getItem('smart_farmer_settings_passcode');
}

function requestPasscode(title, message, callback) {
    const savedPasscode = localStorage.getItem('smart_farmer_settings_passcode');
    if (!savedPasscode) {
        callback(true); // No passcode set, bypass
        return;
    }
    
    const modal = document.getElementById('passcode-gate-modal');
    const titleEl = document.getElementById('passcode-gate-title');
    const msgEl = document.getElementById('passcode-gate-msg');
    const inputEl = document.getElementById('passcode-gate-input');
    
    if (!modal || !titleEl || !msgEl || !inputEl) {
        // Fallback to standard prompt if UI missing
        const entered = prompt(`${title}\n${message}`);
        callback(entered === savedPasscode);
        return;
    }
    
    titleEl.innerText = title;
    msgEl.innerText = message;
    inputEl.value = '';
    
    modal.classList.remove('d-none');
    try {
        inputEl.focus();
    } catch(e) {
        console.warn("Focus failed:", e);
    }
    
    passcodeResolve = (success) => {
        modal.classList.add('d-none');
        passcodeResolve = null;
        callback(success);
    };
}

function savePasscodeConfig() {
    const passcodeIn = document.getElementById('settings-passcode-input');
    if (!passcodeIn) return true;
    const val = passcodeIn.value.trim();
    
    if (val === '') {
        localStorage.removeItem('smart_farmer_settings_passcode');
        if (typeof showToast === 'function') showToast('🔓 ปิดการใช้งานรหัสผ่านป้องกันเรียบร้อยแล้ว', 'info');
        addSystemAuditLog('UPDATE_SECURITY', 'SECURITY', 'PASSCODE', 'ปิดการใช้งานรหัสผ่านการตั้งค่า');
        return true;
    }
    
    if (!/^\d{4,6}$/.test(val)) {
        alert('⚠️ รหัสผ่านป้องกันต้องเป็นตัวเลข 4-6 หลักเท่านั้นครับ');
        return false;
    }
    
    localStorage.setItem('smart_farmer_settings_passcode', val);
    if (typeof showToast === 'function') showToast('🔐 ตั้งรหัสผ่านป้องกันการตั้งค่าเรียบร้อยแล้ว!', 'success');
    addSystemAuditLog('UPDATE_SECURITY', 'SECURITY', 'PASSCODE', 'เปิดการใช้งานและบันทึกรหัสผ่านใหม่');
    return true;
}

function setupPasscodeModalListeners() {
    const passcodeCancel = document.getElementById('passcode-gate-cancel-btn');
    const passcodeSubmit = document.getElementById('passcode-gate-submit-btn');
    const passcodeInput = document.getElementById('passcode-gate-input');
    
    if (passcodeCancel) {
        passcodeCancel.onclick = () => {
            if (passcodeResolve) passcodeResolve(false);
        };
    }
    
    if (passcodeSubmit) {
        passcodeSubmit.onclick = () => {
            const entered = passcodeInput.value.trim();
            const saved = localStorage.getItem('smart_farmer_settings_passcode');
            if (entered === saved) {
                if (passcodeResolve) passcodeResolve(true);
            } else {
                alert('❌ รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
                passcodeInput.value = '';
                try {
                    passcodeInput.focus();
                } catch(e) {
                    console.warn("Focus failed:", e);
                }
            }
        };
    }
    
    if (passcodeInput) {
        passcodeInput.onkeypress = (e) => {
            if (e.key === 'Enter' && passcodeSubmit) {
                passcodeSubmit.click();
            }
        };
    }
}

// --- 2. ENCRYPTED BACKUP & RESTORE UTILITIES (Web Crypto API) ---

async function deriveKey(password, salt) {
    const baseKey = await window.crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey", "deriveBits"]
    );
    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptData(plainText, password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    
    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        new TextEncoder().encode(plainText)
    );
    
    const combined = new Uint8Array(salt.byteLength + iv.byteLength + ciphertext.byteLength);
    combined.set(new Uint8Array(salt), 0);
    combined.set(new Uint8Array(iv), salt.byteLength);
    combined.set(new Uint8Array(ciphertext), salt.byteLength + iv.byteLength);
    
    let binStr = "";
    for (let i = 0; i < combined.length; i++) {
        binStr += String.fromCharCode(combined[i]);
    }
    return btoa(binStr);
}

async function decryptData(encryptedBase64, password) {
    const binStr = atob(encryptedBase64);
    const combined = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
        combined[i] = binStr.charCodeAt(i);
    }
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);
    
    const key = await deriveKey(password, salt);
    const decrypted = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
}

async function triggerEncryptedBackup() {
    const password = prompt("📥 กรุณากำหนดรหัสผ่านสำหรับการเข้ารหัสสำรองข้อมูล:\n*(จำรหัสนี้ไว้ เพื่อใช้ถอดรหัสเมื่อนำเข้าไฟล์กู้คืน)");
    if (!password) {
        if (typeof showToast === 'function') showToast("ยกเลิกการสำรองข้อมูล", "info");
        return;
    }
    
    try {
        const localQueue = await getDataQueue();
        const localAuditLogs = await SmartFarmerDB.getAll('audit_log');
        const localPests = await SmartFarmerDB.getAll('pest_reports');
        const localSendLogs = await SmartFarmerDB.getAll('send_log');
        
        // Collect all local state
        const backupPayload = {
            version: "1.0",
            exportedAt: new Date().toISOString(),
            plots: plots,
            queue: localQueue,
            auditLog: localAuditLogs,
            pestReports: localPests,
            sendLog: localSendLogs,
            settings: {
                sheetUrl: localStorage.getItem('smart_farmer_sheet_url') || '',
                quota: localStorage.getItem('smart_farmer_quota') || '',
                staffId: localStorage.getItem('smart_farmer_staff_id') || '',
                voice: localStorage.getItem('smart_farmer_voice_setting') || 'esan'
            }
        };
        
        const plainText = JSON.stringify(backupPayload);
        const encrypted = await encryptData(plainText, password);
        
        const blob = new Blob([encrypted], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
        
        a.href = url;
        a.download = `smart_farmer_backup_${dateStr}_${timeStr}.sfk`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (typeof showToast === 'function') showToast("💾 สำรองข้อมูลลงไฟล์สำรองสำเร็จแล้ว!", "success");
        await addSystemAuditLog('EXPORT_BACKUP', 'SYSTEM', 'BACKUP', 'ดาวน์โหลดไฟล์สำรองข้อมูลเข้ารหัสสำเร็จ');
    } catch(err) {
        console.error("Backup failed:", err);
        alert("❌ เกิดข้อผิดพลาดในการสำรองข้อมูล: " + err.message);
    }
}

function handleBackupFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const encryptedBase64 = e.target.result.trim();
        const password = prompt("🔑 ป้อนรหัสผ่านเพื่อถอดรหัสไฟล์สำรองข้อมูล:");
        if (!password) {
            event.target.value = '';
            return;
        }
        
        try {
            const decryptedText = await decryptData(encryptedBase64, password);
            const data = JSON.parse(decryptedText);
            
            if (!data.version || !Array.isArray(data.plots)) {
                throw new Error("โครงสร้างไฟล์ข้อมูลสำรองไม่ถูกต้องหรือไม่รองรับ");
            }
            
            const mode = confirm("📁 ตรวจพบข้อมูลแปลงอ้อย " + data.plots.length + " แปลงในไฟล์สำรอง\n\n- กด [ตกลง / OK] เพื่อเขียนทับข้อมูลทั้งหมดในเครื่องใหม่\n- กด [ยกเลิก / Cancel] เพื่อผสานข้อมูลเข้ากับข้อมูลเดิมที่มีอยู่ (Merge)");
            
            await restoreFromBackupData(data, mode ? 'OVERWRITE' : 'MERGE');
            
        } catch(err) {
            console.error("Decryption / Import failed:", err);
            alert("❌ รหัสผ่านไม่ถูกต้อง หรือไฟล์สำรองข้อมูลเสียหาย: " + err.message);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

async function restoreFromBackupData(data, mode) {
    if (mode === 'OVERWRITE') {
        plots = data.plots;
        
        // Write plots to IndexedDB
        await SmartFarmerDB.clear('plots');
        for (const p of plots) {
            await SmartFarmerDB.put('plots', p);
        }
        
        // Save queue
        if (data.queue) await saveDataQueue(data.queue);
        
        // Save auditLog
        if (data.auditLog) {
            await SmartFarmerDB.clear('audit_log');
            for (const l of data.auditLog) {
                await SmartFarmerDB.put('audit_log', l);
            }
        }
        
        // Save pest reports
        if (Array.isArray(data.pestReports)) {
            await SmartFarmerDB.clear('pest_reports');
            for (const p of data.pestReports) {
                await SmartFarmerDB.put('pest_reports', p);
            }
            pestReports = data.pestReports;
        }
        
        // Save send log
        if (Array.isArray(data.sendLog)) {
            await SmartFarmerDB.clear('send_log');
            for (const s of data.sendLog) {
                await SmartFarmerDB.put('send_log', s);
            }
        }
        
        if (data.settings) {
            if (data.settings.sheetUrl) localStorage.setItem('smart_farmer_sheet_url', data.settings.sheetUrl);
            if (data.settings.quota) localStorage.setItem('smart_farmer_quota', data.settings.quota);
            if (data.settings.staffId) localStorage.setItem('smart_farmer_staff_id', data.settings.staffId);
            if (data.settings.voice) localStorage.setItem('smart_farmer_voice_setting', data.settings.voice);
        }
        
        if (typeof showToast === 'function') showToast("✅ เขียนทับและกู้คืนข้อมูลทั้งหมดเรียบร้อยแล้ว!", "success");
        await addSystemAuditLog('IMPORT_BACKUP', 'SYSTEM', 'RESTORE', 'กู้คืนข้อมูลแบบเขียนทับสำเร็จ');
    } else {
        // MERGE mode
        let mergedPlots = [...plots];
        let addedCount = 0;
        let updatedCount = 0;
        
        for (const importPlot of data.plots) {
            const idx = mergedPlots.findIndex(p => p.id === importPlot.id);
            if (idx >= 0) {
                mergedPlots[idx] = importPlot;
                updatedCount++;
            } else {
                mergedPlots.push(importPlot);
                addedCount++;
            }
            await SmartFarmerDB.put('plots', importPlot);
        }
        plots = mergedPlots;
        
        // Merge queue items (avoid duplicates by ID)
        if (data.queue && data.queue.length > 0) {
            const localQueue = await getDataQueue();
            data.queue.forEach(importQ => {
                if (!localQueue.some(q => q.id === importQ.id)) {
                    localQueue.push(importQ);
                }
            });
            await saveDataQueue(localQueue);
        }
        
        // Merge audit logs
        if (data.auditLog && data.auditLog.length > 0) {
            const localLogs = await SmartFarmerDB.getAll('audit_log');
            for (const importL of data.auditLog) {
                if (!localLogs.some(l => l.id === importL.id)) {
                    await SmartFarmerDB.put('audit_log', importL);
                }
            }
        }
        
        // Merge pest reports
        if (Array.isArray(data.pestReports) && data.pestReports.length > 0) {
            const localPests = await SmartFarmerDB.getAll('pest_reports');
            let mergedPests = [...localPests];
            for (const importP of data.pestReports) {
                const idx = mergedPests.findIndex(p => p.id === importP.id);
                if (idx >= 0) {
                    mergedPests[idx] = importP;
                } else {
                    mergedPests.push(importP);
                }
                await SmartFarmerDB.put('pest_reports', importP);
            }
            pestReports = mergedPests;
        }
        
        // Merge send logs
        if (Array.isArray(data.sendLog) && data.sendLog.length > 0) {
            const localSendLogs = await SmartFarmerDB.getAll('send_log');
            for (const importS of data.sendLog) {
                if (!localSendLogs.some(s => s.id === importS.id)) {
                    await SmartFarmerDB.put('send_log', importS);
                }
            }
        }
        
        if (typeof showToast === 'function') showToast(`✅ ผสานข้อมูลเสร็จสิ้น! (เพิ่มใหม่ ${addedCount} แปลง, อัปเดต ${updatedCount} แปลง)`, "success");
        await addSystemAuditLog('IMPORT_BACKUP', 'SYSTEM', 'RESTORE', `ผสานประวัติข้อมูลสำเร็จ (เพิ่มใหม่: ${addedCount}, อัปเดต: ${updatedCount})`);
    }
    
    // Refresh screens
    if (typeof checkQuotaLogin === 'function') checkQuotaLogin();
    if (typeof buildPlotFilterDropdown === 'function') buildPlotFilterDropdown();
    if (typeof renderDashboard === 'function') renderDashboard();
    await renderAuditLogsInUI();
    if (typeof updatePreviewFAB === 'function') updatePreviewFAB();
    
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) settingsModal.classList.add('d-none');
}

// --- 3. SYSTEM AUDIT TRAIL LOGGING ---

async function addSystemAuditLog(action, recordType, recordId, details) {
    const quota = localStorage.getItem('smart_farmer_quota') || '00000';
    const staffId = localStorage.getItem('smart_farmer_staff_id') || '';
    const userDisplay = staffId ? `พนักงาน: ${staffId}` : `ชาวไร่: ${quota}`;
    
    const now = new Date();
    const offlineTime = now.toLocaleString("th-TH");
    
    const newLog = {
        id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        quota: userDisplay,
        action: action,
        recordType: recordType,
        recordId: recordId,
        details: details,
        offlineCreated: offlineTime,
        isOffline: !navigator.onLine
    };
    
    await SmartFarmerDB.put('audit_log', newLog);
    
    const logs = await SmartFarmerDB.getAll('audit_log');
    if (logs.length > 100) {
        logs.sort((a, b) => a.id.localeCompare(b.id));
        while (logs.length > 100) {
            const oldest = logs.shift();
            await SmartFarmerDB.delete('audit_log', oldest.id);
        }
    }
    
    await queueDataChange('INSERT', newLog, 'AUDIT_LOG');
}

async function renderAuditLogsInUI() {
    const listEl = document.getElementById('audit-logs-list');
    if (!listEl) return;
    
    let logs = [];
    try {
        logs = await SmartFarmerDB.getAll('audit_log');
        logs.sort((a, b) => b.id.localeCompare(a.id));
    } catch(e) {
        logs = [];
    }
    
    if (logs.length === 0) {
        listEl.innerHTML = '<span style="color:#888;">ไม่มีประวัติกิจกรรม</span>';
        return;
    }
    
    let html = '';
    logs.forEach(log => {
        const actionStyle = log.action === 'DELETE' ? 'color:var(--brand-red);' : (log.action.includes('IMPORT') ? 'color:#43a047;' : 'color:var(--brand-blue);');
        const offlineBadge = log.isOffline ? ' <span style="color:#e65100; font-size:8px;">[ออฟไลน์]</span>' : '';
        html += `<div style="border-bottom:1px solid #f1f3f4; padding:4px 0; font-size:9.5px; word-break:break-all; text-align:left;">
            <span style="color:#888;">[${log.offlineCreated}]</span> 
            <strong>${log.quota}</strong>: 
            <span style="${actionStyle} font-weight:700;">${log.action}</span> 
            (<span style="color:#e28743;">${log.recordType}</span>) - 
            <span>${log.details}</span>${offlineBadge}
        </div>`;
    });
    listEl.innerHTML = html;
}

async function clearSystemAuditLogs() {
    if (confirm('คุณต้องการล้างประวัติการใช้งานระบบทั้งหมดในเครื่องใช่หรือไม่?')) {
        await SmartFarmerDB.clear('audit_log');
        await renderAuditLogsInUI();
        if (typeof showToast === 'function') showToast('ล้างประวัติการใช้งานเรียบร้อยแล้ว', 'info');
    }
}
