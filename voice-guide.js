// Smart Farmer Book - Voice Guide Module (Phase 5)

const FARMER_VOICES = {
    th: {
        'onboarding-0': "หน้าขึ้นทะเบียนแปลงอ้อย เพียงกรอกข้อมูลโควตา ขนาดแปลง และพิกัด ก็แจ้งปลูกเสร็จสิ้นในสองขั้นตอนครับ",
        'onboarding-1': "ระบบวิเคราะห์ชนิดดินของท่านและแนะนำสูตรปุ๋ยเคมีบำรุงที่แม่นยำที่สุดตามขนาดพื้นที่จริงครับ",
        'onboarding-2': "สไลเดอร์เพื่อประเมินผลผลิตอ้อยต่อไร่ คาดการณ์รายรับและกำไรสุทธิล่วงหน้าแบบเรียลไทม์ครับ",
        'onboarding-3': "วิเคราะห์การสูญเสียระหว่างขนส่ง เปรียบเทียบน้ำหนักต้นทางกับโรงงานเพื่อหาอัตราการหดหายของอ้อยครับ",
        'screen-dashboard': "หน้าสรุปข้อมูลไร่อ้อยของท่าน แสดงกำไรและอัตราการคืนทุนรายแปลงครับ",
        'screen-register': "หน้าทะเบียนแปลงปลูกอ้อยของท่าน สามารถเพิ่มแปลงใหม่และเช็คสถานะแปลงได้ที่นี่ครับ",
        'screen-support': "หน้ายื่นคำขอรับการสนับสนุนทุนและปัจจัยการผลิตอ้อยของท่านครับ",
        'screen-estimate': "หน้าจำลองความหนาแน่นและส่วนสูงอ้อยเพื่อประเมินผลผลิตรายไร่ครับ",
        'screen-cost': "หน้าบันทึกต้นทุนและวิเคราะห์งบดุลเปรียบเทียบระหว่างงบประมาณกับรายจ่ายจริงครับ",
        'screen-harvest': "หน้าบันทึกการตัดส่งอ้อยเข้าโรงงานและตรวจสอบน้ำหนักหดหายระหว่างเดินทางครับ",
        'screen-pest': "ระบบวินิจฉัยโรคอ้อยและแมลงศัตรูพืชเบื้องต้น พร้อมสูตรยารักษาด่วนครับ",
        'warn-area': "คำเตือน ขนาดพื้นที่แปลงปลูกอ้อยมีขนาดใหญ่มาก เกิน 150 ไร่ กรุณาตรวจสอบความถูกต้องของตัวเลขด้วยครับ",
        'err-phone': "ข้อผิดพลาด กรุณากรอกเบอร์โทรศัพท์มือถือของไทยให้ถูกต้อง ครบ 10 หลักครับ",
        'warn-cost': "คำเตือน ต้นทุนต่อไร่อยู่นอกเกณฑ์เฉลี่ยปกติ สองพันถึงสองหมื่นห้าพันบาท กรุณาตรวจสอบตัวเลขอีกครั้งครับ",
        'warn-ccs': "คำเตือน ระดับความหวานอยู่นอกเกณฑ์ปกติ เจ็ดถึงสิบเจ็ดซีซีเอส กรุณาตรวจสอบตัวเลขอีกครั้งครับ",
        'warn-yield': "คำเตือน ปริมาณผลผลิตต่อไร่อยู่นอกเกณฑ์ปกติ สองถึงยี่สิบห้าตันต่อไร่ กรุณาตรวจสอบอีกครั้งครับ",
        'warn-shrinkage': "คำเตือน ปริมาณอ้อยระเหยสูญหายเกินยี่สิบห้าเปอร์เซ็นต์ สูงเกินเกณฑ์ปกติ กรุณาตรวจสอบความล่าช้าในการขนส่งครับ",
        'save-settings': "บันทึกการตั้งค่าระบบเรียบร้อยแล้วครับ",
        'login-welcome': "ยินดีต้อนรับเข้าสู่สมุดดิจิทัลชาวไร่ครับ"
    },
    esan: {
        'onboarding-0': "หน้าแจ้งปลูกด่วนเด้อจ้า แค่เลือกสายพันธุ์ ป้อนพื้นที่ แล้วก็ดึงพิกัดก็ลงทะเบียนอ้อยเรียบร้อยแล้วจ้า",
        'onboarding-1': "ระบบสิช่วยเบิ่งชนิดดินของแปลงเจ้า แล้วแนะนำสูตรปุ๋ยเคมี บำรุงอ้อยให้งดงาม ตรงตามความต้องการของดินเด้อครับ",
        'onboarding-2': "ปุ่มเลื่อนจำลองผลผลิตจ้า เลื่อนตามขนาดลำอ้อยจริงเพื่อเบิ่งว่าปีนี้สิได้เงินเท่าใด คาดการณ์กำไรสะสมล่วงหน้าเด้อจ้า",
        'onboarding-3': "เปรียบเทียบน้ำหนักอ้อยตอนอยู่แปลง กับโรงงาน เพื่อเช็คว่าน้ำหนักหายไปเท่าใดเด้อครับเด้อ ซอยป้องกันเงินหล่นหายจ้า",
        'screen-dashboard': "หน้าสรุปข้อมูลไร่อ้อยเด้อจ้า แสดงยอดกำไรกับอัตราผลตอบแทนของแปลงเจ้าหม่องนี้เด้อครับ",
        'screen-register': "หน้าลงทะเบียนแปลงอ้อยเด้อจ้า เจ้าสามารถมาเพิ่มแปลงใหม่ หรือเบิ่งรายละเอียดแปลงปลูกของเจ้าได้หม่องนี้เด้อครับ",
        'screen-support': "หน้าขอทุนส่งเสริมและปุ๋ยสนับสนุนเด้อครับ มาส่งคำขอทุนอ้อยหม่องนี้ได้เลยเด้อจ้า",
        'screen-estimate': "หน้าคำนวณและประเมินผลผลิตอ้อยเด้อครับ มาสุ่มนับลำ เลื่อนเบิ่งยอดผลผลิตกับกำไรสุทธิล่วงหน้าได้เลยเด้อ",
        'screen-cost': "หน้าคำนวณต้นทุนและวิเคราะห์งบดุลเด้อจ้า มาเบิ่งกราฟเปรียบเทียบงบประมาณการกับที่จ่ายจริงหม่องนี้ได้เลยเด้อ",
        'screen-harvest': "หน้าบันทึกเก็บเกี่ยวส่งอ้อยเด้อครับ ป้อนน้ำหนักชั่งสามจุดเพื่อเช็คค่าระเหยความชื้นและความหวานเด้อจ้า",
        'screen-pest': "หน้าวินิจฉัยโรคอ้อยและแมลงศัตรูพืชจ้า ติ๊กอาการที่พบเพื่อเบิ่งสูตรยารักษาโรคอ้อยได้ทันทีเลยเด้อครับ",
        'warn-area': "คำเตือนเด้อจ้า พื้นที่แปลงปลูกอ้อยกว้างขวางใหญ่เป็นพิเศษ เกิน 150 ไร่ เด้อจ้า ลองเช็คเบิ่งว่าบ่แม่นหน่วยตารางวาเด้อครับ",
        'err-phone': "ข้อมูลบ่ถูกต้องเด้อจ้า กรุณากรอกเบอร์โทรศัพท์ของไทยให้ถูกต้อง ครบ 10 หลักเด้อครับเด้อ",
        'warn-cost': "คำเตือนเด้อจ้า ต้นทุนต่อไร่ที่กรอกมันสูงหรือต่ำผิดปกติเด้อจ้า ลองเช็คตัวเลขเบิ่งอีกรอบแหน่เด้อ",
        'warn-ccs': "คำเตือนเด้อจ้า ระดับความหวานอ้อยมันแปลกๆ เด้อจ้า เกณฑ์ปกติจะอยู่ระหว่างเจ็ดถึงสิบเจ็ดซีซีเอส ลองเช็คเบิ่งเด้อ",
        'warn-yield': "คำเตือนเด้อจ้า ยอดผลผลิตต่อไร่หลุดเกณฑ์ปกติเด้อจ้า ลองตรวจเช็คน้ำหนักอ้อยหรือพื้นที่ดีๆ แหน่เด้อครับ",
        'warn-shrinkage': "คำเตือนเด้อครับ อ้อยแห้งน้ำหนักระเหยหายไปเกินยี่สิบห้าเปอร์เซ็นต์เด้อจ้า อ้อยอาจค้างลานดลเกินไป ลองเช็คเบิ่งเด้อครับ",
        'save-settings': "บันทึกข้อมูลตั้งค่าระบบเรียบร้อยแล้วเด้อครับ",
        'login-welcome': "ยินดีต้อนรับเข้าสู่สมุดดิจิทัลชาวไร่เด้อครับเด้อ"
    }
};

// Pre-load voices on startup to cache them
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }
}

// Global speech unlocked flag to avoid iOS queue blockage from autoplay
let isSpeechUnlocked = false;

// Unlock Speech Synthesis on mobile devices upon first user interaction
const unlockMobileSpeech = () => {
    if (window.speechSynthesis) {
        try {
            const u = new SpeechSynthesisUtterance(' ');
            u.volume = 0.0001;
            window.speechSynthesis.speak(u);
            isSpeechUnlocked = true;
            console.log("SpeechSynthesis unlocked successfully on user gesture.");
        } catch (e) {
            console.warn("Mobile speech unlock failed:", e);
        }
    } else {
        isSpeechUnlocked = true;
    }
    document.removeEventListener('click', unlockMobileSpeech, { capture: true });
    document.removeEventListener('touchstart', unlockMobileSpeech, { capture: true });
};

document.addEventListener('click', unlockMobileSpeech, { capture: true });
document.addEventListener('touchstart', unlockMobileSpeech, { capture: true });

let currentVoiceUtterance = null;

function playFarmerVoice(textKey) {
    if (!isSpeechUnlocked) {
        console.warn(`playFarmerVoice('${textKey}') ignored because speech is not unlocked yet.`);
        return;
    }

    const setting = localStorage.getItem('smart_farmer_voice_setting') || 'esan';
    if (setting === 'off') {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        return;
    }
    
    const dictionary = FARMER_VOICES[setting];
    if (!dictionary || !dictionary[textKey]) {
        return;
    }
    
    const textToSpeak = dictionary[textKey];
    
    if (window.speechSynthesis) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        if (!isIOS) {
            window.speechSynthesis.cancel();
        }
        
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = 'th-TH';
        utterance.rate = 0.78;
        utterance.pitch = 0.92;
        utterance.volume = 1.0;
        
        const voices = window.speechSynthesis.getVoices();
        const thaiVoices = voices.filter(v => v.lang.includes('th-TH') || v.lang.includes('th'));
        let selectedVoice = thaiVoices.find(v => v.name.includes('Kanya')) ||
                            thaiVoices.find(v => v.name.toLowerCase().includes('enhanced')) ||
                            thaiVoices.find(v => v.name.toLowerCase().includes('premium')) ||
                            thaiVoices[0];
                            
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        
        currentVoiceUtterance = utterance;
        window.speechSynthesis.speak(utterance);
    }
}

function speakPestRecipe() {
    const checkedInputs = document.querySelectorAll('.pest-symptom-input:checked');
    if (checkedInputs.length === 0) {
        alert("⚠️ กรุณาเลือกอาการผิดปกติก่อนฟังเสียงสูตรยา");
        return;
    }
    
    const setting = localStorage.getItem('smart_farmer_voice_setting') || 'esan';
    if (setting === 'off') {
        alert("🔊 โปรดเปิดการใช้งานเสียงแนะนำในเมนูตั้งค่าก่อน");
        return;
    }
    
    const voiceScripts = {
        th: {
            'shoot-dead': "พบหนอนกออ้อยระบาดในแปลงครับ แนะนำให้ฉีดพ่นสารเคมี คลอแรนทรานิลิโพรล อัตรา ยี่สิบ มิลลิลิตร ต่อน้ำ ยี่สิบ ลิตร พ่นเมื่อเริ่มพบยอดเหี่ยว หรือปล่อยแตนเบียนไข่ทริคโคแกรมม่า อัตรา สองหมื่น ตัวต่อไร่ ทุกสิบห้าวัน ในช่วงสองสามเดือนแรกครับ",
            'leaf-white': "พบโรคใบขาวอ้อยซึ่งเป็นโรคที่วิกฤตครับ ไม่มีสารเคมีรักษาโดยตรง แนะนำให้ขุดถอนกออ้อยที่ขาวซีดออกไปเผาทำลายนอกแปลงทันที และฉีดพ่นสาร ไดโนทีฟูแรน อัตรา สิบห้า กรัม ต่อน้ำ ยี่สิบ ลิตร เพื่อกำจัดเพลี้ยจักจั่นลายจุดซึ่งเป็นแมลงพาหะครับ",
            'leaf-red-rot': "พบโรคเหี่ยวเน่าแดงระบาดในแปลงครับ แนะนำให้ฉีดพ่นสารคาร์เบนดาซิม อัตรา ยี่สิบ กรัม ต่อน้ำ ยี่สิบ ลิตร หรือสารไดฟีโนโคนาโซล อัตรา สิบห้า มิลลิลิตร ต่อน้ำ ยี่สิบ ลิตร และหลีกเลี่ยงการปล่อยน้ำไหลผ่านจากแปลงที่เกิดโรคครับ",
            'root-eaten': "พบด้วงหนวดยาวอ้อยเข้าทำลายใต้ดินครับ แนะนำให้พ่นสารเคมี ฟิโพรนิล อัตรา แปดสิบ มิลลิลิตร ต่อน้ำ ยี่สิบ ลิตร พ่นโคนกออ้อยรอบแนวระบาดแล้วพรวนกลบหน้าดินทันที และในการเตรียมดินรอบถัดไปให้ไถตากดินลึก สามสิบ เซนติเมตร นานสองสัปดาห์ครับ"
        },
        esan: {
            'shoot-dead': "พบหนอนกออ้อยระบาดในแปลงเด้อครับ แนะนำให้ฉีดพ่นสารเคมี คลอแรนทรานิลิโพรล ซาว มิลลิลิตร ผสมน้ำ ซาว ลิตร พ่นตอนเริ่มเห็นยอดอ้อยเหี่ยวแห้ง หรือสิปล่อยแตนเบียนไข่ทริคโคแกรมม่า สองหมื่น ตัวต่อไร่ ทุกๆ สิบห้าวัน ในช่วงอ้อยน้อย หนึ่งถึงสามเดือนเด้อครับเด้อ",
            'leaf-white': "พบโรคใบขาวอ้อยอันตรายคักเด้อครับ โรคนี้บ่มียารักษาโดยตรงเด้อ ถ้าเห็นกอขาวๆ ให้ขุดไปเผาทำลายนอกแปลงทันทีจ้า แล้วพ่นสาร ไดโนทีฟูแรน สิบห้า กรัม ผสมน้ำ ซาว ลิตร เพื่อขจัดเพลี้ยจักจั่นลายจุดที่เป็นแมลงพาหะเด้อครับเด้อ",
            'leaf-red-rot': "พบโรคเหี่ยวเน่าแดงในแปลงจ้า แนะนำให้พ่นสารคาร์เบนดาซิม ซาว กรัม ผสมน้ำ ซาว ลิตร หรือสิใช้ ไดฟีโนโคนาโซล สิบห้า มิลลิลิตร ผสมน้ำ ซาว ลิตร และหลีกเลี่ยงการปล่อยน้ำไหลผ่านไปแปลงอื่นเด้อจ้าเด้อ",
            'root-eaten': "พบด้วงหนวดยาวอ้อยกัดรากใต้ดินจ้า แนะนำให้พ่นสารเคมี ฟิโพรนิล แปดสิบ มิลลิลิตร ผสมน้ำ ซาว ลิตร พ่นโคนกออ้อยหม่องระบาดแล้วฝังกลบดินทันทีเด้อจ้า และเตรียมดินรอบหน้าให้ไถตากดินลึก สามสิบ เซนติเมตร สองอาทิตย์เด้อครับ"
        }
    };
    
    let combinedText = "";
    checkedInputs.forEach((input, index) => {
        const script = voiceScripts[setting][input.value];
        if (script) {
            combinedText += (index > 0 ? " และ " : "") + script;
        }
    });
    
    if (combinedText && window.speechSynthesis) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (!isIOS) {
            window.speechSynthesis.cancel();
        }
        
        const utterance = new SpeechSynthesisUtterance(combinedText);
        utterance.lang = 'th-TH';
        utterance.rate = 0.78;
        utterance.pitch = 0.92;
        utterance.volume = 1.0;
        
        const voices = window.speechSynthesis.getVoices();
        const thaiVoices = voices.filter(v => v.lang.includes('th-TH') || v.lang.includes('th'));
        let selectedVoice = thaiVoices.find(v => v.name.includes('Kanya')) ||
                            thaiVoices.find(v => v.name.toLowerCase().includes('enhanced')) ||
                            thaiVoices.find(v => v.name.toLowerCase().includes('premium')) ||
                            thaiVoices[0];
                            
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        window.speechSynthesis.speak(utterance);
    }
}

function cancelSpeaking() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

function runSpeechDiagnostics() {
    if (!window.speechSynthesis) {
        alert("❌ เบราว์เซอร์หรืออุปกรณ์นี้ ไม่รองรับระบบสังเคราะห์เสียงพูด (Speech Synthesis API)");
        return;
    }
    
    const voices = window.speechSynthesis.getVoices();
    const thaiVoices = voices.filter(v => v.lang.includes('th-TH') || v.lang.includes('th'));
    
    let report = "📊 ผลการตรวจสอบระบบออกเสียง (TTS Diagnostics):\n";
    report += `• จำนวนเสียงในระบบทั้งหมด: ${voices.length} เสียง\n`;
    report += `• เสียงภาษาไทยที่ตรวจพบ: ${thaiVoices.length} เสียง\n`;
    report += `• สถานะการปลดล็อก (Unlocked): ${isSpeechUnlocked ? 'เปิดแล้ว (Unlocked)' : 'ล็อกอยู่ (Locked)'}\n`;
    report += `• ข้อมูลระบบปฏิบัติการ (User Agent): ${navigator.userAgent}\n`;
    report += "\nกำลังส่งสัญญาณเสียงทดสอบสั้นๆ...\n";
    
    try {
        if (!isSpeechUnlocked) {
            const unlockUtterance = new SpeechSynthesisUtterance(' ');
            unlockUtterance.volume = 0.0001;
            window.speechSynthesis.speak(unlockUtterance);
            isSpeechUnlocked = true;
        }
        
        const testText = "ทดสอบระบบเสียงภาษาไทยของแอปพลิเคชัน สมุดดิจิทัลชาวไร่ ได้ยินเสียงนี้แสดงว่าระบบพร้อมใช้งานแล้วครับ";
        const utterance = new SpeechSynthesisUtterance(testText);
        utterance.lang = 'th-TH';
        utterance.rate = 0.78;
        utterance.pitch = 0.92;
        utterance.volume = 1.0;
        
        let selectedVoice = thaiVoices.find(v => v.name.includes('Kanya')) ||
                            thaiVoices.find(v => v.name.toLowerCase().includes('enhanced')) ||
                            thaiVoices.find(v => v.name.toLowerCase().includes('premium')) ||
                            thaiVoices[0];
                            
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        
        utterance.onstart = () => {
            alert(report + "\n📢 กำลังออกเสียงทดสอบตัวอย่าง! หากคุณไม่ได้ยินเสียง โปรดตรวจสอบ:\n1. สวิตช์ปิดเสียงข้างตัวเครื่อง (โดยเฉพาะบน iPhone)\n2. ระดับเสียงหลักของปุ่มด้านข้างเครื่อง\n3. ให้แน่ใจว่าเปิดแอปด้วยเบราว์เซอร์ Chrome หรือ Safari หลัก");
        };
        
        utterance.onerror = (err) => {
            alert(report + `\n❌ เกิดข้อผิดพลาดจาก API ของเบราว์เซอร์: ${err.error}\n(โปรดรีเฟรชหน้าเว็บหรือเปิดในแอปเบราว์เซอร์มาตรฐานแทน)`);
        };
        
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        alert(report + `\n❌ เกิดข้อผิดพลาดในฝั่งคำสั่งโค้ด: ${e.message}`);
    }
}

function checkWebViewSpeechWarning() {
    const isSupported = !!window.speechSynthesis;
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isWebView = /Line\/|FBAN|FBAV|Instagram|WebView|wv/i.test(ua);
    
    const loginWarning = document.getElementById('login-webview-warning');
    const settingsWarning = document.getElementById('settings-webview-warning');
    
    if (!isSupported) {
        if (loginWarning) {
            const icon = document.getElementById('login-webview-warning-icon');
            const text = document.getElementById('login-webview-warning-text');
            if (icon) icon.textContent = "❌";
            if (text) {
                text.innerHTML = `<strong>อุปกรณ์นี้ไม่รองรับระบบเสียงพูดของเบราว์เซอร์ (Speech Synthesis API)</strong><br>` +
                    `โปรดแน่ใจว่าเปิดใช้งานในแอป Chrome หรือ Safari หลักเท่านั้น ไม่ควรเปิดผ่าน LINE/Facebook`;
            }
            loginWarning.classList.remove('d-none');
        }
        return;
    }
    
    if (isWebView) {
        if (loginWarning) {
            loginWarning.classList.remove('d-none');
        }
        if (settingsWarning) {
            settingsWarning.classList.remove('d-none');
        }
    } else {
        if (loginWarning) loginWarning.classList.add('d-none');
        if (settingsWarning) settingsWarning.classList.add('d-none');
    }
}
