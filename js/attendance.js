/**
 * 簽到及遲到點名模組 (Attendance & Tardy Management)
 * 支援：一鍵點名、座號一鍵循環切換出席/遲到/病假/事假/公假、到校時間24H滾輪編輯、獨立月曆選擇、出席統計、LINE通報、CSV匯出
 */

import { state } from './state.js';
import { saveData } from './storage.js';
import { showToast, safeCopyToClipboard, openModal, closeModal } from './utils.js';
import { openTimeWheelPicker } from './timeWheel.js';

export const ATTENDANCE_STATUSES = [
    { key: 'present', label: '出席', bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-300', lightBg: 'bg-emerald-50' },
    { key: 'tardy', label: '遲到', bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-300', lightBg: 'bg-amber-50' },
    { key: 'sick', label: '病假', bg: 'bg-rose-500', text: 'text-rose-700', border: 'border-rose-300', lightBg: 'bg-rose-50' },
    { key: 'personal', label: '事假', bg: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-300', lightBg: 'bg-blue-50' },
    { key: 'official', label: '公假', bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-300', lightBg: 'bg-purple-50' }
];

export function getTodayDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function formatDateWithWeekday(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const w = weekdays[dateObj.getDay()] || '';
    return `${dateStr} (週${w})`;
}

export function getTodayAttendanceSummary(currentClass, dateStr = getTodayDateStr()) {
    if (!currentClass) {
        return { presentCount: 0, tardyCount: 0, leaveCount: 0, totalStudents: 0, tardies: [], leaves: [] };
    }

    const maxSeat = typeof currentClass.lastMaxSeat === 'number' && currentClass.lastMaxSeat > 0 
        ? currentClass.lastMaxSeat 
        : ((currentClass.students || []).length || 30);
    const attRecord = currentClass.attendance?.[dateStr] || {};

    let presentCount = 0;
    let tardyCount = 0;
    let leaveCount = 0;
    const tardies = [];
    const leaves = [];

    for (let s = 1; s <= maxSeat; s++) {
        const studentInfo = (currentClass.students || []).find(st => Number(st.seat) === s);
        const name = (studentInfo && studentInfo.name && studentInfo.name !== `${s}號`) ? studentInfo.name : '';
        const seatData = attRecord[s];
        const status = seatData?.status || 'present'; // 預設皆為出席

        if (status === 'present') {
            presentCount++;
        } else if (status === 'tardy') {
            tardyCount++;
            tardies.push({ seat: s, name, time: seatData?.time || '' });
        } else {
            leaveCount++;
            leaves.push({ seat: s, name, reason: seatData?.note || status });
        }
    }

    return {
        presentCount,
        tardyCount,
        leaveCount,
        totalStudents: maxSeat,
        tardies,
        leaves
    };
}

let activeAttendanceDate = getTodayDateStr();
let attCalendarDate = new Date();

export function getActiveAttendanceDate() {
    return activeAttendanceDate || getTodayDateStr();
}

export function renderAttendancePage(dateStr = activeAttendanceDate) {
    if (!dateStr) dateStr = activeAttendanceDate || getTodayDateStr();
    activeAttendanceDate = dateStr;
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    // 更新日期顯示按鈕文字與標題
    const dateBtnText = document.getElementById('attendance-date-btn-text');
    if (dateBtnText) {
        dateBtnText.textContent = formatDateWithWeekday(dateStr);
    }
    const attDateInput = document.getElementById('attendance-date-input');
    if (attDateInput) {
        attDateInput.value = dateStr;
    }
    const dateDisplay = document.getElementById('attendance-date-display');
    if (dateDisplay) {
        dateDisplay.textContent = '點擊座號一鍵循環切換出席狀態 · 點擊時間開啟時間滾輪';
    }

    currentClass.attendance = currentClass.attendance || {};
    currentClass.attendance[dateStr] = currentClass.attendance[dateStr] || {};
    const dateRecord = currentClass.attendance[dateStr];

    const maxSeat = typeof currentClass.lastMaxSeat === 'number' ? currentClass.lastMaxSeat : 30;

    // 1. 計算並更新統計條
    let cntPresent = 0, cntTardy = 0, cntSick = 0, cntPersonal = 0, cntOfficial = 0;
    for (let s = 1; s <= maxSeat; s++) {
        const st = dateRecord[s]?.status || 'present';
        if (st === 'present') cntPresent++;
        else if (st === 'tardy') cntTardy++;
        else if (st === 'sick') cntSick++;
        else if (st === 'personal') cntPersonal++;
        else if (st === 'official') cntOfficial++;
    }

    const statPres = document.getElementById('stat-att-present');
    const statTar = document.getElementById('stat-att-tardy');
    const statSick = document.getElementById('stat-att-sick');
    const statPer = document.getElementById('stat-att-personal');
    const statOff = document.getElementById('stat-att-official');

    if (statPres) statPres.textContent = cntPresent;
    if (statTar) statTar.textContent = cntTardy;
    if (statSick) statSick.textContent = cntSick;
    if (statPer) statPer.textContent = cntPersonal;
    if (statOff) statOff.textContent = cntOfficial;

    // 2. 渲染學生座號點名卡片矩陣（座號 1號、2號，支援網站內 24H 時間滾輪編輯到校時間）
    const grid = document.getElementById('attendance-students-grid');
    if (!grid) return;

    const cardsHtml = [];
    for (let s = 1; s <= maxSeat; s++) {
        const studentInfo = (currentClass.students || []).find(st => Number(st.seat) === s);
        const name = (studentInfo && studentInfo.name && studentInfo.name !== `${s}號`) ? studentInfo.name : `${s}號`;
        const seatData = dateRecord[s] || { status: 'present' };
        const statusConfig = ATTENDANCE_STATUSES.find(st => st.key === seatData.status) || ATTENDANCE_STATUSES[0];

        cardsHtml.push(`
            <div 
                class="attendance-seat-card p-3 rounded-2xl border ${statusConfig.border} ${statusConfig.lightBg} flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.02] active:scale-95 shadow-2xs select-none"
                data-seat="${s}"
                data-current-status="${statusConfig.key}"
                title="點擊切換下一個出席狀態"
            >
                <div class="flex items-center justify-between">
                    <span class="text-xs font-black font-mono px-2 py-0.5 rounded-lg bg-white/80 text-slate-800 shadow-2xs">
                        ${s}號
                    </span>
                    <span class="inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-lg ${statusConfig.bg} text-white shadow-2xs">
                        ${statusConfig.label}
                    </span>
                </div>
                <div class="mt-2 text-center">
                    <div class="font-black text-sm text-slate-900 truncate">${name}</div>
                    
                    <!-- 到校時間按鈕：點擊開啟網站內 24 小時制時間滾輪（絕無時間被截斷覆蓋問題） -->
                    ${seatData.status === 'tardy' ? `
                        <div class="mt-1.5 flex items-center justify-center" onclick="event.stopPropagation()">
                            <button 
                                type="button" 
                                data-seat="${s}" 
                                class="btn-open-time-wheel inline-flex items-center justify-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl px-2.5 py-1 border border-amber-300 transition-all cursor-pointer shadow-2xs active:scale-95 text-xs font-mono font-black"
                                title="點擊開啟 24 小時制時間滾輪修改到校時間"
                            >
                                <i class="fa-regular fa-clock text-amber-600"></i>
                                <span>到校 ${seatData.time || '08:00'}</span>
                                <i class="fa-solid fa-pen text-[9px] text-amber-500 ml-0.5"></i>
                            </button>
                        </div>
                    ` : (seatData.time ? `
                        <div class="mt-1.5 flex items-center justify-center" onclick="event.stopPropagation()">
                            <button 
                                type="button" 
                                data-seat="${s}" 
                                class="btn-open-time-wheel inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl px-2.5 py-1 border border-slate-300 transition-all cursor-pointer shadow-2xs active:scale-95 text-xs font-mono font-black"
                                title="點擊開啟 24 小時制時間滾輪修改到校時間"
                            >
                                <i class="fa-regular fa-clock text-slate-500"></i>
                                <span>到校 ${seatData.time}</span>
                                <i class="fa-solid fa-pen text-[9px] text-slate-400 ml-0.5"></i>
                            </button>
                        </div>
                    ` : `
                        <div class="mt-1 flex items-center justify-center" onclick="event.stopPropagation()">
                            <button 
                                type="button" 
                                data-seat="${s}" 
                                class="btn-open-time-wheel text-[10px] text-slate-400 hover:text-emerald-700 font-bold flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer" 
                                title="點擊以時間滾輪登記到校時間"
                            >
                                <i class="fa-regular fa-clock"></i> 登記時間
                            </button>
                        </div>
                    `)}
                </div>
            </div>
        `);
    }

    grid.innerHTML = cardsHtml.join('');

    // 綁定點擊卡片循環切換出席狀態
    grid.querySelectorAll('.attendance-seat-card').forEach(card => {
        card.addEventListener('click', () => {
            const seat = Number(card.dataset.seat);
            cycleStudentAttendance(seat, activeAttendanceDate);
        });
    });

    // 綁定點擊時間按鈕開啟 24H 時間滾輪
    grid.querySelectorAll('.btn-open-time-wheel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止卡片冒泡切換狀態
            const seat = Number(btn.dataset.seat);
            const currentRecord = currentClass.attendance[dateStr]?.[seat] || {};
            const initialTime = currentRecord.time || (currentRecord.status === 'tardy' ? '08:00' : new Date().toTimeString().slice(0, 5));
            const studentInfo = (currentClass.students || []).find(st => Number(st.seat) === seat);
            const studentName = studentInfo?.name && studentInfo.name !== `${seat}號` ? studentInfo.name : '';

            openTimeWheelPicker({
                title: `座號 ${seat}號${studentName ? ' ' + studentName : ''} · 到校時間`,
                initialTime: initialTime,
                onSelect: (selectedTime) => {
                    if (!currentClass.attendance[dateStr]) {
                        currentClass.attendance[dateStr] = {};
                    }
                    if (!currentClass.attendance[dateStr][seat]) {
                        currentClass.attendance[dateStr][seat] = { status: 'present' };
                    }
                    currentClass.attendance[dateStr][seat].time = selectedTime;
                    currentClass.attendance[dateStr][seat].updatedAt = new Date().toISOString();
                    saveData();
                    renderAttendancePage(dateStr);
                    if (selectedTime) {
                        showToast(`座號 ${seat} 號到校時間已更新為 ${selectedTime}`, 'success');
                    } else {
                        showToast(`已清除座號 ${seat} 號到校時間`, 'info');
                    }
                }
            });
        });
    });
}

/**
 * 循環切換學生出席狀態
 */
export function cycleStudentAttendance(seat, dateStr = activeAttendanceDate) {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    currentClass.attendance = currentClass.attendance || {};
    currentClass.attendance[dateStr] = currentClass.attendance[dateStr] || {};
    
    const curStatus = currentClass.attendance[dateStr][seat]?.status || 'present';
    const statusOrder = ['present', 'tardy', 'sick', 'personal', 'official'];
    const curIdx = statusOrder.indexOf(curStatus);
    const nextStatus = statusOrder[(curIdx + 1) % statusOrder.length];

    const prevTime = currentClass.attendance[dateStr][seat]?.time || '';
    const nowTime = new Date().toTimeString().slice(0, 5);

    currentClass.attendance[dateStr][seat] = {
        status: nextStatus,
        time: nextStatus === 'tardy' ? (prevTime || nowTime) : prevTime,
        updatedAt: new Date().toISOString()
    };

    saveData();
    renderAttendancePage(dateStr);
}

/**
 * 一鍵全員出席
 */
export function markAllStudentsPresent(dateStr = activeAttendanceDate) {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    currentClass.attendance = currentClass.attendance || {};
    currentClass.attendance[dateStr] = currentClass.attendance[dateStr] || {};
    
    const maxSeat = typeof currentClass.lastMaxSeat === 'number' ? currentClass.lastMaxSeat : 30;
    const nowIso = new Date().toISOString();

    for (let s = 1; s <= maxSeat; s++) {
        currentClass.attendance[dateStr][s] = {
            status: 'present',
            time: '',
            updatedAt: nowIso
        };
    }

    saveData();
    renderAttendancePage(dateStr);
    showToast(`已設定 ${dateStr} 全員正常出席！`, 'success');
}

export const markAllPresent = markAllStudentsPresent;

// ==========================================
// 簽到專屬月曆視窗 (與聯絡簿月曆視覺規格一致)
// ==========================================

export function renderAttendanceCalendar() {
    const grid = document.getElementById('att-calendar-grid');
    const monthYear = document.getElementById('att-current-month-year');
    if (!grid || !monthYear) return;

    grid.innerHTML = '';
    const year = attCalendarDate.getFullYear();
    const month = attCalendarDate.getMonth();
    monthYear.textContent = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(document.createElement('div'));
    }

    const todayStr = getTodayDateStr();
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    const attendanceRecords = currentClass?.attendance || {};

    for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.className = 'att-calendar-day h-8 w-8 sm:h-9 sm:w-9 mx-auto flex flex-col items-center justify-center rounded-xl font-bold transition-all text-xs sm:text-sm cursor-pointer relative';
        dayBtn.textContent = day;
        dayBtn.dataset.date = dStr;

        if (dStr === activeAttendanceDate) {
            dayBtn.classList.add('bg-emerald-600', 'text-white', 'shadow-md', 'shadow-emerald-200', 'scale-105');
        } else if (dStr === todayStr) {
            dayBtn.classList.add('bg-emerald-50', 'text-emerald-700', 'border', 'border-emerald-300');
        } else {
            dayBtn.classList.add('hover:bg-slate-100', 'text-slate-700');
        }

        // 若該日有點名記錄，顯示綠色小圓點
        if (attendanceRecords[dStr] && Object.keys(attendanceRecords[dStr]).length > 0) {
            const dot = document.createElement('span');
            dot.className = `w-1.5 h-1.5 rounded-full ${dStr === activeAttendanceDate ? 'bg-white' : 'bg-emerald-500'} absolute bottom-0.5`;
            dayBtn.appendChild(dot);
        }

        dayBtn.addEventListener('click', () => {
            activeAttendanceDate = dStr;
            renderAttendancePage(dStr);
            closeAttendanceDatePicker();
        });

        grid.appendChild(dayBtn);
    }
}

export function openAttendanceDatePicker() {
    const modal = document.getElementById('attendance-date-picker-modal');
    if (!modal) return;
    const [y, m, d] = activeAttendanceDate.split('-').map(Number);
    attCalendarDate = new Date(y, m - 1, d || 1);
    renderAttendanceCalendar();
    openModal(modal);
}

export function closeAttendanceDatePicker() {
    const modal = document.getElementById('attendance-date-picker-modal');
    if (modal) closeModal(modal);
}

export function changeAttendanceCalendarMonth(delta) {
    attCalendarDate.setMonth(attCalendarDate.getMonth() + delta);
    renderAttendanceCalendar();
}

/**
 * 複製出席通報至剪貼簿
 */
export function copyAttendanceLineReport(dateStr = activeAttendanceDate) {
    if (!dateStr) dateStr = activeAttendanceDate || getTodayDateStr();
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const summary = getTodayAttendanceSummary(currentClass, dateStr);
    const dateFormatted = formatDateWithWeekday(dateStr);

    let report = `【${currentClass.name} 出席點名日報表】\n`;
    report += `日期：${dateFormatted}\n\n`;
    report += `出席概況：\n`;
    report += `• 實到出席：${summary.presentCount} 人\n`;
    report += `• 遲到到校：${summary.tardyCount} 人\n`;
    report += `• 請假缺席：${summary.leaveCount} 人\n`;
    report += `• 應到總數：${summary.totalStudents} 人\n\n`;

    if (summary.tardyCount > 0) {
        report += `【遲到學生名單】：\n`;
        summary.tardies.forEach(t => {
            report += `  - ${t.seat}號${t.name ? ' ' + t.name : ''} (${t.time ? t.time + ' 到校' : '未註記時間'})\n`;
        });
        report += `\n`;
    }

    if (summary.leaveCount > 0) {
        report += `【請假學生名單】：\n`;
        summary.leaves.forEach(l => {
            report += `  - ${l.seat}號${l.name ? ' ' + l.name : ''} (${l.reason || '假'})\n`;
        });
        report += `\n`;
    }

    if (summary.tardyCount === 0 && summary.leaveCount === 0) {
        report += `今日全班準時到齊，表現優良！\n\n`;
    }

    safeCopyToClipboard(report);
    showToast('已複製出席日報表至剪貼簿！可直接貼至家長 LINE 官方群組', 'success');
}

/**
 * 匯出出席紀錄為 CSV 檔案
 */
export function exportAttendanceCsv(dateStr = activeAttendanceDate) {
    if (!dateStr) dateStr = activeAttendanceDate || getTodayDateStr();
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const dateRecord = currentClass.attendance?.[dateStr] || {};
    const maxSeat = typeof currentClass.lastMaxSeat === 'number' ? currentClass.lastMaxSeat : 30;

    let csvContent = "\uFEFF座號,姓名,出席狀態,到校時間,備註\n";

    for (let s = 1; s <= maxSeat; s++) {
        const studentInfo = (currentClass.students || []).find(st => Number(st.seat) === s);
        const name = (studentInfo && studentInfo.name && studentInfo.name !== `${s}號`) ? studentInfo.name : `${s}號`;
        const seatData = dateRecord[s] || { status: 'present' };
        const statusConfig = ATTENDANCE_STATUSES.find(st => st.key === seatData.status) || ATTENDANCE_STATUSES[0];
        const time = seatData.time || '';
        const note = seatData.note || '';

        csvContent += `"${s}","${name}","${statusConfig.label}","${time}","${note}"\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${currentClass.name}_出席紀錄_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`已成功匯出 ${dateStr} 出席紀錄 CSV！`, 'success');
}

if (typeof window !== 'undefined') {
    window.renderAttendancePage = renderAttendancePage;
    window.markAllStudentsPresent = markAllStudentsPresent;
    window.markAllPresent = markAllStudentsPresent;
    window.copyAttendanceLineReport = copyAttendanceLineReport;
    window.exportAttendanceCsv = exportAttendanceCsv;
    window.getActiveAttendanceDate = getActiveAttendanceDate;
}
