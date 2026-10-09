/**
 * 學生出席狀況與遲到排名統計模組 (Attendance Stats & Tardy Ranking)
 * 支援：動態日期範圍（今日、本週、本月、本學期、自訂區間）、個別學生出席率、遲到排行榜與詳細統計明細
 */

import { state } from './state.js';
import { openModal, closeModal, escapeHtml } from './utils.js';

let activeRange = 'this-month'; // 預設以本月統計
let customStartDate = '';
let customEndDate = '';

/**
 * 取得當前所選範圍的所有合法日期字串陣列 [YYYY-MM-DD, ...]
 */
function getDateRangeList(rangeKey) {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    const allRecordedDates = Object.keys(currentClass?.attendance || {}).sort();

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (rangeKey === 'today') {
        return allRecordedDates.filter(d => d === todayStr);
    }

    if (rangeKey === 'this-week') {
        // 本週一至本週日
        const d = new Date(now);
        const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1; // 轉為週一為 0
        d.setDate(d.getDate() - dayOfWeek);
        const startStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        d.setDate(d.getDate() + 6);
        const endStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return allRecordedDates.filter(dStr => dStr >= startStr && dStr <= endStr);
    }

    if (rangeKey === 'this-month') {
        // 當前月份
        const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return allRecordedDates.filter(dStr => dStr.startsWith(prefix));
    }

    if (rangeKey === 'this-semester') {
        // 近 6 個月
        const d = new Date(now);
        d.setMonth(d.getMonth() - 6);
        const startStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        return allRecordedDates.filter(dStr => dStr >= startStr && dStr <= todayStr);
    }

    if (rangeKey === 'custom' && customStartDate && customEndDate) {
        return allRecordedDates.filter(dStr => dStr >= customStartDate && dStr <= customEndDate);
    }

    // 'all' 或預設
    return allRecordedDates;
}

/**
 * 計算指定日期範圍內的班級統計數據
 */
export function calculateAttendanceStats(rangeKey = activeRange) {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return null;

    const dates = getDateRangeList(rangeKey);
    const maxSeat = typeof currentClass.lastMaxSeat === 'number' && currentClass.lastMaxSeat > 0 
        ? currentClass.lastMaxSeat 
        : ((currentClass.students || []).length || 30);

    const studentMap = {};
    for (let s = 1; s <= maxSeat; s++) {
        const sInfo = (currentClass.students || []).find(st => Number(st.seat) === s);
        studentMap[s] = {
            seat: s,
            name: sInfo?.name && sInfo.name !== `${s}號` ? sInfo.name : '',
            presentCount: 0,
            tardyCount: 0,
            sickCount: 0,
            personalCount: 0,
            officialCount: 0,
            tardyDetails: [], // { date, time }
            totalDays: 0,
            attendanceRate: 100
        };
    }

    let classTotalPresent = 0;
    let classTotalTardy = 0;
    let classTotalSick = 0;
    let classTotalPersonal = 0;
    let classTotalOfficial = 0;

    dates.forEach(dateStr => {
        const record = currentClass.attendance?.[dateStr] || {};
        for (let s = 1; s <= maxSeat; s++) {
            const seatRecord = record[s];
            const status = seatRecord?.status || 'present';
            const time = seatRecord?.time || '';

            studentMap[s].totalDays++;

            if (status === 'present') {
                studentMap[s].presentCount++;
                classTotalPresent++;
            } else if (status === 'tardy') {
                studentMap[s].tardyCount++;
                studentMap[s].tardyDetails.push({ date: dateStr, time: time || '未登記時間' });
                classTotalTardy++;
            } else if (status === 'sick') {
                studentMap[s].sickCount++;
                classTotalSick++;
            } else if (status === 'personal') {
                studentMap[s].personalCount++;
                classTotalPersonal++;
            } else if (status === 'official') {
                studentMap[s].officialCount++;
                classTotalOfficial++;
            }
        }
    });

    // 計算各學生出席率
    const studentList = Object.values(studentMap).map(st => {
        if (st.totalDays > 0) {
            // 出席率 = (出席次數 + 遲到次數) / 總天數 * 100
            st.attendanceRate = Math.round(((st.presentCount + st.tardyCount) / st.totalDays) * 100);
        } else {
            st.attendanceRate = 100;
        }
        return st;
    });

    // 遲到排行榜 (只排有遲到過的學生，按次數多到少排序)
    const tardyRankList = studentList
        .filter(st => st.tardyCount > 0)
        .sort((a, b) => b.tardyCount - a.tardyCount);

    const totalDaysCount = dates.length;
    const totalRecords = totalDaysCount * maxSeat;
    const classRate = totalRecords > 0 
        ? Math.round(((classTotalPresent + classTotalTardy) / totalRecords) * 100) 
        : 100;

    return {
        dates,
        totalDaysCount,
        maxSeat,
        classRate,
        classTotalPresent,
        classTotalTardy,
        classTotalSick,
        classTotalPersonal,
        classTotalOfficial,
        studentList,
        tardyRankList
    };
}

/**
 * 渲染出席狀況與遲到排名彈窗內容
 */
export function renderAttendanceStatsModal() {
    const stats = calculateAttendanceStats(activeRange);
    if (!stats) return;

    // 1. 頂部整體指標
    const rateEl = document.getElementById('att-stats-rate');
    const daysEl = document.getElementById('att-stats-days');
    const tardyTotalEl = document.getElementById('att-stats-total-tardy');
    const leaveTotalEl = document.getElementById('att-stats-total-leaves');

    if (rateEl) rateEl.textContent = `${stats.classRate}%`;
    if (daysEl) daysEl.textContent = `${stats.totalDaysCount} 天`;
    if (tardyTotalEl) tardyTotalEl.textContent = `${stats.classTotalTardy} 人次`;
    if (leaveTotalEl) leaveTotalEl.textContent = `${stats.classTotalSick + stats.classTotalPersonal + stats.classTotalOfficial} 人次`;

    // 2. 遲到排行榜渲染
    const tardyRankContainer = document.getElementById('att-stats-tardy-ranking');
    if (tardyRankContainer) {
        if (stats.tardyRankList.length === 0) {
            tardyRankContainer.innerHTML = `
                <div class="col-span-full py-8 text-center bg-emerald-50/60 rounded-2xl border border-emerald-200 text-emerald-800">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl mx-auto mb-2 shadow-xs">
                        <i class="fa-solid fa-award"></i>
                    </div>
                    <div class="text-sm font-black">恭喜！所選期間內全員準時到校</div>
                    <div class="text-xs text-emerald-600 mt-0.5">全班 0 人遲到，無任何遲到紀錄</div>
                </div>
            `;
        } else {
            const rankBadges = [
                { bg: 'bg-rose-500', text: 'text-white', icon: 'fa-medal', border: 'border-rose-300' },
                { bg: 'bg-amber-500', text: 'text-white', icon: 'fa-medal', border: 'border-amber-300' },
                { bg: 'bg-amber-400', text: 'text-white', icon: 'fa-medal', border: 'border-amber-200' }
            ];

            tardyRankContainer.innerHTML = stats.tardyRankList.slice(0, 10).map((st, idx) => {
                const badge = rankBadges[idx] || { bg: 'bg-slate-200', text: 'text-slate-700', icon: 'fa-user', border: 'border-slate-300' };
                const rankText = `第 ${idx + 1} 名`;
                const recentTardy = st.tardyDetails[st.tardyDetails.length - 1];

                return `
                    <div class="p-3 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <span class="w-7 h-7 rounded-xl ${badge.bg} ${badge.text} flex items-center justify-center text-xs font-black shrink-0 shadow-2xs">
                                ${idx < 3 ? `<i class="fa-solid ${badge.icon}"></i>` : `${idx + 1}`}
                            </span>
                            <div class="min-w-0">
                                <div class="font-black text-sm text-slate-800 truncate">
                                    ${st.seat}號 ${escapeHtml(st.name)}
                                </div>
                                <div class="text-[10px] text-slate-400 truncate">
                                    ${recentTardy ? `最近: ${recentTardy.date} (${recentTardy.time})` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 font-mono font-black text-xs border border-amber-300">
                                <i class="fa-solid fa-clock text-amber-600 text-[10px]"></i>
                                <span>${st.tardyCount} 次</span>
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 3. 個別學生出席詳細清單
    const studentListContainer = document.getElementById('att-stats-student-table-body');
    if (studentListContainer) {
        studentListContainer.innerHTML = stats.studentList.map(st => {
            const hasLeaves = (st.sickCount + st.personalCount + st.officialCount) > 0;
            const rateColor = st.attendanceRate >= 95 ? 'text-emerald-600' : (st.attendanceRate >= 85 ? 'text-amber-600' : 'text-rose-600');
            const barColor = st.attendanceRate >= 95 ? 'bg-emerald-500' : (st.attendanceRate >= 85 ? 'bg-amber-500' : 'bg-rose-500');

            return `
                <tr class="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                    <td class="py-2.5 px-3 font-mono font-black text-xs text-slate-700">
                        ${st.seat}號
                    </td>
                    <td class="py-2.5 px-3 font-bold text-xs text-slate-900">
                        ${escapeHtml(st.name || `${st.seat}號`)}
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="flex items-center gap-2">
                            <span class="font-mono font-black text-xs ${rateColor} w-10 text-right">${st.attendanceRate}%</span>
                            <div class="w-16 sm:w-24 h-2 rounded-full bg-slate-100 overflow-hidden shrink-0">
                                <div class="h-full rounded-full ${barColor}" style="width: ${st.attendanceRate}%"></div>
                            </div>
                        </div>
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono font-bold text-xs text-emerald-600">
                        ${st.presentCount}
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        ${st.tardyCount > 0 ? `
                            <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 font-mono font-black text-xs border border-amber-200 cursor-pointer" title="查看遲到紀錄" onclick="window.showStudentTardyDetails(${st.seat})">
                                ${st.tardyCount}
                            </span>
                        ` : `
                            <span class="font-mono text-xs text-slate-300">0</span>
                        `}
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        ${hasLeaves ? `
                            <div class="flex flex-wrap items-center justify-center gap-1 text-[10px] font-bold">
                                ${st.sickCount ? `<span class="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">病:${st.sickCount}</span>` : ''}
                                ${st.personalCount ? `<span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">事:${st.personalCount}</span>` : ''}
                                ${st.officialCount ? `<span class="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">公:${st.officialCount}</span>` : ''}
                            </div>
                        ` : `
                            <span class="font-mono text-xs text-slate-300">0</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * 彈窗顯示特定學生遲到明細
 */
export function showStudentTardyDetails(seat) {
    const stats = calculateAttendanceStats(activeRange);
    if (!stats) return;
    const st = stats.studentList.find(s => s.seat === Number(seat));
    if (!st || st.tardyDetails.length === 0) return;

    const listHtml = st.tardyDetails.map(td => `
        <li class="flex items-center justify-between py-2 border-b border-slate-100 text-xs font-bold">
            <span class="text-slate-700 flex items-center gap-1.5">
                <i class="fa-regular fa-calendar text-slate-400"></i> ${td.date}
            </span>
            <span class="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-mono">
                <i class="fa-regular fa-clock text-amber-500"></i> ${td.time} 到校
            </span>
        </li>
    `).join('');

    const modal = document.getElementById('att-student-tardy-detail-modal');
    const content = document.getElementById('att-student-tardy-detail-list');
    const title = document.getElementById('att-student-tardy-detail-title');
    if (modal && content && title) {
        title.textContent = `座號 ${st.seat}號 ${st.name} · 遲到詳細明細 (${st.tardyCount} 次)`;
        content.innerHTML = listHtml;
        openModal(modal);
    }
}

/**
 * 開啟出席狀況與遲到排名彈窗
 */
export function openAttendanceStatsModal() {
    const modal = document.getElementById('attendance-stats-modal');
    if (!modal) return;

    renderAttendanceStatsModal();
    openModal(modal);
}

/**
 * 綁定出席狀況彈窗各類時間範圍切換事件
 */
export function initAttendanceStatsEvents() {
    const modal = document.getElementById('attendance-stats-modal');
    if (!modal) return;

    // 關閉按鈕
    document.getElementById('close-attendance-stats-modal-btn')?.addEventListener('click', () => {
        closeModal(modal);
    });

    // 時間範圍下拉選單或按鈕
    const rangeSelect = document.getElementById('attendance-stats-range-select');
    if (rangeSelect) {
        rangeSelect.value = activeRange;
        rangeSelect.addEventListener('change', (e) => {
            activeRange = e.target.value;
            const customBox = document.getElementById('att-stats-custom-range-box');
            if (customBox) {
                if (activeRange === 'custom') {
                    customBox.classList.remove('hidden');
                } else {
                    customBox.classList.add('hidden');
                }
            }
            renderAttendanceStatsModal();
        });
    }

    // 自訂時間範圍套用
    document.getElementById('att-stats-apply-custom-btn')?.addEventListener('click', () => {
        const sInput = document.getElementById('att-stats-start-date');
        const eInput = document.getElementById('att-stats-end-date');
        if (sInput && eInput) {
            customStartDate = sInput.value;
            customEndDate = eInput.value;
            renderAttendanceStatsModal();
        }
    });

    // 搜尋過濾學生
    const searchInput = document.getElementById('att-stats-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            const rows = document.querySelectorAll('#att-stats-student-table-body tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (!query || text.includes(query)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // 學生遲到詳情彈窗關閉
    const detailModal = document.getElementById('att-student-tardy-detail-modal');
    document.getElementById('close-att-student-tardy-detail-btn')?.addEventListener('click', () => {
        if (detailModal) closeModal(detailModal);
    });
}

// 掛載至 window
if (typeof window !== 'undefined') {
    window.openAttendanceStatsModal = openAttendanceStatsModal;
    window.renderAttendanceStatsModal = renderAttendanceStatsModal;
    window.showStudentTardyDetails = showStudentTardyDetails;
    window.initAttendanceStatsEvents = initAttendanceStatsEvents;
}
