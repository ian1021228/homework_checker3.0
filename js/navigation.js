import { state } from './state.js';
import { openModal, closeModal, showToast, formatDate } from './utils.js';
import { saveData, checkAndCleanupStorage } from './storage.js';
import { 
    renderClassSelector, 
    renderClassList, 
    renderHomeworkList, 
    renderStudentGrid, 
    renderStudentDetailsPage, 
    renderContactBookItems, 
    renderCalendar, 
    renderHomeworkTypesPage, 
    updateTypeSelects, 
    updatePortalUI, 
    updateGuestHomeBtnVisibility,
    isStudentCompleted 
} from './render.js';
import { checkInitialMaxSeatSetup, renderExamScoresView } from './examScores.js';
import { renderOverviewPage } from './overview.js';
import { renderOfficersPage } from './officers.js';
import { renderAttendancePage } from './attendance.js';
import { renderAffairsPage } from './affairs.js';
import { updateSidebarActiveState } from './sidebar.js';
import { renderAdminAuditsInContactBook, renderSchoolBroadcastsInContactBook } from './adminDashboard.js';

export function applyCheckMode(mode) {
    state.currentCheckMode = mode;
    localStorage.setItem('checkMode', mode);
    
    const barcodeBtn = document.getElementById('set-barcodes-btn');
    const scanContainer = document.getElementById('scan-mode-container');
    const checkModeSection = document.getElementById('check-mode-section');
    
    if (barcodeBtn) {
        if (mode === 'manual') {
            barcodeBtn.classList.add('hidden');
        } else {
            barcodeBtn.classList.remove('hidden');
        }
    }
    
    if (checkModeSection) {
        checkModeSection.classList.remove('hidden');
    }
    if (scanContainer) {
        if (mode === 'manual') {
            scanContainer.classList.add('hidden');
            scanContainer.classList.remove('flex');
        } else {
            scanContainer.classList.remove('hidden');
            scanContainer.classList.add('flex');
            if (window.setScanActionMode) {
                window.setScanActionMode(localStorage.getItem('scan_action_type') || 'assign');
            }
            setTimeout(() => {
                document.getElementById('barcode-scan-input')?.focus();
            }, 50);
        }
    }
    
    // 更新 detail-page 上的 mode-manual-btn 與 mode-scan-btn 樣式
    const modeManualBtn = document.getElementById('mode-manual-btn');
    const modeScanBtn = document.getElementById('mode-scan-btn');
    if (modeManualBtn && modeScanBtn) {
        if (mode === 'manual') {
            modeManualBtn.className = "flex-1 py-2 px-4 rounded-xl font-black text-sm bg-white shadow-sm border border-indigo-200/80 text-indigo-600 ring-2 ring-indigo-500/20 transition-all cursor-pointer";
            modeScanBtn.className = "flex-1 py-2 px-4 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border border-transparent transition-all cursor-pointer";
        } else {
            modeScanBtn.className = "flex-1 py-2 px-4 rounded-xl font-black text-sm bg-white shadow-sm border border-indigo-200/80 text-indigo-600 ring-2 ring-indigo-500/20 transition-all cursor-pointer";
            modeManualBtn.className = "flex-1 py-2 px-4 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border border-transparent transition-all cursor-pointer";
        }
    }
    
    // 更新 settings-modal 內的按鈕
    const manualBtn = document.getElementById('setting-mode-manual-btn');
    const scanBtn = document.getElementById('setting-mode-scan-btn');
    if (manualBtn && scanBtn) {
        if (mode === 'manual') {
            manualBtn.className = "flex-1 py-2 px-3 rounded-xl font-bold text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-sm transition-all ring-2 ring-indigo-500/20";
            scanBtn.className = "flex-1 py-2 px-3 rounded-xl font-bold text-sm glass-card border border-white/60 text-slate-500 hover:bg-slate-50 transition-all";
        } else {
            scanBtn.className = "flex-1 py-2 px-3 rounded-xl font-bold text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-sm transition-all ring-2 ring-indigo-500/20";
            manualBtn.className = "flex-1 py-2 px-3 rounded-xl font-bold text-sm glass-card border border-white/60 text-slate-500 hover:bg-slate-50 transition-all";
        }
    }

    // 更新頂部導覽列標籤
    const topLabel = document.getElementById('top-check-mode-label');
    if (topLabel) {
        const icon = mode === 'manual' ? '<i class="fa-duotone fa-light fa-hand-back-point-up"></i>' : '<i class="fa-sharp-duotone fa-regular fa-scanner-gun"></i>';
        topLabel.innerHTML = `<span class="text-base">${icon}</span><span>點收方式</span>`;
    }
}

export function pushPageState(stateObj, hash) { 
    try { 
        if (history.state && history.state.page === stateObj.page && history.state.id === stateObj.id) return; 
        history.pushState(stateObj, '', hash); 
    } catch (e) {} 
}

export function hideAllPages() {
    if (state.currentPage) {
        state.scrollPositions[state.currentPage] = window.scrollY || document.documentElement.scrollTop;
    }
    ['portal-page', 'main-page', 'detail-page', 'student-details-page', 'contact-book-page', 'homework-types-page', 'overview-page', 'officers-page', 'attendance-page', 'affairs-page'].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) el.classList.add('hidden'); 
    });
    const fullscreenScores = document.getElementById('exam-scores-fullscreen-view');
    if (fullscreenScores) {
        fullscreenScores.classList.add('hidden');
        fullscreenScores.classList.remove('flex');
    }
    const qrScannerModal = document.getElementById('qr-scanner-modal');
    if (qrScannerModal) {
        qrScannerModal.classList.add('hidden');
        qrScannerModal.classList.remove('flex', 'opacity-100');
    }
    updateGuestHomeBtnVisibility();
}

export function restoreScroll(targetPageId) { 
    state.currentPage = targetPageId; 
    const savedY = state.scrollPositions[targetPageId] || 0;
    window.scrollTo({ top: savedY, behavior: 'auto' }); 
    requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: 'auto' });
        setTimeout(() => {
            window.scrollTo({ top: savedY, behavior: 'auto' });
        }, 50);
    });
    updateGuestHomeBtnVisibility();
}

export function updateMobileNavVisibility(pageName) {
    const bottomNav = document.getElementById('mobile-bottom-nav');
    const fabAdd = document.getElementById('mobile-fab-add');
    if (!bottomNav) return;

    if (pageName === 'portal') {
        bottomNav.classList.add('hidden');
        if (fabAdd) fabAdd.classList.add('hidden');
        return;
    }

    // 在應用程式各主分頁內顯示手機導航欄 (由 sm:hidden 保證大螢幕不顯示)
    bottomNav.classList.remove('hidden');

    // 切換底部導航欄 active 樣式
    const tabMap = {
        'main': 'mobile-nav-homework',
        'contact-book': 'mobile-nav-contact',
        'student-details': 'mobile-nav-stats'
    };
    ['mobile-nav-homework', 'mobile-nav-contact', 'mobile-nav-stats', 'mobile-nav-more'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('text-indigo-600');
            btn.classList.add('text-slate-500');
        }
    });
    const curActiveBtn = document.getElementById(tabMap[pageName] || 'mobile-nav-homework');
    if (curActiveBtn) {
        curActiveBtn.classList.remove('text-slate-500');
        curActiveBtn.classList.add('text-indigo-600');
    }

    // 只有在 main 作業主清單頁面顯示 FAB 新增作業按鈕
    if (fabAdd) {
        if (pageName === 'main') {
            fabAdd.classList.remove('hidden');
        } else {
            fabAdd.classList.add('hidden');
        }
    }
}

export function showPortalPage(fromHistory = false) {
    hideAllPages();
    const portalPageEl = document.getElementById('portal-page');
    if (portalPageEl) portalPageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'portal' }, '#portal');
    updatePortalUI();
    restoreScroll('portal-page');
    updateGuestHomeBtnVisibility();
    updateMobileNavVisibility('portal');
    const scrollIndicator = document.getElementById('portal-scroll-indicator');
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollIndicator && scrollY <= 25) {
        scrollIndicator.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
        scrollIndicator.classList.add('pointer-events-auto');
    }
}

export function showMainPage(fromHistory = false) {
    hideAllPages(); 
    const mainPageEl = document.getElementById('main-page'); 
    if (mainPageEl) mainPageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'main' }, '#main');
    checkAndCleanupStorage(); 
    updateTypeSelects(); 
    renderClassSelector(); 
    renderHomeworkList();
    state.currentHomeworkId = null; 
    const detailPage = document.getElementById('detail-page');
    if (detailPage) detailPage.dataset.from = ''; 
    restoreScroll('main-page');
    updateMobileNavVisibility('main');
    updateSidebarActiveState('main-page');
    checkInitialMaxSeatSetup();
}

export function showDetailPage(homeworkId, fromHistory = false) {
    hideAllPages(); 
    const detailPageEl = document.getElementById('detail-page'); 
    if (detailPageEl) detailPageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'detail', id: homeworkId }, '#detail');

    // 若非從學生詳情點入，維持返回按鈕文字為「返回作業列表」
    const backBtn = document.getElementById('back-to-main-btn');
    if (backBtn && (!detailPageEl || detailPageEl.dataset.from !== 'student-details-page')) {
        backBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg> 返回作業列表`;
    }

    renderStudentGrid(homeworkId); 
    restoreScroll('detail-page');
    updateMobileNavVisibility('detail');
    updateSidebarActiveState('detail-page');
    requestAnimationFrame(() => { renderStudentGrid(homeworkId); });
}

export function showStudentDetailsPage(fromHistory = false) {
    hideAllPages(); 
    const studentPageEl = document.getElementById('student-details-page'); 
    if (studentPageEl) studentPageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'student-details' }, '#student-details');
    renderStudentDetailsPage(); 
    restoreScroll('student-details-page');
    updateMobileNavVisibility('student-details');
    updateSidebarActiveState('student-details-page');

    if (state.lastActiveStudentSeat) {
        const targetSeat = state.lastActiveStudentSeat;
        setTimeout(() => {
            const card = document.getElementById(`student-card-seat-${targetSeat}`);
            if (card) {
                const savedY = state.scrollPositions['student-details-page'] || 0;
                if (!savedY) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                card.classList.add('ring-4', 'ring-indigo-400', 'ring-offset-2', 'transition-all');
                setTimeout(() => {
                    card.classList.remove('ring-4', 'ring-indigo-400', 'ring-offset-2');
                }, 1800);
            }
        }, 80);
    }
}

export function showContactBookPage(fromHistory = false) {
    hideAllPages(); 
    const contactPageEl = document.getElementById('contact-book-page'); 
    if (contactPageEl) contactPageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'contact-book' }, '#contact-book');
    state.selectedDate = new Date(); 
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    const titleEl = document.getElementById('contact-book-title'); 
    if (titleEl) titleEl.textContent = `${currentClass?.name || ''} 聯絡簿`;
    renderContactBookItems(); 
    renderAdminAuditsInContactBook();
    renderSchoolBroadcastsInContactBook();
    restoreScroll('contact-book-page');
    updateMobileNavVisibility('contact-book');
    updateSidebarActiveState('contact-book-page');
}

export function showHomeworkTypesPage(fromHistory = false) {
    hideAllPages(); 
    const typePageEl = document.getElementById('homework-types-page'); 
    if (typePageEl) typePageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'homework-types' }, '#homework-types');
    renderHomeworkTypesPage(); 
    restoreScroll('homework-types-page');
    updateMobileNavVisibility('homework-types');
}

export function showOverviewPage(fromHistory = false) {
    hideAllPages();
    const el = document.getElementById('overview-page');
    if (el) el.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'overview' }, '#overview');
    renderOverviewPage();
    restoreScroll('overview-page');
    updateSidebarActiveState('overview-page');
}

export function showOfficersPage(fromHistory = false) {
    hideAllPages();
    const el = document.getElementById('officers-page');
    if (el) el.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'officers' }, '#officers');
    renderOfficersPage();
    restoreScroll('officers-page');
    updateSidebarActiveState('officers-page');
}

export function showAttendancePage(fromHistory = false) {
    hideAllPages();
    const el = document.getElementById('attendance-page');
    if (el) el.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'attendance' }, '#attendance');
    renderAttendancePage();
    restoreScroll('attendance-page');
    updateSidebarActiveState('attendance-page');
}

export function showAffairsPage(fromHistory = false) {
    hideAllPages();
    const el = document.getElementById('affairs-page');
    if (el) el.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'affairs' }, '#affairs');
    renderAffairsPage();
    restoreScroll('affairs-page');
    updateSidebarActiveState('affairs-page');
}

export function showExamScoresPage(fromHistory = false) {
    const curClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!curClass) {
        showToast('請先建立或選擇班級後再使用成績系統！', 'warning');
        return;
    }
    hideAllPages();
    const fullscreenView = document.getElementById('exam-scores-fullscreen-view');
    if (fullscreenView) {
        fullscreenView.classList.remove('hidden');
        fullscreenView.classList.add('flex');
    }
    if (!fromHistory) pushPageState({ page: 'scores' }, '#scores');
    state.currentPage = 'scores-page';
    renderExamScoresView();
    restoreScroll('scores-page');
    updateSidebarActiveState('scores-page');
}

export function promptSystemUsageAndNavigate() {
    if (state.currentUser) {
        sessionStorage.removeItem('app_is_guest_mode');
        proceedIntoSystem();
        return;
    }
    const modal = document.getElementById('usage-inquiry-modal');
    if (modal) {
        openModal(modal);
    } else {
        openPortalAuthModal('signup');
    }
}

export function openPortalAuthModal(defaultView = 'signin') {
    const modal = document.getElementById('portal-auth-modal');
    if (!modal) return;
    const signinView = document.getElementById('portal-view-signin');
    const signupView = document.getElementById('portal-view-signup');
    const forgotView = document.getElementById('portal-view-forgot');
    const loggedinView = document.getElementById('portal-view-loggedin');

    if (state.currentUser) {
        if (signinView) signinView.classList.add('hidden');
        if (signupView) signupView.classList.add('hidden');
        if (forgotView) forgotView.classList.add('hidden');
        if (loggedinView) loggedinView.classList.remove('hidden');
    } else {
        if (loggedinView) loggedinView.classList.add('hidden');
        if (signinView) signinView.classList.toggle('hidden', defaultView !== 'signin');
        if (signupView) signupView.classList.toggle('hidden', defaultView !== 'signup');
        if (forgotView) forgotView.classList.toggle('hidden', defaultView !== 'forgot');
    }
    openModal(modal);
}

export function closePortalAuthModal() {
    const modal = document.getElementById('portal-auth-modal');
    if (modal) closeModal(modal);
}

export function proceedIntoSystem() {
    sessionStorage.setItem('has_passed_portal_in_session', 'true');
    closePortalAuthModal();
    showMainPage();
    const portalEl = document.getElementById('portal-page');
    if (portalEl) portalEl.classList.add('hidden');
    
    // 預設手動點收，略過彈窗詢問
    if (!localStorage.getItem('checkMode')) {
        localStorage.setItem('checkMode', 'manual');
        state.currentCheckMode = 'manual';
    }
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) {
        closeModal(welcomeModal);
    }
    if (state.appData?.classes?.length === 0) {
        openModal(document.getElementById('manage-classes-modal'));
    }
    updateGuestHomeBtnVisibility();
}

export function openCopyClassModal() {
    if (!state.currentClassId) {
        showToast("請先選擇或建立班級！", "warning");
        return;
    }
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) {
        showToast("找不到目前班級！", "error");
        return;
    }

    const targetNameEl = document.getElementById('copy-target-class-name');
    if (targetNameEl) targetNameEl.textContent = currentClass.name;

    const sourceSelect = document.getElementById('copy-source-class');
    const emptyHint = document.getElementById('copy-source-empty-hint');
    const submitBtn = document.getElementById('submit-copy-class-btn');

    const otherClasses = (state.appData.classes || []).filter(c => c.id !== state.currentClassId);

    if (sourceSelect) {
        sourceSelect.innerHTML = '';
        if (otherClasses.length === 0) {
            sourceSelect.innerHTML = '<option value="" disabled selected>無其他班級可供複製</option>';
            sourceSelect.disabled = true;
            if (emptyHint) emptyHint.classList.remove('hidden');
            if (submitBtn) submitBtn.disabled = true;
        } else {
            otherClasses.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                sourceSelect.appendChild(opt);
            });
            sourceSelect.disabled = false;
            if (emptyHint) emptyHint.classList.add('hidden');
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    const hwChk = document.getElementById('copy-opt-hw'); if (hwChk) hwChk.checked = true;
    const typesChk = document.getElementById('copy-opt-types'); if (typesChk) typesChk.checked = true;
    const barcodesChk = document.getElementById('copy-opt-barcodes'); if (barcodesChk) barcodesChk.checked = true;
    const contactChk = document.getElementById('copy-opt-contact'); if (contactChk) contactChk.checked = true;
    
    const mergeRadio = document.querySelector('input[name="copy-mode"][value="merge"]');
    if (mergeRadio) mergeRadio.checked = true;

    openModal(document.getElementById('copy-class-modal'));
}

export function fullRender() { 
    if (state.currentClassId && !state.appData.classes.some(c => c.id === state.currentClassId)) { 
        state.currentClassId = state.appData.classes.length > 0 ? state.appData.classes[0].id : null; 
        if (state.currentClassId) localStorage.setItem('currentClassId', state.currentClassId); 
        else localStorage.removeItem('currentClassId'); 
    }  
    updateTypeSelects(); 
    renderClassSelector(); 
    renderClassList(); 
    renderHomeworkList(); 
}

export function showWelcomeStep1() {
    document.getElementById('welcome-step-1')?.classList.remove('hidden');
    document.getElementById('welcome-step-2')?.classList.add('hidden');
}

export function showWelcomeStep2() {
    document.getElementById('welcome-step-1')?.classList.add('hidden');
    document.getElementById('welcome-step-2')?.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('welcome-step-2-opened'));
}

if (typeof window !== 'undefined') {
    window.showAttendancePage = showAttendancePage;
    window.showMainPage = showMainPage;
    window.showOverviewPage = showOverviewPage;
    window.showOfficersPage = showOfficersPage;
    window.showAffairsPage = showAffairsPage;
    window.showExamScoresPage = showExamScoresPage;
}
