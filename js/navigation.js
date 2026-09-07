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
        const icon = mode === 'manual' ? '👆' : '📠';
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
    ['portal-page', 'main-page', 'detail-page', 'student-details-page', 'contact-book-page', 'homework-types-page'].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) el.classList.add('hidden'); 
    });
    updateGuestHomeBtnVisibility();
}

export function restoreScroll(targetPageId) { 
    state.currentPage = targetPageId; 
    window.scrollTo({ top: state.scrollPositions[targetPageId] || 0, behavior: 'auto' }); 
}

export function showPortalPage(fromHistory = false) {
    hideAllPages();
    const portalPageEl = document.getElementById('portal-page');
    if (portalPageEl) portalPageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'portal' }, '#portal');
    updatePortalUI();
    restoreScroll('portal-page');
    updateGuestHomeBtnVisibility();
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
    setTimeout(checkAutoArchive, 800);
}

export function showDetailPage(homeworkId, fromHistory = false) {
    hideAllPages(); 
    const detailPageEl = document.getElementById('detail-page'); 
    if (detailPageEl) detailPageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'detail', id: homeworkId }, '#detail');
    renderStudentGrid(homeworkId); 
    restoreScroll('detail-page');
    requestAnimationFrame(() => { renderStudentGrid(homeworkId); });
}

export function showStudentDetailsPage(fromHistory = false) {
    hideAllPages(); 
    const studentPageEl = document.getElementById('student-details-page'); 
    if (studentPageEl) studentPageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'student-details' }, '#student-details');
    renderStudentDetailsPage(); 
    restoreScroll('student-details-page');
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
    restoreScroll('contact-book-page');
}

export function showHomeworkTypesPage(fromHistory = false) {
    hideAllPages(); 
    const typePageEl = document.getElementById('homework-types-page'); 
    if (typePageEl) typePageEl.classList.remove('hidden');
    if (!fromHistory) pushPageState({ page: 'homework-types' }, '#homework-types');
    renderHomeworkTypesPage(); 
    restoreScroll('homework-types-page');
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
    modal.classList.remove('hidden');
}

export function closePortalAuthModal() {
    const modal = document.getElementById('portal-auth-modal');
    if (modal) modal.classList.add('hidden');
}

export function proceedIntoSystem() {
    sessionStorage.setItem('has_passed_portal_in_session', 'true');
    closePortalAuthModal();
    const portalEl = document.getElementById('portal-page');
    if (portalEl) portalEl.classList.add('hidden');
    
    // 進入系統時確保能選擇點收方式 (手動點收 / 條碼掃描)
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) {
        openModal(welcomeModal);
        showWelcomeStep2();
    } else {
        showMainPage();
        if (state.appData.classes.length === 0) openModal(document.getElementById('manage-classes-modal'));
    }
    updateGuestHomeBtnVisibility();
}

export async function checkAutoArchive() {
    if (localStorage.getItem('autoArchiveNeverRemind') === 'true') return;
    if (!state.currentClassId || !state.appData || !state.appData.homeworks) return;

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const hwToArchive = state.appData.homeworks.find(hw => {
        if (hw.classId !== state.currentClassId) return false;
        if (hw.archivePrompted) return false;
        if (!hw.createdAt) return false;
        const hwDate = new Date(hw.createdAt);
        if (hwDate > threeDaysAgo) return false;
        
        const typeId = hw.typeId || 'default';
        const students = hw.students || [];
        if (students.length === 0) return false;
        
        return students.every(s => isStudentCompleted(s, typeId));
    });

    if (hwToArchive) {
        const modal = document.getElementById('auto-archive-modal');
        if (modal && modal.classList.contains('hidden')) {
            document.getElementById('auto-archive-message').textContent = `作業「${hwToArchive.name}」已經全班完成滿 3 天，是否要將其刪除（封存）以保持畫面乾淨？`;
            
            const keepBtn = document.getElementById('auto-archive-keep');
            const deleteBtn = document.getElementById('auto-archive-delete');
            const neverRemindCheck = document.getElementById('auto-archive-never-remind');
            
            neverRemindCheck.checked = false;

            const cleanup = () => { keepBtn.onclick = null; deleteBtn.onclick = null; };

            keepBtn.onclick = () => {
                if (neverRemindCheck.checked) localStorage.setItem('autoArchiveNeverRemind', 'true');
                hwToArchive.archivePrompted = true;
                saveData();
                closeModal(modal);
                cleanup();
                setTimeout(checkAutoArchive, 500);
            };

            deleteBtn.onclick = async () => {
                if (neverRemindCheck.checked) localStorage.setItem('autoArchiveNeverRemind', 'true');
                state.appData.homeworks = state.appData.homeworks.filter(h => h.id !== hwToArchive.id);
                await saveData();
                showToast(`已刪除「${hwToArchive.name}」`, "success");
                renderHomeworkList();
                closeModal(modal);
                cleanup();
                setTimeout(checkAutoArchive, 500);
            };

            openModal(modal);
        }
    }
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
