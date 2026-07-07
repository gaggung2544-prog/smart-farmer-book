// Smart Farmer Book - Sugarcane Harvester Queue Dispatch Module

// 1. Tab switching inside the Harvest screen
function switchHarvestTab(tab) {
    const queueTab = document.getElementById('har-queue-tab-content');
    const logTab = document.getElementById('har-log-tab-content');
    const btnQueue = document.getElementById('tab-btn-harvest-queue');
    const btnLog = document.getElementById('tab-btn-harvest-log');

    if (!queueTab || !logTab || !btnQueue || !btnLog) return;

    if (tab === 'queue') {
        queueTab.classList.remove('d-none');
        logTab.classList.add('d-none');
        btnQueue.classList.add('active');
        btnLog.classList.remove('active');
        
        // Apply Premium styles inline
        btnQueue.style.background = 'var(--brand-green)';
        btnQueue.style.color = '#ffffff';
        btnLog.style.background = 'transparent';
        btnLog.style.color = 'var(--text-secondary)';
        
        renderHarvestQueueForm();
    } else {
        logTab.classList.remove('d-none');
        queueTab.classList.add('d-none');
        btnLog.classList.add('active');
        btnQueue.classList.remove('active');
        
        // Apply Premium styles inline
        btnLog.style.background = 'var(--brand-green)';
        btnLog.style.color = '#ffffff';
        btnQueue.style.background = 'transparent';
        btnQueue.style.color = 'var(--text-secondary)';
        
        if (typeof renderHarvestLogger === 'function') {
            renderHarvestLogger();
        }
    }
}

// 2. Initialize and render harvest tabs screen
function renderHarvestTabs() {
    const userPlots = (typeof getUserPlots === 'function') ? getUserPlots() : [];
    if (userPlots.length === 0) {
        document.getElementById('har-form-content').classList.add('d-none');
        document.getElementById('har-empty-state').classList.remove('d-none');
        return;
    }
    
    document.getElementById('har-form-content').classList.remove('d-none');
    document.getElementById('har-empty-state').classList.add('d-none');

    // Filter plots that are not harvested yet
    const unharvestedPlots = userPlots.filter(p => !p.isHarvested);
    
    if (unharvestedPlots.length === 0) {
        // If all plots are already harvested, default to the Log tab
        switchHarvestTab('log');
    } else {
        // Otherwise, default to the Harvester Queue tab
        switchHarvestTab('queue');
    }
}

// 3. Render the Harvester Queue Request Form
function renderHarvestQueueForm() {
    const queuePlotSelect = document.getElementById('queue-plot-select');
    if (!queuePlotSelect) return;
    
    queuePlotSelect.innerHTML = '';
    const userPlots = (typeof getUserPlots === 'function') ? getUserPlots() : [];
    const unharvestedPlots = userPlots.filter(p => !p.isHarvested);

    if (unharvestedPlots.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.innerText = '-- ทุกแปลงได้รับการเก็บเกี่ยวแล้ว --';
        queuePlotSelect.appendChild(opt);
        document.getElementById('queue-promoter-card').classList.add('d-none');
        document.getElementById('queue-est-weight-card').classList.add('d-none');
        return;
    }

    unharvestedPlots.forEach(plot => {
        const opt = document.createElement('option');
        opt.value = plot.id;
        opt.innerText = `${plot.name} (${plot.cn})`;
        if (plot.id === currentPlotId) {
            opt.selected = true;
        }
        queuePlotSelect.appendChild(opt);
    });

    handleQueuePlotChange();
}

// 4. Handle dropdown selection change in queue request
function handleQueuePlotChange() {
    const plotId = document.getElementById('queue-plot-select').value;
    if (!plotId) return;

    currentPlotId = plotId;
    const plot = plots.find(p => p.id === plotId);
    if (!plot) return;

    // Calculate estimated tons (average 10 tons per rai)
    const area = parseFloat(plot.area) || 0;
    const estTons = area * 10;
    const estWeightVal = document.getElementById('queue-est-weight-val');
    if (estWeightVal) {
        estWeightVal.innerText = `${estTons.toFixed(1)} ตัน`;
        document.getElementById('queue-est-weight-card').classList.remove('d-none');
    }

    // Resolve assigned promoter
    const subzone = (typeof getSubzoneByQuota === 'function') ? getSubzoneByQuota(plot.quota) : null;
    const promoterCard = document.getElementById('queue-promoter-card');
    const promoterNameEl = document.getElementById('queue-promoter-name');
    const promoterCodeEl = document.getElementById('queue-promoter-code');

    if (subzone && promoterCard && promoterNameEl && promoterCodeEl) {
        const name = (typeof getStaffName === 'function') ? getStaffName(subzone) : 'ไม่ทราบ';
        promoterNameEl.innerText = name;
        promoterCodeEl.innerText = `รหัสเขตส่งเสริม: ${subzone}`;
        promoterCard.classList.remove('d-none');
    } else if (promoterCard) {
        promoterCard.classList.add('d-none');
    }

    // Load existing request if present
    const req = plot.harvesterRequest;
    const submitBtn = document.querySelector('#queue-form button[type="submit"]');
    
    if (req) {
        document.getElementById('queue-date').value = req.targetDate || '';
        selectQueueHarvestType(req.harvestType || 'อ้อยสด');
        selectQueueHarvesterType(req.harvesterType || 'รถตัดโรงงาน (AE)');
        document.getElementById('queue-notes').value = req.notes || '';
        
        let statusBadge = '';
        if (req.status === 'PENDING_DISPATCH') {
            statusBadge = ' <span style="background:#fff3cd; color:#856404; font-size:10px; padding:2px 8px; border-radius:12px; font-weight:700;">⏳ รอจัดคิว</span>';
        } else if (req.status === 'DISPATCHED') {
            statusBadge = ' <span style="background:#d4edda; color:#155724; font-size:10px; padding:2px 8px; border-radius:12px; font-weight:700;">🟢 จัดรถตัดแล้ว</span>';
        } else if (req.status === 'COMPLETED') {
            statusBadge = ' <span style="background:#cce5ff; color:#004085; font-size:10px; padding:2px 8px; border-radius:12px; font-weight:700;">✅ สำเร็จแล้ว</span>';
        }
        
        if (submitBtn) {
            submitBtn.innerHTML = `🔄 อัปเดตคำร้องขอคิวรถตัด ${statusBadge}`;
        }
    } else {
        // Reset defaults
        document.getElementById('queue-date').value = '';
        selectQueueHarvestType('อ้อยสด');
        selectQueueHarvesterType('รถตัดโรงงาน (AE)');
        document.getElementById('queue-notes').value = '';
        if (submitBtn) {
            submitBtn.innerHTML = `📤 ส่งคำร้องขอคิวรถตัดไปยังผู้ส่งเสริม`;
        }
    }
}

// 5. Select harvesting method radio card
function selectQueueHarvestType(val) {
    const fresh = document.getElementById('label-queue-type-fresh');
    const burnt = document.getElementById('label-queue-type-burnt');
    const radioFresh = document.querySelector('input[name="queue-harvest-type"][value="อ้อยสด"]');
    const radioBurnt = document.querySelector('input[name="queue-harvest-type"][value="ไฟไหม้"]');

    if (!fresh || !burnt || !radioFresh || !radioBurnt) return;

    if (val === 'อ้อยสด') {
        radioFresh.checked = true;
        fresh.style.borderColor = 'var(--brand-green)';
        fresh.style.background = 'var(--brand-green-bg)';
        burnt.style.borderColor = 'var(--border-color)';
        burnt.style.background = 'transparent';
    } else {
        radioBurnt.checked = true;
        burnt.style.borderColor = 'var(--brand-red)';
        burnt.style.background = 'rgba(217, 83, 79, 0.05)';
        fresh.style.borderColor = 'var(--border-color)';
        fresh.style.background = 'transparent';
    }
}

// 6. Select harvester type radio card
function selectQueueHarvesterType(val) {
    const factory = document.getElementById('label-queue-harvester-factory');
    const farmer = document.getElementById('label-queue-harvester-farmer');
    const radioFactory = document.querySelector('input[name="queue-harvester-type"][value="รถตัดโรงงาน (AE)"]');
    const radioFarmer = document.querySelector('input[name="queue-harvester-type"][value="รถตัดชาวไร่"]');

    if (!factory || !farmer || !radioFactory || !radioFarmer) return;

    if (val === 'รถตัดโรงงาน (AE)') {
        radioFactory.checked = true;
        factory.style.borderColor = 'var(--brand-green)';
        factory.style.background = 'var(--brand-green-bg)';
        farmer.style.borderColor = 'var(--border-color)';
        farmer.style.background = 'transparent';
    } else {
        radioFarmer.checked = true;
        farmer.style.borderColor = 'var(--brand-green)';
        farmer.style.background = 'var(--brand-green-bg)';
        factory.style.borderColor = 'var(--border-color)';
        factory.style.background = 'transparent';
    }
}

// 7. Submit harvester request
function submitHarvesterQueue(event) {
    event.preventDefault();
    
    const plotId = document.getElementById('queue-plot-select').value;
    if (!plotId) return;

    const plot = plots.find(p => p.id === plotId);
    if (!plot) return;

    const subzone = (typeof getSubzoneByQuota === 'function') ? getSubzoneByQuota(plot.quota) : '';
    const promoterName = subzone ? getStaffName(subzone) : 'ไม่ระบุ';

    plot.harvesterRequest = {
        targetDate: document.getElementById('queue-date').value,
        harvestType: document.querySelector('input[name="queue-harvest-type"]:checked').value,
        harvesterType: document.querySelector('input[name="queue-harvester-type"]:checked').value,
        gpsLocation: plot.location || '',
        notes: document.getElementById('queue-notes').value.trim() || 'สามารถเริ่มตัดได้เลยเมื่อถึงแปลง',
        requestedAt: new Date().toLocaleString('th-TH'),
        status: plot.harvesterRequest?.status || 'PENDING_DISPATCH',
        promoterId: subzone,
        promoterName: promoterName
    };

    // Save locally
    if (typeof saveDB === 'function') saveDB();

    // Trigger sync engine queue
    if (typeof queueDataChange === 'function') {
        queueDataChange('UPDATE', plot, 'REGISTRATION');
    }

    if (typeof showToast === 'function') {
        showToast(`ส่งคำขอคิวรถตัดไปยัง ${promoterName} เรียบร้อยแล้ว!`, 'success');
    } else {
        alert(`ส่งคำขอคิวรถตัดไปยัง ${promoterName} เรียบร้อยแล้ว!`);
    }

    // Refresh UI
    handleQueuePlotChange();
}

// 8. Render promoter's harvester requests queue panel
function renderStaffHarvesterRequests() {
    const listContainer = document.getElementById('staff-harvester-requests-list');
    const countBadge = document.getElementById('staff-harvester-request-count');
    
    if (!listContainer || !countBadge) return;
    listContainer.innerHTML = '';

    const currentStaffId = localStorage.getItem('smart_farmer_staff_id');
    if (!currentStaffId) {
        listContainer.innerHTML = '<div style="color:#aaa; font-size:10px; padding:12px; text-align:center;">กรุณาเข้ารหัสผู้ส่งเสริมก่อน</div>';
        countBadge.innerText = '0';
        return;
    }

    // Filter plots with active harvester requests that belong to this promoter's zone
    const searchInput = document.getElementById('staff-farmer-search');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let myRequests = plots.filter(p => {
        return p.harvesterRequest && 
               p.harvesterRequest.status !== 'COMPLETED' && 
               (typeof isStaffResponsibleForPlot === 'function' && isStaffResponsibleForPlot(currentStaffId, p));
    });

    if (searchQuery) {
        myRequests = myRequests.filter(p => 
            (p.quota && String(p.quota).toLowerCase().includes(searchQuery)) || 
            (p.name && String(p.name).toLowerCase().includes(searchQuery))
        );
    }

    countBadge.innerText = myRequests.length;

    if (myRequests.length === 0) {
        listContainer.innerHTML = '<div style="color:#aaa; font-size:10px; padding:12px; text-align:center; background:#fafafa; border:1px dashed #ddd; border-radius:8px;">ไม่มีรายการคำร้องขอคิวรถตัดในเขตพื้นที่รับผิดชอบ</div>';
        return;
    }

    myRequests.forEach(plot => {
        const req = plot.harvesterRequest;
        let statusHtml = '';
        let actionBtnHtml = '';

        if (req.status === 'PENDING_DISPATCH') {
            statusHtml = '<span style="background:#fff3cd; color:#856404; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:700;">⏳ รอจัดคิว</span>';
            actionBtnHtml = `
                <button type="button" class="btn" style="margin:0; height:28px; font-size:11px; padding:0 8px; background:var(--brand-green); color:#fff; border:none; border-radius:6px; font-weight:600;" onclick="dispatchHarvesterQueue('${plot.id}')">
                    🚜 จัดส่งรถตัด
                </button>
            `;
        } else if (req.status === 'DISPATCHED') {
            statusHtml = '<span style="background:#d4edda; color:#155724; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:700;">🟢 จัดส่งรถแล้ว</span>';
            actionBtnHtml = `
                <button type="button" class="btn" style="margin:0; height:28px; font-size:11px; padding:0 8px; background:#17a2b8; color:#fff; border:none; border-radius:6px; font-weight:600;" onclick="completeHarvesterQueue('${plot.id}')">
                    ✅ ตัดเสร็จสิ้น
                </button>
            `;
        }

        const card = document.createElement('div');
        card.style.background = '#fcfcfc';
        card.style.border = '1px solid #e0e0e0';
        card.style.borderRadius = '8px';
        card.style.padding = '10px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '4px';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f3f4; padding-bottom:4px;">
                <span style="font-size:11px; font-weight:700; color:var(--text-primary);">โควตา: ${plot.quota} (CN: ${plot.cn})</span>
                ${statusHtml}
            </div>
            <div style="font-size:12px; font-weight:600; color:var(--text-primary); text-align:left; margin-top:2px;">
                👤 ${plot.name} (<a href="tel:${plot.phone}" style="color:var(--brand-blue); text-decoration:underline;">${plot.phone}</a>)
            </div>
            <div style="font-size:10px; color:var(--text-secondary); text-align:left; line-height:1.4;">
                🌾 <strong>แปลง:</strong> ${plot.variety} | <strong>พื้นที่:</strong> ${plot.area} ไร่
                <br>📅 <strong>นัดตัด:</strong> <strong style="color:#000;">${req.targetDate}</strong>
                <br>🎋 <strong>รูปแบบ:</strong> ${req.harvestType} | <strong>รถตัด:</strong> ${req.harvesterType}
                <br>📍 <strong>พิกัด:</strong> <span style="font-family:'Outfit';">${req.gpsLocation}</span>
                <br>💬 <strong>หมายเหตุ:</strong> <span style="color:#c62828;">"${req.notes}"</span>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px; border-top:1px dashed #eee; padding-top:6px;">
                ${actionBtnHtml}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// 9. Dispatch harvester (move status to DISPATCHED)
function dispatchHarvesterQueue(plotId) {
    const plot = plots.find(p => p.id === plotId);
    if (!plot || !plot.harvesterRequest) return;

    plot.harvesterRequest.status = 'DISPATCHED';
    plot.staffReplyTime = new Date().toLocaleString('th-TH');

    // Save locally
    if (typeof saveDB === 'function') saveDB();

    // Trigger sync engine
    if (typeof queueDataChange === 'function') {
        queueDataChange('UPDATE', plot, 'REGISTRATION');
    }

    if (typeof showToast === 'function') {
        showToast('ดำเนินการจัดส่งรถตัดอ้อยเรียบร้อยแล้ว!', 'success');
    } else {
        alert('ดำเนินการจัดส่งรถตัดอ้อยเรียบร้อยแล้ว!');
    }

    // Refresh dashboards
    if (typeof renderStaffDashboard === 'function') renderStaffDashboard();
}

// 10. Complete harvester queue (mark harvested & status COMPLETED)
function completeHarvesterQueue(plotId) {
    const plot = plots.find(p => p.id === plotId);
    if (!plot || !plot.harvesterRequest) return;

    plot.harvesterRequest.status = 'COMPLETED';
    plot.isHarvested = true;
    plot.actualHarvestDate = plot.harvesterRequest.targetDate;
    plot.harvestMethod = plot.harvesterRequest.harvestType === 'อ้อยสด' ? 'ตัดสด' : 'ตัดไฟไหม้';
    plot.harvestEquipment = 'รถตัด';
    plot.actualHarvestTons = (parseFloat(plot.area) || 0) * 10; // Default seed yield
    plot.actualHarvestCCS = 12.0; // Default seed ccs
    
    plot.staffReplyTime = new Date().toLocaleString('th-TH');

    // Save locally
    if (typeof saveDB === 'function') saveDB();

    // Trigger sync engine
    if (typeof queueDataChange === 'function') {
        queueDataChange('UPDATE', plot, 'REGISTRATION');
    }

    if (typeof showToast === 'function') {
        showToast('บันทึกการเก็บเกี่ยวเสร็จสิ้น!', 'success');
    } else {
        alert('บันทึกการเก็บเกี่ยวเสร็จสิ้น!');
    }

    // Refresh dashboards
    if (typeof renderStaffDashboard === 'function') renderStaffDashboard();
}
