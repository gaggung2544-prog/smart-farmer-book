// Smart Farmer Book - Map GIS Module (Phase 5)

let leafletMapInstance = null;
let leafletPromoterMarker = null;
let leafletFarmerMarker = null;
let leafletConnectingLine = null;
let promoterLocation = null;

// เปิดโมดอลแผนที่นำทางและแสดงตำแหน่ง
function openStaffMap(plot) {
    const modal = document.getElementById('staff-map-modal');
    if (!modal) return;
    modal.classList.remove('d-none');
    if (typeof setStaffMapBadge === 'function') setStaffMapBadge(STAFF_MAP_DISTANCE_BADGE);

    // แยกพิกัดแปลงชาวไร่
    const coordParts = plot.location.split(',');
    const farmerLat = parseFloat(coordParts[0].trim());
    const farmerLng = parseFloat(coordParts[1].trim());
    
    if (isNaN(farmerLat) || isNaN(farmerLng)) {
        alert("⚠️ พิกัดแปลงไม่สมบูรณ์หรืออยู่ในรูปแบบที่ไม่ถูกต้อง");
        modal.classList.add('d-none');
        return;
    }
    
    // แสดงสัญลักษณ์รอพิกัด
    document.getElementById('staff-map-distance-val').innerText = "กำลังหาพิกัด...";
    
    // ดึงพิกัดตำแหน่งสดของพนักงาน
    getPromoterCurrentPosition((pLoc) => {
        let pLat = pLoc.lat;
        let pLng = pLoc.lng;
        // ป้องกันหมุดทับซ้อนกัน 100% กรณีใช้งานเครื่องเดียวกัน/พิกัดเดียวกัน
        if (Math.abs(pLat - farmerLat) < 0.0001 && Math.abs(pLng - farmerLng) < 0.0001) {
            pLat += 0.0015; // ขยับพิกัดเจ้าหน้าที่ออกไปประมาณ 150 เมตร
            pLng += 0.0015;
        }

        // คำนวณระยะทาง
        const distance = calculateHaversineDistance(pLat, pLng, farmerLat, farmerLng);
        document.getElementById('staff-map-distance-val').innerText = distance.toFixed(2);
        
        // ตรวจสอบว่าระบบสามารถใช้งาน Leaflet แผนที่หลักได้หรือไม่
        let leafletLoaded = (typeof L !== 'undefined');
        
        if (leafletLoaded) {
            document.getElementById('leaflet-staff-map').style.display = 'block';
            document.getElementById('canvas-staff-map').style.display = 'none';
            
            // เรียกใช้/รีเซ็ตแผนที่ Leaflet
            setTimeout(() => {
                initLeafletMap(pLat, pLng, farmerLat, farmerLng, plot);
            }, 100);
        } else {
            // สลับไปแผนที่เรดาร์ Canvas
            document.getElementById('leaflet-staff-map').style.display = 'none';
            document.getElementById('canvas-staff-map').style.display = 'block';
            
            drawCanvasRadarMap(pLat, pLng, farmerLat, farmerLng, plot.quota || 'ชาวไร่', distance);
        }
    });
}

// เริ่มการเรนเดอร์และสร้างแอนิเมชันของ Leaflet Map
function initLeafletMap(pLat, pLng, fLat, fLng, plotOrQuota) {
    const mapDiv = document.getElementById('leaflet-staff-map');
    if (!mapDiv) return;
    
    const quota = typeof plotOrQuota === 'object' ? (plotOrQuota.quota || 'ชาวไร่') : plotOrQuota;
    
    // ทำลายแผนที่เดิมถ้ามีอยู่แล้วเพื่อสร้างใหม่
    if (leafletMapInstance) {
        leafletMapInstance.remove();
        leafletMapInstance = null;
    }
    
    // ตั้งค่าพิกัดกลางแผนที่ให้อยู่ตรงกลางระหว่างพนักงานและแปลง
    const centerLat = (pLat + fLat) / 2;
    const centerLng = (pLng + fLng) / 2;
    
    leafletMapInstance = L.map(mapDiv).setView([centerLat, centerLng], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(leafletMapInstance);
    
    // สร้างมาร์กเกอร์สำหรับเจ้าหน้าที่ (สีน้ำเงิน)
    leafletPromoterMarker = L.marker([pLat, pLng]).addTo(leafletMapInstance)
        .bindPopup("🏢 <strong>ตำแหน่งของคุณ</strong><br>(เจ้าหน้าที่ส่งเสริม)").openPopup();
        
    // สร้างมาร์กเกอร์สำหรับแปลงอ้อยชาวไร่ (สีเขียว/แดง)
    leafletFarmerMarker = L.marker([fLat, fLng]).addTo(leafletMapInstance)
        .bindPopup(`🎋 <strong>แปลงโควตา #${quota}</strong><br>พิกัด: ${fLat.toFixed(4)}, ${fLng.toFixed(4)}`);
        
    // ลากเส้นตรงเชื่อมต่อและปรับขนาดแผนที่ให้ครอบคลุมมาร์กเกอร์ทั้งสอง
    leafletConnectingLine = L.polyline([[pLat, pLng], [fLat, fLng]], {
        color: '#1a73e8',
        weight: 3,
        dashArray: '5, 10'
    }).addTo(leafletMapInstance);
    
    const bounds = L.latLngBounds([[pLat, pLng], [fLat, fLng]]);
    
    if (typeof plotOrQuota === 'object') {
        let polygonCoords = plotOrQuota.polygon;
        
        // หากไม่มี Polygon ให้สร้างกรอบจำลอง 4 เหลี่ยมโดยอิงจากจำนวนพื้นที่ไร่
        if (!polygonCoords || polygonCoords.length < 3) {
            const areaRai = parseFloat(plotOrQuota.area) || 10;
            const sideMeters = Math.sqrt(areaRai * 1600); // พื้นที่ 1 ไร่ = 1600 ตรม.
            const distDeg = (sideMeters / 2) / 111320; // 1 องศา ~ 111.32 กิโลเมตร
            
            polygonCoords = [
                [fLat + distDeg, fLng - distDeg],
                [fLat + distDeg, fLng + distDeg],
                [fLat - distDeg, fLng + distDeg],
                [fLat - distDeg, fLng - distDeg]
            ];
        }

        L.polygon(polygonCoords, {
            color: '#10b981',
            weight: 3,
            fillColor: '#34d399',
            fillOpacity: 0.4
        }).addTo(leafletMapInstance);
        
        polygonCoords.forEach(coord => {
            bounds.extend(coord);
        });
    }
    
    leafletMapInstance.fitBounds(bounds, { padding: [40, 40] });
}

// วาดแผนที่เวกเตอร์เรดาร์ (Canvas Offline Fallback)
function drawCanvasRadarMap(pLat, pLng, fLat, fLng, quota, distanceKm) {
    const canvas = document.getElementById('canvas-staff-map');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    
    // ล้างพื้นที่ Canvas
    ctx.fillStyle = '#0f172a'; // พื้นหลังสีมืดดูเท่และล้ำสมัย
    ctx.fillRect(0, 0, w, h);
    
    // วาดเส้นตารางพิกัด
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, h);
    ctx.stroke();
    
    // วาดวงกลมรัศมีเรดาร์ (3 วง)
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.lineWidth = 1.5;
    const radii = [45, 85, 120];
    const labels = ["100m", "1km", "5km+"];
    
    radii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.stroke();
        
        // วาดชื่อรัศมี
        ctx.fillStyle = '#10b981';
        ctx.font = '8px Prompt, sans-serif';
        ctx.fillText(labels[idx], centerX + r - 22, centerY - 4);
    });
    
    // วาดเอฟเฟ็กต์กวาดเรดาร์ (Sweep line)
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + 110, centerY - 60);
    ctx.stroke();
    
    // วาดมาร์กเกอร์ตรงกลาง (ตำแหน่งของพนักงาน)
    ctx.fillStyle = '#3b82f6'; // สีน้ำเงิน
    ctx.beginPath();
    ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // คำนวณมุมและระยะทางจำลองเพื่อวาดแปลงชาวไร่บน Canvas
    const dLat = fLat - pLat;
    const dLng = fLng - pLng;
    const angle = Math.atan2(dLng, dLat); // มุมเรเดียน
    
    // หาระยะทางพิกเซลตามสเกลที่สวยงามบน Canvas (จำกัดระยะไม่ให้เกินพื้นที่การวาด)
    let mapScaleDist = 100; // ค่าเริ่มต้นพิกเซล
    if (distanceKm < 0.2) mapScaleDist = 45;
    else if (distanceKm < 2) mapScaleDist = 85;
    else mapScaleDist = 120;
    
    const targetX = centerX + Math.sin(angle) * mapScaleDist;
    const targetY = centerY - Math.cos(angle) * mapScaleDist; // ใน Canvas แกน Y ด้านบนคือค่าลบ
    
    // วาดเส้นปะเชื่อมระหว่างพนักงานและแปลง
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]); // รีเซ็ตเส้นประ
    
    // วาดแปลงชาวไร่ (เป้าหมายสีแดง)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // วาดชื่อป้ายกำกับ
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Prompt, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("คุณ (เจ้าหน้าที่)", centerX, centerY + 20);
    ctx.fillText(`แปลงโควตา #${quota} (${distanceKm.toFixed(2)} กม.)`, targetX, targetY - 10);
}

// ดูพิกัดแจ้งเกิดโรคระบาดบนแผนที่
function viewPestOnMap(pestLocation, plotId) {
    const modal = document.getElementById('staff-map-modal');
    if (!modal) return;
    modal.classList.remove('d-none');
    if (typeof setStaffMapBadge === 'function') setStaffMapBadge(STAFF_MAP_DISTANCE_BADGE);

    const plot = plots.find(p => p.id === plotId);
    if (!plot) {
        alert("⚠️ ไม่พบข้อมูลแปลงอ้อย");
        return;
    }
    
    const pestCoordParts = pestLocation.split(',');
    const pestLat = parseFloat(pestCoordParts[0].trim());
    const pestLng = parseFloat(pestCoordParts[1].trim());
    
    if (isNaN(pestLat) || isNaN(pestLng)) {
        alert("⚠️ พิกัดโรคระบาดไม่สมบูรณ์");
        return;
    }
    
    const coordParts = plot.location.split(',');
    const farmerLat = parseFloat(coordParts[0].trim());
    const farmerLng = parseFloat(coordParts[1].trim());
    
    if (isNaN(farmerLat) || isNaN(farmerLng)) {
        alert("⚠️ พิกัดแปลงไม่สมบูรณ์");
        return;
    }
    
    document.getElementById('staff-map-distance-val').innerText = "กำลังคำนวณ...";
    
    getPromoterCurrentPosition((pLoc) => {
        const distance = calculateHaversineDistance(pLoc.lat, pLoc.lng, pestLat, pestLng);
        document.getElementById('staff-map-distance-val').innerText = distance.toFixed(2);
        
        let leafletLoaded = (typeof L !== 'undefined');
        
        if (leafletLoaded) {
            document.getElementById('leaflet-staff-map').style.display = 'block';
            document.getElementById('canvas-staff-map').style.display = 'none';
            
            setTimeout(() => {
                const centerLat = (pLoc.lat + pestLat) / 2;
                const centerLng = (pLoc.lng + pestLng) / 2;
                
                if (leafletMapInstance) {
                    leafletMapInstance.remove();
                    leafletMapInstance = null;
                }
                
                leafletMapInstance = L.map('leaflet-staff-map').setView([centerLat, centerLng], 12);
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap'
                }).addTo(leafletMapInstance);
                
                leafletPromoterMarker = L.marker([pLoc.lat, pLoc.lng]).addTo(leafletMapInstance)
                    .bindPopup("🏢 <strong>ตำแหน่งของคุณ</strong><br>(เจ้าหน้าที่ส่งเสริม)");
                
                leafletFarmerMarker = L.marker([farmerLat, farmerLng]).addTo(leafletMapInstance)
                    .bindPopup(`🎋 <strong>แปลงโควตา #${plot.quota}</strong><br>พิกัดแปลง: ${farmerLat.toFixed(4)}, ${farmerLng.toFixed(4)}`);
                
                const redIcon = L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });
                
                L.marker([pestLat, pestLng], { icon: redIcon }).addTo(leafletMapInstance)
                    .bindPopup(`⚠️ <strong>จุดเกิดโรค/ศัตรูพืช</strong><br>พิกัดระบาด: ${pestLat.toFixed(4)}, ${pestLng.toFixed(4)}`).openPopup();
                
                leafletConnectingLine = L.polyline([[pLoc.lat, pLoc.lng], [pestLat, pestLng]], {
                    color: '#1a73e8',
                    weight: 3,
                    dashArray: '5, 10'
                }).addTo(leafletMapInstance);
                
                L.polyline([[pestLat, pestLng], [farmerLat, farmerLng]], {
                    color: '#e91e63',
                    weight: 3,
                    dashArray: '3, 6'
                }).addTo(leafletMapInstance);
                
                const bounds = L.latLngBounds([[pLoc.lat, pLoc.lng], [pestLat, pestLng], [farmerLat, farmerLng]]);
                leafletMapInstance.fitBounds(bounds, { padding: [40, 40] });
            }, 100);
        } else {
            document.getElementById('leaflet-staff-map').style.display = 'none';
            document.getElementById('canvas-staff-map').style.display = 'block';
            
            drawCanvasRadarMap(pLoc.lat, pLoc.lng, pestLat, pestLng, `โรคแปลง #${plot.quota}`, distance);
        }
    });
}

// ==============================================================================
// GIS Heatmap: แผนที่ความร้อนการระบาดศัตรูพืช/โรคอ้อย (leaflet.heat)
// ==============================================================================
let pestHeatLayer = null;
let pestHeatMarkers = [];

const STAFF_MAP_DISTANCE_BADGE = '<span>📏 ระยะห่างเจ้าหน้าที่ - แปลง:</span> <span id="staff-map-distance-val">0.00</span> <span>กม.</span>';
function setStaffMapBadge(html) {
    const b = document.getElementById('staff-map-badge');
    if (b) b.innerHTML = html;
}

function openPestHeatmap() {
    const modal = document.getElementById('staff-map-modal');
    if (!modal) return;

    if (typeof L === 'undefined' || typeof L.heatLayer === 'undefined') {
        alert('⚠️ ต้องมีอินเทอร์เน็ตเพื่อโหลดแผนที่ความร้อนครั้งแรก กรุณาเชื่อมต่อแล้วลองใหม่');
        return;
    }

    const reports = (typeof pestReports !== 'undefined' && Array.isArray(pestReports)) ? pestReports : [];

    // แปลงพิกัด + ถ่วงน้ำหนักตามความรุนแรง
    const sevWeight = (lvl) => {
        const s = (lvl || '').toString();
        if (s.includes('สูง')) return 1.0;
        if (s.includes('ปานกลาง')) return 0.6;
        if (s.includes('ต่ำ')) return 0.3;
        return 0.5;
    };
    const points = [];
    const detail = [];
    reports.forEach(r => {
        const loc = (r.pestLocation || '').split(',');
        const lat = parseFloat((loc[0] || '').trim());
        const lng = parseFloat((loc[1] || '').trim());
        if (!isNaN(lat) && !isNaN(lng)) {
            const w = sevWeight(r.pestLevels);
            points.push([lat, lng, w]);
            detail.push({ lat, lng, w, r });
        }
    });

    modal.classList.remove('d-none');

    if (points.length === 0) {
        alert('ยังไม่มีรายงานการระบาดที่มีพิกัด GPS — เมื่อมีการแจ้งโรคพร้อมพิกัด จุดจะแสดงบนแผนที่ความร้อนนี้');
        modal.classList.add('d-none');
        return;
    }
    setStaffMapBadge('<span>🔥 จุดระบาดทั้งหมด:</span> <span id="staff-map-distance-val">' + points.length + '</span> <span>จุด</span>');

    document.getElementById('leaflet-staff-map').style.display = 'block';
    const canvasEl = document.getElementById('canvas-staff-map');
    if (canvasEl) canvasEl.style.display = 'none';

    setTimeout(() => {
        if (leafletMapInstance) { leafletMapInstance.remove(); leafletMapInstance = null; }
        pestHeatMarkers = [];

        const avgLat = points.reduce((s, p) => s + p[0], 0) / points.length;
        const avgLng = points.reduce((s, p) => s + p[1], 0) / points.length;

        leafletMapInstance = L.map('leaflet-staff-map').setView([avgLat, avgLng], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(leafletMapInstance);

        // ชั้นความร้อน
        pestHeatLayer = L.heatLayer(points, {
            radius: 28,
            blur: 18,
            maxZoom: 13,
            minOpacity: 0.4,
            gradient: { 0.2: '#2196f3', 0.4: '#4caf50', 0.6: '#ffeb3b', 0.8: '#ff9800', 1.0: '#e53935' }
        }).addTo(leafletMapInstance);

        // หมุดรายละเอียดแต่ละจุด (แตะดูข้อมูล)
        const bounds = L.latLngBounds(points.map(p => [p[0], p[1]]));
        detail.forEach(d => {
            const sev = d.w >= 0.8 ? 'สูง' : d.w >= 0.5 ? 'ปานกลาง' : 'ต่ำ';
            const clr = d.w >= 0.8 ? '#e53935' : d.w >= 0.5 ? '#ff9800' : '#4caf50';
            const mk = L.circleMarker([d.lat, d.lng], {
                radius: 6, color: '#fff', weight: 1.5, fillColor: clr, fillOpacity: 0.9
            }).addTo(leafletMapInstance);
            mk.bindPopup(
                `⚠️ <strong>${(d.r.pestDiagnoses || 'พบการระบาด')}</strong><br>` +
                `แปลง: ${d.r.plotName || '-'} (โควตา ${d.r.quota || '-'})<br>` +
                `ความรุนแรง: ${sev}<br>` +
                `เมื่อ: ${d.r.offlineCreated || '-'}`
            );
            pestHeatMarkers.push(mk);
        });

        leafletMapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        leafletMapInstance.invalidateSize();
    }, 120);
}

// --- Plot Boundary Polygon Drawing ---
let drawPolygonMapInstance = null;
let drawnPolygonPoints = [];
let polygonLayer = null;
let polygonMarkers = [];

function openDrawPolygonModal() {
    document.getElementById('draw-polygon-overlay').classList.remove('d-none');
    if (!drawPolygonMapInstance) {
        drawPolygonMapInstance = L.map('polygon-map').setView([15.8700, 100.9925], 6);
        L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google Satellite'
        }).addTo(drawPolygonMapInstance);

        drawPolygonMapInstance.on('click', function(e) {
            drawnPolygonPoints.push([e.latlng.lat, e.latlng.lng]);
            redrawPolygon();
        });

        // Try to get user location to center the map
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                drawPolygonMapInstance.setView([pos.coords.latitude, pos.coords.longitude], 16);
            });
        }
    }
    // Invalidate size to fix Leaflet rendering issues in hidden containers
    setTimeout(() => { drawPolygonMapInstance.invalidateSize(); }, 200);
}

function closeDrawPolygonModal() {
    document.getElementById('draw-polygon-overlay').classList.add('d-none');
}

function clearPolygonDraw() {
    drawnPolygonPoints = [];
    redrawPolygon();
    document.getElementById('polygon-area-display').innerText = '0.00 ไร่';
    document.getElementById('polygon-status-text').innerHTML = '⚠️ แนะนำให้วาดแปลงเพื่อให้เจ้าหน้าที่ประเมินผลผลิตได้แม่นยำขึ้น';
}

function redrawPolygon() {
    if (polygonLayer) drawPolygonMapInstance.removeLayer(polygonLayer);
    polygonMarkers.forEach(m => drawPolygonMapInstance.removeLayer(m));
    polygonMarkers = [];

    if (drawnPolygonPoints.length > 0) {
        polygonLayer = L.polygon(drawnPolygonPoints, {color: '#10b981', fillColor: '#10b981', fillOpacity: 0.4}).addTo(drawPolygonMapInstance);
        
        drawnPolygonPoints.forEach((latlng, index) => {
            const marker = L.circleMarker(latlng, {
                radius: 5, color: 'white', weight: 2, fillColor: '#10b981', fillOpacity: 1
            }).addTo(drawPolygonMapInstance);
            polygonMarkers.push(marker);
        });
    }

    const areaRai = calculatePolygonArea(drawnPolygonPoints);
    document.getElementById('polygon-area-display').innerText = areaRai.toFixed(2) + ' ไร่';
}

function savePolygonDraw() {
    if (drawnPolygonPoints.length < 3) {
        alert('กรุณาวาดจุดอย่างน้อย 3 จุดเพื่อสร้างขอบเขตแปลงอ้อย');
        return;
    }
    document.getElementById('reg-polygon').value = JSON.stringify(drawnPolygonPoints);
    const area = calculatePolygonArea(drawnPolygonPoints);
    document.getElementById('polygon-status-text').innerHTML = 
        `<span style="color: var(--brand-green); font-weight:600;">✅ วาดแปลงสำเร็จ (${drawnPolygonPoints.length} จุด, พื้นที่ ${area.toFixed(2)} ไร่)</span>`;
    // Update the area field automatically as a suggestion
    document.getElementById('reg-area').value = area.toFixed(2);
    closeDrawPolygonModal();
}

function calculatePolygonArea(points) {
    if (points.length < 3) return 0;
    let area = 0;
    const mPerLat = 111111;
    const mPerLng = 107334;
    for (let i = 0; i < points.length; i++) {
        let j = (i + 1) % points.length;
        let x1 = points[i][1] * mPerLng;
        let y1 = points[i][0] * mPerLat;
        let x2 = points[j][1] * mPerLng;
        let y2 = points[j][0] * mPerLat;
        area += (x1 * y2 - x2 * y1);
    }
    return Math.abs(area) / 2 / 1600; // 1 Rai = 1600 sqm
}
