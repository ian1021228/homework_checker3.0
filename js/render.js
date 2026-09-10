import { state } from './state.js';
import { DEFAULT_TYPES } from './constants.js';
import { formatDate, safeStringify, showToast, showConfirmModal, closeModal } from './utils.js';
import { fbDb, fbAuth, isGoogleAdmin } from './firebase.js';

export function getHomeworkType(typeId) { 
    return state.appData.homeworkTypes.find(t => t.id === typeId) || state.appData.homeworkTypes.find(t => t.id === 'default') || DEFAULT_TYPES[0]; 
}

export function isStudentCompleted(student, homeworkTypeId) { 
    const type = getHomeworkType(homeworkTypeId); 
    const statusConfig = type.statuses.find(s => s.key === student.status); 
    return statusConfig ? statusConfig.isCompleted : false; 
}

export function updateSingleStudentUI(seat, oldStatusKey, newStatusKey, typeConfig) {
    const btn = document.getElementById(`btn-seat-${seat}`); 
    if (!btn) return;
    const newStatus = typeConfig.statuses.find(s => s.key === newStatusKey) || typeConfig.statuses[0];
    typeConfig.statuses.forEach(s => {
        const ring = (s.color || '').replace('bg-', 'ring-').replace('-500', '-200').replace('-400', '-200');
        const classesToRemove = [...(s.color || '').split(' '), ...(s.textColor || '').split(' '), `hover:${ring}`, `focus:${ring}`].filter(Boolean);
        btn.classList.remove(...classesToRemove);
    });
    const newRingColor = (newStatus.color || '').replace('bg-', 'ring-').replace('-500', '-200').replace('-400', '-200');
    const newClasses = [...(newStatus.color || '').split(' '), ...(newStatus.textColor || '').split(' '), `hover:${newRingColor}`, `focus:${newRingColor}`].filter(Boolean);
    btn.classList.add(...newClasses);
    const spans = btn.querySelectorAll('span'); 
    if (spans && spans.length > 1) spans[1].textContent = newStatus.text;
}

export function updateSummaryUI(hw) {
    const summaryContainer = document.getElementById('status-summary'); 
    if (!summaryContainer) return;
    const typeConfig = getHomeworkType(hw.typeId || 'default');
    const statusCounts = {};
    typeConfig.statuses.forEach(s => statusCounts[s.key] = 0);
    (hw.students || []).forEach(student => { 
        statusCounts[student.status] = (statusCounts[student.status] || 0) + 1; 
    });
    summaryContainer.innerHTML = '';
    typeConfig.statuses.forEach(s => {
        const count = statusCounts[s.key] || 0; 
        const summaryChip = document.createElement('div');
        summaryChip.className = `flex items-center space-x-1.5 px-3 py-1 rounded-xl shadow-sm ${s.color} ${s.textColor} border border-white/20 backdrop-blur-md`;
        summaryChip.innerHTML = `<span class="font-medium opacity-90 text-[11px] tracking-wide">${s.text}</span><span class="font-black text-sm leading-none">${count}</span>`;
        summaryContainer.appendChild(summaryChip);
    });
}

export function updateTypeSelects() {
    const typeSelect = document.getElementById('homework-type-select'); 
    if (!typeSelect) return; 
    typeSelect.innerHTML = '';
    const filterTypeSelect = document.getElementById('filter-type');
    let currentFilterValue = 'all';
    if (filterTypeSelect) {
        currentFilterValue = filterTypeSelect.value;
        filterTypeSelect.innerHTML = '<option value="all">所有種類</option>';
    }
    state.appData.homeworkTypes.forEach(t => { 
        const opt = document.createElement('option'); 
        opt.value = t.id; 
        opt.textContent = t.name; 
        typeSelect.appendChild(opt); 
        if (filterTypeSelect) {
            const fOpt = document.createElement('option'); 
            fOpt.value = t.id; 
            fOpt.textContent = t.name; 
            filterTypeSelect.appendChild(fOpt);
        }
    });
    if (filterTypeSelect && filterTypeSelect.querySelector(`option[value="${currentFilterValue}"]`)) {
        filterTypeSelect.value = currentFilterValue;
    }
}

export function renderClassSelector() {
    const classSelector = document.getElementById('class-selector'); 
    if (!classSelector) return; 
    classSelector.innerHTML = '';
    if (state.appData.classes.length === 0) {
        const option = document.createElement('option'); 
        option.textContent = '請先建立班級'; 
        classSelector.appendChild(option); 
        classSelector.disabled = true;
        return;
    }
    classSelector.disabled = false;
    state.appData.classes.forEach(c => { 
        const option = document.createElement('option'); 
        option.value = c.id; 
        option.textContent = c.name; 
        if (c.id === state.currentClassId) option.selected = true; 
        classSelector.appendChild(option); 
    });
}

export function renderClassList() {
    const classListDiv = document.getElementById('class-list'); 
    if (!classListDiv) return; 
    classListDiv.innerHTML = '';
    
    if (state.appData.classes.length === 0) {
        classListDiv.innerHTML = '<div class="text-center py-6 text-slate-400 font-medium text-xs">目前尚未建立任何班級</div>';
        return;
    }

    state.appData.classes.forEach(c => {
        const classItem = document.createElement('div');
        classItem.className = 'p-3 bg-white border border-slate-200/80 rounded-2xl mb-2.5 shadow-xs transition-all hover:border-indigo-200 group';
        const code = c.accessCode || '';
        classItem.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
                    <span class="font-black text-slate-800 text-sm truncate" title="${c.name}">${c.name}</span>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                    <div class="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">權限碼</span>
                        <input type="text" data-class-id="${c.id}" class="class-code-input w-20 sm:w-24 bg-transparent text-xs font-mono font-black text-indigo-700 focus:outline-none uppercase" placeholder="未設定" value="${code}" maxlength="16">
                        <button type="button" data-class-id="${c.id}" class="save-class-code-btn text-[11px] font-bold text-indigo-600 hover:text-indigo-800 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors whitespace-nowrap" title="儲存權限碼">儲存</button>
                        <button type="button" data-class-id="${c.id}" class="regen-class-code-btn text-[11px] font-bold text-slate-400 hover:text-slate-700 px-1 py-0.5 rounded hover:bg-slate-200 transition-colors shrink-0" title="隨機產生權限碼">🎲</button>
                    </div>
                    ${code ? `<button type="button" data-code="${code}" data-name="${c.name}" class="copy-class-code-btn px-2.5 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-colors font-bold flex items-center gap-1 shrink-0" title="複製此班級權限代碼"><i class="fa-solid fa-copy"></i><span class="text-[11px] hidden sm:inline">複製代碼</span></button>` : ''}
                    <button data-id="${c.id}" data-name="${c.name}" class="delete-class-btn text-slate-300 hover:text-rose-500 font-bold p-1.5 rounded-xl hover:bg-rose-50 transition-colors text-lg leading-none shrink-0" title="刪除班級">&times;</button>
                </div>
            </div>
        `;
        classListDiv.appendChild(classItem);
    });
}

export function renderAllDoneList(studentsOrSeats, containerId) {
    const container = document.getElementById(containerId); 
    if (!container) return; 
    container.innerHTML = '';
    let displayList = [];
    if (studentsOrSeats.length > 0 && typeof studentsOrSeats[0] === 'object') {
        displayList = studentsOrSeats.map(s => s.seat).sort((a,b) => a-b);
    } else {
        displayList = studentsOrSeats.sort((a,b) => a-b);
    }

    if (displayList.length === 0) { 
        container.innerHTML = '<div class="col-span-full text-center text-slate-400 font-bold py-6 text-sm">目前無人達成條件</div>'; 
        return; 
    }
    displayList.forEach(seat => {
        const badge = document.createElement('div'); 
        badge.className = 'bg-emerald-50 text-emerald-700 font-black text-center py-1.5 text-sm rounded-xl border border-emerald-200/50 shadow-sm';
        badge.textContent = `${seat} 號`; 
        container.appendChild(badge);
    });
}

export function renderHomeworkList() {
    const homeworkList = document.getElementById('homework-list'); 
    if (!homeworkList) return;
    let filteredHomeworks = state.appData.homeworks.filter(hw => hw.classId === state.currentClassId);

    const searchQuery = document.getElementById('search-homework') ? document.getElementById('search-homework').value.trim().toLowerCase() : '';
    const filterType = document.getElementById('filter-type') ? document.getElementById('filter-type').value : 'all';
    const filterDateStart = document.getElementById('filter-date-start') ? document.getElementById('filter-date-start').value : '';
    const filterDateEnd = document.getElementById('filter-date-end') ? document.getElementById('filter-date-end').value : '';

    filteredHomeworks = filteredHomeworks.filter(hw => {
        if (searchQuery && !hw.name.toLowerCase().includes(searchQuery)) return false;
        if (filterType !== 'all' && hw.typeId !== filterType && !(filterType === 'default' && !hw.typeId)) return false;
        
        if (filterDateStart || filterDateEnd) {
            const hwDate = hw.createdAt ? new Date(hw.createdAt) : new Date(0);
            hwDate.setHours(0, 0, 0, 0);
            
            if (filterDateStart) {
                const start = new Date(filterDateStart);
                start.setHours(0, 0, 0, 0);
                if (hwDate < start) return false;
            }
            if (filterDateEnd) {
                const end = new Date(filterDateEnd);
                end.setHours(23, 59, 59, 999);
                if (hwDate > end) return false;
            }
        }
        return true;
    });

    const sortMethod = document.getElementById('sort-homework') ? document.getElementById('sort-homework').value : 'time';
    filteredHomeworks.sort((a, b) => {
        if (sortMethod === 'time') return (b.createdAt || new Date(0)).getTime() - (a.createdAt || new Date(0)).getTime();
        if (sortMethod === 'name') return a.name.localeCompare(b.name, 'zh-Hant');
        if (sortMethod === 'missing') return ((b.students || []).filter(s => !isStudentCompleted(s, b.typeId || 'default')).length) - ((a.students || []).filter(s => !isStudentCompleted(s, a.typeId || 'default')).length);
        return 0;
    });

    homeworkList.innerHTML = '';
    if (filteredHomeworks.length === 0) {
        homeworkList.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-16 px-4"><div class="w-20 h-20 bg-gradient-to-tr from-indigo-50 to-rose-50 rounded-3xl flex items-center justify-center mb-4 border border-white/60 shadow-lg shadow-indigo-500/10 animate-[bounce_3s_infinite]"><svg class="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div><p class="text-center text-slate-400 font-semibold tracking-wide text-xs">目前的班級沒有點收項目，請點擊右上角 ✨ 新增作業</p></div>`;
    } else {
        filteredHomeworks.forEach(hw => {
            const typeId = hw.typeId || 'default'; 
            const typeConfig = getHomeworkType(typeId);
            const statusCounts = (hw.students || []).reduce((acc, student) => { 
                acc[student.status] = (acc[student.status] || 0) + 1; 
                return acc; 
            }, {});
            const completedCount = (hw.students || []).filter(s => isStudentCompleted(s, typeId)).length;
            let summaryHtml = '';
            if (completedCount === (hw.students || []).length && (hw.students || []).length > 0) {
                summaryHtml = `<div class="text-emerald-600 font-black bg-emerald-50/70 border border-emerald-200/50 px-4 py-2 rounded-2xl text-base inline-flex items-center gap-1">🎉 全班已到齊</div>`;
            } else {
                summaryHtml = typeConfig.statuses.filter(s => statusCounts[s.key] > 0).map(s => {
                    let textClass = 'text-slate-600 bg-slate-100/80';
                    if(s.color.includes('blue')) textClass = 'text-blue-600 bg-blue-50/60 border-blue-100/50';
                    else if(s.color.includes('emerald') || s.color.includes('green')) textClass = 'text-emerald-600 bg-emerald-50/60 border-emerald-100/50';
                    else if(s.color.includes('yellow') || s.color.includes('amber')) textClass = 'text-amber-700 bg-amber-50/80 border-amber-100/50';
                    else if(s.color.includes('red') || s.color.includes('rose')) textClass = 'text-rose-600 bg-rose-50/60 border-rose-100/50';
                    else if(s.color.includes('purple')) textClass = 'text-purple-600 bg-purple-50/60 border-purple-100/50';
                    return `<span class="inline-flex items-center text-base font-black border border-transparent px-4 py-2 rounded-2xl ${textClass}">${s.text}<span class="ml-1 opacity-80 font-black">${statusCounts[s.key]}</span></span>`;
                }).join('');
            }

            const hwItem = document.createElement('div');
            hwItem.className = 'glass-card rounded-3xl border border-slate-200/70 p-5 sm:p-6 cursor-pointer shadow-md hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1 hover:border-indigo-300/80 transition-all duration-500 group relative overflow-hidden active:scale-[0.99] hover-shimmer';
            hwItem.dataset.id = hw.id;
            
            const createdDate = (hw.createdAt instanceof Date) ? hw.createdAt.toLocaleDateString('zh-TW') : 'N/A';
            hwItem.innerHTML = `
                <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div><div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full shimmer-bar pointer-events-none z-10"></div>
                <div class="flex justify-between items-start relative z-10">
                    <div class="flex items-center gap-2 flex-grow min-w-0">
                         <span class="text-sm font-black bg-slate-100 text-slate-400 tracking-wider px-2.5 py-1 rounded-xl whitespace-nowrap uppercase">${typeConfig.name}</span>
                        <h2 class="text-2xl font-black text-slate-800 truncate tracking-tight group-hover:text-indigo-600 transition-colors" title="${hw.name}">${hw.name}</h2>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button data-id="${hw.id}" class="edit-hw-btn hide-on-admin-view text-slate-400 hover:text-indigo-600 p-3 rounded-2xl hover:bg-indigo-50 transition-all"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                        <button data-id="${hw.id}" class="delete-hw-btn hide-on-admin-view text-slate-400 hover:text-rose-600 p-3 rounded-2xl hover:bg-rose-50 transition-all"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
                    </div>
                </div>
                <div class="flex justify-between items-center text-sm font-bold text-slate-400 mt-4 tracking-wider relative z-10"><span>👥 名單 ${(hw.students || []).length} 人</span><span>📅 ${createdDate}</span></div>
                <div class="mt-5 flex flex-wrap gap-2 relative z-10">${summaryHtml}</div>
            `;
            homeworkList.appendChild(hwItem);
        });
    }
}

export function renderStudentGrid(homeworkId) {
    const studentGrid = document.getElementById('student-grid'); 
    if (!studentGrid) return;
    const hw = state.appData.homeworks.find(h => h.id === homeworkId); 
    if (!hw) return;
    state.currentHomeworkId = homeworkId; 
    const hwNameEl = document.getElementById('detail-homework-name');
    if (hwNameEl) hwNameEl.textContent = hw.name;
    studentGrid.innerHTML = '';
    const count = (hw.students || []).length; 
    if (count === 0) return; 
    updateSummaryUI(hw);
    
    const containerWidth = (studentGrid.parentElement.clientWidth > 0 ? studentGrid.parentElement.clientWidth : window.innerWidth * 0.9) - 20; 
    const detailPageEl = document.getElementById('detail-page');
    const detailH = detailPageEl?.clientHeight || window.innerHeight;
    const headerH = document.querySelector('#detail-page header')?.offsetHeight || 200;
    const availableHeight = Math.max(detailH - headerH - 50, 200); 
    
    let bestCols = 1; 
    let bestBoxSize = 0;
    for (let c = 1; c <= count; c++) {
        const r = Math.ceil(count / c); 
        const gap = window.innerWidth < 640 ? 8 : 12; 
        const sizeW = (containerWidth - (c - 1) * gap) / c; 
        const sizeH = (availableHeight - (r - 1) * gap) / r;
        const size = Math.min(sizeW, sizeH, 140); 
        if (size > bestBoxSize) { bestBoxSize = size; bestCols = c; }
    }
    if (bestCols < 1) bestCols = 1;
    
    const gap = window.innerWidth < 640 ? 8 : 12;
    studentGrid.className = `grid mx-auto`; 
    studentGrid.style.gap = `${gap}px`;
    studentGrid.style.gridTemplateColumns = `repeat(${bestCols}, 1fr)`;
    studentGrid.style.width = `${Math.floor(bestCols * bestBoxSize + (bestCols - 1) * gap)}px`; 
    studentGrid.style.maxWidth = '100%';

    const typeId = hw.typeId || 'default'; 
    const typeConfig = getHomeworkType(typeId);
    const batchSelect = document.getElementById('batch-status-select');
    if (batchSelect && (batchSelect.options.length === 0 || batchSelect.dataset.typeId !== typeId)) {
        batchSelect.innerHTML = ''; 
        batchSelect.dataset.typeId = typeId;
        typeConfig.statuses.forEach(s => { 
            const opt = document.createElement('option'); 
            opt.value = s.key; 
            opt.textContent = s.text; 
            batchSelect.appendChild(opt); 
        });
    }

    const scanSelect = document.getElementById('scan-target-status-select');
    if (scanSelect && (scanSelect.options.length === 0 || scanSelect.dataset.typeId !== typeId)) {
        scanSelect.innerHTML = ''; 
        scanSelect.dataset.typeId = typeId;
        typeConfig.statuses.forEach(s => { 
            const opt = document.createElement('option'); 
            opt.value = s.key; 
            opt.textContent = s.text; 
            scanSelect.appendChild(opt); 
        });
        const completedStatus = typeConfig.statuses.find(s => s.isCompleted);
        if (completedStatus) scanSelect.value = completedStatus.key; 
        else if (typeConfig.statuses.length > 1) scanSelect.value = typeConfig.statuses[1].key;
    }

    (hw.students || []).forEach(student => {
        let statusInfo = typeConfig.statuses.find(s => s.key === student.status);
        if (!statusInfo) { 
            statusInfo = typeConfig.statuses[0]; 
            student.status = statusInfo.key; 
        }
        const studentBtn = document.createElement('button');
        const ringColor = (statusInfo.color || '').replace('bg-', 'ring-').replace('-500', '-200').replace('-400', '-200');
        studentBtn.id = `btn-seat-${student.seat}`;
        studentBtn.className = `disable-on-admin-view student-btn rounded-2xl shadow-sm text-center transition-all duration-300 transform hover:scale-[1.05] active:scale-90 ${statusInfo.color} ${statusInfo.textColor} flex flex-col items-center justify-center border-2 border-transparent aspect-square overflow-hidden cursor-pointer w-full h-full ring-4 ring-offset-1 ring-transparent hover:${ringColor} focus:outline-none focus:${ringColor}`;
        studentBtn.dataset.seat = student.seat;
        const fontSizeNum = Math.max(12, bestBoxSize * 0.35); 
        const fontSizeText = Math.max(9, bestBoxSize * 0.15); 
        studentBtn.innerHTML = `
            <span class="font-black leading-none tracking-tighter select-none" style="font-size: ${fontSizeNum}px; pointer-events: none;">${student.seat}</span>
            <span class="font-bold leading-tight mt-1 opacity-90 truncate w-full px-1 select-none" style="font-size: ${fontSizeText}px; pointer-events: none;">${statusInfo.text}</span>
        `;
        studentGrid.appendChild(studentBtn);
    });
    
    setTimeout(() => { 
        const scanContainer = document.getElementById('scan-mode-container'); 
        const scanInput = document.getElementById('barcode-scan-input'); 
        if (scanContainer && !scanContainer.classList.contains('hidden')) {
            if (scanInput) scanInput.focus(); 
            if (window.setScanActionMode) {
                window.setScanActionMode(localStorage.getItem('scan_action_type') || 'assign');
            }
        }
    }, 300);
}

export function renderStudentDetailsPage() {
    const studentDetailsList = document.getElementById('student-details-list'); 
    if (!studentDetailsList) return;
    studentDetailsList.innerHTML = '';
    const filteredHomeworks = state.appData.homeworks.filter(hw => hw.classId === state.currentClassId);

    if (filteredHomeworks.length === 0) { 
        studentDetailsList.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10 font-bold text-sm glass-card rounded-3xl m-2">目前此班級尚無登錄作業。</div>'; 
        return; 
    }

    const studentData = []; 
    let maxStudentCount = 0;
    filteredHomeworks.forEach(hw => { 
        (hw.students || []).forEach(s => { 
            maxStudentCount = Math.max(maxStudentCount, s.seat); 
        }); 
    });

    if (maxStudentCount === 0) { 
        studentDetailsList.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10 font-bold text-sm">此班級尚無建立學生。</div>'; 
        return; 
    }
    
    for (let i = 1; i <= maxStudentCount; i++) {
        const issues = []; 
        let isExistsInAnyHw = false;
        filteredHomeworks.forEach(hw => {
            const typeId = hw.typeId || 'default'; 
            const student = (hw.students || []).find(s => s.seat === i);
            if (student) {
                isExistsInAnyHw = true;
                if (!isStudentCompleted(student, typeId)) {
                    const typeConfig = getHomeworkType(typeId); 
                    const statusInfo = typeConfig.statuses.find(s => s.key === student.status) || typeConfig.statuses[0];
                    issues.push({ 
                        hwName: hw.name, 
                        hwId: hw.id, 
                        statusText: statusInfo.text, 
                        colorClass: statusInfo.textColor.includes('white') ? (statusInfo.color || '').replace('bg-', 'text-') : 'text-slate-600' 
                    });
                }
            }
        });
        if (isExistsInAnyHw) studentData.push({ seat: i, issues });
    }

    const sortMethod = document.getElementById('sort-student-detail') ? document.getElementById('sort-student-detail').value : 'number';
    studentData.sort((a, b) => sortMethod === 'number' ? a.seat - b.seat : b.issues.length - a.issues.length);

    let hasIssues = false;
    studentData.forEach(data => {
        if (data.issues.length === 0) return;
        hasIssues = true;
        const studentCard = document.createElement('div');
        studentCard.className = 'glass-card rounded-3xl shadow-sm border border-slate-200/60 p-6 sm:p-8 hover:shadow-md transition-all';
        const issuesHtml = data.issues.map(issue => `<span class="mr-2 inline-block bg-slate-50 border border-slate-200/40 rounded-xl px-3 py-1.5 mb-2 text-sm"><span class="homework-link font-black ${issue.colorClass} cursor-pointer hover:underline" data-id="${issue.hwId}">${issue.hwName}</span> <span class="text-xs font-bold opacity-50 ml-1">(${issue.statusText})</span></span>`).join('');
        studentCard.innerHTML = `
            <h3 class="text-xl font-black text-slate-800 flex justify-between items-center mb-4">
                <span class="bg-slate-100 px-3 py-1.5 rounded-xl">${data.seat} 號</span>
                <span class="text-sm font-bold text-rose-500 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100">未完成: ${data.issues.length}</span>
            </h3>
            <div class="mt-1 flex flex-wrap">${issuesHtml}</div>
        `;
        studentDetailsList.appendChild(studentCard);
    });
    
    if (!hasIssues) {
        studentDetailsList.innerHTML = `<div class="col-span-full bg-emerald-50 border border-emerald-100 rounded-3xl p-8 text-center shadow-inner"><div class="text-3xl mb-2">🏆</div><p class="text-emerald-700 font-extrabold text-base">全班所有作業均已準時點收完成！</p></div>`;
    }
}

export function renderHomeworkTypesPage() {
    const list = document.getElementById('types-list'); 
    if (!list) return; 
    list.innerHTML = '';
    state.appData.homeworkTypes.forEach((type, typeIndex) => {
        const card = document.createElement('div');
        card.className = 'glass-card rounded-3xl shadow-sm border border-slate-200/60 p-6 sm:p-8 hover:shadow-md transition-shadow relative overflow-hidden';
        const statusesHtml = type.statuses.map((status, statusIndex) => {
            return `
                <div class="flex items-center gap-2 mb-2 bg-slate-50 p-2 rounded-xl border border-slate-200/40">
                    <div class="color-dot ${status.color} w-4 h-4 shadow-sm border-2 border-white cursor-pointer rounded-full flex-shrink-0 transition-transform hover:scale-110" data-type-index="${typeIndex}" data-status-index="${statusIndex}"></div>
                    <input type="text" class="status-name-input bg-transparent font-bold focus:outline-none focus:border-b-2 focus:border-indigo-400 px-1 py-0.5 w-20 text-xs text-slate-700" value="${status.text}" data-type-index="${typeIndex}" data-status-index="${statusIndex}">
                    <label class="flex items-center text-[10px] font-black text-slate-400 cursor-pointer select-none ml-auto bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm hover:text-slate-600">
                        <input type="checkbox" class="mr-1.5 is-completed-check w-3 h-3 text-indigo-500 rounded border-slate-300 focus:ring-indigo-500" ${status.isCompleted ? 'checked' : ''} data-type-index="${typeIndex}" data-status-index="${statusIndex}"> 完成
                    </label>
                    <button class="delete-status-btn text-slate-300 hover:text-rose-500 p-1 rounded transition-colors" data-type-index="${typeIndex}" data-status-index="${statusIndex}">&times;</button>
                </div>`;
        }).join('');

        card.innerHTML = `
            <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${typeIndex === 0 ? 'from-slate-300 to-slate-400' : 'from-indigo-500 to-violet-500'}"></div>
            <div class="flex justify-between items-center mb-3 gap-2">
                <input type="text" class="type-name-input text-lg font-black text-slate-800 focus:outline-none focus:bg-slate-50 rounded-xl px-2 py-1 -ml-2 bg-transparent w-full transition-colors" value="${type.name}" data-type-index="${typeIndex}">
                <button class="delete-type-btn text-slate-400 hover:text-rose-500 text-[11px] font-bold bg-slate-100 hover:bg-rose-50 px-2 py-1 rounded-xl transition-colors whitespace-nowrap" data-type-index="${typeIndex}" ${type.id === 'default' ? 'disabled style="opacity:0.2; cursor:not-allowed;"' : ''}>刪除</button>
            </div>
            <div class="space-y-1 mb-3">${statusesHtml}</div>
            <button class="add-status-btn w-full py-2 border border-dashed border-slate-200 text-slate-400 font-bold rounded-xl hover:bg-slate-50 hover:text-indigo-500 hover:border-indigo-200 transition-all text-[11px] flex items-center justify-center gap-1" data-type-index="${typeIndex}">+ 新增狀態</button>
        `;
        list.appendChild(card);
    });
}

export function renderContactBookItems() {
    const blackboard = document.getElementById('blackboard-content'); 
    if (!blackboard) return;
    blackboard.innerHTML = ''; 
    blackboard.style.fontSize = `${state.blackboardFontSize}rem`; 
    blackboard.style.lineHeight = `${state.blackboardLineHeight}`;
    
    if (!state.currentClassId) return;
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    const dateDisplay = document.getElementById('contact-book-date'); 
    if (dateDisplay) dateDisplay.textContent = formatDate(state.selectedDate);
    const dateString = formatDate(state.selectedDate, 'YYYY-MM-DD'); 
    const items = currentClass?.contactBook?.[dateString] || [];

    if (items.length === 0) { 
        blackboard.innerHTML = `<p class="text-white/20 italic text-center mt-10 text-sm select-none" style="font-family: sans-serif;">今日無記事。在下方輸入...</p>`; 
        return; 
    }

    items.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'flex items-start justify-between group p-3 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/10';
        itemEl.innerHTML = `
            <div class="flex-grow pt-0.5"><span class="mr-2 font-bold opacity-60">${index + 1}.</span><span class="whitespace-pre-wrap">${item}</span></div>
            <div class="flex gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all ml-3 flex-shrink-0 bg-slate-900/60 backdrop-blur-md rounded-xl p-1 border border-white/10 shadow-xl">
                <button class="to-hw-btn hide-on-admin-view w-7 h-7 flex items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 hover:bg-teal-500 hover:text-white transition-all font-bold text-sm" data-index="${index}" title="轉為作業">📖</button>
                <button class="edit-contact-btn hide-on-admin-view w-7 h-7 flex items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-white transition-all font-bold text-sm" data-index="${index}" title="編輯內文">✏️</button>
                <button class="delete-contact-item-btn w-7 h-7 flex items-center justify-center rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white transition-all font-bold text-base leading-none" data-index="${index}" title="擦除">&times;</button>
            </div>
        `;
        blackboard.appendChild(itemEl);
    });
}

export function renderCalendar() {
    const grid = document.getElementById('calendar-grid'); 
    const monthYear = document.getElementById('current-month-year');
    if (!grid || !monthYear) return; 
    grid.innerHTML = '';
    const year = state.calendarDate.getFullYear(), month = state.calendarDate.getMonth();
    monthYear.textContent = `${year}年 ${month + 1}月`;
    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));
    const todayString = formatDate(new Date(), 'YYYY-MM-DD'); 
    const selectedDateString = formatDate(state.selectedDate, 'YYYY-MM-DD');

    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('button');
        dayEl.className = 'calendar-day h-8 w-8 sm:h-9 sm:w-9 mx-auto flex items-center justify-center rounded-lg font-bold transition-all text-sm';
        dayEl.textContent = day; 
        dayEl.dataset.day = day;
        const currentDayString = formatDate(new Date(year, month, day), 'YYYY-MM-DD');
        if (currentDayString === selectedDateString) dayEl.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-200', 'scale-105');
        else if (currentDayString === todayString) dayEl.classList.add('bg-indigo-50', 'text-indigo-600', 'border', 'border-indigo-200');
        else dayEl.classList.add('text-slate-600', 'hover:bg-slate-100', 'hover:text-indigo-600');
        grid.appendChild(dayEl);
    }
}

export function updateStorageUsage() {
    if (!state.currentUser || !fbDb) return;
    const errorMsg = document.getElementById('cloud-error-msg'); 
    if (errorMsg) errorMsg.classList.add('hidden');
    try {
        const hwStr = safeStringify(state.appData.homeworks || []); 
        const hwBytes = new Blob([hwStr]).size;
        const cbData = (state.appData.classes || []).map(c => c.contactBook || {}); 
        const cbBytes = new Blob([safeStringify(cbData)]).size;
        const fullBytes = new Blob([safeStringify(state.appData)]).size; 
        const otherBytes = Math.max(0, fullBytes - hwBytes - cbBytes);
        const maxBytes = 1048576; // 1MB
        
        const hwPct = Math.min(100, (hwBytes / maxBytes) * 100);
        const cbPct = Math.min(100 - hwPct, (cbBytes / maxBytes) * 100);
        const otherPct = Math.min(100 - hwPct - cbPct, (otherBytes / maxBytes) * 100);
        const totalPct = hwPct + cbPct + otherPct;

        const barHw = document.getElementById('bar-hw');
        const barCb = document.getElementById('bar-cb');
        const barOther = document.getElementById('bar-other');
        const storageText = document.getElementById('cloud-storage-text');

        if (barHw) barHw.style.width = `${hwPct}%`; 
        if (barCb) barCb.style.width = `${cbPct}%`; 
        if (barOther) barOther.style.width = `${otherPct}%`;
        if (storageText) storageText.textContent = `${(fullBytes / 1024).toFixed(1)} KB / 1024 KB (${totalPct.toFixed(1)}%)`;

        if (errorMsg) {
            if (!navigator.onLine) { 
                errorMsg.textContent = "無網路連線，無法同步至雲端。"; 
                errorMsg.classList.remove('hidden'); 
            } else if (state.lastCloudError) { 
                errorMsg.textContent = "雲端錯誤：" + state.lastCloudError; 
                errorMsg.classList.remove('hidden'); 
            }
        }
    } catch (err) { 
        if (errorMsg) { 
            errorMsg.textContent = "計算錯誤：" + err.message; 
            errorMsg.classList.remove('hidden'); 
        } 
    }
}

export function updateDataManagementUI(onRestoreBackup) {
    const statusText = document.getElementById('current-file-status');
    const linkBtn = document.getElementById('link-file-btn');
    const unlinkBtn = document.getElementById('unlink-file-btn');
    const backupList = document.getElementById('auto-backup-list');
    const cloudStatus = document.getElementById('cloud-sync-status');
    const loginBtn = document.getElementById('google-login-btn');
    const cloudActions = document.getElementById('cloud-actions');
    
    if (state.currentUser && fbAuth?.currentUser) {
        if (cloudStatus) cloudStatus.innerHTML = `狀態：已安全登入雲端 <br><span class="text-sky-900 font-bold bg-white px-3 py-1.5 rounded-xl inline-block mt-2 shadow-sm border border-sky-100 text-[11px] tracking-wide">👤 ${state.currentUser.displayName || state.currentUser.email}</span>`;
        if (loginBtn) loginBtn.classList.add('hidden');
        if (cloudActions) cloudActions.classList.remove('hidden');
        const storageContainer = document.getElementById('cloud-storage-container'); 
        if (storageContainer) storageContainer.classList.remove('hidden');
        updateStorageUsage();
    } else if (state.currentUser) {
        if (cloudStatus) cloudStatus.innerHTML = `狀態：本地離線模式 <br><span class="text-slate-700 font-bold bg-white px-3 py-1.5 rounded-xl inline-block mt-2 shadow-sm border border-slate-200 text-[11px] tracking-wide">👤 ${state.currentUser.displayName || state.currentUser.email}</span><br><span class="text-[11px] text-sky-600 mt-1 inline-block">點擊下方按鈕登入 Google 帳號以啟用雲端備份</span>`;
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (cloudActions) cloudActions.classList.add('hidden');
        const storageContainer = document.getElementById('cloud-storage-container'); 
        if (storageContainer) storageContainer.classList.add('hidden');
    } else {
        if (cloudStatus) cloudStatus.innerHTML = "狀態：未登入，點擊下方按鈕登入以啟用雲端同步。";
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (cloudActions) cloudActions.classList.add('hidden');
        const storageContainer = document.getElementById('cloud-storage-container'); 
        if (storageContainer) storageContainer.classList.add('hidden');
    }

    const adminEmail = 'ianw.solar@gmail.com';
    const userEmail = (state.currentUser?.email || '').toLowerCase();
    const isCurrentUserAdmin = isGoogleAdmin(state.currentUser) || userEmail === adminEmail;
    if (isCurrentUserAdmin) {
        document.getElementById('admin-modal-btn')?.classList.remove('hidden');
        document.getElementById('admin-btn')?.classList.remove('hidden');
    } else {
        document.getElementById('admin-modal-btn')?.classList.add('hidden');
        document.getElementById('admin-btn')?.classList.add('hidden');
    }

    if (!statusText) return;
    if (state.fileHandle) {
        statusText.innerHTML = `狀態：已安全對齊本地檔案 <br><span class="text-indigo-900 font-bold bg-white px-2 py-1 rounded-lg inline-block mt-2 shadow-sm border border-indigo-100 text-[11px] tracking-wide">📄 ${state.fileHandle.name}</span>`;
        if (linkBtn) linkBtn.textContent = "變更硬碟資料檔"; 
        if (unlinkBtn) unlinkBtn.classList.remove('hidden');
    } else {
        statusText.textContent = "狀態：暫存模式 (重整或關閉瀏覽器資料可能遺失)"; 
        statusText.className = "text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-100 p-2.5 rounded-xl mb-3";
        if (linkBtn) linkBtn.textContent = "綁定硬碟實體 .json 檔案"; 
        if (unlinkBtn) unlinkBtn.classList.add('hidden');
    }
    
    if (!window.showSaveFilePicker) {
        statusText.textContent = "您的瀏覽器不支援硬碟直寫，請定時手手動下載備份。"; 
        statusText.className = "text-[11px] font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-100 mb-3";
        if (linkBtn) linkBtn.classList.add('hidden'); 
        if (unlinkBtn) unlinkBtn.classList.add('hidden');
    }

    if (backupList) {
        backupList.innerHTML = '';
        const keys = Object.keys(localStorage).filter(k => k.startsWith('hw_backup_')).sort().reverse();
        if (keys.length === 0) backupList.innerHTML = '<p class="text-[11px] font-bold text-slate-400 py-1">無自動備份快取。</p>';
        else {
            keys.forEach(k => {
                const dateStr = k.replace('hw_backup_', ''); 
                const btn = document.createElement('button');
                btn.className = 'w-full glass-card border border-white/60 text-slate-700 text-[11px] font-bold py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors flex justify-between items-center shadow-sm';
                btn.innerHTML = `<span class="flex items-center gap-1.5 text-slate-500">📅 ${dateStr}</span> <span class="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded-lg text-[9px] shadow-sm transition-colors">倒退還原</span>`;
                btn.onclick = () => {
                    showConfirmModal('自動備份覆蓋還原', `確定要將所有班級與作業還原至 ${dateStr} 嗎？目前的修改將被完全洗掉！`, async () => {
                        const dataStr = localStorage.getItem(k);
                        if (dataStr && onRestoreBackup) {
                            await onRestoreBackup(dataStr);
                        }
                    });
                };
                backupList.appendChild(btn);
            });
        }
    }
}

export function updateGuestHomeBtnVisibility() {
    const btn = document.getElementById('floating-guest-home-btn');
    const isGuest = sessionStorage.getItem('app_is_guest_mode') === 'true';
    const isPortalVisible = !document.getElementById('portal-page')?.classList.contains('hidden');
    if (btn) {
        if (isGuest && !isPortalVisible) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
    if (window.updateChatVisibility) {
        window.updateChatVisibility();
    }
}

let portalScrollDismissed = false;
export function initPortalScrollIndicator() {
    const scrollIndicator = document.getElementById('portal-scroll-indicator');
    if (!scrollIndicator) return;
    
    let ticking = false;
    const checkScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
            if (scrollY > 25) {
                portalScrollDismissed = true;
                scrollIndicator.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
                scrollIndicator.classList.remove('pointer-events-auto');
                window.removeEventListener('scroll', checkScroll);
            }
        });
    };

    window.addEventListener('scroll', checkScroll, { passive: true });
    scrollIndicator.addEventListener('click', () => {
        window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
    });
}

export function updatePortalUI() {
    const signinView = document.getElementById('portal-view-signin');
    const signupView = document.getElementById('portal-view-signup');
    const forgotView = document.getElementById('portal-view-forgot');
    const loggedinView = document.getElementById('portal-view-loggedin');
    const userEmailSpan = document.getElementById('portal-loggedin-user-info');
    const guestActions = document.getElementById('portal-nav-guest-actions');
    const userBadge = document.getElementById('portal-nav-user-badge');
    const userNameSpan = document.getElementById('portal-nav-user-name');
    const heroStartBtn = document.getElementById('portal-hero-start-btn');
    const ctaStartBtn = document.getElementById('portal-cta-start-btn');

    if (state.currentUser) {
        if (signinView) signinView.classList.add('hidden');
        if (signupView) signupView.classList.add('hidden');
        if (forgotView) forgotView.classList.add('hidden');
        if (loggedinView) loggedinView.classList.remove('hidden');
        const displayName = state.currentUser.displayName || state.currentUser.email || '已驗證使用者';
        if (userEmailSpan) {
            userEmailSpan.innerHTML = `目前以 <b>${displayName}</b> 登入<br><span class="text-xs text-stone-500">${state.currentUser.email || ''}</span>`;
        }
        if (guestActions) guestActions.classList.add('hidden');
        if (userBadge) userBadge.classList.remove('hidden');
        if (userNameSpan) userNameSpan.textContent = displayName;
        if (heroStartBtn) heroStartBtn.innerHTML = `<span>進入作業點收系統</span><i class="fa-solid fa-arrow-right text-sm"></i>`;
        if (ctaStartBtn) ctaStartBtn.innerHTML = `<span class="pointer-events-none select-none inline-block">立即進入系統</span><i class="fa-solid fa-chevron-right text-xs pointer-events-none select-none"></i>`;
    } else {
        if (loggedinView) loggedinView.classList.add('hidden');
        if (signupView && !signupView.classList.contains('hidden')) {
            // keep signup
        } else if (forgotView && !forgotView.classList.contains('hidden')) {
            // keep forgot
        } else {
            if (signinView) signinView.classList.remove('hidden');
        }
        if (guestActions) guestActions.classList.remove('hidden');
        if (userBadge) userBadge.classList.add('hidden');
        if (heroStartBtn) heroStartBtn.innerHTML = `<span>立即開始使用</span><i class="fa-solid fa-arrow-right text-sm"></i>`;
        if (ctaStartBtn) ctaStartBtn.innerHTML = `<span class="pointer-events-none select-none inline-block">免費建立帳號 / 立即開始使用</span><i class="fa-solid fa-chevron-right text-xs pointer-events-none select-none"></i>`;
    }
}

export function reRenderCurrentPage(showMainPageFn, showDetailPageFn) {
    if (state.currentPage === 'main-page') { 
        renderClassSelector(); 
        renderHomeworkList(); 
        renderClassList(); 
    } 
    else if (state.currentPage === 'detail-page') { 
        if (state.currentHomeworkId && state.appData.homeworks.find(h => h.id === state.currentHomeworkId)) {
            renderStudentGrid(state.currentHomeworkId); 
        } else if (showMainPageFn) {
            showMainPageFn(); 
        }
    } 
    else if (state.currentPage === 'student-details-page') {
        renderStudentDetailsPage();
    }
    else if (state.currentPage === 'contact-book-page') {
        renderContactBookItems();
    }
    else if (state.currentPage === 'homework-types-page') {
        renderHomeworkTypesPage();
    }
    updateDataManagementUI();
}
