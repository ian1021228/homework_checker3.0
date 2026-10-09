/**
 * 側邊欄抽屜導覽管理模組 (Sidebar Drawer Navigation)
 * 登入後左上角三條橫線漢堡圖標展開可收合選單
 * 支援 7 大功能切換：總覽、作業點收、聯絡簿、成績、幹部及值日生、簽到及遲到、班級事務
 */

import { state } from './state.js';
import { 
    showMainPage, 
    showContactBookPage, 
    showOverviewPage, 
    showOfficersPage, 
    showAttendancePage, 
    showAffairsPage,
    showExamScoresPage
} from './navigation.js';
import { showAdminDashboardPage, refreshUserRole } from './adminDashboard.js';
import { openModal } from './utils.js';

let isSidebarOpen = false;

export function setupSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const closeBtn = document.getElementById('sidebar-close-btn');

    // 綁定所有帶有 .sidebar-toggle-btn 類別或 #sidebar-toggle-btn 的按鈕
    document.querySelectorAll('.sidebar-toggle-btn, #sidebar-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeSidebar();
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', () => {
            closeSidebar();
        });
    }

    // 綁定各導覽項目點擊
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const targetView = item.dataset.view;
            switchViewFromSidebar(targetView);
            closeSidebar();
        });
    });

    // 快捷管理與登出按鈕
    const classManageBtn = document.getElementById('sidebar-class-manage-btn');
    if (classManageBtn) {
        classManageBtn.addEventListener('click', () => {
            closeSidebar();
            const originalManageBtn = document.getElementById('manage-classes-btn');
            if (originalManageBtn) originalManageBtn.click();
        });
    }

    const logoutBtn = document.getElementById('sidebar-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            closeSidebar();
            const originalLogoutBtn = document.getElementById('logout-btn') || document.getElementById('portal-logout-btn');
            if (originalLogoutBtn) originalLogoutBtn.click();
        });
    }
}

export function toggleSidebar() {
    if (isSidebarOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

export function openSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;

    // 更新目前班級名稱
    const curClassNameEl = document.getElementById('sidebar-current-class-name');
    if (curClassNameEl) {
        const curClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
        curClassNameEl.textContent = curClass ? curClass.name : '未選擇班級';
    }

    // 檢查管理人員權限
    refreshUserRole();
    const adminSidebarBtn = document.getElementById('sidebar-admin-portal-btn');
    if (adminSidebarBtn) {
        if (state.currentUserRole === 'admin') {
            adminSidebarBtn.classList.remove('hidden');
        } else {
            adminSidebarBtn.classList.add('hidden');
        }
    }

    // 醒目標示目前分頁：優先判斷全螢幕/彈窗覆蓋層
    const scoresView = document.getElementById('exam-scores-fullscreen-view');
    const isScoresVisible = scoresView && !scoresView.classList.contains('hidden');
    const qrModal = document.getElementById('qr-scanner-modal');
    const isQrModalVisible = qrModal && !qrModal.classList.contains('hidden');

    let currentActive = state.currentPage;
    if (isScoresVisible) {
        currentActive = 'scores-page';
    } else if (isQrModalVisible) {
        currentActive = 'quickAuth';
    }

    updateSidebarActiveState(currentActive);

    sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
    isSidebarOpen = true;
}

export function closeSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;

    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
    isSidebarOpen = false;
}

export function updateSidebarActiveState(activeViewName = state.currentPage) {
    const viewMapping = {
        'overview-page': 'overview',
        'main-page': 'main',
        'detail-page': 'main',
        'contact-book-page': 'contact-book',
        'student-details-page': 'main',
        'scores-page': 'scores',
        'scores': 'scores',
        'exam-scores': 'scores',
        'officers-page': 'officers',
        'attendance-page': 'attendance',
        'affairs-page': 'affairs',
        'quickAuth': 'quickAuth',
        'manage-classes': 'manage-classes',
        'admin-dashboard': 'admin-dashboard'
    };

    const targetKey = viewMapping[activeViewName] || activeViewName;

    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        const itemKey = item.dataset.view;
        if (itemKey === targetKey) {
            item.classList.add('bg-indigo-50', 'text-indigo-600', 'font-black');
            item.classList.remove('text-slate-700');
        } else {
            item.classList.remove('bg-indigo-50', 'text-indigo-600', 'font-black');
            item.classList.add('text-slate-700');
        }
    });
}

function switchViewFromSidebar(viewKey) {
    // 若在全螢幕成績系統中，切換至其他分頁時關閉全螢幕成績系統
    const scoresView = document.getElementById('exam-scores-fullscreen-view');
    if (scoresView && viewKey !== 'scores') {
        scoresView.classList.add('hidden');
        scoresView.classList.remove('flex');
    }

    // 若在管理人員全螢幕後台中，切換至其他分頁時關閉管理人員後台
    const adminPage = document.getElementById('admin-fullscreen-dashboard');
    if (adminPage && viewKey !== 'admin-dashboard') {
        adminPage.classList.add('hidden');
        adminPage.classList.remove('flex');
    }

    // 若在快速授權彈窗中，切換至其他分頁時關閉快速授權
    const qrScannerModal = document.getElementById('qr-scanner-modal');
    if (qrScannerModal && viewKey !== 'quickAuth') {
        qrScannerModal.classList.add('hidden');
        qrScannerModal.classList.remove('flex', 'opacity-100');
    }

    switch (viewKey) {
        case 'overview':
            showOverviewPage();
            break;
        case 'main':
            showMainPage();
            break;
        case 'contact-book':
            showContactBookPage();
            break;
        case 'scores':
            showExamScoresPage();
            break;
        case 'officers':
            showOfficersPage();
            break;
        case 'attendance':
            showAttendancePage();
            break;
        case 'affairs':
            showAffairsPage();
            break;
        case 'manage-classes':
            openModal(document.getElementById('manage-classes-modal'));
            break;
        case 'admin-dashboard':
            showAdminDashboardPage();
            break;
        case 'quickAuth':
            if (window.openPhoneQrScannerModal) {
                window.openPhoneQrScannerModal();
            } else {
                document.getElementById('main-qr-scan-btn')?.click();
            }
            break;
        default:
            showMainPage();
            break;
    }
}
