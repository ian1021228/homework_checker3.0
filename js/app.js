/**
 * 班級經營系統 3.0 - 核心主程式入口
 */

import { state } from './state.js';

import {
    DEFAULT_TYPES,
    STATUS_COLORS,
    globalAppId
} from './constants.js';

import {
    generateId,
    formatDate,
    safeClone,
    safeStringify,
    generateRandomAccessCode,
    sanitizeAppData,
    fixDates,
    showToast,
    showAlertModal,
    showConfirmModal,
    showNamePromptModal,
    safeCopyToClipboard,
    openModal,
    closeModal
} from './utils.js';

import {
    fbAuth,
    fbDb,
    isGoogleAdmin
} from './firebase.js';

import {
    saveData,
    getFileHandle,
    syncFromFileHandle
} from './storage.js';

import {
    getHomeworkType,
    isStudentCompleted,
    updateTypeSelects,
    renderClassSelector,
    renderClassList,
    renderHomeworkList,
    renderStudentGrid,
    renderStudentDetailsPage,
    renderHomeworkTypesPage,
    renderContactBookItems,
    renderCalendar,
    updateDataManagementUI,
    updatePortalUI,
    reRenderCurrentPage
} from './render.js';

import {
    applyCheckMode,
    pushPageState,
    showPortalPage,
    showMainPage,
    showDetailPage,
    showStudentDetailsPage,
    showContactBookPage,
    showHomeworkTypesPage,
    showOverviewPage,
    showOfficersPage,
    showAttendancePage,
    showAffairsPage,
    showExamScoresPage,
    openPortalAuthModal,
    closePortalAuthModal,
    proceedIntoSystem,
    promptSystemUsageAndNavigate,
    fullRender
} from './navigation.js';

import { setupSidebar } from './sidebar.js';
import { toggleOverviewFullscreen, copyOverviewDailyReport, renderOverviewPage } from './overview.js';
import { saveOfficersAndDutySettings, setCustomDutyForDate, renderOfficersPage, addNewOfficer, resetDefaultOfficers } from './officers.js';
import { markAllPresent, copyAttendanceLineReport, exportAttendanceCsv, renderAttendancePage, openAttendanceDatePicker, closeAttendanceDatePicker, changeAttendanceCalendarMonth, getActiveAttendanceDate } from './attendance.js';
import { initTimeWheel } from './timeWheel.js';
import { openAttendanceStatsModal, initAttendanceStatsEvents } from './attendanceStats.js';
import { createNewAffair, renderAffairsPage } from './affairs.js';
import { initAdminDashboard, refreshUserRole } from './adminDashboard.js';

import { setupButtonEvents } from './events.js';
import { ICONS, getSvgIcon } from './icons.js';
import { startRealtimeCloudSync, stopRealtimeCloudSync } from './firebase.js';
import {
    setupQrLoginEvents,
    checkUrlForQrLogin,
    startDeviceQrLoginSession,
    stopDeviceQrLoginSession,
    openPhoneQrScannerModal,
    closePhoneQrScannerModal
} from './qrLogin.js';

// 將核心全域輔助函式掛載至 window，確保相容性與無縫呼叫
window.state = state;
window.showToast = showToast;
window.showAlertModal = showAlertModal;
window.showConfirmModal = showConfirmModal;
window.showNamePromptModal = showNamePromptModal;
window.openModal = openModal;
window.closeModal = closeModal;
window.isGoogleAdmin = isGoogleAdmin;
window.promptSystemUsageAndNavigate = promptSystemUsageAndNavigate;
window.openPortalAuthModal = openPortalAuthModal;
window.closePortalAuthModal = closePortalAuthModal;
window.proceedIntoSystem = proceedIntoSystem;
window.showExamScoresPage = showExamScoresPage;
window.getSvgIcon = getSvgIcon;
window.fullRender = fullRender;
window.reRenderCurrentPage = () => reRenderCurrentPage(showMainPage, showDetailPage);
window.startRealtimeCloudSync = startRealtimeCloudSync;
window.stopRealtimeCloudSync = stopRealtimeCloudSync;
window.startDeviceQrLoginSession = startDeviceQrLoginSession;
window.stopDeviceQrLoginSession = stopDeviceQrLoginSession;
window.openPhoneQrScannerModal = openPhoneQrScannerModal;
window.closePhoneQrScannerModal = closePhoneQrScannerModal;

// 滾動提示指示器
let portalScrollDismissed = false;
function initPortalScrollIndicator() {
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

// 快速替換 DOM 中的 Font Awesome 圖標為 SVG 圖標，解決多條橫線 (Missing Glyph) 問題
function replaceFaIconsWithSvg() {
    const faMap = {
        'fa-arrow-right': 'arrow-right',
        'fa-arrow-down': 'arrow-down',
        'fa-chevron-right': 'chevron-right',
        'fa-arrow-right-from-bracket': 'arrow-right-from-bracket',
        'fa-circle-check': 'circle-check',
        'fa-circle-info': 'circle-info',
        'fa-triangle-exclamation': 'triangle-exclamation',
        'fa-wand-magic-sparkles': 'wand-magic-sparkles',
        'fa-shield-halved': 'shield-halved',
        'fa-barcode': 'barcode',
        'fa-comment-dots': 'comment-dots',
        'fa-envelope': 'envelope',
        'fa-envelope-circle-check': 'envelope-circle-check',
        'fa-copy': 'copy',
        'fa-laptop-code': 'laptop-code',
        'fa-magnifying-glass-plus': 'magnifying-glass-plus',
        'fa-heart': 'heart',
        'fa-house': 'house',
        'fa-key': 'key',
        'fa-eye': 'eye',
        'fa-eye-slash': 'eye-slash',
        'fa-spinner': 'spinner'
    };

    document.querySelectorAll('i[class*="fa-"]').forEach(el => {
        for (const [faClass, svgName] of Object.entries(faMap)) {
            if (el.classList.contains(faClass)) {
                const colorClasses = Array.from(el.classList).filter(c => c.startsWith('text-') || c.startsWith('hover:text-')).join(' ');
                const span = document.createElement('span');
                span.className = `inline-flex items-center justify-center ${colorClasses}`;
                span.innerHTML = getSvgIcon(svgName);
                el.replaceWith(span);
                break;
            }
        }
    });
}

async function init() {
    // 0. 若重載前停留在管理員檢視模式備份中，主動還原管理員原本的真實本地資料
    if (sessionStorage.getItem('admin_backup_appData')) {
        try {
            const adminData = JSON.parse(sessionStorage.getItem('admin_backup_appData'));
            localStorage.setItem('homeworkAppData', safeStringify(adminData));
            const adminClassId = sessionStorage.getItem('admin_backup_classId');
            if (adminClassId) localStorage.setItem('currentClassId', adminClassId);
            sessionStorage.removeItem('admin_backup_appData');
            sessionStorage.removeItem('admin_backup_classId');
        } catch(e) {}
    }

    // 1. 初始化資料與用戶階段
    try {
        const savedSession = localStorage.getItem('app_user_session');
        if (savedSession) {
            state.currentUser = JSON.parse(savedSession);
        }
    } catch(e) {}

    if (sessionStorage.getItem('app_dev_mode') === 'true') {
        state.isDevMode = true;
        if (state.currentUser) state.currentUser.isDevMode = true;
    }

    const localData = localStorage.getItem('homeworkAppData');
    if (localData) {
        try {
            state.appData = sanitizeAppData(JSON.parse(localData));
            fixDates(state.appData);
        } catch (err) {
            console.warn("Failed to parse local storage, initializing default:", err);
            state.appData = sanitizeAppData(null);
        }
    } else {
        state.appData = sanitizeAppData(null);
    }
    
    // 2. 替換靜態圖標為純向量 SVG，杜絕橫線符號
    try {
        replaceFaIconsWithSvg();
    } catch (e) {
        console.warn("Replace icons error:", e);
    }

    // 3. 綁定所有互動事件
    setupButtonEvents(); 
    setupQrLoginEvents();
    setupNewFeaturesEvents();
    checkUrlForQrLogin();
    updateDataManagementUI();
    document.getElementById('loading-page')?.classList.add('hidden');
    window.__app_initialized = true;

    // 4. 恢復偏好設定
    const savedMode = localStorage.getItem('checkMode') || 'manual';
    applyCheckMode(savedMode);
    
    // 5. 檢查硬碟存取
    if (window.showSaveFilePicker) {
        try { 
            const handle = await getFileHandle(); 
            if (handle) {
                state.fileHandle = handle;
                if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') { 
                    document.getElementById('sync-banner')?.classList.remove('hidden'); 
                    document.body.classList.add('has-banner'); 
                } else {
                    await syncFromFileHandle(); 
                }
            }
        } catch (e) {}
    }

    initPortalScrollIndicator();
    if (fbAuth?.currentUser && fbDb && sessionStorage.getItem('app_is_guest_mode') !== 'true' && !state.currentUser?.isDevMode) {
        startRealtimeCloudSync();
    }

    // 6. 頁面導航初始化
    const hasPassedPortalInSession = sessionStorage.getItem('has_passed_portal_in_session') === 'true';
    if (!hasPassedPortalInSession) {
        showPortalPage(true);
        return;
    }

    const explicitAppSubPages = ['#main', '#detail', '#student-details', '#contact-book', '#homework-types', '#overview', '#officers', '#attendance', '#affairs', '#scores'];
    if (!window.location.hash || window.location.hash === '#portal' || !explicitAppSubPages.includes(window.location.hash)) {
        showPortalPage(true);
        return;
    }
    
    if (window.location.hash === '#overview') {
        showOverviewPage(true);
        return;
    }
    if (window.location.hash === '#officers') {
        showOfficersPage(true);
        return;
    }
    if (window.location.hash === '#attendance') {
        showAttendancePage(true);
        return;
    }
    if (window.location.hash === '#affairs') {
        showAffairsPage(true);
        return;
    }
    if (window.location.hash === '#contact-book') {
        showContactBookPage(true);
        return;
    }
    if (window.location.hash === '#scores') {
        showExamScoresPage(true);
        return;
    }
    if (window.location.hash === '#main') {
        applyCheckMode(localStorage.getItem('checkMode') || 'manual');
        pushPageState({ page: 'main' }, '#main'); 
        showMainPage(true);
        if (state.appData.classes.length === 0) openModal(document.getElementById('manage-classes-modal'));
        return;
    }
}

function setupNewFeaturesEvents() {
    setupSidebar();

    // 總覽頁面事件
    const fsBtn = document.getElementById('overview-fullscreen-btn');
    if (fsBtn) fsBtn.addEventListener('click', toggleOverviewFullscreen);

    const refBtn = document.getElementById('overview-refresh-btn');
    if (refBtn) refBtn.addEventListener('click', renderOverviewPage);

    const copyLineBtn = document.getElementById('overview-copy-line-btn');
    if (copyLineBtn) copyLineBtn.addEventListener('click', copyOverviewDailyReport);

    const goAttBtn = document.getElementById('overview-go-attendance-btn');
    if (goAttBtn) goAttBtn.addEventListener('click', () => showAttendancePage());

    const goContactBtn = document.getElementById('overview-go-contact-btn');
    if (goContactBtn) goContactBtn.addEventListener('click', () => showContactBookPage());

    const goDutyBtn = document.getElementById('overview-go-duty-btn');
    if (goDutyBtn) goDutyBtn.addEventListener('click', () => showOfficersPage());

    // 總覽注意事項編輯
    const editNoticeBtn = document.getElementById('overview-edit-notice-btn');
    const noticeModal = document.getElementById('notice-edit-modal');
    const noticeTextarea = document.getElementById('overview-notice-textarea');
    const saveNoticeBtn = document.getElementById('save-overview-notice-btn');

    if (editNoticeBtn && noticeModal && noticeTextarea) {
        editNoticeBtn.addEventListener('click', () => {
            const curClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
            noticeTextarea.value = curClass?.bulletinNotice || '';
            openModal(noticeModal);
        });
    }

    if (saveNoticeBtn && noticeModal && noticeTextarea) {
        saveNoticeBtn.addEventListener('click', () => {
            const curClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
            if (curClass) {
                curClass.bulletinNotice = noticeTextarea.value.trim();
                saveData();
                renderOverviewPage();
                showToast('已成功更新班級注意事項！', 'success');
            }
            closeModal(noticeModal);
        });
    }

    // 幹部與值日生事件
    const saveOfficersBtn = document.getElementById('save-officers-btn');
    if (saveOfficersBtn) saveOfficersBtn.addEventListener('click', saveOfficersAndDutySettings);

    const addOfficerBtn = document.getElementById('btn-add-officer');
    if (addOfficerBtn) addOfficerBtn.addEventListener('click', addNewOfficer);

    const resetOfficersBtn = document.getElementById('btn-reset-default-officers');
    if (resetOfficersBtn) resetOfficersBtn.addEventListener('click', resetDefaultOfficers);

    const swapDutyBtn = document.getElementById('duty-swap-modal-btn');
    const dutyModal = document.getElementById('duty-assign-modal');
    const dutyDateInput = document.getElementById('duty-assign-date');
    const dutySeatsInput = document.getElementById('duty-assign-seats');
    const saveDutyBtn = document.getElementById('save-custom-duty-btn');

    if (swapDutyBtn && dutyModal) {
        swapDutyBtn.addEventListener('click', () => {
            const today = new Date().toISOString().slice(0, 10);
            if (dutyDateInput) dutyDateInput.value = today;
            if (dutySeatsInput) dutySeatsInput.value = '';
            openModal(dutyModal);
        });
    }

    if (saveDutyBtn && dutyModal && dutyDateInput && dutySeatsInput) {
        saveDutyBtn.addEventListener('click', () => {
            const d = dutyDateInput.value;
            const seats = dutySeatsInput.value.split(/[,，\s]+/).filter(Boolean);
            if (d && seats.length > 0) {
                setCustomDutyForDate(d, seats);
            }
            closeModal(dutyModal);
        });
    }

    // 簽到及遲到事件
    const attDateInput = document.getElementById('attendance-date-input');
    if (attDateInput) {
        attDateInput.addEventListener('change', (e) => {
            renderAttendancePage(e.target.value);
        });
    }

    // 簽到專屬月曆事件 (與聯絡簿月曆視覺一致)
    const openAttDateBtn = document.getElementById('open-attendance-date-picker-btn');
    if (openAttDateBtn) openAttDateBtn.addEventListener('click', openAttendanceDatePicker);

    const closeAttDateBtn = document.getElementById('close-att-date-picker-btn');
    if (closeAttDateBtn) closeAttDateBtn.addEventListener('click', closeAttendanceDatePicker);

    const prevAttMonthBtn = document.getElementById('att-prev-month-btn');
    if (prevAttMonthBtn) prevAttMonthBtn.addEventListener('click', () => changeAttendanceCalendarMonth(-1));

    const nextAttMonthBtn = document.getElementById('att-next-month-btn');
    if (nextAttMonthBtn) nextAttMonthBtn.addEventListener('click', () => changeAttendanceCalendarMonth(1));

    const markAllBtn = document.getElementById('attendance-mark-all-present-btn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', () => {
            const d = getActiveAttendanceDate();
            markAllPresent(d);
        });
    }

    const attStatsBtn = document.getElementById('attendance-stats-modal-btn');
    if (attStatsBtn) {
        attStatsBtn.addEventListener('click', () => {
            openAttendanceStatsModal();
        });
    }

    const copyAttLineBtn = document.getElementById('attendance-copy-line-btn');
    if (copyAttLineBtn) {
        copyAttLineBtn.addEventListener('click', () => {
            const d = getActiveAttendanceDate();
            copyAttendanceLineReport(d);
        });
    }

    const exportAttCsvBtn = document.getElementById('attendance-export-csv-btn');
    if (exportAttCsvBtn) {
        exportAttCsvBtn.addEventListener('click', () => {
            const d = getActiveAttendanceDate();
            exportAttendanceCsv(d);
        });
    }

    // 班級事務（問卷回條）事件
    const createAffairBtn = document.getElementById('create-affair-btn');
    const affairModal = document.getElementById('affair-create-modal');
    const affairForm = document.getElementById('affair-create-form');

    if (createAffairBtn && affairModal) {
        createAffairBtn.addEventListener('click', () => {
            if (affairForm) affairForm.reset();
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 7);
            const deadlineInput = document.getElementById('new-affair-deadline');
            if (deadlineInput) deadlineInput.value = tomorrow.toISOString().slice(0, 10);
            openModal(affairModal);
        });
    }

    if (affairForm && affairModal) {
        affairForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = document.getElementById('new-affair-title')?.value || '';
            const content = document.getElementById('new-affair-content')?.value || '';
            const deadline = document.getElementById('new-affair-deadline')?.value || '';
            const type = document.getElementById('new-affair-type')?.value || 'single';
            const optionsRaw = document.getElementById('new-affair-options')?.value || '';
            const requireSignature = document.getElementById('new-affair-require-sign')?.checked ?? true;

            const options = optionsRaw.split('\n').map(s => s.trim()).filter(Boolean);

            createNewAffair({
                title,
                content,
                deadline,
                type,
                options: options.length > 0 ? options : ['同意', '不同意'],
                requireSignature
            });

            closeModal(affairModal);
        });
    }

    // 初始化時間滾輪與出席統計模組
    initTimeWheel();
    initAttendanceStatsEvents();

    // 初始化管理人員 (Admin) 行政中樞與 RBAC
    initAdminDashboard();
}

// 啟動主程式
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
