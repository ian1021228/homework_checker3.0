/**
 * 幹部及值日生管理模組 (Officers & Daily Duty Rotation)
 * 支援：班級幹部自由新增/刪除/編輯稱謂、座號每日自動輪值排程、手動指定與調換、工作備忘錄
 */

import { state } from './state.js';
import { saveData } from './storage.js';
import { showToast, openModal, closeModal, showConfirmDialog } from './utils.js';

export const DEFAULT_OFFICER_ROLES = [
    { key: 'president', title: '班長', icon: 'fa-crown', color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { key: 'vicePresident', title: '副班長', icon: 'fa-award', color: 'text-orange-600 bg-orange-50 border-orange-200' },
    { key: 'discipline', title: '風紀股長', icon: 'fa-shield-halved', color: 'text-rose-600 bg-rose-50 border-rose-200' },
    { key: 'study', title: '學藝股長', icon: 'fa-pen-nib', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    { key: 'hygiene', title: '衛生股長', icon: 'fa-broom', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { key: 'sports', title: '體育股長', icon: 'fa-volleyball', color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { key: 'counsel', title: '輔導股長', icon: 'fa-hand-holding-heart', color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { key: 'general', title: '總務股長', icon: 'fa-coins', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
    { key: 'library', title: '圖書股長', icon: 'fa-book-bookmark', color: 'text-teal-600 bg-teal-50 border-teal-200' },
    { key: 'info', title: '資訊股長', icon: 'fa-laptop-code', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    { key: 'subjectChinese', title: '國文小老師', icon: 'fa-scroll', color: 'text-red-600 bg-red-50 border-red-200' },
    { key: 'subjectEnglish', title: '英文小老師', icon: 'fa-language', color: 'text-sky-600 bg-sky-50 border-sky-200' },
    { key: 'subjectMath', title: '數學小老師', icon: 'fa-calculator', color: 'text-violet-600 bg-violet-50 border-violet-200' },
    { key: 'subjectScience', title: '自然小老師', icon: 'fa-flask', color: 'text-lime-600 bg-lime-50 border-lime-200' },
    { key: 'subjectSocial', title: '社會小老師', icon: 'fa-earth-americas', color: 'text-amber-700 bg-amber-50 border-amber-300' }
];

export function getTodayDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * 依日期與班級設定計算當日值日生（座號不補 0、無自訂姓名不重複顯示「1號 1號」）
 */
export function getTodayDutyStudents(currentClass, dateStr = getTodayDateStr()) {
    if (!currentClass) return [];
    
    currentClass.dutySettings = currentClass.dutySettings || {};
    const settings = currentClass.dutySettings;
    const customAssignments = settings.customAssignments || {};

    // 1. 若該日期有老師手動指定的值日生，優先採用手動指定
    if (customAssignments[dateStr] && Array.isArray(customAssignments[dateStr]) && customAssignments[dateStr].length > 0) {
        return customAssignments[dateStr].map(seat => {
            const numSeat = Number(seat);
            const st = (currentClass.students || []).find(s => Number(s.seat) === numSeat);
            const cleanName = (st && st.name && st.name !== `${numSeat}號` && st.name !== `${String(numSeat).padStart(2, '0')}號`) ? st.name : '';
            return {
                seat: numSeat,
                name: cleanName,
                isCustom: true
            };
        });
    }

    // 2. 自動按日期天數與座號推算輪值
    const maxSeat = typeof currentClass.lastMaxSeat === 'number' && currentClass.lastMaxSeat > 0 
        ? currentClass.lastMaxSeat 
        : ((currentClass.students || []).length || 30);
    const perDay = Number(settings.studentsPerDay) || 2;

    // 用 dateStr 產生確定性的天數序號
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);
    // 計算從年初至今天的上課天數 (略過週六日)
    const startOfYear = new Date(y, 0, 1);
    let schoolDayCount = 0;
    for (let cur = new Date(startOfYear); cur <= targetDate; cur.setDate(cur.getDate() + 1)) {
        const dayOfWeek = cur.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 排除週六週日
            schoolDayCount++;
        }
    }

    const startIndex = (schoolDayCount * perDay) % maxSeat;
    const result = [];
    for (let i = 0; i < perDay; i++) {
        let seatNum = ((startIndex + i) % maxSeat) + 1;
        const st = (currentClass.students || []).find(s => Number(s.seat) === seatNum);
        const cleanName = (st && st.name && st.name !== `${seatNum}號` && st.name !== `${String(seatNum).padStart(2, '0')}號`) ? st.name : '';
        result.push({
            seat: seatNum,
            name: cleanName,
            isCustom: false
        });
    }

    return result;
}

export function getActiveOfficerRoles(currentClass) {
    if (!currentClass.officerRoles || !Array.isArray(currentClass.officerRoles) || currentClass.officerRoles.length === 0) {
        currentClass.officerRoles = JSON.parse(JSON.stringify(DEFAULT_OFFICER_ROLES));
    }
    return currentClass.officerRoles;
}

export function renderOfficersPage() {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    currentClass.officers = currentClass.officers || {};
    currentClass.dutySettings = currentClass.dutySettings || {
        studentsPerDay: 2,
        cycleMode: 'sequential',
        customAssignments: {}
    };

    const roles = getActiveOfficerRoles(currentClass);
    const maxSeat = typeof currentClass.lastMaxSeat === 'number' ? currentClass.lastMaxSeat : 30;

    // 更新幹部數量標籤
    const countBadge = document.getElementById('officers-count-badge');
    if (countBadge) countBadge.textContent = `${roles.length} 位`;

    // 1. 渲染動態幹部卡片（可編輯名稱、可刪除、可填寫座號姓名）
    const grid = document.getElementById('officers-grid');
    if (grid) {
        grid.innerHTML = roles.map(role => {
            const savedSeat = currentClass.officers[role.key]?.seat || '';
            const savedName = currentClass.officers[role.key]?.name || '';

            return `
                <div class="officer-card p-4 rounded-2xl border ${role.color || 'text-indigo-600 bg-indigo-50 border-indigo-200'} flex flex-col justify-between transition-all hover:shadow-xs group relative" data-role="${role.key}">
                    <div class="flex items-center justify-between mb-2 gap-2">
                        <div class="flex items-center gap-2 flex-1 min-w-0">
                            <i class="fa-solid ${role.icon || 'fa-user-tag'} text-base shrink-0"></i>
                            <input 
                                type="text" 
                                value="${role.title}" 
                                data-role="${role.key}"
                                class="officer-title-input font-black text-sm text-slate-800 bg-transparent border-b border-dashed border-slate-300 hover:border-indigo-400 focus:border-indigo-600 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition-all w-full"
                                placeholder="幹部名稱"
                                title="點擊直接修改幹部名稱"
                            />
                        </div>
                        <button 
                            type="button" 
                            class="delete-officer-btn p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0 cursor-pointer" 
                            data-role="${role.key}"
                            title="刪除此幹部"
                        >
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                    <div class="space-y-1.5">
                        <div class="flex items-center gap-2">
                            <label class="text-[11px] font-bold text-slate-500 shrink-0">座號</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="${maxSeat}" 
                                placeholder="座號" 
                                value="${savedSeat}" 
                                data-role="${role.key}"
                                class="officer-seat-input w-20 py-1 px-2 rounded-lg border border-slate-300 text-xs font-bold text-center bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                            <input 
                                type="text" 
                                placeholder="姓名" 
                                value="${savedName}" 
                                data-role="${role.key}"
                                class="officer-name-input flex-1 py-1 px-2 rounded-lg border border-slate-300 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 綁定幹部稱謂即時編輯
        grid.querySelectorAll('.officer-title-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const roleKey = e.target.dataset.role;
                const newTitle = e.target.value.trim() || '幹部';
                const roleObj = roles.find(r => r.key === roleKey);
                if (roleObj) {
                    roleObj.title = newTitle;
                    saveData();
                }
            });
        });

        // 綁定輸入座號時自動查填姓名
        grid.querySelectorAll('.officer-seat-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const seatVal = Number(e.target.value);
                const roleKey = e.target.dataset.role;
                const nameInput = grid.querySelector(`.officer-name-input[data-role="${roleKey}"]`);
                if (seatVal && nameInput) {
                    const st = (currentClass.students || []).find(s => Number(s.seat) === seatVal);
                    if (st && st.name) {
                        nameInput.value = st.name;
                    }
                }
            });
        });

        // 綁定刪除幹部
        grid.querySelectorAll('.delete-officer-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const roleKey = btn.dataset.role;
                deleteOfficer(roleKey);
            });
        });
    }

    // 2. 渲染今日值日生與參數
    renderDutySettingsSection(currentClass);
}

/**
 * 新增自訂幹部
 */
export function addNewOfficer() {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const roles = getActiveOfficerRoles(currentClass);
    const newKey = 'officer_' + Date.now();
    const colorStyles = [
        'text-indigo-600 bg-indigo-50 border-indigo-200',
        'text-emerald-600 bg-emerald-50 border-emerald-200',
        'text-purple-600 bg-purple-50 border-purple-200',
        'text-amber-600 bg-amber-50 border-amber-200',
        'text-rose-600 bg-rose-50 border-rose-200',
        'text-sky-600 bg-sky-50 border-sky-200',
        'text-teal-600 bg-teal-50 border-teal-200'
    ];
    const pickedColor = colorStyles[roles.length % colorStyles.length];

    roles.push({
        key: newKey,
        title: '新幹部',
        icon: 'fa-user-tag',
        color: pickedColor
    });

    currentClass.officers = currentClass.officers || {};
    currentClass.officers[newKey] = { seat: '', name: '' };

    saveData();
    renderOfficersPage();
    showToast('已新增幹部項目，請直接修改幹部名稱並指派座號！', 'info');

    setTimeout(() => {
        const titleInput = document.querySelector(`.officer-title-input[data-role="${newKey}"]`);
        if (titleInput) {
            titleInput.focus();
            titleInput.select();
        }
    }, 50);
}

/**
 * 刪除幹部
 */
export function deleteOfficer(roleKey) {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const roles = getActiveOfficerRoles(currentClass);
    const targetIdx = roles.findIndex(r => r.key === roleKey);
    if (targetIdx === -1) return;

    const roleName = roles[targetIdx].title;
    roles.splice(targetIdx, 1);

    if (currentClass.officers && currentClass.officers[roleKey]) {
        delete currentClass.officers[roleKey];
    }

    saveData();
    renderOfficersPage();
    showToast(`已刪除幹部「${roleName}」`, 'info');
}

/**
 * 回復預設 15 項常用幹部
 */
export async function resetDefaultOfficers() {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const ok = await showConfirmDialog('回復預設幹部', '確定要將幹部名冊回復為系統預設的 15 項正規幹部嗎？', {
        okText: '確定回復',
        okClass: 'bg-indigo-600 text-white font-bold py-2.5 px-6 text-sm rounded-xl shadow-md hover:bg-indigo-700 transition-colors'
    });
    if (!ok) return;

    currentClass.officerRoles = JSON.parse(JSON.stringify(DEFAULT_OFFICER_ROLES));
    saveData();
    renderOfficersPage();
    showToast('已成功回復為預設 15 項幹部！', 'success');
}

function renderDutySettingsSection(currentClass) {
    const todayStr = getTodayDateStr();
    const dutyTodayDate = document.getElementById('duty-today-date');
    if (dutyTodayDate) dutyTodayDate.textContent = todayStr;

    const dutyBox = document.getElementById('duty-today-students-box');
    if (dutyBox) {
        const duty = getTodayDutyStudents(currentClass, todayStr);
        dutyBox.innerHTML = duty.map(d => `
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white font-black text-sm shadow-xs">
                <i class="fa-solid fa-broom text-amber-200 text-xs"></i>
                <span>${d.seat}號${d.name ? ' ' + d.name : ''}</span>
                ${d.isCustom ? '<span class="text-[10px] bg-white/20 px-1 rounded">手動</span>' : ''}
            </span>
        `).join('');
    }

    const perDaySelect = document.getElementById('duty-students-per-day');
    if (perDaySelect && currentClass.dutySettings?.studentsPerDay) {
        perDaySelect.value = String(currentClass.dutySettings.studentsPerDay);
    }
}

/**
 * 儲存幹部設定與值日生排程
 */
export function saveOfficersAndDutySettings() {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    currentClass.officers = currentClass.officers || {};
    const roles = getActiveOfficerRoles(currentClass);

    // 收集所有幹部的稱謂與座號姓名輸入
    roles.forEach(role => {
        const titleInput = document.querySelector(`.officer-title-input[data-role="${role.key}"]`);
        if (titleInput && titleInput.value.trim()) {
            role.title = titleInput.value.trim();
        }

        const seatInput = document.querySelector(`.officer-seat-input[data-role="${role.key}"]`);
        const nameInput = document.querySelector(`.officer-name-input[data-role="${role.key}"]`);
        const seat = seatInput ? (Number(seatInput.value) || '') : '';
        const name = nameInput ? nameInput.value.trim() : '';

        currentClass.officers[role.key] = { seat, name };
    });

    // 收集值日生設定
    currentClass.dutySettings = currentClass.dutySettings || {};
    const perDaySelect = document.getElementById('duty-students-per-day');
    if (perDaySelect) {
        currentClass.dutySettings.studentsPerDay = Number(perDaySelect.value) || 2;
    }

    const tasksInput = document.getElementById('duty-tasks-input');
    if (tasksInput) {
        currentClass.dutySettings.tasks = tasksInput.value.trim();
    }

    saveData();
    showToast('班級幹部與值日生設定已成功儲存並同步至雲端！', 'success');
    renderDutySettingsSection(currentClass);
}

/**
 * 手動為指定日期指派/更換值日生
 */
export function setCustomDutyForDate(dateStr, seatsArray) {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    currentClass.dutySettings = currentClass.dutySettings || {};
    currentClass.dutySettings.customAssignments = currentClass.dutySettings.customAssignments || {};
    currentClass.dutySettings.customAssignments[dateStr] = seatsArray.map(Number).filter(Boolean);

    saveData();
    showToast(`已成功指定 ${dateStr} 的值日生為：${seatsArray.join(', ')} 號`, 'success');
    renderDutySettingsSection(currentClass);
}
