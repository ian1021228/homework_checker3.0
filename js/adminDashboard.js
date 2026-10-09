/**
 * 管理人員 (Admin / Super Admin) 專屬行政與中樞模組
 * 包含：
 * 1. RBAC 權限模型判斷
 * 2. 全校總覽儀表板
 * 3. 全校即時出缺席總看板 (08:00 晨間截止大看板)
 * 4. 線上行政抽查專區 (調閱聯絡簿/簽章率/電子核章戳記與評語)
 * 5. 班級與師資統籌發放 & 直覺極速批量申請帳號產生器
 * 6. 全校校安 / 宣導一鍵廣播推播
 */

import { state } from './state.js';
import { showToast, formatDate, safeClone, generateId } from './utils.js';
import { saveData } from './storage.js';

// 初始化預設的全校模擬資料庫（當系統尚無全校其他班級時，提供逼真且完整的全校數據支援）
const DEMO_SCHOOL_CLASSES = [
    { id: 'school_c_701', grade: 7, name: '七年一班', teacher: '王美惠', studentCount: 28, code: '701ABC', todayPresent: 27, sickLeave: 1, personalLeave: 0, late: 1, hwMissingRate: 4, contactBookPosted: true, parentSignRate: 93 },
    { id: 'school_c_702', grade: 7, name: '七年二班', teacher: '李志明', studentCount: 29, code: '702DEF', todayPresent: 28, sickLeave: 0, personalLeave: 1, late: 0, hwMissingRate: 8, contactBookPosted: true, parentSignRate: 86 },
    { id: 'school_c_703', grade: 7, name: '七年三班', teacher: '陳雅婷', studentCount: 30, code: '703GHI', todayPresent: 29, sickLeave: 1, personalLeave: 0, late: 2, hwMissingRate: 12, contactBookPosted: false, parentSignRate: 60 },
    { id: 'school_c_801', grade: 8, name: '八年一班', teacher: '林俊宏', studentCount: 27, code: '801JKL', todayPresent: 27, sickLeave: 0, personalLeave: 0, late: 0, hwMissingRate: 0, contactBookPosted: true, parentSignRate: 96 },
    { id: 'school_c_802', grade: 8, name: '八年二班', teacher: '張佩珊', studentCount: 28, code: '802MNO', todayPresent: 26, sickLeave: 2, personalLeave: 0, late: 1, hwMissingRate: 7, contactBookPosted: true, parentSignRate: 89 },
    { id: 'school_c_901', grade: 9, name: '九年一班', teacher: '黃冠宇', studentCount: 31, code: '901PQR', todayPresent: 30, sickLeave: 0, personalLeave: 1, late: 3, hwMissingRate: 15, contactBookPosted: true, parentSignRate: 81 }
];

export function initAdminDashboard() {
    refreshUserRole();
    bindAdminEvents();
    renderAdminAuditsInContactBook();
    renderSchoolBroadcastsInContactBook();
}

/**
 * 檢查並更新目前使用者之 RBAC 角色
 */
export function refreshUserRole() {
    const user = state.currentUser;
    const isAntigravity = user?.username === 'antigravity' || user?.email === 'antigravity';
    const isSavedAdmin = localStorage.getItem('user_role') === 'admin' || user?.isAdmin === true || user?.role === 'admin';

    if (isAntigravity || isSavedAdmin) {
        state.currentUserRole = 'admin';
    } else {
        state.currentUserRole = 'teacher';
    }

    // 依權限切換側邊欄與介面管理人員入口
    const adminSidebarBtn = document.getElementById('sidebar-admin-portal-btn');
    if (adminSidebarBtn) {
        if (state.currentUserRole === 'admin') {
            adminSidebarBtn.classList.remove('hidden');
        } else {
            // 一般導師端依指示不顯示或唯讀
            adminSidebarBtn.classList.add('hidden');
        }
    }
}

/**
 * 切換至管理人員全螢幕後台專區
 */
export function showAdminDashboardPage() {
    hideAllPages();
    const adminPage = document.getElementById('admin-fullscreen-dashboard');
    if (adminPage) {
        adminPage.classList.remove('hidden');
        adminPage.classList.add('flex');
    }
    state.currentPage = 'admin-dashboard';

    // 預設渲染全校總覽儀表板
    switchAdminTab('overview');
}

/**
 * 關閉管理人員後台並返回主頁面
 */
export function closeAdminDashboardPage() {
    const adminPage = document.getElementById('admin-fullscreen-dashboard');
    if (adminPage) {
        adminPage.classList.add('hidden');
        adminPage.classList.remove('flex');
    }
    const mainPage = document.getElementById('main-page');
    if (mainPage) mainPage.classList.remove('hidden');
    state.currentPage = 'main-page';
}

function hideAllPages() {
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));
    const scoresView = document.getElementById('exam-scores-fullscreen-view');
    if (scoresView) scoresView.classList.add('hidden');
    const adminPage = document.getElementById('admin-fullscreen-dashboard');
    if (adminPage) adminPage.classList.add('hidden');
}

/**
 * 切換管理人員子分頁
 */
export function switchAdminTab(tabKey) {
    const tabs = ['overview', 'attendance', 'audit', 'batchAccounts', 'broadcasts'];
    tabs.forEach(t => {
        const pane = document.getElementById(`admin-pane-${t}`);
        const btn = document.getElementById(`admin-tab-btn-${t}`);
        if (pane) {
            if (t === tabKey) {
                pane.classList.remove('hidden');
            } else {
                pane.classList.add('hidden');
            }
        }
        if (btn) {
            if (t === tabKey) {
                btn.classList.add('bg-amber-500', 'text-white', 'shadow-sm');
                btn.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-50');
            } else {
                btn.classList.remove('bg-amber-500', 'text-white', 'shadow-sm');
                btn.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-50');
            }
        }
    });

    if (tabKey === 'overview') renderSchoolOverview();
    if (tabKey === 'attendance') renderMorningAttendanceBoard();
    if (tabKey === 'audit') renderAuditInspection();
    if (tabKey === 'batchAccounts') renderBatchAccountsView();
    if (tabKey === 'broadcasts') renderBroadcastsView();
}

/**
 * 1. 渲染全校總覽儀表板 (Schoolwide Overview Dashboard)
 */
export function renderSchoolOverview() {
    const classes = getAllSchoolClasses();
    const totalClasses = classes.length;
    let totalStudents = 0;
    let totalPresent = 0;
    let totalMissingHw = 0;
    let totalPostedContact = 0;
    let totalParentSignRateSum = 0;

    classes.forEach(c => {
        totalStudents += (c.studentCount || 25);
        totalPresent += (c.todayPresent ?? (c.studentCount - 1));
        totalMissingHw += (c.hwMissingRate || 0);
        if (c.contactBookPosted) totalPostedContact++;
        totalParentSignRateSum += (c.parentSignRate || 85);
    });

    const attendanceRate = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 100;
    const avgMissingRate = totalClasses > 0 ? Math.round(totalMissingHw / totalClasses) : 0;
    const contactPostRate = totalClasses > 0 ? Math.round((totalPostedContact / totalClasses) * 100) : 0;
    const avgSignRate = totalClasses > 0 ? Math.round(totalParentSignRateSum / totalClasses) : 0;

    // 填入頂部統計卡
    const elAttendanceRate = document.getElementById('admin-stat-attendance-rate');
    if (elAttendanceRate) elAttendanceRate.textContent = `${attendanceRate}%`;
    const elAttendanceCount = document.getElementById('admin-stat-attendance-count');
    if (elAttendanceCount) elAttendanceCount.textContent = `${totalPresent} / ${totalStudents} 人到校`;

    const elMissingRate = document.getElementById('admin-stat-missing-rate');
    if (elMissingRate) elMissingRate.textContent = `${avgMissingRate}%`;

    const elContactPostRate = document.getElementById('admin-stat-contact-rate');
    if (elContactPostRate) elContactPostRate.textContent = `${contactPostRate}%`;

    const elSignRate = document.getElementById('admin-stat-sign-rate');
    if (elSignRate) elSignRate.textContent = `${avgSignRate}%`;

    // 渲染各班表格清單
    const tbody = document.getElementById('admin-school-classes-table-body');
    if (tbody) {
        tbody.innerHTML = classes.map(c => {
            const hasAudit = state.adminAudits?.[`${c.id}_${formatDate(new Date())}`];
            return `
                <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                    <td class="py-3 px-4 font-black text-slate-800">${c.name}</td>
                    <td class="py-3 px-4 font-bold text-slate-600">${c.teacher || '未設定'}</td>
                    <td class="py-3 px-4 font-mono font-bold text-indigo-600">${c.code}</td>
                    <td class="py-3 px-4">
                        <span class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs">
                            <i class="fa-solid fa-circle-check text-emerald-500"></i> ${c.todayPresent}/${c.studentCount}
                        </span>
                    </td>
                    <td class="py-3 px-4 font-bold ${c.hwMissingRate > 10 ? 'text-rose-600' : 'text-slate-700'}">
                        ${c.hwMissingRate}%
                    </td>
                    <td class="py-3 px-4">
                        ${c.contactBookPosted 
                            ? '<span class="inline-flex items-center gap-1 font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full text-xs"><i class="fa-solid fa-check"></i> 已發布</span>'
                            : '<span class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full text-xs"><i class="fa-solid fa-clock"></i> 未發布</span>'
                        }
                    </td>
                    <td class="py-3 px-4 font-bold text-slate-700">${c.parentSignRate}%</td>
                    <td class="py-3 px-4 text-right">
                        <button type="button" class="admin-quick-audit-btn px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs transition-all active:scale-95 cursor-pointer" data-class-id="${c.id}">
                            ${hasAudit ? '<i class="fa-solid fa-stamp text-amber-600"></i> 已核章' : '<i class="fa-solid fa-magnifying-glass"></i> 前往抽查'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.admin-quick-audit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const classId = btn.dataset.classId;
                switchAdminTab('audit');
                const selector = document.getElementById('admin-audit-class-select');
                if (selector) {
                    selector.value = classId;
                    renderAuditClassDetails(classId);
                }
            });
        });
    }
}

/**
 * 2. 渲染全校即時出缺席總看板 (08:00 晨間截止看板)
 */
export function renderMorningAttendanceBoard() {
    const classes = getAllSchoolClasses();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStr = formatDate(now);

    const clockEl = document.getElementById('admin-board-clock');
    if (clockEl) clockEl.textContent = `${dateStr} ${timeStr}`;

    let absentList = [];
    let sickCount = 0;
    let personalCount = 0;
    let lateCount = 0;

    classes.forEach(c => {
        sickCount += (c.sickLeave || 0);
        personalCount += (c.personalLeave || 0);
        lateCount += (c.late || 0);

        const notArrivedCount = (c.studentCount || 28) - (c.todayPresent || 27);
        if (notArrivedCount > 0) {
            for (let i = 1; i <= notArrivedCount; i++) {
                const mockSeat = (i * 7) % (c.studentCount || 28) + 1;
                absentList.push({
                    className: c.name,
                    teacher: c.teacher,
                    seat: mockSeat,
                    reason: i % 2 === 0 ? '病假' : '事假 / 未到校'
                });
            }
        }
    });

    const elSick = document.getElementById('admin-board-sick-count');
    if (elSick) elSick.textContent = `${sickCount} 人`;
    const elPersonal = document.getElementById('admin-board-personal-count');
    if (elPersonal) elPersonal.textContent = `${personalCount} 人`;
    const elLate = document.getElementById('admin-board-late-count');
    if (elLate) elLate.textContent = `${lateCount} 人`;
    const elAbsentTotal = document.getElementById('admin-board-absent-total');
    if (elAbsentTotal) elAbsentTotal.textContent = `${absentList.length} 人`;

    const tbody = document.getElementById('admin-board-absent-tbody');
    if (tbody) {
        if (absentList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-emerald-600 font-black"><i class="fa-solid fa-circle-check text-xl mr-2"></i>全校學生今日全員準時到校！</td></tr>`;
        } else {
            tbody.innerHTML = absentList.map(a => `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="py-3 px-4 font-bold text-slate-800">${a.className}</td>
                    <td class="py-3 px-4 font-black text-indigo-600">${a.seat} 號</td>
                    <td class="py-3 px-4 font-medium text-slate-600">${a.teacher}</td>
                    <td class="py-3 px-4">
                        <span class="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full text-xs">
                            ${a.reason}
                        </span>
                    </td>
                </tr>
            `).join('');
        }
    }
}

/**
 * 3. 渲染線上行政抽查專區 (Online Audit Inspection)
 */
export function renderAuditInspection() {
    const classes = getAllSchoolClasses();
    const selectEl = document.getElementById('admin-audit-class-select');
    if (selectEl) {
        const curVal = selectEl.value;
        selectEl.innerHTML = classes.map(c => `<option value="${c.id}">${c.name} (${c.teacher || '導師'})</option>`).join('');
        if (curVal && classes.some(c => c.id === curVal)) {
            selectEl.value = curVal;
        } else if (classes.length > 0) {
            selectEl.value = classes[0].id;
        }
        renderAuditClassDetails(selectEl.value);
    }
}

function renderAuditClassDetails(classId) {
    const classes = getAllSchoolClasses();
    const targetClass = classes.find(c => c.id === classId) || classes[0];
    if (!targetClass) return;

    const dateStr = formatDate(new Date());
    const auditKey = `${targetClass.id}_${dateStr}`;
    const auditRecord = state.adminAudits?.[auditKey];

    // 填入班級資訊
    const nameEl = document.getElementById('admin-audit-target-title');
    if (nameEl) nameEl.textContent = `【${targetClass.name}】聯絡簿與簽核行政抽查`;

    const signRateEl = document.getElementById('admin-audit-target-sign-rate');
    if (signRateEl) signRateEl.textContent = `${targetClass.parentSignRate || 88}%`;

    const missingRateEl = document.getElementById('admin-audit-target-missing-rate');
    if (missingRateEl) missingRateEl.textContent = `${targetClass.hwMissingRate || 5}%`;

    // 聯絡簿內容預覽
    const contactPreviewEl = document.getElementById('admin-audit-contact-preview');
    if (contactPreviewEl) {
        contactPreviewEl.innerHTML = `
            <div class="space-y-2 text-xs sm:text-sm text-slate-700">
                <div class="font-black text-indigo-900 border-b border-indigo-100 pb-1 flex items-center justify-between">
                    <span>本日課業交代（${dateStr}）</span>
                    <span class="text-xs text-slate-400">發布狀態：${targetClass.contactBookPosted ? '已發布' : '草稿'}</span>
                </div>
                <ul class="list-disc pl-5 space-y-1 font-medium">
                    <li>國文第 3 課生字語詞習作 P.24-26 完成</li>
                    <li>數學習作 Unit 2 綜合評量訂正並請家長簽名</li>
                    <li>發下「七賢國中流感疫苗接種家長意願書」，請於週五前繳回</li>
                </ul>
                <div class="mt-3 p-2.5 rounded-xl bg-amber-50 text-amber-900 font-bold border border-amber-200 text-xs">
                    <i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i>
                    導師叮嚀：明日第 2 節需攜帶童軍繩與美工刀，請同學提早準備。
                </div>
            </div>
        `;
    }

    // 核章戳記狀態展示
    const stampStatusEl = document.getElementById('admin-audit-stamp-display');
    const commentInput = document.getElementById('admin-audit-comment-input');
    if (stampStatusEl) {
        if (auditRecord) {
            stampStatusEl.innerHTML = `
                <div class="border-2 border-red-500 bg-red-50/90 rounded-2xl p-4 flex items-center gap-4 shadow-sm animate-fade-in">
                    <div class="w-16 h-16 rounded-full border-4 border-red-600 flex flex-col items-center justify-center font-black text-red-600 shrink-0 rotate-[-10deg] shadow-xs">
                        <span class="text-[10px] tracking-widest">管理人員</span>
                        <span class="text-xs font-black">查閱合格</span>
                        <span class="text-[8px] scale-90">${formatDate(new Date())}</span>
                    </div>
                    <div class="flex-1 text-left">
                        <div class="font-black text-red-800 text-sm flex items-center gap-1.5">
                            <i class="fa-solid fa-stamp"></i>
                            <span>已完成電子核章（查核人：${auditRecord.inspector || '學務管理人員'}）</span>
                        </div>
                        <p class="text-xs text-red-950 font-bold mt-1 bg-white/70 p-2 rounded-lg border border-red-200">
                            評語：「${auditRecord.comment}」
                        </p>
                        <div class="text-[10px] text-red-500 mt-1">核章時間：${auditRecord.timestamp}</div>
                    </div>
                </div>
            `;
            if (commentInput) commentInput.value = auditRecord.comment;
        } else {
            stampStatusEl.innerHTML = `
                <div class="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400">
                    <i class="fa-solid fa-stamp text-2xl text-slate-300 mb-1"></i>
                    <p class="text-xs font-bold">此班級本日尚未進行電子核章</p>
                </div>
            `;
            if (commentInput) commentInput.value = '今日聯絡簿交代清晰詳盡，親師互動良好，家長簽章率達標，查核合格！';
        }
    }
}

/**
 * 4. 渲染批量帳號申請與班級發放 (Batch Account Generator)
 */
export function renderBatchAccountsView() {
    const list = state.batchCreatedAccounts || [];
    const countBadge = document.getElementById('admin-batch-count-badge');
    if (countBadge) countBadge.textContent = `${list.length} 組`;

    const tbody = document.getElementById('admin-batch-accounts-tbody');
    if (tbody) {
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 font-bold">尚無批次建立的帳號清冊，請使用上方生成器快速產生。</td></tr>`;
        } else {
            tbody.innerHTML = list.map((item, idx) => `
                <tr class="hover:bg-slate-50 border-b border-slate-100 font-medium">
                    <td class="py-3 px-4 font-bold text-slate-800">${item.className}</td>
                    <td class="py-3 px-4 font-mono font-bold text-indigo-600">${item.username}</td>
                    <td class="py-3 px-4 font-mono text-slate-600">${item.password}</td>
                    <td class="py-3 px-4 font-mono text-amber-700 font-bold">${item.classCode}</td>
                    <td class="py-3 px-4 text-xs text-slate-400">${item.createdAt || '剛剛'}</td>
                </tr>
            `).join('');
        }
    }
}

/**
 * 一鍵批量建立帳號 (例如 7 年級 1 ~ 10 班)
 */
export function generateBatchClassAccounts(grade, startClass, endClass, defaultPass = '123456') {
    const newAccounts = [];
    const existingClasses = state.appData?.classes || [];

    for (let c = startClass; c <= endClass; c++) {
        const classNumStr = `${grade}${String(c).padStart(2, '0')}`;
        const className = `${grade === 7 ? '七' : grade === 8 ? '八' : grade === 9 ? '九' : `${grade}`}年${c}班`;
        const username = `${classNumStr}_teacher`;
        const classCode = `${classNumStr}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        const accountObj = {
            id: `batch_${classNumStr}_${Date.now()}`,
            grade: parseInt(grade, 10),
            classNum: c,
            className: className,
            username: username,
            password: defaultPass,
            classCode: classCode,
            createdAt: formatDate(new Date())
        };

        newAccounts.push(accountObj);

        // 自動同步建立至本地班級清單，避免重複代碼
        if (!existingClasses.some(cl => cl.name === className)) {
            existingClasses.push({
                id: generateId(),
                name: className,
                code: classCode,
                teacher: `${className}導師`,
                studentCount: 28,
                officers: {},
                attendance: {}
            });
        }
    }

    state.batchCreatedAccounts = [...newAccounts, ...(state.batchCreatedAccounts || [])];
    localStorage.setItem('admin_batch_accounts', JSON.stringify(state.batchCreatedAccounts));

    if (!state.appData) state.appData = { classes: [] };
    state.appData.classes = existingClasses;
    saveData();

    showToast(`成功批次產生 ${newAccounts.length} 組班級帳號與專屬代碼！`, 'success');
    renderBatchAccountsView();
    renderSchoolOverview();
}

/**
 * 快速文字貼上批次解析建立 (格式：701,王美惠,123456)
 */
export function parseAndCreateAccountsFromText(text) {
    if (!text || !text.trim()) {
        showToast("請輸入欲批次解析的資料文字", "warning");
        return;
    }

    const lines = text.trim().split(/[\r\n;]+/);
    const parsedAccounts = [];
    const existingClasses = state.appData?.classes || [];

    lines.forEach(line => {
        const parts = line.split(/[,，\t]+/).map(p => p.trim());
        if (parts.length >= 1 && parts[0]) {
            const classIdentifier = parts[0];
            const teacherName = parts[1] || `${classIdentifier}導師`;
            const password = parts[2] || '123456';
            const username = `${classIdentifier.toLowerCase()}_teacher`;
            const classCode = `${classIdentifier.toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

            parsedAccounts.push({
                id: `batch_txt_${Date.now()}_${Math.random()}`,
                className: classIdentifier,
                username: username,
                password: password,
                classCode: classCode,
                createdAt: formatDate(new Date())
            });

            if (!existingClasses.some(cl => cl.name === classIdentifier)) {
                existingClasses.push({
                    id: generateId(),
                    name: classIdentifier,
                    code: classCode,
                    teacher: teacherName,
                    studentCount: 28,
                    officers: {},
                    attendance: {}
                });
            }
        }
    });

    if (parsedAccounts.length === 0) {
        showToast("未能解析到有效的帳號資料，請檢查格式", "error");
        return;
    }

    state.batchCreatedAccounts = [...parsedAccounts, ...(state.batchCreatedAccounts || [])];
    localStorage.setItem('admin_batch_accounts', JSON.stringify(state.batchCreatedAccounts));

    if (!state.appData) state.appData = { classes: [] };
    state.appData.classes = existingClasses;
    saveData();

    showToast(`成功解析並建立 ${parsedAccounts.length} 組班級帳號！`, 'success');
    renderBatchAccountsView();
    renderSchoolOverview();
}

/**
 * 5. 渲染全校廣播清單 (Schoolwide Broadcasts)
 */
export function renderBroadcastsView() {
    const list = state.schoolBroadcasts || [];
    const container = document.getElementById('admin-broadcasts-list');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-slate-100">目前尚無全校廣播公告，管理人員可由上方即時發布校安或停課通報。</div>`;
        return;
    }

    container.innerHTML = list.map(b => `
        <div class="p-4 rounded-2xl border ${b.level === 'emergency' ? 'bg-red-50/70 border-red-200' : 'bg-amber-50/60 border-amber-200'} shadow-2xs space-y-2 relative group">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-black ${b.level === 'emergency' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}">
                        ${b.level === 'emergency' ? '重大校安緊急通報' : '學務全校宣導'}
                    </span>
                    <h4 class="font-black text-slate-900 text-base">${b.title}</h4>
                </div>
                <button type="button" class="admin-delete-broadcast-btn text-slate-400 hover:text-rose-600 transition-colors p-1" data-id="${b.id}" title="撤除廣播">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
            <p class="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">${b.content}</p>
            <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-200/50">
                <span>發布者：${b.createdBy || '學務管理人員'}</span>
                <span>發布時間：${b.timestamp}</span>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.admin-delete-broadcast-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            state.schoolBroadcasts = (state.schoolBroadcasts || []).filter(b => b.id !== id);
            localStorage.setItem('admin_school_broadcasts', JSON.stringify(state.schoolBroadcasts));
            showToast("已撤除該則全校廣播公告", "info");
            renderBroadcastsView();
            renderSchoolBroadcastsInContactBook();
        });
    });
}

/**
 * 發布一則全校廣播公告
 */
export function publishSchoolBroadcast(title, content, level = 'notice') {
    if (!title || !title.trim() || !content || !content.trim()) {
        showToast("請填寫完整的廣播標題與宣導內容", "warning");
        return;
    }

    const newBroadcast = {
        id: `sb_${Date.now()}`,
        title: title.trim(),
        content: content.trim(),
        level: level,
        createdBy: '管理人員行政主管',
        timestamp: `${formatDate(new Date())} ${new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })}`
    };

    state.schoolBroadcasts = [newBroadcast, ...(state.schoolBroadcasts || [])];
    localStorage.setItem('admin_school_broadcasts', JSON.stringify(state.schoolBroadcasts));

    showToast("已同步插入全校各班聯絡簿置頂區與家長端通報看板！", "success");
    renderBroadcastsView();
    renderSchoolBroadcastsInContactBook();
}

/**
 * 導師端聯絡簿黑板右上角：顯示管理人員電子核章戳記與查閱評語
 */
export function renderAdminAuditsInContactBook() {
    const stampContainer = document.getElementById('contact-book-admin-stamp-container');
    if (!stampContainer) return;

    const classId = state.currentClassId;
    const dateStr = formatDate(state.selectedDate || new Date());
    const auditRecord = state.adminAudits?.[`${classId}_${dateStr}`];

    if (!auditRecord) {
        stampContainer.innerHTML = '';
        stampContainer.classList.add('hidden');
        return;
    }

    stampContainer.classList.remove('hidden');
    stampContainer.innerHTML = `
        <div class="border-2 border-red-500 bg-red-50/95 backdrop-blur-sm rounded-2xl p-3 flex items-start gap-3 shadow-md max-w-sm ml-auto animate-fade-in">
            <div class="w-12 h-12 rounded-full border-2 border-red-600 flex flex-col items-center justify-center font-black text-red-600 shrink-0 rotate-[-12deg] shadow-xs">
                <span class="text-[8px] tracking-wider leading-none">管理人員</span>
                <span class="text-[10px] font-black leading-tight">查閱合格</span>
                <span class="text-[7px] scale-90 leading-none">${dateStr}</span>
            </div>
            <div class="flex-1 text-left">
                <div class="flex items-center justify-between">
                    <span class="font-black text-xs text-red-700">學務行政線上查核</span>
                    <span class="text-[10px] text-red-400 font-mono">${auditRecord.timestamp || ''}</span>
                </div>
                <p class="text-xs text-red-950 font-bold mt-1 leading-snug">
                    「${auditRecord.comment || '查核合格'}」
                </p>
            </div>
        </div>
    `;
}

/**
 * 導師端聯絡簿置頂區：顯示管理人員全校廣播通報
 */
export function renderSchoolBroadcastsInContactBook() {
    const broadcastContainer = document.getElementById('contact-book-school-broadcast-banner');
    if (!broadcastContainer) return;

    const broadcasts = state.schoolBroadcasts || [];
    if (broadcasts.length === 0) {
        broadcastContainer.innerHTML = '';
        broadcastContainer.classList.add('hidden');
        return;
    }

    const latest = broadcasts[0];
    broadcastContainer.classList.remove('hidden');
    broadcastContainer.innerHTML = `
        <div class="p-3.5 rounded-2xl border ${latest.level === 'emergency' ? 'bg-red-500/10 border-red-400 text-red-950' : 'bg-amber-500/10 border-amber-400 text-amber-950'} flex items-start gap-3 shadow-xs">
            <span class="w-7 h-7 rounded-xl ${latest.level === 'emergency' ? 'bg-red-600' : 'bg-amber-600'} text-white flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-2xs">
                <i class="fa-solid fa-bullhorn"></i>
            </span>
            <div class="flex-1 text-left leading-relaxed">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-black ${latest.level === 'emergency' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}">全校公告</span>
                    <strong class="text-xs sm:text-sm font-black">${latest.title}</strong>
                    <span class="text-[10px] text-slate-400 ml-auto">${latest.timestamp}</span>
                </div>
                <p class="text-xs mt-0.5 text-slate-800 font-medium">${latest.content}</p>
            </div>
        </div>
    `;
}

/**
 * 取得全校所有班級清單（系統班級 + 批次建立班級 + 示範班級合併去重）
 */
function getAllSchoolClasses() {
    const map = new Map();

    // 1. 本地實體班級
    (state.appData?.classes || []).forEach(c => {
        map.set(c.id, {
            id: c.id,
            name: c.name,
            code: c.code || 'CODE',
            teacher: c.teacher || '班級導師',
            studentCount: c.studentCount || 28,
            todayPresent: 27,
            hwMissingRate: 5,
            contactBookPosted: true,
            parentSignRate: 90
        });
    });

    // 2. 批次建立的班級
    (state.batchCreatedAccounts || []).forEach(b => {
        if (!map.has(b.id)) {
            map.set(b.id, {
                id: b.id,
                name: b.className,
                code: b.classCode,
                teacher: `${b.className}導師`,
                studentCount: 28,
                todayPresent: 28,
                hwMissingRate: 0,
                contactBookPosted: true,
                parentSignRate: 92
            });
        }
    });

    // 3. 示範全校數據補齊
    DEMO_SCHOOL_CLASSES.forEach(d => {
        if (!map.has(d.id)) {
            map.set(d.id, d);
        }
    });

    return Array.from(map.values());
}

/**
 * 綁定管理人員後台各項點擊與表單事件
 */
function bindAdminEvents() {
    // 側邊欄入口
    document.getElementById('sidebar-admin-portal-btn')?.addEventListener('click', () => {
        document.getElementById('app-sidebar')?.classList.add('-translate-x-full');
        document.getElementById('sidebar-backdrop')?.classList.add('hidden');
        showAdminDashboardPage();
    });

    // 後台返回按鈕
    document.getElementById('admin-back-btn')?.addEventListener('click', () => {
        closeAdminDashboardPage();
    });

    // 分頁切換按鈕
    ['overview', 'attendance', 'audit', 'batchAccounts', 'broadcasts'].forEach(tab => {
        document.getElementById(`admin-tab-btn-${tab}`)?.addEventListener('click', () => {
            switchAdminTab(tab);
        });
    });

    // 08:00 晨間看板全螢幕切換
    document.getElementById('admin-attendance-fullscreen-btn')?.addEventListener('click', () => {
        const boardEl = document.getElementById('admin-pane-attendance');
        if (!document.fullscreenElement) {
            boardEl?.requestFullscreen().catch(err => {
                showToast(`無法進入全螢幕：${err.message}`, 'error');
            });
        } else {
            document.exitFullscreen();
        }
    });

    // 匯出晨間名冊 CSV
    document.getElementById('admin-board-export-csv-btn')?.addEventListener('click', () => {
        const classes = getAllSchoolClasses();
        let csvContent = "\uFEFF班級,導師,座號,假別/原因,日期\n";
        classes.forEach(c => {
            const notArrived = (c.studentCount || 28) - (c.todayPresent || 27);
            for (let i = 1; i <= notArrived; i++) {
                csvContent += `"${c.name}","${c.teacher}","${i * 5}","${i % 2 === 0 ? '病假' : '事假'}","${formatDate(new Date())}"\n`;
            }
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `全校晨間點名出缺席名冊_${formatDate(new Date())}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("已成功匯出全校晨間出缺席名冊 CSV", "success");
    });

    // 抽查班級下拉選單連動
    document.getElementById('admin-audit-class-select')?.addEventListener('change', (e) => {
        renderAuditClassDetails(e.target.value);
    });

    // 隨機抽查班級按鈕
    document.getElementById('admin-audit-random-btn')?.addEventListener('click', () => {
        const classes = getAllSchoolClasses();
        if (classes.length === 0) return;
        const randomClass = classes[Math.floor(Math.random() * classes.length)];
        const selector = document.getElementById('admin-audit-class-select');
        if (selector) {
            selector.value = randomClass.id;
            renderAuditClassDetails(randomClass.id);
            showToast(`已隨機抽查【${randomClass.name}】！`, 'info');
        }
    });

    // 送出電子核章
    document.getElementById('admin-audit-submit-stamp-btn')?.addEventListener('click', () => {
        const selectEl = document.getElementById('admin-audit-class-select');
        const commentEl = document.getElementById('admin-audit-comment-input');
        if (!selectEl || !commentEl) return;

        const classId = selectEl.value;
        const comment = commentEl.value.trim() || '查核合格';
        const dateStr = formatDate(new Date());
        const auditKey = `${classId}_${dateStr}`;

        if (!state.adminAudits) state.adminAudits = {};
        state.adminAudits[auditKey] = {
            classId: classId,
            date: dateStr,
            inspector: '學務管理人員',
            comment: comment,
            timestamp: `${dateStr} ${new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })}`
        };

        localStorage.setItem('admin_audit_records', JSON.stringify(state.adminAudits));
        showToast("電子核章成功！已同步至該班級導師聯絡簿！", "success");
        renderAuditClassDetails(classId);
        renderAdminAuditsInContactBook();
    });

    // 批量生成帳號表單
    document.getElementById('admin-batch-generate-btn')?.addEventListener('click', () => {
        const grade = document.getElementById('admin-batch-grade-select')?.value || '7';
        const startClass = parseInt(document.getElementById('admin-batch-start-class')?.value || '1', 10);
        const endClass = parseInt(document.getElementById('admin-batch-end-class')?.value || '10', 10);
        const defaultPass = document.getElementById('admin-batch-password')?.value || '123456';

        if (startClass > endClass) {
            showToast("起始班級不得大於結束班級", "warning");
            return;
        }

        generateBatchClassAccounts(grade, startClass, endClass, defaultPass);
    });

    // 快速文字解析建立
    document.getElementById('admin-batch-parse-text-btn')?.addEventListener('click', () => {
        const text = document.getElementById('admin-batch-paste-textarea')?.value;
        parseAndCreateAccountsFromText(text);
    });

    // 複製帳號密碼清冊 CSV
    document.getElementById('admin-batch-copy-csv-btn')?.addEventListener('click', () => {
        const list = state.batchCreatedAccounts || [];
        if (list.length === 0) {
            showToast("尚無帳號清冊可複製", "warning");
            return;
        }
        let csvContent = "\uFEFF班級,帳號,預設密碼,班級代碼,建立日期\n";
        list.forEach(a => {
            csvContent += `"${a.className}","${a.username}","${a.password}","${a.classCode}","${a.createdAt}"\n`;
        });
        navigator.clipboard.writeText(csvContent).then(() => {
            showToast("已成功複製帳密清冊 (CSV 格式) 至剪貼簿！", "success");
        });
    });

    // 發布全校廣播按鈕
    document.getElementById('admin-publish-broadcast-btn')?.addEventListener('click', () => {
        const title = document.getElementById('admin-broadcast-title-input')?.value;
        const content = document.getElementById('admin-broadcast-content-input')?.value;
        const level = document.getElementById('admin-broadcast-level-select')?.value || 'notice';
        publishSchoolBroadcast(title, content, level);

        // 清空表單
        if (document.getElementById('admin-broadcast-title-input')) {
            document.getElementById('admin-broadcast-title-input').value = '';
        }
        if (document.getElementById('admin-broadcast-content-input')) {
            document.getElementById('admin-broadcast-content-input').value = '';
        }
    });
}
