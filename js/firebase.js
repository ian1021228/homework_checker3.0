import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    getRedirectResult, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    sendPasswordResetEmail, 
    sendEmailVerification,
    reload,
    applyActionCode,
    updateProfile, 
    updatePassword,
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    initializeFirestore, 
    persistentLocalCache, 
    persistentMultipleTabManager, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs, 
    onSnapshot, 
    updateDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { firebaseConfig, globalAppId, DEFAULT_TYPES } from './constants.js';
import { state } from './state.js';
import { safeStringify, safeClone, sanitizeAppData, fixDates, showToast, showAlertModal, showConfirmModal, closeModal } from './utils.js';

export let fbApp, fbAuth, fbDb;

export {
    signInWithPopup, 
    GoogleAuthProvider, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile, 
    signOut, 
    signInAnonymously,
    sendPasswordResetEmail, 
    sendEmailVerification,
    reload,
    applyActionCode,
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs, 
    onSnapshot, 
    updateDoc, 
    deleteDoc 
};

try {
    fbApp = initializeApp(firebaseConfig);
    fbAuth = getAuth(fbApp);
    // 設定 Firebase Auth 語系為繁體中文，確保所有寄送之信件皆以繁體中文發送
    fbAuth.languageCode = 'zh-TW';
    
    fbDb = initializeFirestore(fbApp, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (err) {
    console.warn("Firebase 初始化失敗:", err);
}

if (fbAuth) {
    onAuthStateChanged(fbAuth, (user) => {
        try {
            const syncStatus = document.getElementById('cloud-sync-status');
            const loginBtn = document.getElementById('google-login-btn');
            const cloudActions = document.getElementById('cloud-actions');
            const storageContainer = document.getElementById('cloud-storage-container');

            if (user) {
                if (syncStatus) {
                    syncStatus.innerHTML = `狀態：已安全登入雲端 <br><span class="text-sky-900 font-bold bg-white px-3 py-1.5 rounded-xl inline-block mt-2 shadow-sm border border-sky-100 text-[11px] tracking-wide">👤 ${user.displayName || user.email}</span>`;
                }
                if (loginBtn) loginBtn.classList.add('hidden');
                if (cloudActions) cloudActions.classList.remove('hidden');
                if (storageContainer) storageContainer.classList.remove('hidden');
                syncUserProfile();
            } else {
                if (syncStatus) {
                    if (state.currentUser) {
                        syncStatus.innerHTML = `狀態：本地離線模式 <br><span class="text-slate-700 font-bold bg-white px-3 py-1.5 rounded-xl inline-block mt-2 shadow-sm border border-slate-200 text-[11px] tracking-wide">👤 ${state.currentUser.displayName || state.currentUser.email}</span><br><span class="text-[11px] text-sky-600 mt-1 inline-block">點擊下方按鈕登入 Google 帳號以啟用雲端同步</span>`;
                    } else {
                        syncStatus.innerHTML = "狀態：未登入，點擊下方按鈕登入以啟用雲端同步。";
                    }
                }
                if (loginBtn) loginBtn.classList.remove('hidden');
                if (cloudActions) cloudActions.classList.add('hidden');
                if (storageContainer) storageContainer.classList.add('hidden');
            }
            if (window.updateChatUnreadBadge) window.updateChatUnreadBadge();
            if (state.isChatOpen && window.renderChatView) window.renderChatView();
        } catch(e) {}
    });
}

export function isGoogleAuthUser(user) {
    if (!user) return false;
    if (user.isGoogleAuth === true) return true;
    if (sessionStorage.getItem('auth_provider') === 'google') return true;
    if (Array.isArray(user.providerData) && user.providerData.some(p => p && p.providerId === 'google.com')) return true;
    return false;
}

export function isGoogleAdmin(user) {
    if (state?.isDevMode || sessionStorage.getItem('app_dev_mode') === 'true') {
        return true;
    }
    if (!user || !user.email) return false;
    if (user.email.toLowerCase() !== 'ianw.solar@gmail.com') return false;
    return isGoogleAuthUser(user);
}

window.isGoogleAuthUser = isGoogleAuthUser;
window.isGoogleAdmin = isGoogleAdmin;

export function listenToServerConfig() {
    if (!fbDb) return;
    if (state.unsubServerConfig) state.unsubServerConfig();
    
    const configRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'serverConfig', 'main');
    state.unsubServerConfig = onSnapshot(configRef, (docSnap) => {
        const maintenanceScreen = document.getElementById('system-maintenance-screen');
        const newVersionBtn = document.getElementById('new-version-btn');
        const maintenanceMsg = document.getElementById('maintenance-msg');
        const isAdmin = isGoogleAdmin(state.currentUser);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.isMaintenance && !isAdmin) {
                if (maintenanceScreen) maintenanceScreen.classList.remove('hidden');
                if (maintenanceMsg) maintenanceMsg.textContent = data.maintenanceMessage || '系統目前正在進行維護升級，請稍後再試。';
                
                if (data.showNewVersionLink && data.newVersionUrl) {
                    newVersionBtn?.classList.remove('hidden');
                    if (newVersionBtn) newVersionBtn.onclick = () => window.location.href = data.newVersionUrl;
                } else {
                    newVersionBtn?.classList.add('hidden');
                }
            } else {
                if (maintenanceScreen) maintenanceScreen.classList.add('hidden');
            }
        } else {
            if (maintenanceScreen) maintenanceScreen.classList.add('hidden');
        }
    }, (error) => {
        const maintenanceScreen = document.getElementById('system-maintenance-screen');
        if (maintenanceScreen) maintenanceScreen.classList.add('hidden');
    });
}

export function listenToProfile() {
    if (!fbDb || !fbAuth?.currentUser) return;
    const uid = fbAuth.currentUser.uid;
    if (!uid) return;
    if (state.unsubProfile) state.unsubProfile();
    const userProfileRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', uid);
    state.unsubProfile = onSnapshot(userProfileRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const isAdmin = isGoogleAdmin(state.currentUser);
            
            const lockScreen = document.getElementById('system-lock-screen');
            if (data.isLocked && !isAdmin) {
                if (lockScreen) lockScreen.classList.remove('hidden');
            } else {
                if (lockScreen) lockScreen.classList.add('hidden');
            }

            if (data.bannerActive && data.bannerMessage && data.bannerId) {
                state.personalBanner = {
                    id: data.bannerId,
                    message: data.bannerMessage,
                    createdAt: data.bannerTime || new Date().toISOString()
                };
                window.updateBellBadge?.();
                if (state.isBellOpen) window.renderBroadcastPanel?.();

                const dismissed = localStorage.getItem('dismissed_banner_' + data.bannerId);
                if (!dismissed) {
                    const banner = document.getElementById('system-banner');
                    const bannerMsgSpan = document.querySelector('#system-banner-msg span');
                    if (bannerMsgSpan) bannerMsgSpan.textContent = "📢 系統公告：" + data.bannerMessage;
                    banner?.classList.remove('hidden');
                    banner?.classList.add('flex');
                    const bannerClose = document.getElementById('system-banner-close');
                    if (bannerClose) {
                        bannerClose.onclick = () => {
                            banner?.classList.add('hidden');
                            banner?.classList.remove('flex');
                            localStorage.setItem('dismissed_banner_' + data.bannerId, 'true');
                        };
                    }
                }
            }

            if (data.forceReset) {
                performRemoteReset();
            }
        }
    }, (error) => {
        console.warn("Profile listen notice:", error.message || error);
    });
}

export async function syncUserProfile() {
    if (!fbDb || !fbAuth?.currentUser || sessionStorage.getItem('app_is_guest_mode') === 'true') return;
    try {
        const fullBytes = new Blob([safeStringify(state.appData)]).size;
        const currentDataSizeKB = (fullBytes / 1024).toFixed(1);
        const uid = fbAuth.currentUser.uid;
        
        const userProfileRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', uid);
        await setDoc(userProfileRef, {
            email: state.currentUser?.email || fbAuth.currentUser.email || '',
            displayName: state.currentUser?.displayName || fbAuth.currentUser.displayName || fbAuth.currentUser.email || '使用者',
            isGuest: false,
            lastActive: new Date().toISOString(),
            dataSizeKB: currentDataSizeKB
        }, { merge: true });
        
        let visitorId = localStorage.getItem('visitor_id');
        if (visitorId) {
            try { 
                await deleteDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', visitorId)); 
            } catch(e) {}
            localStorage.removeItem('visitor_id');
            localStorage.removeItem('visitor_name');
        }
    } catch(err) {
        console.warn("syncUserProfile notice:", err.message || err);
    }
}

export async function performRemoteReset() {
    state.appData = { classes: [], homeworks: [], homeworkTypes: JSON.parse(safeStringify(DEFAULT_TYPES)) };
    localStorage.setItem('homeworkAppData', safeStringify(state.appData));
    
    if (fbDb) {
        const uid = state.currentUser ? state.currentUser.uid : localStorage.getItem('visitor_id');
        if (uid) {
            try {
                if (state.currentUser) {
                    const docRef = doc(fbDb, 'artifacts', globalAppId, 'users', uid, 'appData', 'mainDoc');
                    await setDoc(docRef, { data: safeStringify(state.appData), updatedAt: new Date().toISOString() });
                }
                const userProfileRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', uid);
                await updateDoc(userProfileRef, { forceReset: false }); 
            } catch (err) {
                console.error("執行 Firebase 狀態重置時發生錯誤", err);
            }
        }
    }
    
    const lockScreen = document.getElementById('system-lock-screen');
    if (lockScreen) {
        lockScreen.innerHTML = `<div class="text-6xl mb-6 shadow-2xl">⚠️</div><h1 class="text-3xl font-black text-white mb-4">資料已重置</h1><p class="text-slate-300 font-medium">系統已完成資料強制重置作業。</p>`;
        lockScreen.classList.remove('hidden');
    }
    setTimeout(() => window.location.reload(), 2000);
}

export async function loadServerConfigForAdmin() {
    if (!fbDb || !isGoogleAdmin(state.currentUser)) return;
    try {
        const configRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'serverConfig', 'main');
        const docSnap = await getDoc(configRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const maintToggle = document.getElementById('admin-maintenance-toggle');
            const maintMsg = document.getElementById('admin-maintenance-msg');
            const showLinkToggle = document.getElementById('admin-show-link-toggle');
            const newVerUrl = document.getElementById('admin-new-version-url');
            if (maintToggle) maintToggle.checked = data.isMaintenance || false;
            if (maintMsg) maintMsg.value = data.maintenanceMessage || '';
            if (showLinkToggle) showLinkToggle.checked = data.showNewVersionLink || false;
            if (newVerUrl) newVerUrl.value = data.newVersionUrl || '';
        }
    } catch(e) { console.error("Load config error", e); }
}

let adminCachedUsers = [];
let adminUsersCallback = null;
let adminFilterListenersBound = false;

function setupAdminFilterListeners() {
    if (adminFilterListenersBound) return;
    adminFilterListenersBound = true;

    const searchInput = document.getElementById('admin-user-search-input');
    const hideGuestsCb = document.getElementById('admin-hide-guests-checkbox');
    const hideAdminCb = document.getElementById('admin-hide-admin-checkbox');
    const refreshBtn = document.getElementById('admin-refresh-users-btn');

    if (searchInput) {
        searchInput.addEventListener('input', () => renderAdminUsersList());
    }
    if (hideGuestsCb) {
        hideGuestsCb.addEventListener('change', () => renderAdminUsersList());
    }
    if (hideAdminCb) {
        hideAdminCb.addEventListener('change', () => renderAdminUsersList());
    }
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadAllUsersForAdmin(adminUsersCallback));
    }
}

export function renderAdminUsersList() {
    const usersList = document.getElementById('admin-users-list');
    if (!usersList) return;

    const searchInput = document.getElementById('admin-user-search-input');
    const hideGuestsCb = document.getElementById('admin-hide-guests-checkbox');
    const hideAdminCb = document.getElementById('admin-hide-admin-checkbox');
    const countBadge = document.getElementById('admin-user-count-badge');

    const keyword = (searchInput?.value || '').trim().toLowerCase();
    const hideGuests = Boolean(hideGuestsCb?.checked);
    const hideAdmin = Boolean(hideAdminCb?.checked);

    const filtered = adminCachedUsers.filter(u => {
        // 隱藏訪客帳號
        if (hideGuests && u.isGuest) return false;
        // 隱藏管理者帳號 (ianw.solar@gmail.com)
        if (hideAdmin && (u.isAdmin || (u.email && u.email.toLowerCase() === 'ianw.solar@gmail.com'))) return false;
        // 關鍵字搜尋 (支援姓名、Email、稱謂、UID)
        if (keyword) {
            const matchName = (u.displayName || '').toLowerCase().includes(keyword);
            const matchEmail = (u.email || '').toLowerCase().includes(keyword);
            const matchId = (u.id || '').toLowerCase().includes(keyword);
            if (!matchName && !matchEmail && !matchId) return false;
        }
        return true;
    });

    if (countBadge) {
        countBadge.textContent = `顯示 ${filtered.length} / 共 ${adminCachedUsers.length} 個帳號`;
    }

    usersList.innerHTML = '';

    if (filtered.length === 0) {
        usersList.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-slate-400 font-bold">🔍 查無符合條件的用戶資料。</td></tr>';
        return;
    }

    filtered.forEach(u => {
        const data = u.data || {};
        const id = u.id;
        const isAdminUser = u.isAdmin;
        const isLocked = u.isLocked;
        const statusHtml = isLocked 
            ? '<span class="bg-rose-100 text-rose-600 px-2 py-1 rounded-lg text-xs font-black shadow-sm">🔴 已凍結</span>'
            : '<span class="bg-emerald-100 text-emerald-600 px-2 py-1 rounded-lg text-xs font-black shadow-sm">🟢 正常</span>';
            
        const lastActive = data.lastActive ? new Date(data.lastActive).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : '未知';
        const size = data.dataSizeKB ? `${data.dataSizeKB} KB` : '未知';

        const roleBadge = isAdminUser
            ? '<span class="inline-block bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded-md ml-1.5 align-middle">最高管理員</span>'
            : (u.isGuest ? '<span class="inline-block bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-md ml-1.5 align-middle">訪客</span>' : '');

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/80 transition-colors";
        tr.innerHTML = `
            <td class="p-3 border-b border-slate-100">
                <div class="font-black text-slate-800 text-base flex items-center">
                    <span>${u.displayName}</span>
                    ${roleBadge}
                </div>
                <div class="text-[11px] font-bold text-slate-400 mt-0.5">${u.email || (u.isGuest ? '未綁定 Email (訪客體驗)' : '無 Email')}</div>
            </td>
            <td class="p-3 border-b border-slate-100 text-xs font-bold text-slate-500 hidden sm:table-cell">${lastActive}</td>
            <td class="p-3 border-b border-slate-100 text-xs font-black text-indigo-600">${size}</td>
            <td class="p-3 border-b border-slate-100">${statusHtml}</td>
            <td class="p-3 border-b border-slate-100 text-right space-x-1 whitespace-nowrap">
                ${isAdminUser ? 
                    '<span class="text-xs font-bold text-slate-400 px-2 py-1 mr-2">🛡️ 最高權限</span>' : 
                    `<button class="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors toggle-lock-btn shadow-sm cursor-pointer" data-id="${id}" data-locked="${isLocked}">
                        ${isLocked ? '🔓 解鎖' : '🔒 鎖定'}
                    </button>`
                }
                <button class="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors view-data-btn shadow-sm cursor-pointer" data-id="${id}" data-email="${u.email || u.displayName}">
                    👁️ 查看資料
                </button>
                <button class="bg-amber-100 hover:bg-amber-200 text-amber-700 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors send-banner-btn shadow-sm cursor-pointer" data-id="${id}">
                    📢 廣播
                </button>
                <button class="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors force-reset-btn shadow-sm cursor-pointer" data-id="${id}">
                    ⚠️ 重置
                </button>
                ${(state?.isDevMode || sessionStorage.getItem('app_dev_mode') === 'true') ? `
                    <button class="bg-stone-100 text-stone-400 border border-stone-200 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-not-allowed shadow-xs" disabled title="開發者模式已鎖定：無法刪除帳號">
                        🚫 禁刪
                    </button>
                ` : `
                    <button class="bg-red-600 hover:bg-red-700 text-white border border-red-800 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors delete-user-btn shadow-sm cursor-pointer" data-id="${id}">
                        🗑️ 刪除
                    </button>
                `}
            </td>
        `;
        usersList.appendChild(tr);
    });

    // 綁定操作按鈕
    usersList.querySelectorAll('.toggle-lock-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetBtn = e.target.closest('.toggle-lock-btn');
            if (!targetBtn) return;
            const id = targetBtn.dataset.id;
            const currentlyLocked = targetBtn.dataset.locked === 'true';
            try {
                await updateDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', id), { isLocked: !currentlyLocked });
                const cached = adminCachedUsers.find(u => u.id === id);
                if (cached) cached.isLocked = !currentlyLocked;
                renderAdminUsersList();
                showToast(currentlyLocked ? "帳戶已解鎖" : "帳戶已凍結", "info");
            } catch(err) { showToast("操作失敗", "error"); }
        });
    });
    
    usersList.querySelectorAll('.view-data-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('.view-data-btn');
            if (!targetBtn) return;
            const id = targetBtn.dataset.id;
            const email = targetBtn.dataset.email;
            if (adminUsersCallback) adminUsersCallback(id, email);
        });
    });

    usersList.querySelectorAll('.send-banner-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetBtn = e.target.closest('.send-banner-btn');
            if (!targetBtn) return;
            const id = targetBtn.dataset.id;
            const msg = prompt("請輸入要廣播給該用戶的系統橫幅：");
            if (msg) {
                try {
                    await updateDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', id), {
                        bannerMessage: msg, bannerActive: true, bannerId: Date.now().toString()
                    });
                    showToast("廣播推播成功！", "success");
                } catch(err) { showToast("推播失敗", "error"); }
            }
        });
    });

    usersList.querySelectorAll('.force-reset-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetBtn = e.target.closest('.force-reset-btn');
            if (!targetBtn) return;
            const id = targetBtn.dataset.id;
            const pass = prompt("【危險操作】請輸入 2FA 本地萬用密鑰以確認清空該用戶資料：");
            if (pass === "ianw0000") {
                try {
                    await updateDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', id), { forceReset: true });
                    showToast("重置核彈已發射！", "success");
                } catch(err) { showToast("重置失敗", "error"); }
            } else {
                showToast("2FA 密鑰驗證失敗！", "error");
            }
        });
    });

    usersList.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetBtn = e.target.closest('.delete-user-btn');
            if (!targetBtn) return;
            if (state?.isDevMode || sessionStorage.getItem('app_dev_mode') === 'true') {
                showToast("⚠️ 開發者模式安全防護：無權限刪除帳戶", "warning");
                return;
            }
            const id = targetBtn.dataset.id;
            const pass = prompt("【危險操作】確定刪除該帳戶？此操作將不可逆。請輸入密鑰確認：");
            if (pass === "ianw0000") {
                try {
                    await deleteDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', id));
                    await deleteDoc(doc(fbDb, 'artifacts', globalAppId, 'users', id, 'appData', 'mainDoc'));
                    adminCachedUsers = adminCachedUsers.filter(u => u.id !== id);
                    renderAdminUsersList();
                    showToast("帳戶已刪除", "success");
                } catch(err) { showToast("刪除失敗", "error"); }
            }
        });
    });
}

export async function loadAllUsersForAdmin(onViewDataCallback) {
    if (!isGoogleAdmin(state.currentUser)) return;
    adminUsersCallback = onViewDataCallback;
    setupAdminFilterListeners();
    loadServerConfigForAdmin();

    const devBadge = document.getElementById('admin-dev-badge');
    if (devBadge) {
        if (state?.isDevMode || sessionStorage.getItem('app_dev_mode') === 'true') {
            devBadge.classList.remove('hidden');
        } else {
            devBadge.classList.add('hidden');
        }
    }

    const usersList = document.getElementById('admin-users-list');
    const countBadge = document.getElementById('admin-user-count-badge');
    if (!usersList) return;
    if (countBadge) countBadge.textContent = '載入中...';
    usersList.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-500 font-bold">📡 正在載入全球伺服器資料...</td></tr>';
    
    try {
        const usersRef = collection(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles');
        const snapshot = await getDocs(usersRef);
        
        const userMap = new Map();
        snapshot.forEach(docSnap => {
            const data = docSnap.data() || {};
            const id = docSnap.id;
            const email = (data.email || '').trim();
            const isGuest = Boolean(data.isGuest || !email || email.includes('guest') || data.displayName === '訪客');
            const isAdmin = Boolean(email && email.toLowerCase() === 'ianw.solar@gmail.com');
            userMap.set(id, {
                id,
                data,
                email,
                displayName: data.displayName || data.username || data.name || (isGuest ? '訪客' : '一般用戶'),
                isGuest,
                isAdmin,
                isLocked: Boolean(data.isLocked),
                lastActive: data.lastActive,
                dataSizeKB: data.dataSizeKB
            });
        });

        // 整合 boundAccounts 確保所有已註冊帳號均能呈現在後台
        try {
            const localBounds = JSON.parse(localStorage.getItem('bound_accounts_all') || localStorage.getItem('bound_accounts_ianw') || '[]');
            localBounds.forEach(acc => {
                const accId = acc.id || acc.uid;
                if (accId && !userMap.has(accId)) {
                    const accEmail = (acc.email || acc.authEmail || '').trim();
                    const isGuest = Boolean(!accEmail || accEmail.includes('guest'));
                    const isAdmin = Boolean(accEmail && accEmail.toLowerCase() === 'ianw.solar@gmail.com');
                    userMap.set(accId, {
                        id: accId,
                        data: acc,
                        email: accEmail,
                        displayName: acc.displayName || acc.username || acc.name || '註冊用戶',
                        isGuest,
                        isAdmin,
                        isLocked: false,
                        lastActive: acc.createdAt,
                        dataSizeKB: 0
                    });
                }
            });
        } catch(e) {}

        adminCachedUsers = Array.from(userMap.values());
        renderAdminUsersList();
    } catch(err) {
        usersList.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-rose-500 font-bold">載入失敗: ${err.message}</td></tr>`;
        if (countBadge) countBadge.textContent = '載入失敗';
    }
}

export async function deleteCloudParentClass(code) {
    if (!fbDb || !code) return;
    try {
        const parentDocRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'parentClasses', String(code).trim());
        await deleteDoc(parentDocRef);
    } catch (e) {
        console.warn("Delete parent class from cloud error:", e);
    }
}

export async function syncDataToCloud() {
    if (sessionStorage.getItem('app_is_guest_mode') === 'true' || !state.currentUser || !fbDb || !fbAuth?.currentUser) return;
    try {
        const targetUid = state.adminViewModeUserId || fbAuth.currentUser.uid;
        const docRef = doc(fbDb, 'artifacts', globalAppId, 'users', targetUid, 'appData', 'mainDoc');
        await setDoc(docRef, { data: safeStringify(state.appData), updatedAt: new Date().toISOString() });

        if (Array.isArray(state.appData.classes)) {
            for (const c of state.appData.classes) {
                if (c && c.accessCode && String(c.accessCode).trim()) {
                    const code = String(c.accessCode).trim();
                    const parentDocRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'parentClasses', code);
                    const classHomeworks = (state.appData.homeworks || []).filter(h => h.classId === c.id).map(h => ({
                        id: h.id,
                        name: h.name,
                        typeId: h.typeId || 'default',
                        createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : (h.createdAt || new Date().toISOString()),
                        studentCount: typeof h.studentCount === 'number' ? h.studentCount : (h.students || []).length,
                        students: (h.students || []).map(s => ({ seat: s.seat, status: s.status }))
                    }));
                    const parentPayload = {
                        classId: c.id,
                        className: c.name,
                        accessCode: code,
                        lastMaxSeat: typeof c.lastMaxSeat === 'number' ? c.lastMaxSeat : 30,
                        lastMissingSeats: c.lastMissingSeats || '',
                        teacherEmail: state.currentUser.email || '',
                        teacherName: state.currentUser.displayName || state.currentUser.email || '班級導師',
                        teacherUid: targetUid,
                        updatedAt: new Date().toISOString(),
                        homeworks: classHomeworks,
                        contactBook: c.contactBook || {},
                        homeworkTypes: safeClone(state.appData.homeworkTypes || DEFAULT_TYPES)
                    };
                    await setDoc(parentDocRef, {
                        ...parentPayload,
                        data: safeStringify(parentPayload),
                        updatedAt: new Date().toISOString()
                    });
                }
            }
        }
        state.lastCloudError = null;
    } catch (error) { 
        console.warn("Cloud sync notice:", error.message || error); 
        state.lastCloudError = error.message; 
    }
}

export async function loadDataFromCloud(silent = false, onLoadedCallback) {
    if (!state.currentUser || !fbDb || !fbAuth?.currentUser) return false;
    try {
        let targetUid = state.adminViewModeUserId || fbAuth.currentUser.uid;
        let docRef = doc(fbDb, 'artifacts', globalAppId, 'users', targetUid, 'appData', 'mainDoc');
        let docSnap = await getDoc(docRef);
        if ((!docSnap.exists() || !docSnap.data()?.data) && targetUid === 'admin_ianw_solar') {
            try {
                const profilesSnap = await getDocs(collection(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles'));
                for (const pDoc of profilesSnap.docs) {
                    if (pDoc.data()?.email === 'ianw.solar@gmail.com' && pDoc.id !== 'admin_ianw_solar') {
                        const altDoc = await getDoc(doc(fbDb, 'artifacts', globalAppId, 'users', pDoc.id, 'appData', 'mainDoc'));
                        if (altDoc.exists() && altDoc.data()?.data) {
                            docSnap = altDoc;
                            targetUid = pDoc.id;
                            break;
                        }
                    }
                }
            } catch(e) {}
        }
        if (docSnap.exists() && docSnap.data().data) {
            const cloudData = sanitizeAppData(JSON.parse(docSnap.data().data));
            if (silent) { 
                state.appData = cloudData; 
                fixDates(state.appData); 
                localStorage.setItem('homeworkAppData', safeStringify(state.appData)); 
                if (!state.currentClassId && state.appData.classes.length > 0) {
                    state.currentClassId = state.appData.classes[0].id;
                    localStorage.setItem('currentClassId', state.currentClassId);
                }
                if (onLoadedCallback) onLoadedCallback();
                showToast('✅ 已從雲端自動還原您的資料！', 'success');
                return true;
            } 
            else {
                showConfirmModal('發現雲端備份', '確定要將本地資料完全覆蓋為雲端上的最新紀錄嗎？這會清除未上傳的本地更動。', () => {
                    state.appData = cloudData; 
                    fixDates(state.appData); 
                    localStorage.setItem('homeworkAppData', safeStringify(state.appData)); 
                    if (!state.currentClassId && state.appData.classes.length > 0) {
                        state.currentClassId = state.appData.classes[0].id;
                        localStorage.setItem('currentClassId', state.currentClassId);
                    }
                    if (onLoadedCallback) onLoadedCallback();
                    showToast('已成功從雲端載入資料！', 'success');
                });
                return true;
            }
        } else {
            if (!silent) showToast('在您的雲端帳戶中尚無備份資料。', 'info');
            return false;
        }
    } catch(e) { 
        console.error(e); 
        if(!silent) showToast("下載失敗：" + e.message, "error"); 
        return false; 
    }
}
