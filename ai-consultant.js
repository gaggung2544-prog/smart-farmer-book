// Smart Farmer Book - AI Consultant Chatbot Module (Phase 4)

let aiChatContext = {};
let isAiVoiceMuted = false;

document.addEventListener('DOMContentLoaded', () => {
    // Expose functions to window
    window.openAIChat = openAIChat;
    window.closeAIChat = closeAIChat;
    window.toggleAiVoice = toggleAiVoice;
    window.startSpeechToText = startSpeechToText;
    window.saveGeminiConfig = saveGeminiConfig;
    
    const chatForm = document.getElementById('ai-chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', handleAiChatSubmit);
    }

    // Load Gemini API Key on startup
    const geminiApiKey = localStorage.getItem('smart_farmer_gemini_apikey') || '';
    const geminiInput = document.getElementById('settings-gemini-apikey');
    if (geminiInput) {
        geminiInput.value = geminiApiKey;
    }
});

function openAIChat() {
    const chatModal = document.getElementById('ai-chat-modal');
    if (chatModal) {
        chatModal.classList.remove('d-none');
        gatherContext();
        
        // Show initial welcome if chat is empty
        const chatMessages = document.getElementById('ai-chat-messages');
        if (chatMessages && chatMessages.children.length === 0) {
            let greeting = "สวัสดีครับ! ผมคือผู้ช่วย AI อัจฉริยะสำหรับ Smart Farmer ยินดีที่ได้รู้จักครับ ";
            if (aiChatContext.plotName) {
                greeting += `วันนี้มีอะไรให้ผมช่วยแนะนำเกี่ยวกับแปลง "${aiChatContext.plotName}" (อายุ ${aiChatContext.plotAgeMonths} เดือน, ดิน: ${aiChatContext.soilDetails ? aiChatContext.soilDetails.name : 'ดินร่วน'}) ไหมครับ? เรื่องการให้น้ำ การใส่ปุ๋ย หรือโรคแมลงถามมาได้เลย!`;
            } else {
                greeting += "วันนี้มีอะไรให้ผมช่วยแนะนำเกี่ยวกับการทำไร่อ้อยไหมครับ? ลองถามผมเรื่องการให้น้ำ การใส่ปุ๋ย หรือโรคและแมลงได้เลยครับ!";
            }
            appendAiMessage(greeting, true);
        }
    }
}

function closeAIChat() {
    const chatModal = document.getElementById('ai-chat-modal');
    if (chatModal) {
        chatModal.classList.add('d-none');
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
}

function gatherContext() {
    // Try to get current plot from dashboard filter
    const dashFilter = document.getElementById('dash-plot-filter');
    let currentPlotId = 'all';
    if (dashFilter && dashFilter.value !== 'all') {
        currentPlotId = dashFilter.value;
    }

    aiChatContext = {
        plotName: "",
        variety: "",
        area: "",
        soilType: "",
        plotAgeMonths: 0,
        weather: document.getElementById('dash-weather-status') ? document.getElementById('dash-weather-status').innerText : "อากาศปกติ"
    };

    // If there's a global plots array in app.js
    if (window.plots && Array.isArray(window.plots)) {
        let activePlot = window.plots.find(p => p.id === currentPlotId);
        if (!activePlot && window.plots.length > 0) activePlot = window.plots[0]; // fallback
        
        if (activePlot) {
            aiChatContext.plotName = activePlot.name || activePlot.quota || "ไม่ระบุชื่อ";
            aiChatContext.variety = activePlot.variety || "ไม่ระบุ";
            aiChatContext.area = activePlot.area || 0;
            aiChatContext.soilType = activePlot.soilType || "loam";
            
            const soilDataMap = {
                'loam': { name: 'ดินร่วน', ph: '6.0-7.5', om: 'สูง' },
                'sandy_loam': { name: 'ดินร่วนปนทราย', ph: '5.5-7.0', om: 'ปานกลาง' },
                'clay_loam': { name: 'ดินร่วนปนเหนียว', ph: '5.5-7.0', om: 'สูง' },
                'sandy': { name: 'ดินทรายจัด', ph: '4.5-5.5 (กรด)', om: 'ต่ำ' },
                'clay': { name: 'ดินเหนียวจัด', ph: 'เป็นด่าง', om: 'ปานกลาง' }
            };
            aiChatContext.soilDetails = soilDataMap[aiChatContext.soilType] || soilDataMap['loam'];
            
            // Calculate age
            if (activePlot.date) {
                const plantDate = new Date(activePlot.date);
                const now = new Date();
                const diffTime = Math.abs(now - plantDate);
                const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
                aiChatContext.plotAgeMonths = diffMonths;
            }
        }
    }
}

function toggleAiVoice() {
    isAiVoiceMuted = !isAiVoiceMuted;
    const btn = document.getElementById('btn-ai-voice-toggle');
    if (btn) {
        btn.innerHTML = isAiVoiceMuted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
        btn.style.opacity = isAiVoiceMuted ? '0.5' : '1';
    }
    if (isAiVoiceMuted && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

async function handleAiChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('ai-chat-input');
    const message = input.value.trim();
    if (!message) return;

    // 1. Add User Message
    appendUserMessage(message);
    input.value = '';

    // Log the AI question for user behavior learning and app development [NEW]
    if (typeof addSystemAuditLog === 'function') {
        addSystemAuditLog('ASK_AI', 'AI_CONSULTANT', 'ai_assistant', message)
            .catch(err => console.error("Error logging AI question:", err));
    }

    // 2. Show Typing Indicator
    showTypingIndicator();

    // 3. Try to call Gemini API if key is available, otherwise use mock
    const apiKey = localStorage.getItem('smart_farmer_gemini_apikey') || '';
    
    if (apiKey) {
        try {
            const response = await callGeminiAPI(message, aiChatContext, apiKey);
            hideTypingIndicator();
            appendAiMessage(response, true);
        } catch (error) {
            console.error("Gemini API Error:", error);
            hideTypingIndicator();
            const fallbackResponse = generateMockAiResponse(message, aiChatContext);
            appendAiMessage(`ขออภัย ระบบขัดข้องชั่วคราวในการเชื่อมต่อกับ AI หรือ API Key ของคุณไม่ถูกต้อง\n\n(ระบบจำลองคำตอบอัตโนมัติ):\n\n` + fallbackResponse, true);
        }
    } else {
        setTimeout(() => {
            hideTypingIndicator();
            const response = generateMockAiResponse(message, aiChatContext);
            appendAiMessage(response, true);
        }, 1200 + Math.random() * 800); // 1.2 - 2.0s delay
    }
}

async function callGeminiAPI(query, context, apiKey) {
    const systemPrompt = `คุณคือผู้ช่วย AI อัจฉริยะของแอป Smart Farmer Book สำหรับช่วยเหลือชาวไร่อ้อย
คุณมีความรู้ลึกซึ้งเกี่ยวกับการจัดการไร่อ้อย เช่น การเตรียมดิน การเลือกพันธุ์อ้อย การจัดการระบบน้ำ (โดยเฉพาะระบบน้ำหยด) การใส่ปุ๋ย และการป้องกันกำจัดโรคพืชและศัตรูพืช
จงให้คำแนะนำที่เป็นมิตร เข้าใจง่าย และใช้ภาษาพูดทั่วไปในการสื่อสารกับชาวไร่
ข้อกำหนด:
- ตอบเป็นภาษาไทยอย่างเป็นกันเองและให้เกียรติชาวไร่ (เช่น แทนตัวเองว่า "ผู้ช่วย AI" หรือ "หมออ้อย" และแทนผู้ใช้งานว่า "พี่น้องชาวไร่" หรือ "คุณ")
- อ้างอิงตามหลักวิชาการและแนวคิดเกษตรกรรมสมัยใหม่
- หากคำถามไม่เกี่ยวกับเรื่องอ้อยหรือการเกษตร ให้ตอบปฏิเสธอย่างสุภาพเพื่อรักษาขอบเขตการทำงานเฉพาะทาง`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // Construct context details
    let contextStr = "";
    if (context && context.plotName) {
        contextStr = `[ข้อมูลประกอบการพิจารณาคำตอบของแปลงชาวไร่รายนี้:
- ชื่อแปลง: ${context.plotName}
- พันธุ์อ้อย: ${context.variety || 'ไม่ระบุ'}
- ขนาดพื้นที่แปลง: ${context.area || 'ไม่ระบุ'} ไร่
- ลักษณะดิน: ${context.soilDetails ? context.soilDetails.name : 'ไม่ระบุ'} (pH: ${context.soilDetails ? context.soilDetails.ph : 'ไม่ระบุ'}, ปริมาณอินทรียวัตถุ: ${context.soilDetails ? context.soilDetails.om : 'ไม่ระบุ'})
- อายุอ้อยปัจจุบัน: ${context.plotAgeMonths} เดือน
- สภาพอากาศล่าสุด: ${context.weather || 'ปกติ'}]
\n`;
    }

    // Gather history from UI
    const messagesContainer = document.getElementById('ai-chat-messages');
    const history = [];
    if (messagesContainer) {
        const bubbles = messagesContainer.querySelectorAll('.chat-bubble');
        // Retrieve last 6 messages to keep context reasonable
        const startIdx = Math.max(0, bubbles.length - 6);
        for (let i = startIdx; i < bubbles.length; i++) {
            const bubble = bubbles[i];
            // Skip typing indicators or system error messages
            if (bubble.id === 'ai-typing-indicator' || bubble.innerText.startsWith('ขออภัย ระบบขัดข้อง')) continue;
            
            const isUser = bubble.classList.contains('chat-bubble-user');
            history.push({
                role: isUser ? "user" : "model",
                parts: [{ text: bubble.innerText }]
            });
        }
    }

    const payload = {
        contents: [
            { role: "user", parts: [{ text: contextStr + systemPrompt }] },
            ...history,
            { role: "user", parts: [{ text: query }] }
        ]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else {
            console.error("Gemini API Error:", data);
            return "ขออภัย ระบบไม่สามารถประมวลผลคำตอบได้ในขณะนี้";
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        return "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์ AI";
    }
}

function generateMockAiResponse(query, context) {
    const q = query.toLowerCase();
    
    // Check for common non-agriculture topics
    const nonAgKeywords = [
        'สวัสดี', 'ทักทาย', 'ชื่ออะไร', 'ทำอะไรได้บ้าง', 'ขอบคุณ', 'อากาศ', 'หนัง', 'เพลง'
    ];
    for (const key of nonAgKeywords) {
        if (q.includes(key)) {
            return `สวัสดีครับ! ผมคือผู้ช่วย AI อัจฉริยะสำหรับ Smart Farmer ยินดีที่ได้รู้จักครับ ผมสามารถให้คำแนะนำเกี่ยวกับการจัดการไร่อ้อย เช่น การให้น้ำ การใส่ปุ๋ย การจัดการดิน โรคและแมลง ลองสอบถามผมมาได้เลยครับ!`;
        }
    }
    
    // Check if query is about drip irrigation or watering
    if (q.includes('น้ำ') || q.includes('รดน้ำ') || q.includes('น้ำหยด') || q.includes('ชลประทาน')) {
        return `สำหรับการจัดการระบบน้ำในแปลง "${context.plotName || 'ไร่อ้อยของคุณ'}" ขอแนะนำให้ตรวจสอบความชื้นในดินอย่างสม่ำเสมอ หากเป็นระบบน้ำหยด ให้เปิดน้ำครั้งละ 2-3 ชั่วโมง ขึ้นอยู่กับสภาพอากาศ "${context.weather || 'ปกติ'}" เพื่อรักษาความชื้นให้เหมาะสมครับ`;
    }
    
    // Check if query is about soil improvement or soil quality
    if (q.includes('ดิน') || q.includes('ปรับปรุงดิน') || q.includes('คุณภาพดิน') || q.includes('ค่า ph')) {
        const soilName = context.soilDetails ? context.soilDetails.name : 'ดินร่วนปนทราย';
        let soilAdvice = `การจัดการสภาพดินสำหรับแปลง "${context.plotName || 'ไร่อ้อยของคุณ'}" ที่มีลักษณะเป็น ${soilName} แนะนำให้เพิ่มอินทรียวัตถุ เช่น ปุ๋ยหมัก หรือ ปุ๋ยคอก เพื่อเพิ่มความอุดมสมบูรณ์ครับ`;
        if (context.soilDetails && context.soilDetails.ph) {
            soilAdvice += ` และจากค่า pH ดิน แนะนำให้ปรับสภาพดินด้วยโดโลไมท์หากดินเป็นกรดครับ`;
        }
        return soilAdvice;
    }

    // Check if query is about fertilizer
    if (q.includes('ปุ๋ย') || q.includes('บำรุง') || q.includes('ธาตุอาหาร')) {
        if (context.plotAgeMonths <= 2) {
            return `อ้อยอายุ ${context.plotAgeMonths} เดือน ในแปลง "${context.plotName || 'ไร่อ้อยของคุณ'}" เป็นช่วงที่ต้องการการเจริญเติบโตของลำต้นและใบ แนะนำให้ใส่ปุ๋ยสูตร 16-8-8 หรือ 15-15-15 เพื่อเร่งการเจริญเติบโตครับ`;
        } else if (context.plotAgeMonths > 2 && context.plotAgeMonths <= 6) {
            return `อ้อยอายุ ${context.plotAgeMonths} เดือน กำลังเข้าสู่ช่วงย่างปล้อง แนะนำให้เสริมปุ๋ยไนโตรเจน (21-0-0) และโพแทสเซียม (0-0-60) เพื่อเพิ่มความแข็งแรงและการสะสมน้ำตาลครับ`;
        } else {
            return `อ้อยอายุ ${context.plotAgeMonths} เดือน เป็นช่วงที่ใกล้เก็บเกี่ยว แนะนำให้เน้นปุ๋ยโพแทสเซียม (0-0-60) เพื่อช่วยในการสะสมความหวาน (CCS) ครับ`;
        }
    }
    
    // Check if query is about pests/diseases
    if (q.includes('โรค') || q.includes('แมลง') || q.includes('หนอน') || q.includes('เพลี้ย') || q.includes('ใบด่าง')) {
        return `หากพบปัญหาโรคหรือแมลงในแปลง "${context.plotName || 'ไร่อ้อยของคุณ'}" แนะนำให้สำรวจแปลงอย่างสม่ำเสมอ หากพบหนอนกอหรือเพลี้ย แนะนำให้ใช้สารชีวภัณฑ์หรือปรึกษาเจ้าหน้าที่ส่งเสริมการเกษตรในพื้นที่เพื่อหาแนวทางป้องกันที่ถูกต้องครับ`;
    }

    // Check if query is about yield / harvest
    if (q.includes('ตัด') || q.includes('ผลผลิต') || q.includes('เก็บเกี่ยว') || q.includes('ตัน')) {
        return `สำหรับการประเมินผลผลิตอ้อยในแปลง "${context.plotName || 'ไร่อ้อยของคุณ'}" อ้อยที่เหมาะสมสำหรับการตัดควรมีอายุประมาณ 10-12 เดือน เพื่อให้ได้ค่าความหวาน (CCS) และน้ำหนักที่ดีที่สุด แนะนำให้ประเมินร่วมกับเจ้าหน้าที่โรงงานครับ`;
    }

    // General fallback
    return `ยินดีให้คำปรึกษาครับ! จากข้อมูลแปลง "${context.plotName || 'ไร่อ้อยของคุณ'}" ผมพร้อมให้คำแนะนำในด้านต่างๆ เช่น การให้น้ำ การใส่ปุ๋ย หรือการจัดการดิน ลองพิมพ์คำถามที่คุณสงสัยมาได้เลยครับ!`;
}

function appendUserMessage(text) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;
    const div = document.createElement('div');
    div.className = 'chat-bubble chat-bubble-user';
    div.textContent = text;
    messagesContainer.appendChild(div);
    scrollToBottom();
}

function appendAiMessage(text, shouldSpeak) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;
    const div = document.createElement('div');
    div.className = 'chat-bubble chat-bubble-ai';
    
    // Basic Markdown removal for speaking and formatting
    const cleanTextForSpeech = text.replace(/\*/g, '');
    
    // Render text with simple bolding if any
    div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    messagesContainer.appendChild(div);
    scrollToBottom();

    if (shouldSpeak && !isAiVoiceMuted && window.speakDynamicText) {
        window.speakDynamicText(cleanTextForSpeech);
    }
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;
    const div = document.createElement('div');
    div.id = 'ai-typing-indicator';
    div.className = 'chat-bubble chat-bubble-ai typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesContainer.appendChild(div);
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// ================= STT (Speech To Text) =================
let recognition;
let isRecording = false;

function startSpeechToText() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("ขออภัย บราวเซอร์ของคุณไม่รองรับการสั่งงานด้วยเสียง โปรดใช้งานผ่าน Google Chrome หรือ Safari");
        return;
    }

    if (isRecording) {
        if(recognition) recognition.stop();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const micBtn = document.getElementById('btn-ai-mic');
    const input = document.getElementById('ai-chat-input');

    recognition.onstart = function() {
        isRecording = true;
        if(micBtn) micBtn.style.color = '#ef4444'; // Red when active
        if(input) input.placeholder = "กำลังฟัง...";
    };

    recognition.onresult = function(event) {
        const speechResult = event.results[0][0].transcript;
        if(input) {
            input.value = speechResult;
        }
    };

    recognition.onerror = function(event) {
        console.error("Speech recognition error", event.error);
        if(input) input.placeholder = "พิมพ์ข้อความที่นี่...";
    };

    recognition.onend = function() {
        isRecording = false;
        if(micBtn) micBtn.style.color = 'var(--text-secondary)';
        if(input && !input.value) input.placeholder = "พิมพ์ข้อความที่นี่...";
    };

    recognition.start();
}

function saveGeminiConfig() {
    const geminiInput = document.getElementById('settings-gemini-apikey');
    if (geminiInput) {
        const key = geminiInput.value.trim();
        localStorage.setItem('smart_farmer_gemini_apikey', key);
        alert('บันทึก API Key สำเร็จแล้ว!');
    }
}
