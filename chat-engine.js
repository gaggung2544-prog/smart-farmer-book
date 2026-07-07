// Smart Farmer Book - Chat & Formal Alert Engine (NEW Module)

let activeChatTab = 'global'; // 'global' or 'group'
let currentUser = { id: '', role: 'farmer', name: '', avatar: '👨‍🌾' };
let assignedStaffId = '0101'; // Default assigned promoter
let chatMediaAttachment = null; // Stores temporary media file data
let mediaRecorder = null;
let audioChunks = [];
let recordingTimerInterval = null;
let recordingDuration = 0;
let activeMicStream = null; // เก็บ stream ไมค์ไว้ปิด track เมื่อยกเลิก/ออกจากหน้าแชท (กันไมค์ค้างเปิด)
let isOfflineMode = !navigator.onLine;

// ===== ความปลอดภัย: กัน XSS จากข้อความ/สื่อที่ดึงมาจากผู้ใช้คนอื่นผ่าน Google Sheet =====
// escape อักขระ HTML ก่อนนำไปแสดง (ใช้กับ caption/ชื่อผู้ส่ง ฯลฯ)
function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
// อนุญาตเฉพาะ media URL ที่ปลอดภัย (data:image|video|audio, blob:, http(s):) — กัน javascript: และการหลุด attribute
function sanitizeMediaUrl(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (/^data:(image|video|audio)\//i.test(u) || /^blob:/i.test(u) || /^https?:\/\//i.test(u)) {
        return u;
    }
    return '';
}

// Pre-populated mock announcements for rich first impression
const MOCK_CHAT_MESSAGES = [
    {
        id: 'msg-mock-1',
        timestamp: Date.now() - 3600000 * 24, // 1 day ago
        senderId: '0101',
        senderName: 'เจ้าหน้าที่กฤษฎา',
        role: 'staff',
        avatar: '👨‍💼',
        message: 'นัดประชุมด่วนชาวไร่ เขต 1 วันที่ 10 กรกฎาคม 2569 เวลา 09:00 น. ณ หอประชุมเทศบาลตำบลกุฉินารายณ์ เพื่อชี้แจงมาตรการสนับสนุนและเงินกู้ปลูกอ้อยดอกเบี้ยต่ำ',
        type: 'text',
        targetGroup: '0101',
        isSynced: 1
    },
    {
        id: 'msg-mock-2',
        timestamp: Date.now() - 3600000 * 20, // 20 hours ago
        senderId: '0101',
        senderName: 'เจ้าหน้าที่กฤษฎา',
        role: 'staff',
        avatar: '👨‍💼',
        message: 'ประกาศข่าวสารสัญญาราคาปุ๋ยเคมีสั่งตัดรายสัปดาห์: แม่ปุ๋ยยูเรีย 46-0-0 ราคาแนะนำ 850 บาท/กระสอบ, แดป 18-46-0 ราคา 1,250 บาท, และม็อบ 0-0-60 ราคา 1,150 บาท สำหรับสัปดาห์นี้ครับ',
        type: 'text',
        targetGroup: 'global',
        isSynced: 1
    },
    {
        id: 'msg-mock-3',
        timestamp: Date.now() - 3600000 * 5, // 5 hours ago
        senderId: '15222',
        senderName: 'ชาวไร่สมใจ',
        role: 'farmer',
        avatar: '👩‍🌾',
        message: 'ขอบคุณครับเจ้าหน้าที่ ราคาปุ๋ยรอบนี้ถือว่าปรับลดลงนิดหน่อย เดี๋ยวสัปดาห์หน้าจะขอเบิกงบสนับสนุนครับ',
        type: 'text',
        targetGroup: '0101',
        isSynced: 1
    }
];

document.addEventListener('DOMContentLoaded', () => {
    // Expose functions to window
    window.openOfficialNoticeModal = openOfficialNoticeModal;
    window.closeOfficialNoticeModal = closeOfficialNoticeModal;
    window.clearChatAttachment = clearChatAttachment;
    window.sendFertilizerAnnouncement = sendFertilizerAnnouncement;

    // Load user role and configuration
    initChatUser();

    // Init UI elements and click handlers
    initChatUI();

    // Check offline/online status
    window.addEventListener('online', () => setChatOnlineStatus(true));
    window.addEventListener('offline', () => setChatOnlineStatus(false));
    setChatOnlineStatus(navigator.onLine);

    // Load Chat History from IndexedDB
    setTimeout(() => {
        loadChatHistory();
        pullChatMessages(); // Initial pull
    }, 1000);

    // Periodic Sync & Pull (every 10 seconds)
    // หยุด poll เมื่อแอปอยู่เบื้องหลัง (document.hidden) เพื่อประหยัดแบต/เน็ตบนมือถือ
    setInterval(() => {
        if (!isOfflineMode && !document.hidden) {
            syncChatMessages();
            pullChatMessages();
        }
    }, 10000);

    // เมื่อกลับมาโฟกัสแอป ให้ดึงข้อความล่าสุดทันที (ชดเชยช่วงที่หยุด poll ตอนอยู่เบื้องหลัง)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !isOfflineMode) {
            pullChatMessages();
        }
    });
});

// 1. Initialize user from localStorage
function initChatUser() {
    const quota = localStorage.getItem('smart_farmer_quota');
    const staffId = localStorage.getItem('smart_farmer_staff_id');
    const profileRaw = localStorage.getItem('smart_farmer_profile');
    
    if (staffId) {
        currentUser.id = staffId;
        currentUser.role = 'staff';
        currentUser.avatar = '👨‍💼';
        currentUser.name = 'เจ้าหน้าที่ส่งเสริม #' + staffId;
        assignedStaffId = staffId;
    } else if (quota) {
        currentUser.id = quota;
        currentUser.role = 'farmer';
        currentUser.avatar = '👨‍🌾';
        currentUser.name = 'ชาวไร่โควตา #' + quota;
        
        // Resolve promoter
        if (window.QUOTA_TO_SUBZONE && window.QUOTA_TO_SUBZONE[quota]) {
            assignedStaffId = window.QUOTA_TO_SUBZONE[quota];
        } else {
            assignedStaffId = '0101'; // fallback
        }
    } else {
        // Guest mode fallback
        currentUser.id = 'GUEST';
        currentUser.role = 'farmer';
        currentUser.name = 'ผู้ใช้ทั่วไป';
    }

    if (profileRaw) {
        try {
            const profile = JSON.parse(profileRaw);
            if (profile.name) currentUser.name = profile.name;
            if (profile.avatar) currentUser.avatar = profile.avatar;
        } catch(e) {
            console.error("Error parsing profile:", e);
        }
    }

    // Toggle staff announcement panel based on role
    const staffPanel = document.getElementById('chat-staff-announcement-panel');
    if (staffPanel) {
        if (currentUser.role === 'staff') {
            staffPanel.classList.remove('d-none');
        } else {
            staffPanel.classList.add('d-none');
        }
    }
}

// 2. Setup DOM Listeners
function initChatUI() {
    const tabGlobal = document.getElementById('chat-tab-global');
    const tabGroup = document.getElementById('chat-tab-group');
    const chatForm = document.getElementById('chat-input-form');
    const chatInput = document.getElementById('chat-text-input');

    if (tabGlobal && tabGroup) {
        tabGlobal.addEventListener('click', () => switchChatTab('global'));
        tabGroup.addEventListener('click', () => switchChatTab('group'));
    }

    if (chatForm) {
        chatForm.addEventListener('submit', handleSendTextMessage);
    }

    // Media attachment triggers
    const btnPhoto = document.getElementById('btn-chat-photo');
    const btnVideo = document.getElementById('btn-chat-video');
    const btnMic = document.getElementById('btn-chat-mic');
    const inputPhoto = document.getElementById('chat-photo-input');
    const inputVideo = document.getElementById('chat-video-input');
    const btnClearAttach = document.getElementById('btn-clear-attachment');

    if (btnPhoto && inputPhoto) {
        btnPhoto.addEventListener('click', () => inputPhoto.click());
        inputPhoto.addEventListener('change', handleImageUpload);
    }

    if (btnVideo && inputVideo) {
        btnVideo.addEventListener('click', () => inputVideo.click());
        inputVideo.addEventListener('change', handleVideoUpload);
    }

    if (btnMic) {
        btnMic.addEventListener('click', toggleAudioRecording);
    }

    if (btnClearAttach) {
        btnClearAttach.addEventListener('click', clearChatAttachment);
    }

    // Screen switching hook inside app.js compatibility
    const oldSwitchScreen = window.switchScreen;
    window.switchScreen = function(screenId) {
        if (oldSwitchScreen) oldSwitchScreen(screenId);
        if (screenId === 'screen-chat') {
            // Mark chat tab active
            document.querySelectorAll('.app-nav .nav-item').forEach(item => {
                if (item.getAttribute('data-screen') === 'screen-chat') {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            // Focus input & scroll chat
            const feed = document.getElementById('chat-feed-container');
            if (feed) {
                setTimeout(() => {
                    feed.scrollTop = feed.scrollHeight;
                }, 100);
            }
            // Clear unread badge
            const badge = document.getElementById('badge-chat');
            if (badge) badge.classList.add('d-none');
        }
    };
}

// 3. Switch Chat Screen Tabs
function switchChatTab(tabName) {
    activeChatTab = tabName;
    const tabGlobal = document.getElementById('chat-tab-global');
    const tabGroup = document.getElementById('chat-tab-group');

    if (activeChatTab === 'global') {
        tabGlobal.classList.add('active');
        tabGlobal.style.background = 'var(--brand-green)';
        tabGlobal.style.color = 'white';
        tabGroup.classList.remove('active');
        tabGroup.style.background = 'none';
        tabGroup.style.color = 'var(--text-secondary)';
    } else {
        tabGroup.classList.add('active');
        tabGroup.style.background = 'var(--brand-green)';
        tabGroup.style.color = 'white';
        tabGlobal.classList.remove('active');
        tabGlobal.style.background = 'none';
        tabGlobal.style.color = 'var(--text-secondary)';
    }
    renderChatMessages();
}

// 4. Render Messages into Chat Feed
async function renderChatMessages() {
    const feed = document.getElementById('chat-feed-container');
    if (!feed) return;

    feed.innerHTML = '';
    let messages = [];

    try {
        if (window.SmartFarmerDB && SmartFarmerDB.db) {
            messages = await SmartFarmerDB.getAll('chat_messages');
        }
    } catch(e) {
        console.error("IndexedDB chat error:", e);
    }

    // Merge in mock messages if db is empty
    if (messages.length === 0) {
        messages = [...MOCK_CHAT_MESSAGES];
        // Populate mock messages to DB
        if (window.SmartFarmerDB && SmartFarmerDB.db) {
            for (let m of messages) {
                await SmartFarmerDB.put('chat_messages', m);
            }
        }
    }

    // Sort by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp);

    // Filter by active tab (Global Chat vs Group Chat Zone)
    const targetGroupFilter = activeChatTab === 'global' ? 'global' : assignedStaffId;
    const filteredMessages = messages.filter(m => m.targetGroup === targetGroupFilter);

    // Track if we need to show a notification badge on the running ticker
    let activeAnnouncement = null;

    filteredMessages.forEach(msg => {
        const isMe = msg.senderId === currentUser.id;
        const msgRow = document.createElement('div');
        msgRow.className = `chat-msg-row ${isMe ? 'me' : 'other'}`;
        if (msg.role === 'staff') {
            msgRow.classList.add('staff-msg');
        }

        // Parse meta details
        const date = new Date(msg.timestamp);
        const timeStr = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        
        let headerText = `${msg.avatar} ${msg.senderName}`;
        if (msg.role === 'staff') {
            headerText += ' (เจ้าหน้าที่ส่งเสริม)';
        }
        
        const metaDiv = document.createElement('div');
        metaDiv.className = 'chat-meta';
        // escapeHtml ชื่อผู้ส่ง (headerText มาจาก msg.senderName ของผู้ใช้อื่น) กัน XSS; ส่วน timeStr/emoji ปลอดภัย
        const syncMark = msg.isSynced === 1 ? '✓' : (msg.isSynced === 2 ? '⚠️' : '⏳');
        metaDiv.innerHTML = `${escapeHtml(headerText)} • ${timeStr} ${syncMark}`;

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'chat-bubble';

        // caption helper: สร้าง element ด้วย textContent (ปลอดภัยจาก XSS เสมอ)
        const makeCaption = (txt) => {
            const c = document.createElement('div');
            c.style.marginTop = '6px';
            c.style.fontSize = '12px';
            c.textContent = txt;
            return c;
        };
        const safeMedia = sanitizeMediaUrl(msg.mediaData);

        // Render message content based on type — สร้างผ่าน DOM ไม่ใช้ string interpolation กับข้อมูลผู้ใช้
        if (msg.type === 'text') {
            bubbleDiv.innerText = msg.message;
        } else if (msg.type === 'image') {
            const label = document.createElement('div');
            label.style.cssText = 'font-size:11px; margin-bottom:4px;';
            label.textContent = '📷 ส่งรูปภาพ:';
            bubbleDiv.appendChild(label);
            if (safeMedia) {
                const img = document.createElement('img');
                img.src = safeMedia;
                img.className = 'chat-image-attachment';
                img.addEventListener('click', () => openPhotoModal(safeMedia));
                bubbleDiv.appendChild(img);
            }
            if (msg.message) bubbleDiv.appendChild(makeCaption(msg.message));
        } else if (msg.type === 'video') {
            const label = document.createElement('div');
            label.style.cssText = 'font-size:11px; margin-bottom:4px;';
            label.textContent = '🎥 ส่งวิดีโอ:';
            bubbleDiv.appendChild(label);
            if (safeMedia) {
                const vid = document.createElement('video');
                vid.src = safeMedia;
                vid.controls = true;
                vid.className = 'chat-video-attachment';
                bubbleDiv.appendChild(vid);
            }
            if (msg.message) bubbleDiv.appendChild(makeCaption(msg.message));
        } else if (msg.type === 'audio') {
            const label = document.createElement('div');
            label.style.cssText = 'font-size:11px; margin-bottom:2px;';
            label.textContent = '🎤 ข้อความเสียง:';
            bubbleDiv.appendChild(label);
            const player = document.createElement('div');
            player.className = 'chat-audio-player';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '▶';
            btn.style.cssText = 'width:24px; height:24px; border-radius:50%; border:none; background:#0F2C59; color:#fff; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;';
            if (safeMedia) btn.addEventListener('click', () => playChatAudio(btn, safeMedia));
            const track = document.createElement('div');
            track.style.cssText = 'height:3px; background:rgba(0,0,0,0.1); flex:1; border-radius:2px; position:relative; overflow:hidden;';
            track.innerHTML = '<div class="play-progress" style="width:0%; height:100%; background:#bf953f; position:absolute; top:0; left:0;"></div>';
            player.appendChild(btn);
            player.appendChild(track);
            bubbleDiv.appendChild(player);
        }

        msgRow.appendChild(metaDiv);
        msgRow.appendChild(bubbleDiv);
        feed.appendChild(msgRow);

        // Scan message for running announcements
        const parsedAlert = scanMessageForFormalAlert(msg);
        if (parsedAlert) {
            activeAnnouncement = parsedAlert;
        }
    });

    // Update Top Ticker Banner with latest announcement
    updateFormalTicker(activeAnnouncement);

    // Scroll to bottom
    feed.scrollTop = feed.scrollHeight;
}

// 5. Send Text Message
async function handleSendTextMessage(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('chat-text-input');
    if (!input) return;
    
    const text = input.value.trim();
    
    if (!text && !chatMediaAttachment) return;

    let msgType = 'text';
    let mediaData = '';

    if (chatMediaAttachment) {
        msgType = chatMediaAttachment.type;
        mediaData = chatMediaAttachment.data;
    }

    const newMsg = {
        id: 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
        senderId: currentUser.id,
        senderName: currentUser.name,
        role: currentUser.role,
        avatar: currentUser.avatar,
        message: text,
        type: msgType,
        mediaData: mediaData,
        targetGroup: activeChatTab === 'global' ? 'global' : assignedStaffId,
        isSynced: 0
    };

    // Save locally
    if (window.SmartFarmerDB && SmartFarmerDB.db) {
        await SmartFarmerDB.put('chat_messages', newMsg);
    } else {
        MOCK_CHAT_MESSAGES.push(newMsg);
    }

    // Reset input states
    input.value = '';
    clearChatAttachment();

    // Re-render chat
    renderChatMessages();

    // Trigger Cloud Sync
    syncChatMessages();
}

// 6. Audio Recording with Microphone
async function toggleAudioRecording() {
    const recordBar = document.getElementById('chat-recording-bar');
    const inputForm = document.getElementById('chat-input-form');
    const timerText = document.getElementById('recording-timer');

    if (!mediaRecorder) {
        // Start Recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            activeMicStream = stream; // เก็บไว้เผื่อยกเลิก/ออกจากหน้าเพื่อปิด track
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                
                // Read as base64
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Data = reader.result;
                    // Auto-send audio message
                    const audioMsg = {
                        id: 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                        timestamp: Date.now(),
                        senderId: currentUser.id,
                        senderName: currentUser.name,
                        role: currentUser.role,
                        avatar: currentUser.avatar,
                        message: '',
                        type: 'audio',
                        mediaData: base64Data,
                        targetGroup: activeChatTab === 'global' ? 'global' : assignedStaffId,
                        isSynced: 0
                    };
                    
                    if (window.SmartFarmerDB && SmartFarmerDB.db) {
                        await SmartFarmerDB.put('chat_messages', audioMsg);
                    }
                    renderChatMessages();
                    syncChatMessages();
                };

                // Stop microphone tracks
                stream.getTracks().forEach(track => track.stop());
                activeMicStream = null;
            };

            mediaRecorder.start();
            recordingDuration = 0;
            if (timerText) timerText.innerText = '0:00';

            // Show recording status
            recordBar.classList.remove('d-none');
            inputForm.classList.add('d-none');

            // Start timer
            recordingTimerInterval = setInterval(() => {
                recordingDuration++;
                const mins = Math.floor(recordingDuration / 60);
                const secs = recordingDuration % 60;
                if (timerText) timerText.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }, 1000);

            // Set up cancel recording button
            document.getElementById('btn-cancel-recording').onclick = () => {
                stopRecordingTimer();
                mediaRecorder.onstop = null; // Discard blob
                mediaRecorder.stop();
                mediaRecorder = null;
                // ปิด track ไมค์ด้วย (เดิม set onstop=null ทำให้ track ไม่ถูกปิด = ไมค์ค้างเปิด)
                if (activeMicStream) { activeMicStream.getTracks().forEach(t => t.stop()); activeMicStream = null; }
                recordBar.classList.add('d-none');
                inputForm.classList.remove('d-none');
            };

            // Set up stop and send button
            document.getElementById('btn-stop-recording').onclick = () => {
                stopRecordingTimer();
                mediaRecorder.stop();
                mediaRecorder = null;
                recordBar.classList.add('d-none');
                inputForm.classList.remove('d-none');
            };

        } catch (err) {
            console.error("Audio recording permission denied or failed:", err);
            alert("⚠️ ไม่สามารถเข้าถึงไมโครโฟนได้! กรุณาอนุญาตสิทธิ์การใช้ไมโครโฟนในเบราว์เซอร์");
        }
    }
}

function stopRecordingTimer() {
    if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
    }
}

// ยกเลิกการอัดเสียงที่ค้างอยู่ + ปิดไมค์ (เรียกตอนออกจากหน้าแชทกลางคัน กันไมค์เปิดค้าง)
function cancelActiveRecording() {
    if (!mediaRecorder && !activeMicStream) return;
    stopRecordingTimer();
    if (mediaRecorder) {
        try { mediaRecorder.onstop = null; if (mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch (e) {}
        mediaRecorder = null;
    }
    if (activeMicStream) {
        activeMicStream.getTracks().forEach(t => t.stop());
        activeMicStream = null;
    }
    const recordBar = document.getElementById('chat-recording-bar');
    const inputForm = document.getElementById('chat-input-form');
    if (recordBar) recordBar.classList.add('d-none');
    if (inputForm) inputForm.classList.remove('d-none');
}

// 7. Handle Image Upload & Compression
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // DATA-LOSS/STABILITY: กันรูปขนาดใหญ่มากที่ทำเบราว์เซอร์ค้างตอน decode และทำ IndexedDB/localStorage เต็ม
    // (เดิมมีลิมิตเฉพาะวิดีโอ 10MB แต่รูปไม่มีลิมิตเลย)
    const MAX_IMAGE_SIZE = 12 * 1024 * 1024; // 12MB ต่อรูปต้นฉบับ (จะถูกบีบเป็น JPEG 600px อีกที)
    if (!file.type || !file.type.startsWith('image/')) {
        alert('⚠️ ไฟล์นี้ไม่ใช่รูปภาพ กรุณาเลือกไฟล์รูปภาพ');
        e.target.value = '';
        return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
        alert('⚠️ รูปภาพมีขนาดใหญ่เกินไป! กรุณาเลือกรูปขนาดไม่เกิน 12 MB');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = function() {
            // Compress Image using Canvas
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600;
            const MAX_HEIGHT = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG with 0.7 quality
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

            // Show preview
            chatMediaAttachment = {
                type: 'image',
                data: compressedBase64,
                name: file.name,
                size: (compressedBase64.length / 1024).toFixed(1) + ' KB'
            };
            showAttachmentPreview();
        };
    };
    reader.readAsDataURL(file);
}

// 8. Handle Video Upload & Size Limit
function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Check size limit: max 10MB (as per user comment feedback)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
        alert("⚠️ ไฟล์วิดีโอมีขนาดใหญ่เกินไป! กรุณาเลือกไฟล์วิดีโอขนาดไม่เกิน 10 MB เพื่อการส่งข้อมูลที่รวดเร็ว");
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const base64Data = event.target.result;
        chatMediaAttachment = {
            type: 'video',
            data: base64Data,
            name: file.name,
            size: (file.size / (1024 * 1024)).toFixed(2) + ' MB'
        };
        showAttachmentPreview();
    };
    reader.readAsDataURL(file);
}

// 9. Show/Clear Attachments
function showAttachmentPreview() {
    const preview = document.getElementById('chat-attachment-preview');
    const thumb = document.getElementById('attachment-thumb');
    const nameText = document.getElementById('attachment-name');
    const sizeText = document.getElementById('attachment-size');

    if (!preview || !chatMediaAttachment) return;

    if (chatMediaAttachment.type === 'image') {
        thumb.style.backgroundImage = `url(${chatMediaAttachment.data})`;
    } else {
        thumb.style.backgroundImage = 'none';
        thumb.innerHTML = '<span style="font-size:24px; display:flex; justify-content:center; align-items:center; height:100%;">🎬</span>';
    }

    nameText.innerText = chatMediaAttachment.name;
    sizeText.innerText = chatMediaAttachment.size;
    preview.classList.remove('d-none');
}

function clearChatAttachment() {
    chatMediaAttachment = null;
    const preview = document.getElementById('chat-attachment-preview');
    const inputPhoto = document.getElementById('chat-photo-input');
    const inputVideo = document.getElementById('chat-video-input');

    if (preview) preview.classList.add('d-none');
    if (inputPhoto) inputPhoto.value = '';
    if (inputVideo) inputVideo.value = '';
}

// 10. Play Audio Message
let activeAudioElement = null;
let activeAudioPlayButton = null;

function playChatAudio(button, base64Data) {
    if (activeAudioElement) {
        activeAudioElement.pause();
        if (activeAudioPlayButton) activeAudioPlayButton.innerText = '▶';
        
        // If clicking the same button that is currently playing, just pause
        if (activeAudioPlayButton === button) {
            activeAudioElement = null;
            activeAudioPlayButton = null;
            return;
        }
    }

    const audio = new Audio(base64Data);
    activeAudioElement = audio;
    activeAudioPlayButton = button;
    button.innerText = '⏸';

    // Update progress bar
    const progress = button.nextElementSibling.querySelector('.play-progress');

    audio.ontimeupdate = () => {
        if (audio.duration) {
            const percentage = (audio.currentTime / audio.duration) * 100;
            if (progress) progress.style.width = percentage + '%';
        }
    };

    audio.onended = () => {
        button.innerText = '▶';
        if (progress) progress.style.width = '0%';
        activeAudioElement = null;
        activeAudioPlayButton = null;
    };

    audio.play().catch(err => {
        console.error("Audio playback error:", err);
        button.innerText = '▶';
    });
}

// 11. Open photo view modal
function openPhotoModal(imgSrc) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.9)';
    modal.style.zIndex = '10005';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.cursor = 'zoom-out';
    // สร้าง <img> ผ่าน DOM + sanitize src กัน XSS จาก imgSrc ที่มาจากข้อความผู้ใช้อื่น
    const safeSrc = sanitizeMediaUrl(imgSrc);
    if (safeSrc) {
        const fullImg = document.createElement('img');
        fullImg.src = safeSrc;
        fullImg.style.cssText = 'max-width:95%; max-height:90vh; border-radius:8px; border:2px solid white; box-shadow:0 0 20px rgba(0,0,0,0.5);';
        modal.appendChild(fullImg);
    }

    modal.onclick = () => {
        document.body.removeChild(modal);
    };
    
    document.body.appendChild(modal);
}

// 12. Intelligent Text Parser to detect announcements
function scanMessageForFormalAlert(msg) {
    const text = msg.message;
    if (!text) return null;

    const isMeeting = text.includes("นัดประชุม") || text.includes("ขอเชิญประชุม") || text.includes("สัมมนา");
    const isFertilizer = text.includes("ราคาปุ๋ย") || text.includes("ปุ๋ยเคมี") || text.includes("แม่ปุ๋ย");
    const isNews = text.includes("ประกาศข่าว") || text.includes("ประชาสัมพันธ์") || text.includes("ด่วนที่สุด");

    if (isMeeting) {
        return {
            type: 'MEETING',
            id: msg.id,
            timestamp: msg.timestamp,
            sender: msg.senderName,
            subject: 'นัดประชุมกลุ่มชาวไร่อ้อย',
            message: text,
            badge: '📅 ประชุมด่วน'
        };
    } else if (isFertilizer) {
        return {
            type: 'FERTILIZER',
            id: msg.id,
            timestamp: msg.timestamp,
            sender: msg.senderName,
            subject: 'ประกาศราคาปุ๋ยเคมีส่งเสริม',
            message: text,
            badge: '🧪 ราคาปุ๋ย'
        };
    } else if (isNews) {
        return {
            type: 'NEWS',
            id: msg.id,
            timestamp: msg.timestamp,
            sender: msg.senderName,
            subject: 'ประกาศข่าวสารส่งเสริมด่วน',
            message: text,
            badge: '📰 ข่าวประชาสัมพันธ์'
        };
    }
    return null;
}

// 13. Update Top Ticker Banner
let activeTickerAnnouncement = null;

function updateFormalTicker(announcement) {
    const tickerBanner = document.getElementById('formal-ticker-banner');
    const tickerText = document.getElementById('formal-ticker-text');

    if (!tickerBanner || !tickerText) return;

    const isDashboardActive = document.getElementById('screen-dashboard')?.classList.contains('active');

    if (!announcement) {
        // Fallback to default
        tickerText.innerText = 'ติดตามประกาศนัดหมายและข่าวสารปุ๋ยเคมีจากเจ้าหน้าที่ส่งเสริมการเกษตรได้ที่นี่...';
        if (isDashboardActive) {
            tickerBanner.classList.remove('d-none');
        } else {
            tickerBanner.classList.add('d-none');
        }
        activeTickerAnnouncement = null;
        return;
    }

    activeTickerAnnouncement = announcement;
    tickerText.innerText = `${announcement.badge}: ${announcement.message}`;
    if (isDashboardActive) {
        tickerBanner.classList.remove('d-none');
    } else {
        tickerBanner.classList.add('d-none');
    }
}

// 14. Official Gazette Modal Handler
function openOfficialNoticeModal() {
    if (!activeTickerAnnouncement) return;

    const modal = document.getElementById('official-notice-modal');
    const docId = document.getElementById('notice-doc-id');
    const docDate = document.getElementById('notice-doc-date');
    const docSubject = document.getElementById('notice-doc-subject');
    const docSender = document.getElementById('notice-doc-sender');
    const docBody = document.getElementById('notice-doc-body');
    const signatureName = document.getElementById('notice-doc-signature-name');

    if (modal) {
        docId.innerText = 'สส.กฉ/' + activeTickerAnnouncement.id.replace('msg-', '').substring(0, 8).toUpperCase();
        docDate.innerText = new Date(activeTickerAnnouncement.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
        docSubject.innerText = activeTickerAnnouncement.subject;
        docSender.innerText = activeTickerAnnouncement.sender;
        docBody.innerText = activeTickerAnnouncement.message;
        signatureName.innerText = activeTickerAnnouncement.sender;

        modal.classList.remove('d-none');
    }
}

function closeOfficialNoticeModal() {
    const modal = document.getElementById('official-notice-modal');
    if (modal) modal.classList.add('d-none');
}

// 15. Offline/Online UI State Management
function setChatOnlineStatus(online) {
    isOfflineMode = !online;
    
    // Auto-sync messages once back online
    if (online) {
        console.log("[Chat Engine] Device is online. Initiating message sync and pull...");
        syncChatMessages();
        pullChatMessages();
    } else {
        console.log("[Chat Engine] Device is offline. Messages queued locally.");
    }
}

// 16. Local/Cloud Message Sync Logic
async function loadChatHistory() {
    // If table is loaded, render
    renderChatMessages();
}

async function pullChatMessages() {
    if (isOfflineMode) return;

    const sheetUrl = localStorage.getItem('smart_farmer_sheet_url') || '';
    if (!sheetUrl) return; // No sheet URL set

    try {
        if (!window.SmartFarmerDB || !SmartFarmerDB.db) return;

        console.log("[Chat Engine] Pulling new messages from Google Sheet...");

        // Call App Script Web App with get_chats action (มี timeout กันค้าง)
        const url = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + 'action=get_chats';
        const doFetch = (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : (u, o) => fetch(u, o);
        const response = await doFetch(url, { method: 'GET', mode: 'cors' }, 20000);
        if (!response.ok) return;

        const resData = await response.json();
        if (resData.status === 'success' && Array.isArray(resData.messages)) {
            let hasNew = false;
            
            // Loop through pulled messages and save any new ones to IndexedDB
            for (let msg of resData.messages) {
                // Check if message exists locally
                const localMsg = await SmartFarmerDB.get('chat_messages', msg.id);
                if (!localMsg) {
                    // Mark as synced and save locally
                    msg.isSynced = 1;
                    await SmartFarmerDB.put('chat_messages', msg);
                    hasNew = true;
                }
            }

            // Only re-render if new messages were added
            if (hasNew) {
                console.log("[Chat Engine] Found new messages, re-rendering chat feed.");
                renderChatMessages();

                // Check if the user is currently NOT on the chat screen
                const chatNavItem = document.querySelector('.app-nav .nav-item[data-screen="screen-chat"]');
                const isChatActive = chatNavItem && chatNavItem.classList.contains('active');
                
                if (!isChatActive) {
                    // 1. Show the red badge
                    const badge = document.getElementById('badge-chat');
                    if (badge) {
                        badge.classList.remove('d-none');
                        badge.innerText = '•';
                    }
                    
                    // 2. Play a notification beep sound
                    playNotificationSound();
                    
                    // 3. Show Toast notification
                    if (typeof showToast === 'function') {
                        const lastMsg = resData.messages[resData.messages.length - 1];
                        if (lastMsg) {
                            showToast(`💬 ${lastMsg.senderName}: ${lastMsg.message || 'ส่งรูปภาพ/วิดีโอ'}`, 'info');
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Cloud chat pull error:", e);
    }
}

async function syncChatMessages() {
    if (isOfflineMode) return;

    const sheetUrl = localStorage.getItem('smart_farmer_sheet_url') || '';
    if (!sheetUrl) return; // No sheet URL set

    try {
        if (!window.SmartFarmerDB || !SmartFarmerDB.db) return;
        
        const allMessages = await SmartFarmerDB.getAll('chat_messages');
        const unsyncedMessages = allMessages.filter(m => m.isSynced === 0);

        if (unsyncedMessages.length === 0) return;

        console.log(`[Chat Engine] Syncing ${unsyncedMessages.length} messages to Google Sheet...`);

        const doFetch = (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : (u, o) => fetch(u, o);
        const MAX_CHAT_SYNC_ATTEMPTS = 5;

        for (let msg of unsyncedMessages) {
            // Format payload to Google Apps Script
            const payload = {
                action: 'save_chat',
                id: msg.id,
                timestamp: msg.timestamp,
                senderId: msg.senderId,
                senderName: msg.senderName,
                role: msg.role,
                message: msg.message,
                type: msg.type,
                mediaData: msg.mediaData, // base64
                targetGroup: msg.targetGroup
            };

            try {
                // Call App Script Web App (มี timeout กันค้าง)
                const response = await doFetch(sheetUrl, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                    body: JSON.stringify(payload)
                }, 30000);

                const text = await response.text();
                let ok = false;
                try {
                    const resData = JSON.parse(text);
                    ok = (resData.status === 'success' || resData.status === 'ok');
                } catch (_) { ok = false; } // ตอบไม่ใช่ JSON (หน้า HTML/error) = ยังไม่สำเร็จ

                if (ok) {
                    msg.isSynced = 1;
                    msg.syncAttempts = 0;
                } else {
                    msg.syncAttempts = (msg.syncAttempts || 0) + 1;
                    // เลิกส่งหลังพยายามหลายครั้ง กัน re-upload base64 media ซ้ำทุก 10 วิไม่รู้จบ
                    if (msg.syncAttempts >= MAX_CHAT_SYNC_ATTEMPTS) {
                        msg.isSynced = 2; // failed/ยกเลิก (ไม่ถูกดึงเป็น unsynced อีก)
                        console.warn(`[Chat Engine] เลิกส่งข้อความ ${msg.id} หลังพยายาม ${MAX_CHAT_SYNC_ATTEMPTS} ครั้ง`);
                    }
                }
                await SmartFarmerDB.put('chat_messages', msg);
            } catch (err) {
                // network/timeout: นับ attempt แล้วไปข้อความถัดไป (ไม่ให้ทั้ง batch ค้างเพราะข้อความเดียว)
                msg.syncAttempts = (msg.syncAttempts || 0) + 1;
                if (msg.syncAttempts >= MAX_CHAT_SYNC_ATTEMPTS) msg.isSynced = 2;
                try { await SmartFarmerDB.put('chat_messages', msg); } catch (_) {}
                console.warn(`[Chat Engine] ส่งข้อความ ${msg.id} ล้มเหลว (ครั้งที่ ${msg.syncAttempts}):`, err.message);
            }
        }

        // Re-render
        renderChatMessages();

    } catch (e) {
        console.error("Cloud chat sync error:", e);
    }
}

// 17. Play a browser-synthesized notification sound
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
        console.warn("AudioContext block:", e);
    }
}

// 18. Send fertilizer price announcement from staff helper tool
async function sendFertilizerAnnouncement() {
    const formulaSelect = document.getElementById('announcement-fert-formula');
    const priceInput = document.getElementById('announcement-fert-price');
    if (!formulaSelect || !priceInput) return;

    const formula = formulaSelect.value;
    const price = priceInput.value.trim();

    if (!price) {
        alert("⚠️ กรุณาระบุราคาปุ๋ยก่อนประกาศ");
        return;
    }

    const messageText = `ประกาศข่าวประชาสัมพันธ์ราคาแนะนำปุ๋ยเคมี: แม่ปุ๋ย/ปุ๋ยสูตรสำเร็จ [${formula}] ราคาแนะนำอยู่ที่กระสอบละ ${price} บาท สำหรับสัปดาห์นี้ครับ`;

    // Populate input and trigger send
    const textInput = document.getElementById('chat-text-input');
    if (textInput) {
        textInput.value = messageText;
        // Trigger chat form submit
        const chatForm = document.getElementById('chat-input-form');
        if (chatForm) {
            // Create a mock event to prevent page reload
            const mockEvent = { preventDefault: () => {} };
            await handleSendTextMessage(mockEvent);
        }
    }
    
    // Clear price input
    priceInput.value = '';
}
