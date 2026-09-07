/**
 * 親師作業點收X聯絡簿系統 3.0 - 核心主程式入口
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
    openPortalAuthModal,
    closePortalAuthModal,
    proceedIntoSystem
, fullRender } from './navigation.js';

import { setupButtonEvents } from './events.js';
import { ICONS, getSvgIcon } from './icons.js';

// 將核心全域輔助函式掛載至 window，確保相容性與無縫呼叫
window.showToast = showToast;
window.showAlertModal = showAlertModal;
window.showConfirmModal = showConfirmModal;
window.showNamePromptModal = showNamePromptModal;
window.openModal = openModal;
window.closeModal = closeModal;
window.isGoogleAdmin = isGoogleAdmin;
window.getSvgIcon = getSvgIcon;

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
    // 1. 初始化資料與用戶階段
    try {
        const savedSession = localStorage.getItem('app_user_session');
        if (savedSession) {
            state.currentUser = JSON.parse(savedSession);
        }
    } catch(e) {}

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
    updateDataManagementUI();
    document.getElementById('loading-page')?.classList.add('hidden');

    // 4. 恢復偏好設定
    const savedMode = localStorage.getItem('checkMode') || 'manual';
    applyCheckMode(savedMode);

    if (!localStorage.getItem('hasSeenZoomPrompt')) { 
        showAlertModal('提示', '請將分頁縮放調到100%', () => { 
            document.body.style.zoom = '100%'; 
        }); 
        localStorage.setItem('hasSeenZoomPrompt', 'true'); 
    }
    
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

    // 6. 頁面導航初始化
    const hasPassedPortalInSession = sessionStorage.getItem('has_passed_portal_in_session') === 'true';
    if (!hasPassedPortalInSession) {
        showPortalPage(true);
        return;
    }

    const explicitAppSubPages = ['#main', '#detail', '#student-details', '#contact-book', '#homework-types'];
    if (!window.location.hash || window.location.hash === '#portal' || !explicitAppSubPages.includes(window.location.hash)) {
        showPortalPage(true);
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

// 啟動主程式
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
