/**
 * ==============================================================================
 * คู่มือขั้นตอนการเชื่อมต่อฐานข้อมูลแอปพลิเคชันเข้ากับ GOOGLE SHEET + GOOGLE DRIVE
 * ==============================================================================
 * 
 * ขั้นตอนที่ 1: เปิดส่วนของ Apps Script บนชีตเดิมของคุณ
 *   - ไปที่หน้า Google Sheet "ฐานข้อมูล Smart Farmer Book"
 *   - คลิกที่เมนู "ส่วนขยาย" (Extensions) -> "Apps Script"
 * 
 * ขั้นตอนที่ 2: วางโค้ดใหม่นี้แทนที่โค้ดเดิม
 *   - คัดลอกโค้ดด้านล่างทั้งหมดนี้ไปวางทับโค้ดเดิมในหน้าต่างแก้ไขรหัส.gs
 *   - กดปุ่มบันทึกโครงการ (รูปแผ่นดิสก์ 💾) ด้านบน
 * 
 * ขั้นตอนที่ 3: ทำการเผยแพร่อัปเดตเวอร์ชันเว็บแอป (Deploy) ⚠️ สำคัญมาก
 *   - คลิกที่ปุ่ม "การทำให้ใช้งานได้" (Deploy) ที่มุมขวาบน -> เลือก "จัดการการทำให้ใช้งานได้" (Manage deployments)
 *   - คลิกที่ไอคอนรูปดินสอ ✏️ (แก้ไข) ข้างรายการเว็บแอปเดิมของคุณ
 *   - ที่หัวข้อ "เวอร์ชัน" (Version) ให้เปลี่ยนเลือกเป็น **"เวอร์ชันใหม่" (New version)**
 *   - ตรวจสอบว่า "ผู้ที่มีสิทธิ์เข้าถึง" (Who has access) ยังเป็น **"ทุกคน" (Anyone)**
 *   - กดปุ่ม "การทำให้ใช้งานได้" (Deploy)
 *   - ลิงก์เชื่อมโยงในแอปบนมือถือจะใช้ลิงก์เดิมได้ทันที ไม่ต้องนำไปกรอกใหม่
 * 
 */

// ฟังก์ชันสร้าง CORS Response สำหรับ Preflight OPTIONS request
function createCORSResponse(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON);
}

// ฟังก์ชันรับข้อมูลผ่าน GET (fallback สำหรับกรณี POST มีปัญหา CORS)
// ส่งข้อมูล JSON ผ่าน query parameter ?p=<JSON encoded>
// ฟังก์ชันรับข้อมูลผ่าน GET (fallback สำหรับกรณี POST มีปัญหา CORS)
// ส่งข้อมูล JSON ผ่าน query parameter ?p=<JSON encoded> หรือ ?action=summary
function doGet(e) {
  // ตรวจสอบว่าเป็นคำขอดึงข้อมูลสรุป (action=summary) หรือไม่
  if (e && e.parameter && e.parameter.action === "summary") {
    return handleSummaryRequest();
  }
  if (e && e.parameter && e.parameter.action === "getAll") {
    return getAllPlots();
  }
  if (e && e.parameter && e.parameter.action === "pullAll") {
    return pullAllData();
  }
  
  // ถ้ามี parameter 'p' หมายความว่าเป็นการส่งข้อมูล
  if (e && e.parameter && e.parameter.p) {
    try {
      var rawP = e.parameter.p;
      var decodedP;
      try {
        decodedP = decodeURIComponent(rawP);
      } catch(uriErr) {
        // Fallback if decodeURIComponent throws URIError because the parameter is already decoded by Google
        decodedP = rawP;
      }
      var data = JSON.parse(decodedP);
      return processData(data);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error", message: "Invalid JSON in parameter: " + err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  // ถ้าไม่มี parameter ส่งคืนข้อความสถานะปกติ
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok", message: "Smart Farmer Book API is running! (v3 - CORS ready)" })
  ).setMimeType(ContentService.MimeType.JSON);
}

function getAllPlots() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
                  .getSheetByName('REGISTRATION') || SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลแปลงอ้อย');
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();                    // แถวแรก = หัวคอลัมน์

  const plots = values
    .filter(row => row[0] !== '')                    // ข้ามแถวว่าง
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        // แปลงค่าที่เก็บเป็น JSON กลับเป็น object/array (customPrices ฯลฯ)
        if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
          try { v = JSON.parse(v); } catch (err) {}
        }
        obj[h] = v;
      });
      return obj;
    });

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'success', plots: plots }))
    .setMimeType(ContentService.MimeType.JSON);
}

function pullAllData() {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch(err) {
    console.warn("Could not get active spreadsheet: " + err.toString());
  }
  if (!ss) {
    var sheetId = "1ckLwOvgc8gMloGaj9rpoJ2keH0Ivt0c2l6SX_2g4N9o";
    ss = SpreadsheetApp.openById(sheetId);
  }
  
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
  
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'success', plots: plotsList, pestReports: pestsList }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ฟังก์ชันดึงข้อมูลสรุปจากชีตหลังบ้านทั้งหมดเพื่อนำไปวิเคราะห์แบบ Real-time
function handleSummaryRequest() {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch(err) {
    console.warn("Could not get active spreadsheet: " + err.toString());
  }
  if (!ss) {
    var sheetId = "1ckLwOvgc8gMloGaj9rpoJ2keH0Ivt0c2l6SX_2g4N9o";
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch(e) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "error", 
        message: "ไม่สามารถเปิดไฟล์ Google Sheet ได้: " + e.toString() 
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
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
          var plotId = row[idxId];
          var yieldVal = parseFloat(row[idxExpYield]) || 0;
          latestEst[plotId] = yieldVal;
        }
        for (var pId in latestEst) {
          summary.totalExpectedYield += latestEst[pId];
        }
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
          var plotId = row[idxId];
          var costVal = parseFloat(row[idxTotalCost]) || 0;
          latestCost[plotId] = costVal;
        }
        for (var pId in latestCost) {
          summary.totalCost += latestCost[pId];
        }
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
          var plotId = row[idxId];
          var yieldVal = parseFloat(row[idxActualYield]) || 0;
          latestHarv[plotId] = yieldVal;
        }
        for (var pId in latestHarv) {
          summary.totalActualYield += latestHarv[pId];
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(summary))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "เกิดข้อผิดพลาดในการคำนวณข้อมูลสรุป: " + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันสำหรับรับข้อมูลที่ส่งมาจากแอปพลิเคชันแบบ POST
function doPost(e) {
  try {
    // ดึงและแปลงข้อมูลดิบที่เป็น JSON (รองรับทั้ง application/json และ text/plain)
    var jsonString = e.postData ? e.postData.contents : (e.parameter ? e.parameter.p : '');
    var data = JSON.parse(jsonString);

    // === AI วินิจฉัยศัตรูพืช/โรคอ้อยจากรูปภาพ (Claude Vision) ===
    if (data && data.action === "aiPestVision") {
      return handleAIPestVision(data);
    }

    // === AI ผู้ช่วยสนทนาที่ปรึกษาอ้อย (Claude Chat) ===
    if (data && data.action === "aiChat") {
      return handleAIChat(data);
    }

    // === LINE Login: ยืนยันตัวตน + ผูกบัญชีกับเลขโควตา (ฟรี ไม่มีค่า SMS) ===
    if (data && data.action === "lineVerify") {
      return handleLineVerify(data);
    }
    if (data && data.action === "lineLink") {
      return handleLineLink(data);
    }

    return processData(data);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ==============================================================================
 * AI วินิจฉัยศัตรูพืช/โรคอ้อยจากรูปภาพ ด้วย Google Gemini Vision API (ฟรี)
 * ------------------------------------------------------------------------------
 * วิธีตั้งค่า (ทำครั้งเดียว):
 *   1. ขอคีย์ฟรีที่ https://aistudio.google.com/apikey (ไม่ต้องใส่บัตร)
 *   2. ใน Apps Script เมนู Project Settings > Script Properties
 *   3. เพิ่ม Property: GEMINI_API_KEY = <คีย์ที่ขึ้นต้น AQ... หรือ AIza...>
 *   4. (ทางเลือก) GEMINI_MODEL = gemini-2.0-flash  (ค่าเริ่มต้น ฟรี รองรับรูปภาพ)
 *      แชตใช้ GEMINI_CHAT_MODEL แยกได้ถ้าต้องการ
 * คีย์ถูกเก็บฝั่งเซิร์ฟเวอร์เท่านั้น ไม่เคยส่งไปหน้าเว็บ/แอป
 * ==============================================================================
 */
function handleAIPestVision(data) {
  function jsonOut(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonOut({
        status: "error",
        code: "no_api_key",
        message: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Script Properties"
      });
    }
    var model = props.getProperty("GEMINI_MODEL") || "gemini-2.0-flash";

    // แยกส่วนหัว data URL ออก เหลือเฉพาะ base64 และตรวจชนิดไฟล์
    var rawImage = (data.image || "").toString();
    var mediaType = "image/jpeg";
    var base64Data = rawImage;
    var m = rawImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (m) {
      mediaType = m[1];
      base64Data = m[2];
    }
    if (!base64Data) {
      return jsonOut({ status: "error", code: "no_image", message: "ไม่พบข้อมูลรูปภาพ" });
    }

    // อาการ/โรคที่ผู้ใช้สงสัย (ส่งเป็น context เสริม ถ้ามี)
    var hint = (data.suspected && data.suspected !== "none") ? data.suspected : "";

    var promptText =
      "คุณเป็นผู้เชี่ยวชาญโรคและศัตรูพืชอ้อยของไทย วิเคราะห์รูปใบ/ลำ/กออ้อยในภาพนี้ " +
      "แล้วตอบเป็น JSON ตามสคีมาที่กำหนด\n" +
      "ค่า diagnosisKey เลือกได้เฉพาะ: " +
      "\"shoot-dead\" (หนอนกออ้อย), \"leaf-white\" (โรคใบขาว), " +
      "\"leaf-red-rot\" (โรคเหี่ยวเน่าแดง), \"root-eaten\" (ด้วงหนวดยาว), " +
      "\"healthy\" (ปกติดี ไม่พบโรค), \"unknown\" (ไม่สามารถระบุได้จากภาพ)\n" +
      "diseaseName = ชื่อโรค/ศัตรูพืชภาษาไทย, confidence = 0-100 (ความเชื่อมั่น), " +
      "severity = หนึ่งใน \"ต่ำ\"/\"ปานกลาง\"/\"สูง\", " +
      "advice = คำแนะนำการจัดการสั้นๆ 1-2 ประโยคภาษาไทย" +
      (hint ? ("\nหมายเหตุ: เกษตรกรสงสัยว่าเป็น \"" + hint + "\" ใช้ประกอบการพิจารณาแต่ยึดสิ่งที่เห็นในภาพเป็นหลัก") : "");

    var payload = {
      contents: [{
        role: "user",
        parts: [
          { inline_data: { mime_type: mediaType, data: base64Data } },
          { text: promptText }
        ]
      }],
      generationConfig: {
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            diagnosisKey: {
              type: "STRING",
              enum: ["shoot-dead", "leaf-white", "leaf-red-rot", "root-eaten", "healthy", "unknown"]
            },
            diseaseName: { type: "STRING" },
            confidence: { type: "NUMBER" },
            severity: { type: "STRING", enum: ["ต่ำ", "ปานกลาง", "สูง"] },
            advice: { type: "STRING" }
          },
          required: ["diagnosisKey", "diseaseName", "confidence", "severity", "advice"]
        }
      }
    };

    var endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);

    var resp = UrlFetchApp.fetch(endpoint, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code !== 200) {
      return jsonOut({ status: "error", code: "api_" + code, message: body.substring(0, 1500) });
    }

    var parsed = JSON.parse(body);
    if (parsed.promptFeedback && parsed.promptFeedback.blockReason) {
      return jsonOut({ status: "error", code: "blocked", message: "ไม่สามารถวิเคราะห์ภาพนี้ได้" });
    }
    if (!parsed.candidates || !parsed.candidates.length) {
      return jsonOut({ status: "error", code: "no_candidate", message: "ไม่มีผลวิเคราะห์กลับมา" });
    }

    var textOut = extractGeminiText(parsed);
    var result = JSON.parse(textOut);

    return jsonOut({ status: "success", result: result, model: model });

  } catch (err) {
    return jsonOut({ status: "error", code: "exception", message: err.toString() });
  }
}

// รวมข้อความจาก response ของ Gemini (candidates[0].content.parts[].text)
function extractGeminiText(parsed) {
  var out = "";
  try {
    var parts = parsed.candidates[0].content.parts || [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].text) out += parts[i].text;
    }
  } catch (e) {}
  return out;
}

/**
 * ==============================================================================
 * AI ผู้ช่วยสนทนาที่ปรึกษาอ้อย ด้วย Google Gemini (ฟรี)
 * ใช้ Script Property เดียวกับ handleAIPestVision (GEMINI_API_KEY / GEMINI_MODEL)
 * รับ: data.history = [{role:'user'|'assistant', content}], data.context = ข้อมูลแปลง/อากาศ
 * ส่งคืน: { status:'success', reply:'...' }
 * ==============================================================================
 */
function handleAIChat(data) {
  function jsonOut(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonOut({ status: "error", code: "no_api_key", message: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" });
    }
    var model = props.getProperty("GEMINI_CHAT_MODEL") || props.getProperty("GEMINI_MODEL") || "gemini-2.0-flash";

    // แปลงประวัติสนทนาเป็นรูปแบบ Gemini (role: user/model)
    var history = Array.isArray(data.history) ? data.history : [];
    var contents = [];
    for (var i = 0; i < history.length; i++) {
      var role = history[i].role;
      var content = (history[i].content || "").toString();
      if (!content) continue;
      if (role === "user") {
        contents.push({ role: "user", parts: [{ text: content }] });
      } else if (role === "assistant" || role === "model") {
        contents.push({ role: "model", parts: [{ text: content }] });
      }
    }
    if (!contents.length || contents[contents.length - 1].role !== "user") {
      return jsonOut({ status: "error", code: "bad_history", message: "ไม่มีคำถามจากผู้ใช้" });
    }

    // สร้าง context แปลงเป็นข้อความสั้นๆ แทรกใน system instruction
    var ctx = data.context || {};
    var ctxText = "";
    if (ctx.plotCount) {
      ctxText += "เกษตรกรมีแปลงอ้อย " + ctx.plotCount + " แปลง";
      if (ctx.plots && ctx.plots.length) {
        var lines = ctx.plots.map(function (p) {
          return "- " + (p.name || "แปลง") + ": " + (p.area || "?") + " ไร่, พันธุ์ " +
            (p.variety || "?") + ", ปลูกเมื่อ " + (p.plantingDate || "?") +
            ", การให้น้ำ " + (p.irrigation || "?") + ", ต้นทุน/ไร่ " + (p.costPerRai || "?") + " บาท";
        });
        ctxText += ":\n" + lines.join("\n");
      }
    }
    if (ctx.weather) ctxText += "\nสภาพอากาศปัจจุบัน: " + ctx.weather;

    var systemPrompt =
      "คุณเป็น 'ผู้ช่วย AI ที่ปรึกษาการปลูกอ้อย' สำหรับเกษตรกรชาวไร่อ้อยไทย " +
      "ตอบเป็นภาษาไทยที่สุภาพ เป็นกันเอง เข้าใจง่าย กระชับ (โดยทั่วไปไม่เกิน 4-6 ประโยค) " +
      "ให้คำแนะนำที่ปฏิบัติได้จริงเรื่องการปลูก ดูแล ใส่ปุ๋ย จัดการศัตรูพืช การเก็บเกี่ยว ต้นทุน และราคาอ้อย " +
      "หากข้อมูลไม่พอให้สอบถามเพิ่มอย่างสุภาพ และอย่าให้คำแนะนำที่อันตรายหรือเกินขอบเขตการเกษตร" +
      (ctxText ? ("\n\nข้อมูลแปลงของเกษตรกรคนนี้ (ใช้ประกอบการตอบให้ตรงแปลง):\n" + ctxText) : "");

    var payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
    };

    var endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);

    var resp = UrlFetchApp.fetch(endpoint, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code !== 200) {
      return jsonOut({ status: "error", code: "api_" + code, message: body.substring(0, 1500) });
    }

    var parsed = JSON.parse(body);
    if (parsed.promptFeedback && parsed.promptFeedback.blockReason) {
      return jsonOut({ status: "success", reply: "ขออภัยครับ ผมไม่สามารถให้คำแนะนำเรื่องนี้ได้ ลองถามเรื่องการดูแลแปลงอ้อยได้นะครับ" });
    }

    var reply = extractGeminiText(parsed);
    if (!reply) reply = "ขออภัยครับ ผมยังตอบคำถามนี้ไม่ได้ ลองถามใหม่อีกครั้งนะครับ";

    return jsonOut({ status: "success", reply: reply, model: model });

  } catch (err) {
    return jsonOut({ status: "error", code: "exception", message: err.toString() });
  }
}

/**
 * ==============================================================================
 * LINE LOGIN — ยืนยัน ID Token กับเซิร์ฟเวอร์ LINE แล้วผูกบัญชีกับเลขโควตา
 * ------------------------------------------------------------------------------
 * วิธีตั้งค่า (ทำครั้งเดียว):
 *   1. สร้าง LINE Login channel + LIFF app ที่ https://developers.line.biz/console/
 *   2. ใน Apps Script > Project Settings > Script Properties เพิ่ม:
 *        LINE_CHANNEL_ID = <Channel ID ของ LINE Login channel>
 *   3. นำ LIFF ID ไปใส่ในตัวแปร LIFF_ID ใน app.js
 * ชีตเก็บการผูกบัญชีชื่อ "LINE_LINK" จะถูกสร้างอัตโนมัติเมื่อมีการเชื่อมครั้งแรก
 * ==============================================================================
 */
function lineJsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ยืนยัน ID Token กับ LINE แล้วคืน payload ที่เชื่อถือได้ (sub = LINE userId)
// ป้องกันการปลอม userId — ห้ามเชื่อ userId ที่ส่งจาก client ตรงๆ
function verifyLineIdToken_(idToken) {
  var channelId = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ID");
  if (!channelId) throw new Error("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID ใน Script Properties");
  if (!idToken) throw new Error("ไม่พบ idToken");

  var resp = UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "post",
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true
  });
  var body = JSON.parse(resp.getContentText());
  if (resp.getResponseCode() !== 200 || !body.sub) {
    throw new Error(body.error_description || body.error || "ID Token ไม่ถูกต้องหรือหมดอายุ");
  }
  return body; // { sub, name, picture, ... }
}

// เปิด/สร้างชีตเก็บการผูกบัญชี LINE ↔ เลขโควตา
function getLineLinkSheet_() {
  var ss;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (!ss) ss = SpreadsheetApp.openById("1ckLwOvgc8gMloGaj9rpoJ2keH0Ivt0c2l6SX_2g4N9o");
  var sheet = ss.getSheetByName("LINE_LINK");
  if (!sheet) {
    sheet = ss.insertSheet("LINE_LINK");
    sheet.appendRow(["LINE userId", "เลขโควตา (Quota)", "ชื่อ LINE", "เวลาเชื่อมบัญชี"]);
  }
  return sheet;
}

function findLineLinkRow_(userId) {
  var sheet = getLineLinkSheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(userId)) {
      return { row: i + 1, quota: String(values[i][1]) };
    }
  }
  return null;
}

// ตรวจ ID Token แล้วบอกว่าเคยผูกโควตาหรือยัง
function handleLineVerify(data) {
  try {
    var payload = verifyLineIdToken_(data.idToken);
    var link = findLineLinkRow_(payload.sub);
    return lineJsonOut_({
      status: "success",
      linked: !!link,
      quota: link ? link.quota : "",
      userId: payload.sub,
      displayName: payload.name || ""
    });
  } catch (err) {
    return lineJsonOut_({ status: "error", message: err.toString() });
  }
}

// ผูกบัญชี LINE (ที่ยืนยันแล้ว) เข้ากับเลขโควตา 5 หลัก
function handleLineLink(data) {
  try {
    var payload = verifyLineIdToken_(data.idToken);
    var userId = payload.sub;
    var displayName = payload.name || "";
    var quota = (data.quota || "").toString().trim();
    if (!/^\d{5}$/.test(quota)) {
      return lineJsonOut_({ status: "error", message: "เลขโควตาต้องเป็นตัวเลข 5 หลัก" });
    }

    var sheet = getLineLinkSheet_();
    var existing = findLineLinkRow_(userId);
    var now = new Date().toLocaleString("th-TH");
    if (existing) {
      sheet.getRange(existing.row, 2, 1, 3).setValues([[quota, displayName, now]]);
    } else {
      sheet.appendRow([userId, quota, displayName, now]);
    }
    return lineJsonOut_({ status: "success", quota: quota, userId: userId, displayName: displayName });
  } catch (err) {
    return lineJsonOut_({ status: "error", message: err.toString() });
  }
}

// ฟังก์ชันหลักประมวลผลข้อมูล (ใช้ร่วมกันระหว่าง doPost และ doGet)
function processData(data) {
  try {
    
    // ดึงข้อมูลพารามิเตอร์การซิงก์
    var action = data.action;
    var type = (data.type || "REGISTRATION").toString().toUpperCase();
    var plot = data.data; // ข้อมูลแปลง/ข้อมูลรายงาน
    
    // เปิด Google Sheet (ใช้ Active Spreadsheet ของคอนเทนเนอร์ก่อน และใช้ ID สำรองกรณีทำงานแยกเดี่ยว)
    var ss;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch(err) {
      console.warn("Could not get active spreadsheet: " + err.toString());
    }
    if (!ss) {
      var sheetId = "1ckLwOvgc8gMloGaj9rpoJ2keH0Ivt0c2l6SX_2g4N9o";
      try {
        ss = SpreadsheetApp.openById(sheetId);
      } catch(e) {
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "error", 
          message: "ไม่สามารถเปิดไฟล์ Google Sheet ได้ กรุณาตรวจสอบว่าคุณได้ผูกสคริปต์นี้เข้ากับ Google Sheet แล้ว (Container-Bound) หรือแก้ไขกรอก ID ของ Google Sheet ให้ถูกต้องในสคริปต์: " + e.toString() 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    var sheetName = "";
    var headers = [];
    var rowValues = [];
    
    // ตรวจจับและกระจายข้อมูลลงตามแท็บชีต
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
        "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์"
      ];
      
      // การลบแปลงอ้อย
      if (action === "DELETE") {
        var sheet = ss.getSheetByName(sheetName);
        if (sheet) {
          var sheetData = sheet.getDataRange().getValues();
          for (var i = 1; i < sheetData.length; i++) {
            if (sheetData[i][0] == plot.id) {
              sheet.deleteRow(i + 1);
              return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Deleted plot successfully" }))
                .setMimeType(ContentService.MimeType.JSON);
            }
          }
        }
        return ContentService.createTextOutput(JSON.stringify({ status: "not_found", message: "Plot not found for deletion" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var regPhotoUrl = saveBase64ImageToDrive(plot.regPhoto, "แจ้งปลูก_" + plot.cn + "_" + (plot.quota || "00000") + ".jpg");
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
        plot.isOffline ? "ใช่" : "ไม่ใช่"
      ];
      
    } else if (type === "SUPPORT") {
      sheetName = "คำขอการสนับสนุน";
      headers = ["วันที่-เวลา", "รหัสแปลง (Plot ID)", "เลขโควตา (Quota)", "ชื่อชาวไร่", "รายการสนับสนุนที่ขอ", "วงเงินสนับสนุนรวม (บาท)", "เวลาบันทึกจริง (Offline)", "แก้ไขออฟไลน์"];
      
      var totalSupportVal = 0;
      if (plot.supportItems && plot.customPrices) {
        plot.supportItems.forEach(function(item) {
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
        "แก้ไขออฟไลน์"
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
        plot.isOffline ? "ใช่" : "ไม่ใช่"
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
    }

    
    // เปิดหรือสร้างแท็บชีตเป้าหมาย
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2f0d9");
    }
    
    // หากเป็นชีตข้อมูลหลัก "ข้อมูลแปลงอ้อย" ให้ทำการเขียนทับแถวเดิมที่มีอยู่ (เพื่อไม่ให้เกิดแปลงซ้ำ)
    if (type === "REGISTRATION") {
      var sheetData = sheet.getDataRange().getValues();
      var rowIndex = -1;
      for (var i = 1; i < sheetData.length; i++) {
        if (sheetData[i][0] == plot.id) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
    } else {
      // หากเป็นชีตประวัติอื่นๆ (ยืนยันตน, สนับสนุน, ประเมิน, ต้นทุน, เก็บเกี่ยว, โรค) ให้ทำการ Append บรรทัดใหม่เสมอเพื่อบันทึกประวัติการบันทึก
      sheet.appendRow(rowValues);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Synced successfully to sheet: " + sheetName }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันสำหรับรับและบันทึกรูปภาพ Base64 ลงใน Google Drive
function saveBase64ImageToDrive(base64Data, filename) {
  try {
    if (!base64Data) return "";
    
    // หากข้อมูลที่ส่งมาเป็นลิงก์ Google Drive เดิมอยู่แล้ว ให้คืนค่า URL เดิมกลับไป ไม่ต้องสร้างไฟล์ใหม่
    if (base64Data.indexOf("http") === 0) {
      return base64Data;
    }
    
    // ตรวจสอบความถูกต้องของรูปแบบ Base64 รูปภาพ
    if (base64Data.indexOf("data:image") === -1) {
      return "";
    }
    
    // ดึงเฉพาะข้อมูล Base64 และข้อมูลประเภทเนื้อหา
    var parts = base64Data.split(",");
    var contentType = parts[0].match(/:(.*?);/)[1];
    var rawData = parts[1];
    
    // แปลงรหัสไฟล์ Base64
    var decoded = Utilities.base64Decode(rawData);
    var blob = Utilities.newBlob(decoded, contentType, filename);
    
    // ค้นหาหรือสร้างโฟลเดอร์สำหรับอัปโหลดใน Google Drive
    var folderName = "รูปภาพแปลงอ้อย Smart Farmer";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder;
    
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    // บันทึกไฟล์ลงในโฟลเดอร์ Google Drive
    var file = folder.createFile(blob);
    
    // ปรับเปลี่ยนสิทธิ์ของรูปภาพให้ "ทุกคนที่มีลิงก์สามารถดูได้"
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // คืนค่าที่อยู่เว็บ (URL) สำหรับนำไปลงตารางชีต
    return file.getUrl();
  } catch (err) {
    console.error("Failed to save image to Drive: " + err.toString());
    return "Error saving image: " + err.toString();
  }
}

// ฟังก์ชันล้างข้อมูลประวัติและรูปภาพที่หมดอายุตามมาตรฐาน PDPA (เช่น เกิน 90 วัน)
// สามารถตั้งเวลาให้ทำความสะอาดอัตโนมัติทุกคืนผ่านระบบ Apps Script Triggers
function purgeExpiredIdentityLogs() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("ยืนยันตัวตน");
    if (!sheet) return "Sheet 'ยืนยันตัวตน' not found.";
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return "No data to purge.";
    
    var dataRange = sheet.getRange(2, 1, lastRow - 1, 5); // อ่านวันที่, รหัสโควตา, พิกัด, ลิงก์ใบหน้า, และความยินยอม
    var data = dataRange.getValues();
    var rowsDeleted = 0;
    
    var now = new Date();
    var retentionPeriodMs = 90 * 24 * 60 * 60 * 1000; // กำหนดระยะเวลาจัดเก็บสูงสุด 90 วัน
    
    // วนลูปถอยหลังเพื่อไม่ให้ตำแหน่งแถวเพี้ยนขณะลบแถว
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var dateStr = row[0];
      var imageUrl = row[3];
      var rowIndex = i + 2; // ดัชนีในสเปรดชีต (เริ่มที่ 2 เพราะมีแถวหัวตาราง)
      
      var rowDate = new Date(dateStr);
      
      // ตรวจสอบว่าหากพ้นกำหนด 90 วันแล้ว
      if (!isNaN(rowDate.getTime()) && (now.getTime() - rowDate.getTime() > retentionPeriodMs)) {
        // 1. ค้นหาและลบรูปภาพใบหน้าใน Google Drive ก่อนเพื่อไม่ให้ขยะตกค้าง
        if (imageUrl && imageUrl.indexOf("id=") !== -1) {
          try {
            var fileId = imageUrl.split("id=")[1].split("&")[0];
            var file = DriveApp.getFileById(fileId);
            if (file) {
              file.setTrashed(true); // ย้ายลงถังขยะ Google Drive เพื่อความปลอดภัยตามกฎหมาย
            }
          } catch (fileErr) {
            console.warn("Failed to delete file from Drive for row " + rowIndex + ": " + fileErr.toString());
          }
        }
        
        // 2. ลบแถวข้อมูลในสเปรดชีต
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
