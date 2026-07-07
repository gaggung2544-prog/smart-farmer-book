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
        
        // หากไม่มี Polygon ให้สร้างกรอบจำลอง 4 เหลี่ยมโดยอิงจากจำนวนพื้นที่ไร่ และทำการเกลี่ยโค้งให้สมจริง
        if (!polygonCoords || polygonCoords.length < 3) {
            const areaRai = parseFloat(plotOrQuota.area) || 10;
            const sideMeters = Math.sqrt(areaRai * 1600); // พื้นที่ 1 ไร่ = 1600 ตรม.
            const distDeg = (sideMeters / 2) / 111320; // 1 องศา ~ 111.32 กิโลเมตร
            
            const square = [
                [fLat + distDeg, fLng - distDeg],
                [fLat + distDeg, fLng + distDeg],
                [fLat - distDeg, fLng + distDeg],
                [fLat - distDeg, fLng - distDeg]
            ];
            polygonCoords = smoothPolygonChaikin(square, 2);
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

// --- Plot Boundary Polygon Drawing ---
let drawPolygonMapInstance = null;
let drawnPolygonPoints = [];
let polygonLayer = null;
let polygonMarkers = [];
let drawMode = 'click'; // 'click' หรือ 'drag' (วาดอิสระ)
let isDrawingDrag = false;

// ฟังก์ชัน Chaikin's Algorithm เกลี่ยเส้นเหลี่ยมให้โค้งมนแบบธรรมชาติ
function smoothPolygonChaikin(points, iterations = 1) {
    if (points.length < 3) return points;
    let current = [...points];
    for (let iter = 0; iter < iterations; iter++) {
        let nextPoints = [];
        const len = current.length;
        for (let i = 0; i < len; i++) {
            const p1 = current[i];
            const p2 = current[(i + 1) % len];
            
            // จุดที่ 1/4 ของความยาวส่วนเส้นตรง
            const q = [
                0.75 * p1[0] + 0.25 * p2[0],
                0.75 * p1[1] + 0.25 * p2[1]
            ];
            // จุดที่ 3/4 ของความยาวส่วนเส้นตรง
            const r = [
                0.25 * p1[0] + 0.75 * p2[0],
                0.25 * p1[1] + 0.75 * p2[1]
            ];
            nextPoints.push(q);
            nextPoints.push(r);
        }
        current = nextPoints;
    }
    return current;
}

// สลับโหมดการวาดแปลง
function setDrawMode(mode) {
    drawMode = mode;
    const btnClick = document.getElementById('btn-draw-mode-click');
    const btnDrag = document.getElementById('btn-draw-mode-drag');
    if (!btnClick || !btnDrag) return;

    if (mode === 'click') {
        btnClick.style.background = '#e2e8f0';
        btnClick.style.color = '#334155';
        btnClick.style.border = '1px solid #cbd5e1';
        btnDrag.style.background = 'white';
        btnDrag.style.color = '#64748b';
        btnDrag.style.border = '1px solid #e2e8f0';
        if (drawPolygonMapInstance) {
            drawPolygonMapInstance.dragging.enable();
        }
    } else {
        btnDrag.style.background = '#e0f2fe';
        btnDrag.style.color = '#0369a1';
        btnDrag.style.border = '1px solid #bae6fd';
        btnClick.style.background = 'white';
        btnClick.style.color = '#64748b';
        btnClick.style.border = '1px solid #e2e8f0';
        if (drawPolygonMapInstance) {
            // ปิดการลากแผนที่ชั่วคราวเพื่อเตรียมตัวสำหรับการวาดอิสระ
            drawPolygonMapInstance.dragging.disable();
        }
    }
}

// ฟังก์ชันเกลี่ยขอบโค้งปัจจุบัน
function smoothCurrentDraw(iterations = 1) {
    if (drawnPolygonPoints.length < 3) {
        alert("⚠️ ต้องมีจุดพิกัดอย่างน้อย 3 จุดก่อนการเกลี่ยขอบโค้งครับ");
        return;
    }
    drawnPolygonPoints = smoothPolygonChaikin(drawnPolygonPoints, iterations);
    redrawPolygon();
}

function openDrawPolygonModal() {
    document.getElementById('draw-polygon-overlay').classList.remove('d-none');
    if (!drawPolygonMapInstance) {
        drawPolygonMapInstance = L.map('polygon-map').setView([15.8700, 100.9925], 6);
        L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google Satellite'
        }).addTo(drawPolygonMapInstance);

        // ดักเหตุการณ์คลิก (สำหรับโหมดปักหมุดปกติ)
        drawPolygonMapInstance.on('click', function(e) {
            if (drawMode !== 'click') return;
            drawnPolygonPoints.push([e.latlng.lat, e.latlng.lng]);
            redrawPolygon();
        });

        // ดักเหตุการณ์ลากวาดอิสระ (Freehand Drawing)
        drawPolygonMapInstance.on('mousedown touchstart', function(e) {
            if (drawMode !== 'drag') return;
            isDrawingDrag = true;
            if (drawPolygonMapInstance) drawPolygonMapInstance.dragging.disable();
            drawnPolygonPoints.push([e.latlng.lat, e.latlng.lng]);
            redrawPolygon();
        });

        drawPolygonMapInstance.on('mousemove touchmove', function(e) {
            if (drawMode !== 'drag' || !isDrawingDrag) return;
            const lastPoint = drawnPolygonPoints[drawnPolygonPoints.length - 1];
            if (lastPoint) {
                const dist = drawPolygonMapInstance.latLngToLayerPoint(e.latlng).distanceTo(
                    drawPolygonMapInstance.latLngToLayerPoint(L.latLng(lastPoint[0], lastPoint[1]))
                );
                if (dist < 12) return; // ข้ามจุดที่อยู่ใกล้กันเกิน 12 พิกเซลเพื่อถนอมหน่วยความจำและสวยงาม
            }
            drawnPolygonPoints.push([e.latlng.lat, e.latlng.lng]);
            redrawPolygon();
        });

        const endDragDrawing = () => {
            if (drawMode === 'drag' && isDrawingDrag) {
                isDrawingDrag = false;
                if (drawPolygonMapInstance) drawPolygonMapInstance.dragging.enable();
                // เกลี่ยขอบแปลงที่เกิดจากการลากมือสั่นเบาๆ โดยอัตโนมัติ 1 รอบ
                smoothCurrentDraw(1);
            }
        };

        drawPolygonMapInstance.on('mouseup touchend', endDragDrawing);
        window.addEventListener('mouseup', endDragDrawing);
        window.addEventListener('touchend', endDragDrawing);

        // ค้นหาตำแหน่งปัจจุบัน
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                drawPolygonMapInstance.setView([pos.coords.latitude, pos.coords.longitude], 16);
            });
        }
    }
    
    // ตั้งค่าเริ่มต้นโหมดให้เป็นโหมดปักหมุดเสมอเมื่อเปิดใช้งาน
    setDrawMode('click');
    
    // Invalidate size เพื่อปรับขนาดการแสดงผล Leaflet ในกรอบ Modal
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
        
        // หากจำนวนจุดพิกัดไม่มากเกินไป (<= 25 จุด) ให้วาดหมุดจุดยอดสำหรับให้ขยับแก้พิกัดได้
        // เพื่อป้องกันไม่ให้แผนที่รกและแลกกรณีที่มีจำนวนจุดพิกัดจากการลาก/เกลี่ยโค้งสูงมาก
        if (drawnPolygonPoints.length <= 25) {
            drawnPolygonPoints.forEach((latlng, index) => {
                const marker = L.marker(latlng, {
                    draggable: true,
                    icon: L.divIcon({
                        className: 'polygon-vertex-icon',
                        html: `<div style="background:#10b981; width:12px; height:12px; border:2px solid white; border-radius:50%; box-shadow:0 2px 4px rgba(0,0,0,0.35);"></div>`,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })
                }).addTo(drawPolygonMapInstance);
                
                marker.on('drag', function(e) {
                    const newLatLng = e.target.getLatLng();
                    drawnPolygonPoints[index] = [newLatLng.lat, newLatLng.lng];
                    if (polygonLayer) {
                        polygonLayer.setLatLngs(drawnPolygonPoints);
                    }
                    const areaRai = calculatePolygonArea(drawnPolygonPoints);
                    const areaEl = document.getElementById('polygon-area-display');
                    if (areaEl) areaEl.innerText = areaRai.toFixed(2) + ' ไร่';
                });
                
                marker.on('dragend', function() {
                    redrawPolygon();
                });
                
                marker.on('click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    if (drawnPolygonPoints.length <= 3) {
                        alert("⚠️ แปลงอ้อยต้องมีจุดมุมอย่างน้อย 3 จุดสำหรับการคำนวณพื้นที่ครับ");
                        return;
                    }
                    drawnPolygonPoints.splice(index, 1);
                    redrawPolygon();
                });
                
                polygonMarkers.push(marker);
            });
        }
    }

    const areaRai = calculatePolygonArea(drawnPolygonPoints);
    const areaEl = document.getElementById('polygon-area-display');
    if (areaEl) areaEl.innerText = areaRai.toFixed(2) + ' ไร่';
}

function savePolygonDraw() {
    if (drawnPolygonPoints.length < 3) {
        alert('กรุณาวาดจุดอย่างน้อย 3 จุดเพื่อสร้างขอบเขตแปลงอ้อย');
        return;
    }
    
    // บันทึกขอบเขตแปลงลงฟอร์ม
    document.getElementById('reg-polygon').value = JSON.stringify(drawnPolygonPoints);
    
    const area = calculatePolygonArea(drawnPolygonPoints);
    const statusText = document.getElementById('polygon-status-text');
    if (statusText) {
        statusText.innerHTML = `<span style="color: var(--brand-green); font-weight:600;">✅ วาดแปลงสำเร็จ (${drawnPolygonPoints.length} จุด, พื้นที่ ${area.toFixed(2)} ไร่)</span>`;
    }
    
    // อัปเดตขนาดพื้นที่ที่คำนวณได้ลงในฟอร์มลงทะเบียนโดยอัตโนมัติ
    document.getElementById('reg-area').value = area.toFixed(2);
    
    // คำนวณจุดศูนย์กลางแปลงอุตุนิยมวิทยาอัตโนมัติ เพื่อนำไปกรอกในช่องพิกัด GPS หลัก
    const center = getPolygonCenter(drawnPolygonPoints);
    document.getElementById('reg-location').value = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
    
    // ซ่อนข้อความแจ้งเตือนค่าคลาดเคลื่อนของปุ่ม GPS เก่า
    const accuracyBadge = document.getElementById('gps-accuracy-badge');
    if (accuracyBadge) accuracyBadge.classList.add('d-none');
    
    closeDrawPolygonModal();
}

// คำนวณหาพิกัดกึ่งกลาง (Centroid) ของแปลงโพลีกอนแบบระนาบ
function getPolygonCenter(points) {
    let latSum = 0;
    let lngSum = 0;
    points.forEach(p => {
        latSum += p[0];
        lngSum += p[1];
    });
    return {
        lat: latSum / points.length,
        lng: lngSum / points.length
    };
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
    return Math.abs(area) / 2 / 1600; // 1 ไร่ = 1600 ตารางเมตร
}

// ฟังก์ชันดาวน์โหลดและแคชแผนที่ออฟไลน์สำหรับแปลงอ้อย (OSM และ Google Satellite)
async function cacheMapTilesForPlot(plot, onProgress, onSuccess, onError) {
    if (!plot.location) {
        if (onError) onError("ไม่พบพิกัดของแปลงปลูก");
        return;
    }

    // 1. หาขอบเขตพื้นที่ (Bounding Box)
    let minLat, maxLat, minLng, maxLng;
    
    if (plot.polygon && plot.polygon.length >= 3) {
        // หา Bounding Box จากโพลีกอนจริง
        const lats = plot.polygon.map(p => p[0]);
        const lngs = plot.polygon.map(p => p[1]);
        minLat = Math.min(...lats);
        maxLat = Math.max(...lats);
        minLng = Math.min(...lngs);
        maxLng = Math.max(...lngs);
    } else {
        // ถ้าไม่มีโพลีกอน ให้ใช้พิกัดจุดกึ่งกลางและสร้างกรอบขอบเขตขนาดประมาณ 500x500 เมตร (ประมาณ +-0.0025 องศา)
        const coordParts = plot.location.split(',');
        const lat = parseFloat(coordParts[0].trim());
        const lng = parseFloat(coordParts[1].trim());
        if (isNaN(lat) || isNaN(lng)) {
            if (onError) onError("พิกัดแปลงไม่ถูกต้อง");
            return;
        }
        minLat = lat - 0.0025;
        maxLat = lat + 0.0025;
        minLng = lng - 0.0025;
        maxLng = lng + 0.0025;
    }

    // 2. แปลง Lat/Lng เป็น Tile Coordinates สำหรับแต่ละระดับ Zoom (14 ถึง 18)
    const zoomLevels = [14, 15, 16, 17, 18];
    const urlsToFetch = [];

    // ฟังก์ชันคำนวณตำแหน่งแผ่นภาพ (Web Mercator Tile coordinates)
    function latLngToTile(lat, lng, z) {
        const rLat = lat * Math.PI / 180;
        const x = Math.floor((lng + 180) / 360 * Math.pow(2, z));
        const y = Math.floor((1 - Math.log(Math.tan(rLat) + 1 / Math.cos(rLat)) / Math.PI) / 2 * Math.pow(2, z));
        return { x, y };
    }

    zoomLevels.forEach(z => {
        const startTile = latLngToTile(maxLat, minLng, z); // Top-Left
        const endTile = latLngToTile(minLat, maxLng, z);   // Bottom-Right
        
        // จำกัดจำนวนแผ่นภาพต่อซูมระดับสูงๆ เพื่อไม่ให้โหลดหนักเกินไป
        // (สำหรับแปลงทั่วไปจะมีขนาดประมาณ 1-4 แผ่นภาพต่อระดับซูม)
        const maxTilesPerLevel = 16;
        const width = Math.abs(endTile.x - startTile.x) + 1;
        const height = Math.abs(endTile.y - startTile.y) + 1;
        
        if (width * height > maxTilesPerLevel) {
            // ถ้าพื้นที่กว้างเกินไป (เช่น พิกัดเพี้ยน) ให้โหลดเฉพาะแผ่นภาพศูนย์กลาง
            const centerTile = latLngToTile((minLat + maxLat) / 2, (minLng + maxLng) / 2, z);
            urlsToFetch.push({ z, x: centerTile.x, y: centerTile.y });
        } else {
            for (let x = Math.min(startTile.x, endTile.x); x <= Math.max(startTile.x, endTile.x); x++) {
                for (let y = Math.min(startTile.y, endTile.y); y <= Math.max(startTile.y, endTile.y); y++) {
                    urlsToFetch.push({ z, x, y });
                }
            }
        }
    });

    // 3. สร้างรายการ URL ทั้งหมดที่จะดาวน์โหลด (OSM และ Google Satellite)
    const tileUrls = [];
    urlsToFetch.forEach(tile => {
        // OSM URL
        const osmSubdomain = ['a', 'b', 'c'][Math.floor(Math.random() * 3)];
        tileUrls.push(`https://${osmSubdomain}.tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`);
        
        // Google Satellite URL
        const googleSubdomain = ['mt0', 'mt1', 'mt2', 'mt3'][Math.floor(Math.random() * 4)];
        tileUrls.push(`https://${googleSubdomain}.google.com/vt/lyrs=s,h&x=${tile.x}&y=${tile.y}&z=${tile.z}`);
    });

    if (tileUrls.length === 0) {
        if (onError) onError("ไม่พบแผ่นแผนที่ที่จะดาวน์โหลด");
        return;
    }

    console.log(`[Offline Map] Starting pre-cache of ${tileUrls.length} map tiles...`);
    
    let loadedCount = 0;
    const totalCount = tileUrls.length;

    // ดาวน์โหลดแบบขนาน (จำกัด Concurrency = 4 เพื่อถนอมการเชื่อมต่อ)
    const concurrency = 4;
    const queue = [...tileUrls];
    
    async function worker() {
        while (queue.length > 0) {
            const url = queue.shift();
            try {
                // เรียกใช้ fetch ซึ่งตัว Service Worker (sw.js) จะคอยดักจับและเก็บบันทึกลงใน 'map-tiles-cache' โดยอัตโนมัติ
                const response = await fetch(url, { mode: 'no-cors', cache: 'reload' });
                if (response) {
                    loadedCount++;
                    if (onProgress) {
                        onProgress(loadedCount, totalCount);
                    }
                }
            } catch (err) {
                console.warn(`[Offline Map] Failed to fetch tile: ${url}`, err);
                // ข้ามข้อผิดพลาดรายแผ่นภาพเพื่อให้ดาวน์โหลดส่วนที่เหลือต่อได้
                loadedCount++;
                if (onProgress) {
                    onProgress(loadedCount, totalCount);
                }
            }
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
        workers.push(worker());
    }
    
    await Promise.all(workers);
    
    console.log(`[Offline Map] Pre-caching completed for plot: ${plot.name}`);
    if (onSuccess) onSuccess();
}

// ==============================================================================
// SMART MAPPING SYSTEM (GIS) ENGINE [NEW]
// ==============================================================================

let smartMapInstance = null;
let smartMapLayers = {
    yield: null,
    soil: null,
    pest: null,
    staff: null
};
let smartMapGpsWatchId = null;
let smartMapUserMarker = null;
let smartMapUserAccuracyCircle = null;
let smartMapGpsFirstLock = true;

// Initialize Smart Mapping System
function initSmartMappingSystem() {
    const mapDiv = document.getElementById('leaflet-smart-map');
    if (!mapDiv) return;

    // Reset map instance if it already exists
    if (smartMapInstance) {
        if (smartMapGpsWatchId !== null) {
            navigator.geolocation.clearWatch(smartMapGpsWatchId);
            smartMapGpsWatchId = null;
        }
        smartMapUserMarker = null;
        smartMapUserAccuracyCircle = null;
        
        smartMapInstance.remove();
        smartMapInstance = null;
    }

    // Default center: Kuchinarai area default
    let mapCenter = [16.5414, 104.0482]; 
    
    // Find a plot to center on if available
    if (window.plots && window.plots.length > 0) {
        const firstPlot = window.plots[0];
        if (firstPlot.location) {
            const parts = firstPlot.location.split(',');
            const lat = parseFloat(parts[0].trim());
            const lng = parseFloat(parts[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) {
                mapCenter = [lat, lng];
            }
        }
    }

    // Create Map
    smartMapInstance = L.map(mapDiv).setView(mapCenter, 13);

    // Set Map Tile Base Layer (Google Satellite subdomains mt0-mt3)
    L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Google Satellite'
    }).addTo(smartMapInstance);

    // Initialize Layer Groups
    smartMapLayers.yield = L.featureGroup().addTo(smartMapInstance);
    smartMapLayers.soil = L.featureGroup();
    smartMapLayers.pest = L.featureGroup();
    smartMapLayers.staff = L.featureGroup().addTo(smartMapInstance);

    // Populate dropdown options dynamically from database plots
    populateSmartMapFilterOptions();

    // Bind UI toggles
    setupSmartMapToggles();

    // Populate Layers
    renderYieldSmartLayer();
    renderSoilSmartLayer();
    renderPestSmartLayer();
    renderStaffSmartLayer();

    // Refresh UI stats panel
    updateSmartMapStatsUI();

    // Invalidate size after map has rendered in DOM
    setTimeout(() => {
        if (smartMapInstance) {
            smartMapInstance.invalidateSize();
        }
    }, 200);
}

// Rebuild crop filter selections dynamically from active database plots [NEW]
function populateSmartMapFilterOptions() {
    if (!window.plots) return;

    const cropYearSelect = document.getElementById('filter-map-crop-year');
    const caneTypeSelect = document.getElementById('filter-map-cane-type');
    const varietySelect = document.getElementById('filter-map-variety');

    if (!cropYearSelect || !caneTypeSelect || !varietySelect) return;

    // Save current user selection to restore it afterwards
    const selectedCropYear = cropYearSelect.value;
    const selectedCaneType = caneTypeSelect.value;
    const selectedVariety = varietySelect.value;

    // Extract unique values from database plots
    const cropYears = [...new Set(window.plots.map(p => p.cropYear).filter(Boolean))].sort();
    const caneTypes = [...new Set(window.plots.map(p => p.caneType).filter(Boolean))].sort();
    const varieties = [...new Set(window.plots.map(p => p.variety).filter(Boolean))].sort();

    // Rebuild Crop Year options
    cropYearSelect.innerHTML = '<option value="all">ทั้งหมด</option>';
    cropYears.forEach(year => {
        cropYearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    });
    // Fallback if previous selection is no longer valid
    cropYearSelect.value = cropYears.includes(selectedCropYear) ? selectedCropYear : 'all';

    // Rebuild Cane Type options
    caneTypeSelect.innerHTML = '<option value="all">ทั้งหมด</option>';
    caneTypes.forEach(type => {
        caneTypeSelect.innerHTML += `<option value="${type}">${type}</option>`;
    });
    caneTypeSelect.value = caneTypes.includes(selectedCaneType) ? selectedCaneType : 'all';

    // Rebuild Variety options
    varietySelect.innerHTML = '<option value="all">ทั้งหมด</option>';
    varieties.forEach(v => {
        varietySelect.innerHTML += `<option value="${v}">${v}</option>`;
    });
    varietySelect.value = varieties.includes(selectedVariety) ? selectedVariety : 'all';
}

// Bind layer checkboxes
// Bind layer checkboxes
function setupSmartMapToggles() {
    const bindToggle = (checkboxId, layerGroup) => {
        const cb = document.getElementById(checkboxId);
        if (cb) {
            // Synchronize starting checkbox state
            if (cb.checked) {
                layerGroup.addTo(smartMapInstance);
            } else {
                smartMapInstance.removeLayer(layerGroup);
            }
            
            cb.onchange = (e) => {
                if (e.target.checked) {
                    layerGroup.addTo(smartMapInstance);
                } else {
                    smartMapInstance.removeLayer(layerGroup);
                }
            };
        }
    };

    bindToggle('layer-toggle-yield', smartMapLayers.yield);
    bindToggle('layer-toggle-soil', smartMapLayers.soil);
    bindToggle('layer-toggle-pest', smartMapLayers.pest);
    bindToggle('layer-toggle-staff', smartMapLayers.staff);

    // Toggle layer controls panel visibility
    const toggleBtn = document.getElementById('smart-map-toggle-btn');
    const controlsPanel = document.getElementById('smart-map-controls');
    const closeBtn = document.getElementById('smart-map-controls-close-btn');

    if (toggleBtn && controlsPanel) {
        toggleBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            controlsPanel.classList.toggle('d-none');
            // Close filter panel if open
            document.getElementById('smart-map-filters')?.classList.add('d-none');
        };
    }

    if (closeBtn && controlsPanel) {
        closeBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            controlsPanel.classList.add('d-none');
        };
    }

    // Toggle plot filters panel visibility [NEW]
    const filterBtn = document.getElementById('smart-map-filter-btn');
    const filterPanel = document.getElementById('smart-map-filters');
    const filterCloseBtn = document.getElementById('smart-map-filters-close-btn');

    if (filterBtn && filterPanel) {
        filterBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            filterPanel.classList.toggle('d-none');
            // Close controls panel if open
            controlsPanel?.classList.add('d-none');
        };
    }

    if (filterCloseBtn && filterPanel) {
        filterCloseBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            filterPanel.classList.add('d-none');
        };
    }

    // Bind dropdown filter changes [NEW]
    const filterIds = ['filter-map-crop-year', 'filter-map-cane-type', 'filter-map-irrigation', 'filter-map-variety'];
    filterIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.onchange = () => {
                applySmartMapFilters();
            };
        }
    });

    // Hide panels when clicking on Leaflet map
    if (smartMapInstance) {
        smartMapInstance.on('click', () => {
            controlsPanel?.classList.add('d-none');
            filterPanel?.classList.add('d-none');
        });
    }

    // Toggle GPS real-time tracking [NEW]
    const gpsBtn = document.getElementById('smart-map-gps-btn');
    if (gpsBtn) {
        gpsBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            
            if (smartMapGpsWatchId !== null) {
                // Currently tracking, so turn it off
                stopSmartMapGpsTracking();
            } else {
                // Start tracking
                if (!navigator.geolocation) {
                    showToast('อุปกรณ์ของคุณไม่รองรับการสืบค้นพิกัด Geolocation', 'error');
                    return;
                }
                
                smartMapGpsFirstLock = true;
                
                // Highlight button as active
                gpsBtn.style.background = 'linear-gradient(135deg, #1E40AF, #0F2C59)';
                gpsBtn.style.color = '#ffffff';
                gpsBtn.style.boxShadow = '0 4px 10px rgba(15, 44, 89, 0.4)';
                
                showToast('กำลังเปิดดึงพิกัดตนเองแบบเรียลไทม์...', 'info');
                
                smartMapGpsWatchId = navigator.geolocation.watchPosition(
                    (position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        const accuracy = position.coords.accuracy;
                        
                        // Icon blue-pulse representation
                        const userIcon = L.divIcon({
                            className: 'gps-user-location-icon',
                            html: '<div class="gps-pulse-ring"></div><div class="gps-blue-dot"></div>',
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        });
                        
                        if (smartMapUserMarker) {
                            smartMapUserMarker.setLatLng([lat, lng]);
                        } else {
                            smartMapUserMarker = L.marker([lat, lng], { icon: userIcon }).addTo(smartMapInstance)
                                .bindPopup("📍 <strong>ตำแหน่งของฉัน (สด)</strong>");
                        }
                        
                        if (smartMapUserAccuracyCircle) {
                            smartMapUserAccuracyCircle.setLatLng([lat, lng]);
                            smartMapUserAccuracyCircle.setRadius(accuracy);
                        } else {
                            smartMapUserAccuracyCircle = L.circle([lat, lng], {
                                radius: accuracy,
                                color: '#3b82f6',
                                fillColor: '#3b82f6',
                                fillOpacity: 0.12,
                                weight: 1
                            }).addTo(smartMapInstance);
                        }
                        
                        if (smartMapGpsFirstLock) {
                            smartMapInstance.setView([lat, lng], 16);
                            smartMapGpsFirstLock = false;
                            showToast('ระบุพิกัดตำแหน่งเรียลไทม์สำเร็จ', 'success');
                        }
                    },
                    (err) => {
                        console.error("GPS Watch Error:", err);
                        showToast('ระบุตำแหน่งพิกัด GPS ล้มเหลว โปรดตรวจสอบสิทธิ์การเข้าถึงพิกัด', 'error');
                        stopSmartMapGpsTracking();
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 4000,
                        timeout: 8000
                    }
                );
            }
        };
    }
}

// Function to stop real-time GPS tracking on smart map [NEW]
function stopSmartMapGpsTracking() {
    if (smartMapGpsWatchId !== null) {
        navigator.geolocation.clearWatch(smartMapGpsWatchId);
        smartMapGpsWatchId = null;
    }
    if (smartMapUserMarker) {
        if (smartMapInstance) smartMapInstance.removeLayer(smartMapUserMarker);
        smartMapUserMarker = null;
    }
    if (smartMapUserAccuracyCircle) {
        if (smartMapInstance) smartMapInstance.removeLayer(smartMapUserAccuracyCircle);
        smartMapUserAccuracyCircle = null;
    }
    
    // Reset button UI style
    const gpsBtn = document.getElementById('smart-map-gps-btn');
    if (gpsBtn) {
        gpsBtn.style.background = 'rgba(255, 255, 255, 0.95)';
        gpsBtn.style.color = '#64748b';
        gpsBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)';
    }
    showToast('ปิดการทำงานการติดตามตำแหน่ง GPS', 'info');
}

// Get filtered plots based on current dropdown options [NEW]
function getFilteredPlots() {
    if (!window.plots) return [];
    
    const cropYearVal = document.getElementById('filter-map-crop-year')?.value || 'all';
    const caneTypeVal = document.getElementById('filter-map-cane-type')?.value || 'all';
    const irrigationVal = document.getElementById('filter-map-irrigation')?.value || 'all';
    const varietyVal = document.getElementById('filter-map-variety')?.value || 'all';
    
    return window.plots.filter(plot => {
        // Crop Year
        if (cropYearVal !== 'all' && plot.cropYear !== cropYearVal) return false;
        
        // Cane Type
        if (caneTypeVal !== 'all' && plot.caneType !== caneTypeVal) return false;
        
        // Irrigation
        if (irrigationVal !== 'all') {
            const hasIrr = !!plot.hasIrrigation;
            if (irrigationVal === 'irrigated' && !hasIrr) return false;
            if (irrigationVal === 'rainfed' && hasIrr) return false;
        }
        
        // Variety
        if (varietyVal !== 'all' && plot.variety !== varietyVal) return false;
        
        return true;
    });
}

// Apply chosen filters and redraw the map [NEW]
function applySmartMapFilters() {
    renderYieldSmartLayer();
    renderSoilSmartLayer();
    renderPestSmartLayer();
    updateSmartMapStatsUI();
}

// Update stats panel
function updateSmartMapStatsUI() {
    const filtered = getFilteredPlots();
    const countPlots = filtered.length;
    const countPests = filtered.filter(p => p.pestReported || p.polygonStatus === 'pest_alert').length; 
    const countStaff = 2; // simulated staff counts

    const elPlots = document.getElementById('map-stat-plots');
    const elPests = document.getElementById('map-stat-pests');
    const elStaff = document.getElementById('map-stat-staff');

    if (elPlots) elPlots.innerText = countPlots;
    if (elPests) elPests.innerText = countPests;
    if (elStaff) elStaff.innerText = countStaff + ' คน';

    const elStatus = document.getElementById('smart-map-status');
    if (elStatus) {
        const staffId = localStorage.getItem('smart_farmer_staff_id');
        elStatus.innerText = staffId ? `เจ้าหน้าที่ (${staffId})` : 'โหมดชาวไร่';
        elStatus.style.background = staffId ? 'rgba(124, 58, 237, 0.45)' : 'rgba(255, 255, 255, 0.15)';
        elStatus.style.color = staffId ? '#e9d5ff' : '#94a3b8';
    }
}

function getPlotPolygon(plot) {
    if (plot.polygon && plot.polygon.length >= 3) {
        return plot.polygon;
    }
    if (!plot.location) return null;
    const coordParts = plot.location.split(',');
    const lat = parseFloat(coordParts[0].trim());
    const lng = parseFloat(coordParts[1].trim());
    if (isNaN(lat) || isNaN(lng)) return null;

    const areaRai = parseFloat(plot.area) || 10;
    const sideMeters = Math.sqrt(areaRai * 1600);
    const distDeg = (sideMeters / 2) / 111320;
    
    // สร้างสี่เหลี่ยมรอบแปลงอ้อยจำลอง
    const square = [
        [lat + distDeg, lng - distDeg],
        [lat + distDeg, lng + distDeg],
        [lat - distDeg, lng + distDeg],
        [lat - distDeg, lng - distDeg]
    ];
    // เกลี่ยขอบแปลงจำลองให้โค้งมน 16 ด้านสวยงามแทนสี่เหลี่ยมทื่อๆ
    return smoothPolygonChaikin(square, 2);
}

function getYieldColor(plot) {
    const stalks = parseFloat(plot.stalksPerMeter) || 8;
    const h = parseFloat(plot.height) || 2.2;
    const d = parseFloat(plot.diameter) || 2.5;
    const sp = parseFloat(plot.spacing) || 1.2;
    
    // Calculate simulated tons per rai
    const tonsPerRai = stalks * h * (d * 0.15) * (1.2 / sp); 
    
    if (tonsPerRai >= 12) return { border: '#10b981', fill: '#10b981', name: 'ดีเยี่ยม (>12 ตัน/ไร่)', val: tonsPerRai };
    if (tonsPerRai >= 8) return { border: '#d97706', fill: '#fbbf24', name: 'ปานกลาง (8-12 ตัน/ไร่)', val: tonsPerRai };
    return { border: '#ef4444', fill: '#f87171', name: 'วิกฤต (<8 ตัน/ไร่)', val: tonsPerRai };
}

function renderYieldSmartLayer() {
    smartMapLayers.yield.clearLayers();
    const filtered = getFilteredPlots();
    if (filtered.length === 0) return;

    const currentStaffId = localStorage.getItem('smart_farmer_staff_id');

    filtered.forEach(plot => {
        const coords = getPlotPolygon(plot);
        if (!coords) return;

        const colorConfig = getYieldColor(plot);
        
        // 1. Determine responsibility if in Staff Mode
        const isMyPlot = currentStaffId ? (typeof window.isStaffResponsibleForPlot === 'function' ? window.isStaffResponsibleForPlot(currentStaffId, plot) : true) : true;
        
        // 2. Set fill opacity based on responsibility (brighter/more opaque for own plots)
        let fillOpacity = 0.5;
        let weight = 2.5;
        if (currentStaffId) {
            fillOpacity = isMyPlot ? 0.85 : 0.15;
            weight = isMyPlot ? 4 : 1.2;
        }

        // 3. Determine border color based on Cane Type (New planting: Green, Ratooned: Brown)
        let borderColor = colorConfig.border;
        if (plot.caneType === 'อ้อยปลูกใหม่') {
            borderColor = '#22c55e'; // Bright Green border
        } else if (plot.caneType === 'อ้อยตอ') {
            borderColor = '#b45309'; // Rich Brown border
        }

        const poly = L.polygon(coords, {
            color: borderColor,
            weight: weight,
            fillColor: colorConfig.fill,
            fillOpacity: fillOpacity
        }).addTo(smartMapLayers.yield);

        const estYield = (parseFloat(plot.area) * colorConfig.val);
        const popupContent = `
            <div style="font-family:'Prompt',sans-serif; min-width: 170px; text-align: left; line-height: 1.4;">
                <h4 style="margin:0 0 6px 0; font-size:12px; color:#10b981; font-weight:700;">🌾 แปลง: ${plot.name}</h4>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>เลขโควตา:</b> #${plot.quota}</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ขนาดพื้นที่:</b> ${plot.area} ไร่</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>สายพันธุ์:</b> ${plot.variety}</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ประเภทอ้อย:</b> ${plot.caneType || 'ไม่ระบุ'}</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ผลผลิตต่อไร่:</b> ${colorConfig.val.toFixed(1)} ตัน/ไร่</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ประมาณการรวม:</b> ${estYield.toFixed(1)} ตัน</div>
                <div style="font-size:10px; color:#555; margin-bottom:8px;"><b>ระดับสุขภาพ:</b> <span style="color:${colorConfig.border}; font-weight:700;">${colorConfig.name}</span></div>
                <button type="button" onclick="showSmartMapDetails('plot', '${plot.id}')" style="background:var(--brand-green); color:white; border:none; padding:4px 8px; border-radius:6px; font-size:9.5px; width:100%; cursor:pointer; font-weight:600; text-align:center;">🔍 วิเคราะห์ข้อมูลแปลงเชิงลึก</button>
            </div>
        `;
        poly.bindPopup(popupContent);
    });
}

function getSoilConfig(soilType) {
    switch (soilType) {
        case 'loam':
            return { name: 'ดินร่วน (กำแพงแสน)', border: '#047857', fill: '#059669', desc: 'ดินอุ้มน้ำดี สารอาหารสูง' };
        case 'sandy_loam':
            return { name: 'ดินร่วนปนทราย', border: '#b45309', fill: '#d97706', desc: 'ไถพรวนง่าย ระบายน้ำดี' };
        case 'clay_loam':
            return { name: 'ดินร่วนเหนียว', border: '#0369a1', fill: '#0284c7', desc: 'อุ้มน้ำและธาตุอาหารดีเยี่ยม' };
        case 'sandy':
            return { name: 'ดินทรายจัด', border: '#c2410c', fill: '#ea580c', desc: 'ระบายน้ำเร็ว สารอาหารน้อย' };
        case 'clay':
            return { name: 'ดินเหนียวจัด', border: '#6b21a8', fill: '#8b5cf6', desc: 'ระบายน้ำยาก แต่วัตถุดิบอุ้มน้ำดี' };
        default:
            return { name: 'ดินร่วน (กำแพงแสน)', border: '#047857', fill: '#059669', desc: 'ดินอุ้มน้ำดี สารอาหารสูง' };
    }
}

function renderSoilSmartLayer() {
    smartMapLayers.soil.clearLayers();
    const filtered = getFilteredPlots();
    if (filtered.length === 0) return;

    const currentStaffId = localStorage.getItem('smart_farmer_staff_id');

    filtered.forEach(plot => {
        const coords = getPlotPolygon(plot);
        if (!coords) return;

        const soilType = plot.soilType || 'loam';
        const config = getSoilConfig(soilType);

        // 1. Determine responsibility if in Staff Mode
        const isMyPlot = currentStaffId ? (typeof window.isStaffResponsibleForPlot === 'function' ? window.isStaffResponsibleForPlot(currentStaffId, plot) : true) : true;
        
        // 2. Set fill opacity based on responsibility (brighter/more opaque for own plots)
        let fillOpacity = 0.4;
        let weight = 2;
        if (currentStaffId) {
            fillOpacity = isMyPlot ? 0.8 : 0.12;
            weight = isMyPlot ? 3.5 : 1.2;
        }

        // 3. Determine border color based on Cane Type (New planting: Green, Ratooned: Brown)
        let borderColor = config.border;
        if (plot.caneType === 'อ้อยปลูกใหม่') {
            borderColor = '#22c55e'; // Bright Green border
        } else if (plot.caneType === 'อ้อยตอ') {
            borderColor = '#b45309'; // Rich Brown border
        }
        
        const poly = L.polygon(coords, {
            color: borderColor,
            weight: weight,
            fillColor: config.fill,
            fillOpacity: fillOpacity,
            dashArray: '3, 5'
        }).addTo(smartMapLayers.soil);

        const popupContent = `
            <div style="font-family:'Prompt',sans-serif; min-width: 160px; text-align: left; line-height: 1.4;">
                <h4 style="margin:0 0 6px 0; font-size:12px; color:#d97706; font-weight:700;">🧪 ข้อมูลดิน: ${plot.name}</h4>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ประเภทดิน:</b> ${config.name}</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ลักษณะดิน:</b> ${config.desc}</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ประเภทอ้อย:</b> ${plot.caneType || 'ไม่ระบุ'}</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ระดับ N-P-K:</b> N=16, P=8, K=8</div>
                <div style="font-size:10px; color:#555; margin-bottom:8px;"><b>ความชื้นเฉลี่ย:</b> 65% (ระดับพอดี)</div>
                <button type="button" onclick="showSmartMapDetails('soil', '${plot.id}')" style="background:#ea580c; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:9.5px; width:100%; cursor:pointer; font-weight:600; text-align:center;">🧪 ดูคำแนะนำสูตรปุ๋ย</button>
            </div>
        `;
        poly.bindPopup(popupContent);
    });
}

function renderPestSmartLayer() {
    smartMapLayers.pest.clearLayers();
    const filtered = getFilteredPlots();
    if (filtered.length === 0) return;

    filtered.forEach((plot, index) => {
        // Simulate pest outbreak on first plot or if marked in database
        const hasPest = plot.pestReported || (index === 0); 
        if (!hasPest) return;

        const coords = getPlotPolygon(plot);
        if (!coords) return;
        
        const center = getPolygonCenter(coords);
        
        // 1. Red warning marker
        const redIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        const marker = L.marker([center.lat, center.lng], { icon: redIcon }).addTo(smartMapLayers.pest);
        
        // 2. Pulsing danger buffer ring (500m)
        const circle = L.circle([center.lat, center.lng], {
            radius: 500,
            color: '#ef4444',
            weight: 1,
            fillColor: '#ef4444',
            fillOpacity: 0.15,
            className: 'pest-outbreak-pulse'
        }).addTo(smartMapLayers.pest);

        const popupContent = `
            <div style="font-family:'Prompt',sans-serif; min-width: 170px; text-align: left; line-height: 1.4;">
                <h4 style="margin:0 0 6px 0; font-size:12px; color:#ef4444; font-weight:700;">⚠️ ตรวจพบศัตรูพืชระบาด!</h4>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>โรคระบาด:</b> โรคใบขาวอ้อย (White Leaf)</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>แปลงเฝ้าระวัง:</b> แปลง ${plot.name}</div>
                <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>ขอบเขตผลกระทบ:</b> รัศมี 500 เมตร</div>
                <div style="font-size:10px; color:#555; margin-bottom:8px;"><b>status ปัจจุบัน:</b> ส่งมอบพนักงานด่วน</div>
                <button type="button" onclick="showSmartMapDetails('pest', '${plot.id}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:9.5px; width:100%; cursor:pointer; font-weight:600; text-align:center;">🐛 ดูแนวทางแก้ไขด่วน</button>
            </div>
        `;
        marker.bindPopup(popupContent);
        circle.bindPopup(popupContent);
    });
}

function renderStaffSmartLayer() {
    smartMapLayers.staff.clearLayers();
    if (!window.plots || window.plots.length === 0) return;

    const coords = getPlotPolygon(window.plots[0]);
    if (!coords) return;
    const center = getPolygonCenter(coords);

    // Simulate two field officers positions
    const staff1Pos = [center.lat + 0.005, center.lng - 0.005];
    const staff2Pos = [center.lat - 0.004, center.lng + 0.006];

    const staffIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background:#7c3aed; width:30px; height:30px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.3); font-size:14px;">👨‍💼</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const m1 = L.marker(staff1Pos, { icon: staffIcon }).addTo(smartMapLayers.staff);
    const m2 = L.marker(staff2Pos, { icon: staffIcon }).addTo(smartMapLayers.staff);

    m1.bindPopup(`
        <div style="font-family:'Prompt',sans-serif; text-align: left; min-width: 140px; line-height: 1.4;">
            <h4 style="margin:0 0 4px 0; font-size:12px; color:#7c3aed; font-weight:700;">🧑‍💼 ประสงค์ ใจดี (เขต 1)</h4>
            <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>สถานะ:</b> ตรวจสอบปุ๋ยผสมสั่งตัด</div>
            <div style="font-size:10px; color:#555; margin-bottom:6px;"><b>เป้าหมายถัดไป:</b> แปลง ${window.plots[0].name}</div>
            <button type="button" onclick="showSmartMapDetails('staff', 'staff-1')" style="background:#7c3aed; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:9.5px; width:100%; cursor:pointer; font-weight:600; text-align:center;">📞 ติดต่อพนักงานส่งเสริม</button>
        </div>
    `);

    m2.bindPopup(`
        <div style="font-family:'Prompt',sans-serif; text-align: left; min-width: 140px; line-height: 1.4;">
            <h4 style="margin:0 0 4px 0; font-size:12px; color:#7c3aed; font-weight:700;">🧑‍💼 สมศักดิ์ แสนดี (เขต 1)</h4>
            <div style="font-size:10px; color:#555; margin-bottom:4px;"><b>สถานะ:</b> เคลื่อนที่ตามรถบรรทุก</div>
            <div style="font-size:10px; color:#555; margin-bottom:6px;"><b>การดำเนินงาน:</b> ออนไลน์เรียลไทม์</div>
            <button type="button" onclick="showSmartMapDetails('staff', 'staff-2')" style="background:#7c3aed; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:9.5px; width:100%; cursor:pointer; font-weight:600; text-align:center;">📞 ติดต่อพนักงานส่งเสริม</button>
        </div>
    `);
}

function showSmartMapDetails(type, id) {
    const card = document.getElementById('smart-map-details-card');
    if (!card) return;

    card.classList.remove('d-none');
    card.innerHTML = '';

    if (type === 'plot') {
        const plot = window.plots.find(p => p.id === id);
        if (!plot) return;
        
        const area = parseFloat(plot.area) || 0;
        const colorConfig = getYieldColor(plot);
        const estYield = area * colorConfig.val;
        const profit = estYield * (parseFloat(plot.buyingPrice) || 890) - (area * 5500); 

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px;">
                <h3 style="margin:0; font-size:13.5px; font-weight:700; color:var(--brand-green);">🌾 ผลประเมินสุขภาพและคาดการณ์ผลผลิตแปลง: ${plot.name}</h3>
                <button type="button" onclick="document.getElementById('smart-map-details-card').classList.add('d-none')" style="background:none; border:none; font-size:18px; font-weight:700; cursor:pointer;">&times;</button>
            </div>
            <div style="display:grid; grid-template-columns:1.2fr 0.8fr; gap:10px; font-size:11.5px; line-height:1.6; text-align:left;">
                <div><b>สายพันธุ์อ้อย:</b> ${plot.variety}</div>
                <div><b>ขนาดพื้นที่:</b> ${plot.area} ไร่</div>
                <div><b>ระบบชลประทาน:</b> ${plot.hasIrrigation ? '💧 มีระบบชลประทาน' : '❌ อาศัยน้ำฝน'}</div>
                <div><b>วันแจ้งปลูก:</b> ${plot.plantingDate}</div>
                <div><b>คาดการณ์อ้อย:</b> <span style="color:var(--brand-green); font-weight:700;">${estYield.toFixed(1)} ตัน</span></div>
                <div><b>กำไรสะสมโดยประมาณ:</b> <span style="color:#10b981; font-weight:700;">${profit.toLocaleString()} บาท</span></div>
            </div>
            <div style="margin-top:12px; display:flex; gap:8px;">
                <button type="button" onclick="currentPlotId='${plot.id}'; switchScreen('screen-estimate')" class="btn" style="flex:1; margin:0; height:34px; font-size:11px; background:var(--brand-green); color:white; border:none; border-radius:8px;">🎋 จำลองสไลเดอร์ผลผลิต</button>
                <button type="button" onclick="currentPlotId='${plot.id}'; switchScreen('screen-support')" class="btn btn-secondary" style="flex:1; margin:0; height:34px; font-size:11px; border-radius:8px;">📋 ยื่นเรื่องขอปุ๋ย/เงินทุน</button>
            </div>
        `;
    } else if (type === 'soil') {
        const plot = window.plots.find(p => p.id === id);
        if (!plot) return;
        
        const soilType = plot.soilType || 'loam';
        const config = getSoilConfig(soilType);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px;">
                <h3 style="margin:0; font-size:13.5px; font-weight:700; color:#d97706;">🧪 การจัดการเคมีดินและปุ๋ยผสมรายแปลง: ${plot.name}</h3>
                <button type="button" onclick="document.getElementById('smart-map-details-card').classList.add('d-none')" style="background:none; border:none; font-size:18px; font-weight:700; cursor:pointer;">&times;</button>
            </div>
            <div style="font-size:11.5px; line-height:1.6; text-align:left; margin-bottom:10px;">
                <b>ประเภทเนื้อดิน:</b> ${config.name} (${config.desc})<br>
                <b>สถานะสารอาหารอินทรียวัตถุ:</b> ไนโตรเจน (N): <span style="color:#ef4444; font-weight:700;">ขาดแคลน 🔴</span> | ฟอสฟอรัส (P): <span style="color:#d97706; font-weight:700;">ปานกลาง 🟡</span> | โพแทสเซียม (K): <span style="color:#10b981; font-weight:700;">สมบูรณ์ 🟢</span>
            </div>
            <div style="background:#fff7ed; border:1px solid #ffedd5; border-radius:8px; padding:8px; font-size:10.5px; color:#9a3412; line-height:1.45; text-align:left; margin-bottom:10px;">
                🧪 <b>สูตรผสมปุ๋ยผสมเอง (แม่ปุ๋ย 3 สูตร):</b> แนะนำใช้ <b>46-0-0</b> (ยูเรีย) 8.5 กก./ไร่ + <b>18-46-0</b> (แดป) 4.0 กก./ไร่ เพื่อสร้างการเจริญเติบโตที่สูงสุดตามความกว้างแถวปลูก
            </div>
            <div style="display:flex; gap:8px;">
                <button type="button" onclick="currentPlotId='${plot.id}'; switchScreen('screen-estimate')" class="btn" style="width:100%; margin:0; height:34px; font-size:11px; background:#d97706; color:white; border:none; border-radius:8px;">🧪 ไปคำนวณสัดส่วนผสมปุ๋ยสั่งตัดรายแปลง</button>
            </div>
        `;
    } else if (type === 'pest') {
        const plot = window.plots.find(p => p.id === id);
        if (!plot) return;

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px;">
                <h3 style="margin:0; font-size:13.5px; font-weight:700; color:#ef4444;">🐛 รายงานพิกัดและพื้นที่ระบาดวิกฤต: ${plot.name}</h3>
                <button type="button" onclick="document.getElementById('smart-map-details-card').classList.add('d-none')" style="background:none; border:none; font-size:18px; font-weight:700; cursor:pointer;">&times;</button>
            </div>
            <div style="font-size:11.5px; line-height:1.5; text-align:left; margin-bottom:10px;">
                <b>โรคระบาดที่พบ:</b> โรคใบขาวอ้อย (เกิดจากเชื้อไฟโตพลาสมา)<br>
                <b>สถานะเตือนภัย:</b> <span style="color:#ef4444; font-weight:700;">รัศมีอันตราย 500 เมตร (แปลงเพาะปลูกข้างเคียงต้องเฝ้าระวัง)</span>
            </div>
            <div style="background:#fef2f2; border:1px solid #fee2e2; border-radius:8px; padding:8px; font-size:10.5px; color:#991b1b; line-height:1.45; text-align:left; margin-bottom:10px;">
                ⚠️ <b>แนวทางแก้ไขเร่งด่วน:</b> ถอนกออ้อยที่ติดเชื้อแล้วนำไปเผาทำลายนอกแปลงด่วนเพื่อหยุดยั้งพาหะเพลี้ยจักจั่น และพ่นสารชีวภัณฑ์เสริมภูมิคุ้มกันในแปลงรอบข้าง
            </div>
            <div style="display:flex; gap:8px;">
                <button type="button" onclick="currentPlotId='${plot.id}'; switchScreen('screen-pest')" class="btn" style="width:100%; margin:0; height:34px; font-size:11px; background:#ef4444; color:white; border:none; border-radius:8px;">🐛 บันทึกส่งพิกัดระบาดโรคพืชเพิ่มเติม</button>
            </div>
        `;
    } else if (type === 'staff') {
        const name = id === 'staff-1' ? 'ประสงค์ ใจดี (เขต 1)' : 'สมศักดิ์ แสนดี (เขต 1)';
        const details = id === 'staff-1' ? 'เจ้าหน้าที่ส่งเสริมการเกษตรผู้เชี่ยวชาญการตรวจดิน' : 'เจ้าหน้าที่ผู้รับผิดชอบระบบคิวและการขนส่งอ้อย';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px;">
                <h3 style="margin:0; font-size:13.5px; font-weight:700; color:#7c3aed;">🧑‍💼 ข้อมูลติดต่อพนักงานส่งเสริมภาคสนาม</h3>
                <button type="button" onclick="document.getElementById('smart-map-details-card').classList.add('d-none')" style="background:none; border:none; font-size:18px; font-weight:700; cursor:pointer;">&times;</button>
            </div>
            <div style="font-size:11.5px; line-height:1.6; text-align:left; margin-bottom:10px;">
                <b>ชื่อ-สกุล:</b> ${name}<br>
                <b>สิทธิ์ตำแหน่ง:</b> ${details}<br>
                <b>สถานะการปฏิบัติงาน:</b> กำลังเดินงานภาคสนาม (พิกัดดาวเทียมทำงาน) 🟢
            </div>
            <div style="display:flex; gap:8px;">
                <button type="button" onclick="alert('📞 กำลังจำลองส่งสัญญาณเรียกสายสนทนากับ ${name}...');" class="btn" style="width:100%; margin:0; height:34px; font-size:11px; background:#7c3aed; color:white; border:none; border-radius:8px;">📞 กดปุ่มติดต่อเจ้าหน้าที่โดยตรง</button>
            </div>
        `;
    }
}

