import { fbDb, fbAuth, doc, getDoc, setDoc, updateDoc, onSnapshot, signInWithEmailAndPassword, signInAnonymously } from './firebase.js';
import { globalAppId } from './constants.js';
import { state } from './state.js';
import { safeClone, safeStringify, sanitizeAppData, fixDates, showToast, showAlertModal, openModal, closeModal } from './utils.js';
import { updateDataManagementUI, updatePortalUI } from './render.js';
import { proceedIntoSystem } from './navigation.js';
import { startRealtimeCloudSync, loadDataFromCloud } from './firebase.js';
import { getUserStorageKey, loadLocalDataForUser } from './storage.js';

let activeQrUnsubscribe = null;
let activeQrCountdownInterval = null;
let currentChallengeId = null;
let html5QrCodeScanner = null;

/**
 * 讀取當前裝置上的 Firebase Auth Session 記錄 (包含 Google 授權與 STS Token)
 */
export async function getFirebaseAuthSessionRecord() {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open('firebaseLocalStorageDb');
            req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
                    resolve(null);
                    return;
                }
                const tx = db.transaction(['firebaseLocalStorage'], 'readonly');
                const store = tx.objectStore('firebaseLocalStorage');
                const getReq = store.getAll();
                getReq.onsuccess = () => {
                    const authItem = (getReq.result || []).find(item => item && item.fbase_key && item.fbase_key.startsWith('firebase:authUser:'));
                    resolve(authItem || null);
                };
                getReq.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

/**
 * 將手機端授權之 Firebase Auth Session 記錄注入至當前電腦端的 IndexedDB
 */
export async function injectFirebaseAuthSessionRecord(record) {
    if (!record || !record.fbase_key || !record.value) return false;
    return new Promise((resolve, reject) => {
        try {
            const req = indexedDB.open('firebaseLocalStorageDb');
            req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
                    resolve(false);
                    return;
                }
                const tx = db.transaction(['firebaseLocalStorage'], 'readwrite');
                const store = tx.objectStore('firebaseLocalStorage');
                const putReq = store.put(record);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = (e) => reject(e);
            };
            req.onerror = (e) => reject(req.error);
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * 電腦 / 目標裝置端：啟動「手機掃碼快速登入」Session
 */
export async function startDeviceQrLoginSession() {
    if (!fbDb) {
        showAlertModal("無法啟用掃碼登入", "尚未連線至 Firebase 雲端服務，請檢查網路連線。");
        return;
    }

    // 關閉任何可能開著的其他認證彈窗
    const portalAuthModal = document.getElementById('portal-auth-modal');
    if (portalAuthModal && !portalAuthModal.classList.contains('hidden')) {
        closeModal(portalAuthModal);
    }
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && !settingsModal.classList.contains('hidden')) {
        closeModal(settingsModal);
    }

    const qrModal = document.getElementById('qr-login-modal');
    if (!qrModal) return;

    // 清理舊的監聽與倒數計時
    stopDeviceQrLoginSession();

    // 產生唯一 Challenge ID
    currentChallengeId = `qr_login_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 建立 Firestore 紀錄 (儲存在已對所有設備開放讀寫的 userProfiles 集合下)
    try {
        const challengeDoc = {
            type: 'qr_login_challenge',
            challengeId: currentChallengeId,
            status: 'waiting', // waiting -> scanned -> authorized -> consumed / expired
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            userAgent: navigator.userAgent
        };
        await setDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', currentChallengeId), challengeDoc);
    } catch (err) {
        console.error("Failed to create QR login challenge:", err);
        showToast("⚠️ 建立掃碼登入連線失敗，請稍後重試", "error");
        return;
    }

    // 開啟 QR Modal
    openModal(qrModal);

    // 產生掃碼 URL (支援原生相機掃描或 App 內掃描)
    const baseUrl = window.location.origin + window.location.pathname;
    const qrScanUrl = `${baseUrl}?qr_login=${currentChallengeId}`;

    // 渲染 QR Code
    const qrContainer = document.getElementById('qr-code-canvas-container');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        if (window.QRCode) {
            new window.QRCode(qrContainer, {
                text: qrScanUrl,
                width: 220,
                height: 220,
                colorDark: "#1e1b4b",
                colorLight: "#ffffff",
                correctLevel: window.QRCode.CorrectLevel.M
            });
        } else {
            qrContainer.innerHTML = `<div class="p-4 text-rose-500 font-bold text-xs">QR Code 模組載入中，請稍候...</div>`;
        }
    }

    // 重置狀態顯示
    const statusText = document.getElementById('qr-login-status-text');
    const statusIndicator = document.getElementById('qr-login-status-indicator');
    const countdownText = document.getElementById('qr-login-countdown');
    const refreshBtn = document.getElementById('qr-login-refresh-btn');

    if (statusText) statusText.textContent = "等待手機掃描中...";
    if (statusIndicator) statusIndicator.className = "w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping";
    if (refreshBtn) refreshBtn.classList.add('hidden');

    let remainingSeconds = 300; // 5 分鐘
    const updateCountdownDisplay = () => {
        const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
        const secs = String(remainingSeconds % 60).padStart(2, '0');
        if (countdownText) countdownText.textContent = `有效時間：${mins}:${secs}`;
    };
    updateCountdownDisplay();

    activeQrCountdownInterval = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds <= 0) {
            clearInterval(activeQrCountdownInterval);
            activeQrCountdownInterval = null;
            if (statusText) statusText.textContent = "⚠️ QR Code 已過期，請點擊重新產生";
            if (statusIndicator) statusIndicator.className = "w-2.5 h-2.5 rounded-full bg-rose-500";
            if (refreshBtn) refreshBtn.classList.remove('hidden');
        } else {
            updateCountdownDisplay();
        }
    }, 1000);

    // 建立即時 Firestore 監聽
    activeQrUnsubscribe = onSnapshot(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', currentChallengeId), async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        if (data.status === 'scanned') {
            if (statusText) statusText.textContent = "📱 手機已掃描，等待手機端確認授權...";
            if (statusIndicator) statusIndicator.className = "w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse";
        } else if (data.status === 'authorized' && data.userObj) {
            // 手機已授權！開始執行登入程序
            const authProvider = data.authProvider || (data.userObj.isGoogleAuth ? 'google' : 'password');
            const providerName = authProvider === 'google' ? 'Google 帳號' : '雲端帳號';
            if (statusText) statusText.textContent = `🎉 手機已授權！正在登入 ${data.userObj.displayName || data.userObj.email} (${providerName})...`;
            if (statusIndicator) statusIndicator.className = "w-2.5 h-2.5 rounded-full bg-emerald-500";

            // 停止監聽與計時
            stopDeviceQrLoginSession(false);

            try {
                // 1. 若含有 Firebase Auth Session 記錄 (例如 Google 帳號授權)，直接注入 IndexedDB 實現無縫同帳號自動登入
                let sessionInjected = false;
                let sessionRecord = null;
                if (data.authSessionStr) {
                    try {
                        sessionRecord = JSON.parse(data.authSessionStr);
                    } catch (e) {}
                } else if (data.authSessionRecord) {
                    sessionRecord = data.authSessionRecord;
                }

                if (sessionRecord) {
                    try {
                        sessionInjected = await injectFirebaseAuthSessionRecord(sessionRecord);
                    } catch (idbErr) {
                        console.warn("Inject auth session record error:", idbErr);
                    }
                }

                // 2. 若含有登入帳密，亦進行 Firebase Auth 認證備援
                if (data.credentials?.authEmail && data.credentials?.password) {
                    try {
                        await signInWithEmailAndPassword(fbAuth, data.credentials.authEmail, data.credentials.password);
                    } catch (authErr) {
                        console.warn("Direct Firebase Auth sign-in err:", authErr);
                    }
                }

                // 3. 寫入本地 Session 與使用者物件 (標記 isQrAuthorized 保證離線模式不被誤判)
                state.currentUser = {
                    ...data.userObj,
                    isQrAuthorized: true
                };
                sessionStorage.setItem('auth_provider', authProvider);
                sessionStorage.setItem('qr_authorized_session', JSON.stringify(state.currentUser));
                sessionStorage.removeItem('is_explicit_logout');
                sessionStorage.removeItem('app_is_guest_mode');
                localStorage.removeItem('visitor_id');
                localStorage.removeItem('visitor_name');
                localStorage.setItem('app_user_session', JSON.stringify(state.currentUser));
                localStorage.setItem('storageSelected', 'true');

                // 4. 恢復最新雲端 / 手機同步資料 (確保不遺失本地或手機班級作業)
                const userKey = getUserStorageKey(state.currentUser);
                const localData = loadLocalDataForUser(state.currentUser);
                const phoneHasClasses = data.appData && Array.isArray(data.appData.classes) && data.appData.classes.length > 0;
                const localHasClasses = localData && Array.isArray(localData.classes) && localData.classes.length > 0;

                if (phoneHasClasses) {
                    state.appData = sanitizeAppData(data.appData);
                    fixDates(state.appData);
                    state.currentClassId = state.appData.classes?.[0]?.id || null;
                } else if (localHasClasses) {
                    state.appData = localData;
                    fixDates(state.appData);
                    state.currentClassId = localStorage.getItem('currentClassId_' + userKey) || state.appData.classes[0]?.id || null;
                }
                const serialized = safeStringify(state.appData);
                localStorage.setItem('homeworkAppData_' + userKey, serialized);
                localStorage.setItem('homeworkAppData', serialized);
                if (state.currentClassId) {
                    localStorage.setItem('currentClassId_' + userKey, state.currentClassId);
                    localStorage.setItem('currentClassId', state.currentClassId);
                }

                // 5. 標記挑戰已完成防重複使用，並清空敏感驗證字串保全安全
                try {
                    await updateDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', currentChallengeId), {
                        status: 'consumed',
                        authSessionStr: null,
                        authSessionRecord: null,
                        credentials: null,
                        consumedAt: new Date().toISOString()
                    });
                } catch (e) {}

                // 6. 更新畫面 UI 與權限
                updateDataManagementUI();
                try { updatePortalUI(); } catch (e) {}

                if (data.userObj.isAdmin) {
                    document.getElementById('admin-modal-btn')?.classList.remove('hidden');
                    document.getElementById('admin-btn')?.classList.remove('hidden');
                } else {
                    document.getElementById('admin-modal-btn')?.classList.add('hidden');
                    document.getElementById('admin-btn')?.classList.add('hidden');
                }

                // 7. 啟動跨設備即時同步與雲端載入
                startRealtimeCloudSync();
                await loadDataFromCloud(true);

                // 8. 關閉彈窗並提示
                closeModal(qrModal);
                showToast(`🎉 掃碼授權成功！歡迎 ${data.userObj.displayName || data.userObj.email}（已同步 ${providerName}）`, "success");

                // 9. 若已注入 Firebase Auth Session (例如 Google 帳號)，重新載入頁面使 Firebase Web SDK 完整識別同一個帳號
                if (sessionInjected) {
                    setTimeout(() => {
                        window.location.reload();
                    }, 400);
                } else {
                    proceedIntoSystem();
                }
            } catch (loginErr) {
                console.error("QR login finalize error:", loginErr);
                showToast("⚠️ 登入程序發生異常，請重試", "error");
            }
        }
    });
}

/**
 * 停止目標裝置端的 QR Login 監聽與定時器
 */
export function stopDeviceQrLoginSession(closeTheModal = true) {
    if (activeQrUnsubscribe) {
        activeQrUnsubscribe();
        activeQrUnsubscribe = null;
    }
    if (activeQrCountdownInterval) {
        clearInterval(activeQrCountdownInterval);
        activeQrCountdownInterval = null;
    }
    if (closeTheModal) {
        const qrModal = document.getElementById('qr-login-modal');
        if (qrModal && !qrModal.classList.contains('hidden')) {
            closeModal(qrModal);
        }
    }
}

/**
 * 手機端：開啟相機掃描 QR Code
 */
export async function openPhoneQrScannerModal() {
    if (!state.currentUser) {
        showToast("⚠️ 請先在手機登入帳號，才能掃碼授權其他裝置登入！", "warning");
        const portalModal = document.getElementById('portal-auth-modal');
        if (portalModal) openModal(portalModal);
        return;
    }

    if (!window.Html5Qrcode) {
        showAlertModal("掃描元件載入中", "相機掃描元件正在加載，請稍候 3 秒後重試。");
        return;
    }

    const scannerModal = document.getElementById('qr-scanner-modal');
    if (!scannerModal) return;

    openModal(scannerModal);

    const viewportEl = document.getElementById('qr-scanner-viewport');
    if (viewportEl) viewportEl.innerHTML = '';

    try {
        if (!html5QrCodeScanner) {
            html5QrCodeScanner = new window.Html5Qrcode("qr-scanner-viewport");
        }

        const config = {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        await html5QrCodeScanner.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                // 掃描成功！
                console.log("Scanned QR Text:", decodedText);
                await closePhoneQrScannerModal();

                // 解析 Challenge ID
                const challengeId = parseChallengeId(decodedText);
                if (challengeId) {
                    await promptAuthorizeChallenge(challengeId);
                } else {
                    showAlertModal("無法辨識的 QR Code", "此 QR Code 並非作業點收系統的登入碼，請對準電腦螢幕上的登入 QR Code 再次掃描。");
                }
            },
            (errorMessage) => {
                // 掃描中幀未命中 (通常忽略避免刷屏)
            }
        );
    } catch (err) {
        console.error("Camera start error:", err);
        showAlertModal("無法啟用相機", "系統無法存取您的手機鏡頭。請確認已允許瀏覽器使用相機權限，或使用手機內建的相機 App 掃描電腦螢幕上的 QR Code。");
        closePhoneQrScannerModal();
    }
}

/**
 * 關閉手機相機掃描視窗
 */
export async function closePhoneQrScannerModal() {
    const scannerModal = document.getElementById('qr-scanner-modal');
    if (html5QrCodeScanner) {
        try {
            if (html5QrCodeScanner.isScanning) {
                await html5QrCodeScanner.stop();
            }
        } catch (e) {
            console.warn("Scanner stop error:", e);
        }
    }
    if (scannerModal && !scannerModal.classList.contains('hidden')) {
        closeModal(scannerModal);
    }
}

/**
 * 解析 QR Code 字串
 */
function parseChallengeId(text) {
    if (!text) return null;
    try {
        if (text.includes('qr_login=')) {
            const url = new URL(text);
            return url.searchParams.get('qr_login');
        }
        if (text.startsWith('HW_QRLOGIN:')) {
            return text.replace('HW_QRLOGIN:', '').trim();
        }
        if (text.startsWith('qr_login_')) {
            return text.trim();
        }
    } catch (e) {
        // text might not be a full URL, fallback regex
        const match = text.match(/qr_login=([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
    }
    return null;
}

/**
 * 手機端：彈出授權確認視窗
 */
export async function promptAuthorizeChallenge(challengeId) {
    if (!fbDb) return;
    if (!state.currentUser) {
        sessionStorage.setItem('pending_qr_login_challenge', challengeId);
        showToast("📱 請先在手機登入您的帳號，登入後將自動授權該裝置登入！", "info");
        const portalModal = document.getElementById('portal-auth-modal');
        if (portalModal) openModal(portalModal);
        return;
    }

    try {
        // 1. 查詢挑戰紀錄
        const challengeRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', challengeId);
        const snap = await getDoc(challengeRef);

        if (!snap.exists()) {
            showAlertModal("QR Code 已失效", "找不到此登入請求，該 QR Code 可能已過期或被取消，請在電腦螢幕上點選「重新產生」。");
            return;
        }

        const data = snap.data();
        if (data.status === 'consumed') {
            showAlertModal("QR Code 已被使用", "此 QR Code 已經完成登入，無法重複授權。");
            return;
        }

        const expiresAt = new Date(data.expiresAt).getTime();
        if (Date.now() > expiresAt) {
            showAlertModal("QR Code 已過期", "此登入 QR Code 已超過 5 分鐘有效時間，請在電腦端重新產生。");
            return;
        }

        // 2. 標記為已掃描 (讓電腦端即時顯示「已掃描，等待確認」)
        await updateDoc(challengeRef, {
            status: 'scanned',
            scannedAt: new Date().toISOString(),
            scannedByUser: state.currentUser.displayName || state.currentUser.email
        });

        // 3. 填入確認視窗資料
        const confirmModal = document.getElementById('qr-auth-confirm-modal');
        const userDisplayEl = document.getElementById('qr-auth-user-name');
        const emailDisplayEl = document.getElementById('qr-auth-user-email');
        const confirmBtn = document.getElementById('qr-auth-confirm-btn');

        if (userDisplayEl) userDisplayEl.textContent = state.currentUser.displayName || '親師使用者';
        if (emailDisplayEl) emailDisplayEl.textContent = state.currentUser.email || state.currentUser.authEmail || '無信箱記錄';

        // 綁定確認點擊事件 (單次執行)
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                confirmBtn.disabled = true;
                const origText = confirmBtn.innerHTML;
                confirmBtn.innerHTML = `<span>⏳ 正在授權登入...</span>`;

                try {
                    // 取得可能存在的密碼 (從 boundAccounts 記錄)
                    let boundPassword = null;
                    let authEmail = state.currentUser.authEmail || state.currentUser.email;
                    try {
                        let bounds = JSON.parse(localStorage.getItem('bound_accounts_all') || '[]');
                        let found = bounds.find(b => b.uid === state.currentUser.uid || (b.email && b.email.toLowerCase() === (state.currentUser.email || '').toLowerCase()));
                        if (!found && fbDb) {
                            try {
                                const bSnap = await getDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'boundAccounts', state.currentUser.uid));
                                if (bSnap.exists()) found = bSnap.data();
                            } catch (e) {}
                        }
                        if (found) {
                            boundPassword = found.password || null;
                            authEmail = found.authEmail || authEmail;
                        }
                    } catch (e) {}

                    // 取得手機端的 Firebase Auth Session 記錄 (包含 Google 授權 STS Token)
                    let authSessionStr = null;
                    try {
                        const authSessionRecord = await getFirebaseAuthSessionRecord();
                        if (authSessionRecord) {
                            authSessionStr = JSON.stringify(authSessionRecord);
                        }
                    } catch (sessErr) {
                        console.warn("Could not retrieve Firebase Auth session record:", sessErr);
                    }

                    const authProvider = sessionStorage.getItem('auth_provider') || (state.currentUser?.isGoogleAuth ? 'google' : 'password');

                    // 寫入授權資料至 Firestore 挑戰文件 (序列化杜絕 undefined 欄位引發 Firestore 異常)
                    await updateDoc(challengeRef, {
                        status: 'authorized',
                        userObj: JSON.parse(JSON.stringify(state.currentUser || {})),
                        authProvider: authProvider,
                        authSessionStr: authSessionStr,
                        credentials: boundPassword ? { authEmail, password: boundPassword } : null,
                        appData: state.appData || { classes: [], homeworks: [] },
                        authorizedAt: new Date().toISOString()
                    });

                    // 同步寫入跨設備快取通道 (保證即使在任何網路狀態下資料皆無縫互通)
                    if (state.currentUser?.uid && state.appData) {
                        try {
                            await setDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', `sync_${state.currentUser.uid}`), {
                                data: safeStringify(state.appData),
                                updatedAt: new Date().toISOString(),
                                userEmail: state.currentUser.email || '',
                                userDisplayName: state.currentUser.displayName || ''
                            });
                        } catch (e) {}
                    }

                    closeModal(confirmModal);
                    showToast("🎉 已成功授權！該裝置現已自動登入系統。", "success");
                } catch (err) {
                    console.error("Authorize error:", err);
                    showToast("⚠️ 授權失敗，請確認網路連線後重試", "error");
                } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = origText;
                }
            };
        }

        if (confirmModal) openModal(confirmModal);

    } catch (err) {
        console.error("Fetch challenge doc error:", err);
        showAlertModal("讀取登入請求失敗", "連線至雲端伺服器發生異常，請重試。");
    }
}

/**
 * 檢查網址列是否帶有 ?qr_login=XYZ 參數 (適用以手機原生相機掃描開啟網址的情境)
 */
export async function checkUrlForQrLogin() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const challengeId = urlParams.get('qr_login');
        if (challengeId) {
            // 清理網址列，避免重複觸發
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);

            // 延遲一點等待 app 初始化完成
            setTimeout(async () => {
                await promptAuthorizeChallenge(challengeId);
            }, 600);
        }
    } catch (e) {
        console.warn("Check URL for QR login error:", e);
    }
}

/**
 * 綁定所有 QR 登入相關 DOM 點擊事件
 */
export function setupQrLoginEvents() {
    // 1. 開啟 QR 登入碼展示 (電腦 / 平板端)
    document.getElementById('portal-nav-qr-login-btn')?.addEventListener('click', () => {
        startDeviceQrLoginSession();
    });
    document.getElementById('portal-modal-qr-login-btn')?.addEventListener('click', () => {
        startDeviceQrLoginSession();
    });
    document.getElementById('settings-show-qr-btn')?.addEventListener('click', () => {
        startDeviceQrLoginSession();
    });
    document.getElementById('qr-login-refresh-btn')?.addEventListener('click', () => {
        startDeviceQrLoginSession();
    });

    // 2. 關閉 QR 登入彈窗
    document.getElementById('qr-login-modal-close-btn')?.addEventListener('click', () => {
        stopDeviceQrLoginSession(true);
    });
    document.getElementById('qr-login-back-to-form-btn')?.addEventListener('click', () => {
        stopDeviceQrLoginSession(true);
        const portalAuthModal = document.getElementById('portal-auth-modal');
        if (portalAuthModal) openModal(portalAuthModal);
    });

    // 3. 手機端開啟掃描鏡頭
    document.getElementById('portal-nav-qr-scan-btn')?.addEventListener('click', () => {
        openPhoneQrScannerModal();
    });
    document.getElementById('main-qr-scan-btn')?.addEventListener('click', () => {
        openPhoneQrScannerModal();
    });
    document.getElementById('settings-scan-qr-btn')?.addEventListener('click', () => {
        openPhoneQrScannerModal();
    });

    // 4. 關閉相機視窗
    document.getElementById('qr-scanner-modal-close-btn')?.addEventListener('click', () => {
        closePhoneQrScannerModal();
    });
    document.getElementById('qr-scanner-cancel-btn')?.addEventListener('click', () => {
        closePhoneQrScannerModal();
    });

    // 5. 關閉授權確認視窗
    document.getElementById('qr-auth-cancel-btn')?.addEventListener('click', () => {
        const confirmModal = document.getElementById('qr-auth-confirm-modal');
        if (confirmModal) closeModal(confirmModal);
    });
}
