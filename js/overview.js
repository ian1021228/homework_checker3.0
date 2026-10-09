/**
 * 總覽大螢幕課堂看板 (Overview / Classroom Mission Control)
 * 專為教室大螢幕/電子白板設計，一目了然，免向下捲動
 * 整合：各作業未完成座號（按狀態名稱詳細條列）、今日聯絡簿、今日值日生、注意事項、出缺席概況
 */

import { state } from './state.js';
import { formatDate, safeCopyToClipboard, showToast, openModal, closeModal } from './utils.js';
import { getTodayDutyStudents } from './officers.js';
import { getTodayAttendanceSummary } from './attendance.js';
import { getHomeworkType } from './render.js';

export function getTodayDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function formatChineseDateWithWeekday(date = new Date()) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const w = weekdays[date.getDay()];
    return `${y} 年 ${m} 月 ${d} 日 ${w}`;
}

export function renderOverviewPage() {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const todayStr = getTodayDateStr();

    // 1. 頂部日期與班級標題
    const dateDisplay = document.getElementById('overview-date-display');
    if (dateDisplay) {
        dateDisplay.textContent = `${currentClass.name} · ${formatChineseDateWithWeekday()}`;
    }

    // 2. 今日各作業未完成名單（依狀態名稱條列）
    renderOverviewHomeworks(currentClass);

    // 3. 今日出缺席狀態統計
    renderOverviewAttendance(currentClass, todayStr);

    // 4. 今日黑板聯絡簿
    renderOverviewContactBook(currentClass, todayStr);

    // 5. 今日值日生
    renderOverviewDutyStudents(currentClass, todayStr);

    // 6. 班級注意事項
    renderOverviewNotice(currentClass);
}

function renderOverviewHomeworks(currentClass) {
    const container = document.getElementById('overview-homework-list');
    const badge = document.getElementById('overview-hw-missing-badge');
    if (!container) return;

    const classHomeworks = (state.appData?.homeworks || []).filter(h => h.classId === currentClass.id);
    if (classHomeworks.length === 0) {
        container.innerHTML = `
            <div class="h-40 flex flex-col items-center justify-center text-slate-400 font-bold text-sm bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                <i class="fa-solid fa-folder-open text-2xl text-slate-300 mb-2"></i>
                <span>目前尚無指派中的作業</span>
            </div>
        `;
        if (badge) badge.textContent = '0 項作業';
        return;
    }

    let totalIncompleteAcrossAll = 0;

    const cardsHtml = classHomeworks.map(hw => {
        const students = hw.students || [];
        const maxSeat = typeof currentClass.lastMaxSeat === 'number' ? currentClass.lastMaxSeat : students.length;
        const type = getHomeworkType(hw.typeId);

        // 依未完成狀態名稱分組收集座號
        const uncompletedGroups = {}; // { [statusKey]: { text, color, textColor, seats: [] } }
        let uncompletedCount = 0;

        for (let i = 1; i <= maxSeat; i++) {
            const st = students.find(s => Number(s.seat) === i);
            const statusKey = st?.status || type.statuses[0]?.key;
            const statusObj = type.statuses.find(s => s.key === statusKey) || type.statuses[0];
            
            if (!statusObj || !statusObj.isCompleted) {
                uncompletedCount++;
                const sKey = statusObj?.key || 'not-submitted';
                if (!uncompletedGroups[sKey]) {
                    uncompletedGroups[sKey] = {
                        text: statusObj?.text || '未繳交',
                        color: statusObj?.color || 'bg-rose-500',
                        textColor: statusObj?.textColor || 'text-white',
                        seats: []
                    };
                }
                uncompletedGroups[sKey].seats.push(i);
            }
        }

        totalIncompleteAcrossAll += uncompletedCount;
        const completedCount = maxSeat - uncompletedCount;
        const rate = maxSeat > 0 ? Math.round((completedCount / maxSeat) * 100) : 100;
        const isAllDone = uncompletedCount === 0;

        let statusSectionsHtml = '';
        if (isAllDone) {
            statusSectionsHtml = `
                <div class="mt-2">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs">
                        <i class="fa-solid fa-circle-check text-emerald-600"></i> 全班皆已完成
                    </span>
                </div>
            `;
        } else {
            const groupsArr = Object.values(uncompletedGroups);
            statusSectionsHtml = `
                <div class="mt-2 space-y-2">
                    ${groupsArr.map(group => `
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-xs font-black text-slate-700 shrink-0 flex items-center gap-1.5">
                                <span class="w-2.5 h-2.5 rounded-full ${group.color}"></span>
                                <span>${group.text} (${group.seats.length}人)：</span>
                            </span>
                            <div class="flex flex-wrap items-center gap-1">
                                ${group.seats.map(seat => `
                                    <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-lg ${group.color} ${group.textColor} font-black text-xs shadow-2xs">
                                        ${seat}號
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        return `
            <div class="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
                <div class="flex items-center justify-between gap-2 mb-1.5">
                    <div class="flex items-center gap-2 font-black text-slate-900 text-sm truncate">
                        <span class="w-2.5 h-2.5 rounded-full ${isAllDone ? 'bg-emerald-500' : 'bg-rose-500'} shrink-0"></span>
                        <span class="truncate">${hw.name}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-xs font-black font-mono ${isAllDone ? 'text-emerald-600' : 'text-slate-600'}">
                            ${completedCount} / ${maxSeat} (${rate}%)
                        </span>
                    </div>
                </div>

                <!-- 進度條 -->
                <div class="w-full bg-slate-100 rounded-full h-2 mb-1.5 overflow-hidden">
                    <div class="${isAllDone ? 'bg-emerald-500' : 'bg-indigo-600'} h-2 rounded-full transition-all duration-500" style="width: ${rate}%"></div>
                </div>

                <!-- 依狀態名稱詳細條列座號 -->
                ${statusSectionsHtml}
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
    if (badge) {
        badge.innerHTML = totalIncompleteAcrossAll === 0 
            ? `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-check mr-1"></i>全班作業皆完成</span>`
            : `<span>總未完成人次：<strong class="text-rose-600 font-black">${totalIncompleteAcrossAll}</strong></span>`;
    }
}

function renderOverviewAttendance(currentClass, todayStr) {
    const summary = getTodayAttendanceSummary(currentClass, todayStr);

    const elPresent = document.getElementById('overview-att-present-count');
    const elTardy = document.getElementById('overview-att-tardy-count');
    const elLeave = document.getElementById('overview-att-leave-count');
    const elTotal = document.getElementById('overview-att-total-count');
    const elDetail = document.getElementById('overview-att-detail-box');

    if (elPresent) elPresent.textContent = summary.presentCount;
    if (elTardy) elTardy.textContent = summary.tardyCount;
    if (elLeave) elLeave.textContent = summary.leaveCount;
    if (elTotal) elTotal.textContent = summary.totalStudents;

    if (elDetail) {
        if (summary.tardyCount === 0 && summary.leaveCount === 0) {
            elDetail.innerHTML = `
                <div class="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                    <i class="fa-solid fa-circle-check text-emerald-500"></i>
                    <span>今日全員準時到齊，無遲到缺席學生！</span>
                </div>
            `;
        } else {
            const abnormalItems = [];
            if (summary.tardies.length > 0) {
                abnormalItems.push(`
                    <span class="text-amber-800 font-black">
                        遲到 (${summary.tardyCount}人)：${summary.tardies.map(t => `${t.seat}號${t.name ? ' ' + t.name : ''}${t.time ? ` (${t.time} 到校)` : ''}`).join('、')}
                    </span>
                `);
            }
            if (summary.leaves.length > 0) {
                abnormalItems.push(`
                    <span class="text-rose-800 font-black">
                        請假 (${summary.leaveCount}人)：${summary.leaves.map(l => `${l.seat}號${l.name ? ' ' + l.name : ''} (${l.reason || '假'})`).join('、')}
                    </span>
                `);
            }
            elDetail.innerHTML = `
                <div class="flex flex-col gap-1 w-full text-xs">
                    ${abnormalItems.join('')}
                </div>
            `;
        }
    }
}

function renderOverviewContactBook(currentClass, todayStr) {
    const box = document.getElementById('overview-contact-items-box');
    if (!box) return;

    const contactBook = currentClass.contactBook || {};
    const todayData = contactBook[todayStr] || {};
    const items = todayData.items || [];

    if (items.length === 0) {
        box.innerHTML = `
            <div class="h-32 flex flex-col items-center justify-center text-slate-400 font-mono text-sm opacity-80">
                <i class="fa-solid fa-chalkboard text-2xl mb-1 text-slate-500"></i>
                <span>今日聯絡簿尚未新增條目</span>
                <span class="text-xs text-slate-500 mt-1">點擊右上角「聯絡簿編輯」即可寫上黑板</span>
            </div>
        `;
        return;
    }

    const itemsHtml = items.map((item, index) => {
        const text = typeof item === 'string' ? item : (item.text || '');
        return `
            <div class="flex items-start gap-2.5 py-1.5 border-b border-white/10 last:border-0 leading-relaxed font-mono">
                <span class="text-amber-300 font-black shrink-0">${index + 1}.</span>
                <span class="text-slate-100 flex-1 break-words">${text}</span>
            </div>
        `;
    }).join('');

    box.innerHTML = itemsHtml;
}

function renderOverviewDutyStudents(currentClass, todayStr) {
    const namesEl = document.getElementById('overview-duty-names');
    if (!namesEl) return;

    const duty = getTodayDutyStudents(currentClass, todayStr);
    if (!duty || duty.length === 0) {
        namesEl.textContent = '今日未指定值日生';
        return;
    }

    const namesText = duty.map(d => `${d.seat}號${d.name ? ' ' + d.name : ''}`).join('、');
    namesEl.textContent = namesText;
}

function renderOverviewNotice(currentClass) {
    const noticeEl = document.getElementById('overview-notice-display');
    if (!noticeEl) return;

    const notice = currentClass.bulletinNotice || '';
    if (notice.trim()) {
        noticeEl.textContent = notice.trim();
        noticeEl.classList.remove('italic', 'text-slate-400');
        noticeEl.classList.add('text-indigo-950');
    } else {
        noticeEl.textContent = '暫無特殊注意事項，請記得攜帶文具、水壺與作業！';
        noticeEl.classList.add('italic', 'text-slate-400');
        noticeEl.classList.remove('text-indigo-950');
    }
}

/**
 * 複製今日班級總通報文案 (LINE家長群一鍵貼上)
 */
export function copyOverviewDailyReport() {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const todayStr = getTodayDateStr();
    const summary = getTodayAttendanceSummary(currentClass, todayStr);
    const classHomeworks = (state.appData?.homeworks || []).filter(h => h.classId === currentClass.id);
    const accessCode = currentClass.accessCode || 'DEMO';
    const parentUrl = `${window.location.origin}${window.location.pathname.replace('homework_checker3.0_dev', 'parent_dashboard_dev')}?code=${accessCode}`;

    let report = `📢 【${currentClass.name} 今日班級聯絡簿與出缺席總通報】\n`;
    report += `📅 日期：${formatChineseDateWithWeekday()}\n\n`;

    // 1. 出缺席概況
    report += `📊 【出缺席概況】：\n`;
    report += `• 實到出席：${summary.presentCount} 人\n`;
    report += `• 遲到到校：${summary.tardyCount} 人\n`;
    report += `• 請假缺席：${summary.leaveCount} 人\n`;
    if (summary.tardies.length > 0) {
        report += `• 遲到名單：${summary.tardies.map(t => `${t.seat}號${t.name ? ' ' + t.name : ''}${t.time ? ` (${t.time} 到校)` : ''}`).join('、')}\n`;
    }
    if (summary.leaves.length > 0) {
        report += `• 請假名單：${summary.leaves.map(l => `${l.seat}號${l.name ? ' ' + l.name : ''} (${l.reason || '假'})`).join('、')}\n`;
    }
    report += `\n`;

    // 2. 各項作業未完成名單 (按狀態名稱詳細條列)
    report += `📝 【今日作業完成進度】：\n`;
    if (classHomeworks.length > 0) {
        classHomeworks.forEach(hw => {
            const students = hw.students || [];
            const maxSeat = typeof currentClass.lastMaxSeat === 'number' ? currentClass.lastMaxSeat : students.length;
            const type = getHomeworkType(hw.typeId);

            const uncompletedGroups = {};
            let uncompletedCount = 0;
            for (let i = 1; i <= maxSeat; i++) {
                const st = students.find(s => Number(s.seat) === i);
                const statusKey = st?.status || type.statuses[0]?.key;
                const statusObj = type.statuses.find(s => s.key === statusKey) || type.statuses[0];
                if (!statusObj || !statusObj.isCompleted) {
                    uncompletedCount++;
                    const sKey = statusObj?.key || 'not-submitted';
                    if (!uncompletedGroups[sKey]) {
                        uncompletedGroups[sKey] = {
                            text: statusObj?.text || '未繳交',
                            seats: []
                        };
                    }
                    uncompletedGroups[sKey].seats.push(i);
                }
            }

            if (uncompletedCount === 0) {
                report += `• ${hw.name}：全班皆已完成！✨\n`;
            } else {
                report += `• ${hw.name}：\n`;
                Object.values(uncompletedGroups).forEach(group => {
                    report += `   - ${group.text} (${group.seats.length}人)：${group.seats.map(s => `${s}號`).join('、')}\n`;
                });
            }
        });
    } else {
        report += `(目前尚無指派作業)\n`;
    }
    report += `\n`;

    // 3. 值日生
    const duty = getTodayDutyStudents(currentClass, todayStr);
    if (duty && duty.length > 0) {
        report += `🧹 【今日值日生】：${duty.map(d => `${d.seat}號${d.name ? ' ' + d.name : ''}`).join('、')}\n\n`;
    }

    // 4. 注意事項
    if (currentClass.bulletinNotice && currentClass.bulletinNotice.trim()) {
        report += `💡 【重要提醒】：${currentClass.bulletinNotice.trim()}\n\n`;
    }

    // 5. 家長端直查連結
    report += `🔗 家長端即時查詢與電子簽名：\n${parentUrl}\n`;

    safeCopyToClipboard(report);
    showToast('已複製今日總通報文案至剪貼簿！可直接貼至家長 LINE 官方群組', 'success');
}

/**
 * 全螢幕切換與按鈕狀態更新
 */
export function updateOverviewFullscreenButton() {
    const btn = document.getElementById('overview-fullscreen-btn');
    if (!btn) return;
    const isFull = !!document.fullscreenElement;
    if (isFull) {
        btn.innerHTML = `<i class="fa-solid fa-compress"></i> <span>離開全螢幕</span>`;
        btn.classList.add('bg-slate-700', 'hover:bg-slate-800');
        btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
    } else {
        btn.innerHTML = `<i class="fa-solid fa-expand"></i> <span>全螢幕投影</span>`;
        btn.classList.remove('bg-slate-700', 'hover:bg-slate-800');
        btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
    }
}

// 監聽全螢幕變化事件（包含使用者按 ESC 離開）
if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', updateOverviewFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateOverviewFullscreenButton);
}

export function toggleOverviewFullscreen() {
    const el = document.getElementById('overview-page');
    if (!el) return;

    if (!document.fullscreenElement) {
        el.requestFullscreen().then(() => {
            updateOverviewFullscreenButton();
        }).catch(err => {
            console.warn('Fullscreen request failed:', err);
        });
    } else {
        document.exitFullscreen().then(() => {
            updateOverviewFullscreenButton();
        }).catch(err => {
            console.warn('Exit fullscreen failed:', err);
        });
    }
}
