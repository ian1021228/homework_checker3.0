/**
 * PalClass 新版本通知與雙版本同帳號自動同步引導 (homework_checker3.0)
 * 全用戶永久顯示，無法關閉，僅能收合為右下角快捷提示並可勾選「一律收合」。
 * 支援 0 毫秒直開新版正式網址（無 about:blank 空白頁）＋ postMessage 即時握手主通道 ＋ 2KB 極輕量 Firestore 備援通道。
 */

import { state } from './state.js';
import { fbAuth, fbDb, globalAppId, doc, setDoc, syncDataToCloud } from './firebase.js';
import { flushPendingSave } from './storage.js';
import { safeStringify } from './utils.js';

const DEFAULT_PALCLASS_ORIGIN = 'https://palclass.pages.dev';
const ALWAYS_COLLAPSE_KEY = 'hw3_palclass_notice_always_collapse_v1';
const NOTICE_DOM_VERSION = '4.3.2';
const HANDOFF_TTL_MS = 3 * 60 * 1000;

let userSessionExpandedOverride = null;
let lastRenderedAccountLabel = '';
let cachedAuthSessionStr = null;
let authPrefetchInFlight = false;

const stripSubAddressAlias = (raw) => String(raw || '').trim().replace(/\+acc[a-z0-9_]+(?=@)/i, '');

function isLoopbackHost() {
    try {
        const h = typeof window !== 'undefined' ? window.location.hostname : '';
        return h === '127.0.0.1' || h === 'localhost';
    } catch (e) {
        return false;
    }
}

function getPalClassBaseUrl() {
    if (isLoopbackHost() && typeof window.__PALCLASS_NEW_VERSION_BASE_URL__ === 'string') {
        const custom = window.__PALCLASS_NEW_VERSION_BASE_URL__.trim();
        if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(custom)) {
            return custom.replace(/\/?$/, '/');
        }
    }
    return DEFAULT_PALCLASS_ORIGIN + '/';
}

function isAllowedPalClassOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    if (origin === DEFAULT_PALCLASS_ORIGIN || origin === 'https://ian1021228.github.io') return true;
    if (isLoopbackHost()) {
        return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
    }
    return false;
}

function readPersistedSessionUserFallback() {
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('is_explicit_logout') === 'true') return null;
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('is_explicit_logout') === 'true') return null;
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('app_is_guest_mode') === 'true') return null;
        const qrRaw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('qr_authorized_session') : null;
        const raw = qrRaw || (typeof localStorage !== 'undefined' ? localStorage.getItem('app_user_session') : null);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.isGuest) return null;
        return parsed;
    } catch (e) {
        return null;
    }
}

function getSignedInStateSnapshot() {
    const isGuest = Boolean(
        state.currentUser?.isGuest ||
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('app_is_guest_mode') === 'true')
    );
    if (isGuest) return { user: null, isSignedIn: false };
    const user = state.currentUser || fbAuth?.currentUser || readPersistedSessionUserFallback();
    if (!user || user.isGuest) return { user: null, isSignedIn: false };
    return { user, isSignedIn: true };
}

function getActiveAccountDisplay() {
    const { user, isSignedIn } = getSignedInStateSnapshot();
    if (!isSignedIn || !user) return '';
    const candidate =
        (user.username && !String(user.username).includes('@') ? String(user.username).trim() : '') ||
        (user.displayName ? String(user.displayName).trim() : '') ||
        stripSubAddressAlias(user.email || user.authEmail || '');
    return candidate || '';
}

function getV3FirebaseAuthSessionRecord(timeoutMs = 500) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (val) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(val);
        };
        const timer = setTimeout(() => done(null), timeoutMs);
        try {
            if (typeof indexedDB === 'undefined') {
                done(null);
                return;
            }
            const req = indexedDB.open('firebaseLocalStorageDb');
            req.onblocked = () => done(null);
            req.onerror = () => done(null);
            req.onupgradeneeded = () => {
                // 不主動建立空資料庫，若尚未初始化直接回傳 null
            };
            req.onsuccess = () => {
                try {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
                        try { db.close(); } catch (e) {}
                        done(null);
                        return;
                    }
                    const tx = db.transaction(['firebaseLocalStorage'], 'readonly');
                    const store = tx.objectStore('firebaseLocalStorage');
                    const getAllReq = store.getAll();
                    getAllReq.onsuccess = () => {
                        const list = Array.isArray(getAllReq.result) ? getAllReq.result : [];
                        const rec = list.find(item => item && typeof item.fbase_key === 'string' && item.fbase_key.startsWith('firebase:authUser:'));
                        try { db.close(); } catch (e) {}
                        done(rec || null);
                    };
                    getAllReq.onerror = () => {
                        try { db.close(); } catch (e) {}
                        done(null);
                    };
                } catch (err) {
                    done(null);
                }
            };
        } catch (e) {
            done(null);
        }
    });
}

function prefetchV3AuthSession() {
    if (authPrefetchInFlight) return;
    authPrefetchInFlight = true;
    getV3FirebaseAuthSessionRecord(600)
        .then((rec) => {
            if (rec) {
                try { cachedAuthSessionStr = JSON.stringify(rec); } catch (e) {}
            }
        })
        .catch(() => {})
        .finally(() => {
            authPrefetchInFlight = false;
        });
}

function getPendingHandoffMap() {
    if (typeof window === 'undefined') return new Map();
    if (!(window.__v3PendingHandoffs instanceof Map)) {
        window.__v3PendingHandoffs = new Map();
    }
    const now = Date.now();
    for (const [key, val] of window.__v3PendingHandoffs.entries()) {
        if (!val || (now - (val.createdAtMs || 0)) > HANDOFF_TTL_MS) {
            window.__v3PendingHandoffs.delete(key);
        }
    }
    return window.__v3PendingHandoffs;
}

function ensureHandoffMessageListener() {
    if (typeof window === 'undefined' || window.__v3HandoffMsgBound) return;
    window.__v3HandoffMsgBound = true;
    window.addEventListener('message', (ev) => {
        try {
            if (!isAllowedPalClassOrigin(ev.origin)) return;
            const msg = ev.data;
            if (!msg || msg.type !== 'PALCLASS_V3_HANDOFF_READY') return;
            const handoffId = String(msg.handoffId || '').trim();
            if (!handoffId || !handoffId.startsWith('v3_handoff_')) return;

            const pendingMap = getPendingHandoffMap();
            const entry = pendingMap.get(handoffId);
            if (!entry || !entry.pmPayload) return;

            // 若背景剛好剛補完 authSessionStr，順帶補進握手封包
            if (!entry.pmPayload.authSessionStr && cachedAuthSessionStr) {
                entry.pmPayload.authSessionStr = cachedAuthSessionStr;
            }
            ev.source?.postMessage(
                {
                    type: 'PALCLASS_V3_HANDOFF_DATA',
                    handoffId,
                    payload: entry.pmPayload
                },
                ev.origin
            );
        } catch (e) {}
    });
}

function readAlwaysCollapsePref() {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(ALWAYS_COLLAPSE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function writeAlwaysCollapsePref(enabled) {
    try {
        if (typeof localStorage === 'undefined') return;
        if (enabled) localStorage.setItem(ALWAYS_COLLAPSE_KEY, '1');
        else localStorage.removeItem(ALWAYS_COLLAPSE_KEY);
    } catch (e) {}
}

export function isEligibleForNewVersionNotice() {
    return true;
}

function applyExpandedState(isExpanded) {
    const card = document.getElementById('palclass-notice-card');
    const pill = document.getElementById('palclass-notice-pill-btn');
    if (!card || !pill) return;

    if (isExpanded) {
        card.classList.remove('hidden');
        card.style.display = 'block';
        pill.classList.add('hidden');
        pill.style.display = 'none';
    } else {
        card.classList.add('hidden');
        card.style.display = 'none';
        pill.classList.remove('hidden');
        pill.style.display = 'inline-flex';
    }
}

function syncCheckboxWithPref() {
    const chk = document.getElementById('palclass-notice-always-collapse');
    if (chk) {
        chk.checked = readAlwaysCollapsePref();
    }
}

function buildHandoffPayloads(signedInUser, accountLabel) {
    const activeUser = state.currentUser || signedInUser || {};
    const authProvider =
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_provider')) ||
        (activeUser.isGoogleAuth ? 'google' : 'password');
    const cleanUserObj = {
        uid: String(activeUser.uid || activeUser.id || fbAuth?.currentUser?.uid || ''),
        id: String(activeUser.id || activeUser.uid || fbAuth?.currentUser?.uid || ''),
        username: String(activeUser.username || ''),
        email: stripSubAddressAlias(activeUser.email || fbAuth?.currentUser?.email || ''),
        authEmail: stripSubAddressAlias(activeUser.authEmail || activeUser.email || fbAuth?.currentUser?.email || ''),
        displayName: String(activeUser.displayName || activeUser.name || accountLabel || fbAuth?.currentUser?.displayName || '使用者'),
        photoURL: String(activeUser.photoURL || fbAuth?.currentUser?.photoURL || ''),
        isAdmin: Boolean(activeUser.isAdmin),
        isGoogleAuth: Boolean(activeUser.isGoogleAuth || authProvider === 'google'),
        emailVerified: true,
        isGuest: false
    };

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();

    // Firestore 專用極輕量憑證 (< 2KB)：絕不寫入 appData，杜絕 nested arrays / 1MB 限制或寫入超時
    const firestorePayload = {
        type: 'v3_auto_login_handoff',
        status: 'authorized',
        createdAt: nowIso,
        expiresAt: expiresIso,
        accountLabel: String(accountLabel || cleanUserObj.displayName || cleanUserObj.email || ''),
        userObj: cleanUserObj,
        authProvider: String(authProvider),
        authSessionStr: cachedAuthSessionStr || null
    };

    // postMessage 專用記憶體封包（同瀏覽器跨分頁 0 延遲直傳，可安全附帶序列化後的 appDataStr）
    let appDataStr = null;
    try {
        if (state.appData && Array.isArray(state.appData.classes) && state.appData.classes.length > 0) {
            const raw = safeStringify(state.appData);
            if (raw && raw.length <= 450000) {
                appDataStr = raw;
            }
        }
    } catch (e) {}

    const pmPayload = {
        ...firestorePayload,
        appDataStr
    };

    return { firestorePayload, pmPayload };
}

function ensureNoticeBannerElement(forceRebuild = false) {
    let container = document.getElementById('palclass-new-version-notice');
    if (container) {
        const hasAccountBadge = Boolean(document.getElementById('palclass-notice-account-badge'));
        const isCurrentVersion = container.dataset?.noticeVersion === NOTICE_DOM_VERSION;
        if (!forceRebuild && hasAccountBadge && isCurrentVersion) {
            return container;
        }
        container.remove();
    }

    container = document.createElement('aside');
    container.id = 'palclass-new-version-notice';
    container.dataset.noticeVersion = NOTICE_DOM_VERSION;
    container.setAttribute('aria-label', 'PalClass 新版本通知');
    container.className = 'fixed bottom-4 right-4 z-[95] select-none flex flex-col items-end pointer-events-none max-w-[calc(100vw-2rem)]';
    container.style.cssText = 'position:fixed;right:1rem;bottom:1rem;z-index:95;max-width:calc(100vw - 2rem);display:flex;flex-direction:column;align-items:flex-end;pointer-events:none;';
    container.innerHTML = `
        <div id="palclass-notice-card" style="pointer-events:auto;background:linear-gradient(145deg,rgba(255,255,255,0.96) 0%,rgba(246,249,255,0.94) 100%);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);color:#0f172a;" class="pointer-events-auto w-[calc(100vw-2rem)] sm:w-[360px] max-w-[360px] rounded-2xl bg-white/95 backdrop-blur-xl border-2 border-indigo-500/80 shadow-2xl p-4 text-slate-900">
            <div class="flex items-start justify-between gap-2.5">
                <div class="flex items-start gap-2.5 min-w-0">
                    <span class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm shrink-0 shadow-sm">
                        <i class="fa-solid fa-rocket" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">新版上線通知</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">雙版本自動同步</span>
                        </div>
                        <h4 class="text-sm font-black text-slate-900 mt-1 leading-snug">新版 PalClass 已正式上線</h4>
                    </div>
                </div>
                <button type="button" id="palclass-notice-collapse-btn" class="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0" title="收合通知" aria-label="收合新版通知">
                    <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true"></i>
                    <span>收合</span>
                </button>
            </div>
            <p class="text-xs text-slate-600 font-medium leading-relaxed mt-2">
                切換至新版 <span class="font-bold text-slate-800">PalClass</span> 後，您的全部班級、作業、聯絡簿與成績將自動即時雙向同步，還可改用更直覺的個人專屬連結！
            </p>
            <div id="palclass-notice-account-badge" class="hidden mt-2.5 px-2.5 py-1.5 rounded-xl bg-indigo-50/90 border border-indigo-200/80 text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                <i class="fa-solid fa-user-check text-indigo-600 shrink-0" aria-hidden="true"></i>
                <span id="palclass-notice-account-text" class="truncate"></span>
            </div>
            <div class="mt-3 flex flex-col gap-2">
                <button type="button" id="palclass-notice-launch-btn" class="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95">
                    <i class="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true"></i>
                    <span id="palclass-notice-launch-label">前往新版 PalClass</span>
                </button>
                <label for="palclass-notice-always-collapse" class="flex items-center gap-2 text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer select-none px-0.5">
                    <input type="checkbox" id="palclass-notice-always-collapse" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer">
                    <span>一律收合（下次進入自動收合為快捷提示）</span>
                </label>
            </div>
        </div>

        <button type="button" id="palclass-notice-pill-btn" style="pointer-events:auto;background:linear-gradient(145deg,rgba(255,255,255,0.96) 0%,rgba(246,249,255,0.94) 100%);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);color:#0f172a;" class="hidden pointer-events-auto px-3.5 py-2 rounded-full bg-white/95 hover:bg-indigo-50 text-slate-900 hover:text-indigo-900 border border-indigo-300 shadow-lg backdrop-blur-md flex items-center gap-2 text-xs font-black transition-all active:scale-95 cursor-pointer max-w-full" title="展開新版 PalClass 通知" aria-label="展開新版 PalClass 通知">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <i class="fa-solid fa-rocket text-indigo-600 shrink-0" aria-hidden="true"></i>
            <span class="truncate">新版 PalClass 已上線</span>
            <i class="fa-solid fa-chevron-up text-[10px] text-slate-500 shrink-0" aria-hidden="true"></i>
        </button>
    `;
    document.body.appendChild(container);

    const collapseBtn = document.getElementById('palclass-notice-collapse-btn');
    const pillBtn = document.getElementById('palclass-notice-pill-btn');
    const chkAlwaysCollapse = document.getElementById('palclass-notice-always-collapse');
    const launchBtn = document.getElementById('palclass-notice-launch-btn');

    collapseBtn?.addEventListener('click', () => {
        userSessionExpandedOverride = false;
        applyExpandedState(false);
    });

    pillBtn?.addEventListener('click', () => {
        userSessionExpandedOverride = true;
        applyExpandedState(true);
    });

    chkAlwaysCollapse?.addEventListener('change', () => {
        const checked = Boolean(chkAlwaysCollapse.checked);
        writeAlwaysCollapsePref(checked);
        if (checked) {
            userSessionExpandedOverride = false;
            applyExpandedState(false);
        }
    });

    ensureHandoffMessageListener();

    launchBtn?.addEventListener('click', () => {
        if (!launchBtn) return;
        const { user: signedInUser, isSignedIn } = getSignedInStateSnapshot();
        const accountLabel = getActiveAccountDisplay();
        const baseUrl = getPalClassBaseUrl();

        if (!isSignedIn || !signedInUser) {
            window.open(`${baseUrl}?from=v3#portal`, '_blank', 'noopener');
            return;
        }

        // 1. 0 毫秒同步準備雙軌憑證（絕不開 about:blank，杜絕背景分頁節流或 IndexedDB 卡死空白頁）
        const handoffId = `v3_handoff_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        const { firestorePayload, pmPayload } = buildHandoffPayloads(signedInUser, accountLabel);

        const pendingMap = getPendingHandoffMap();
        pendingMap.set(handoffId, {
            firestorePayload,
            pmPayload,
            createdAtMs: Date.now()
        });
        ensureHandoffMessageListener();

        // 2. 立即同步直開新版 PalClass 正式網址（保留 window.opener 供 postMessage 毫秒握手）
        const targetUrl = `${baseUrl}?from=v3&v3_handoff=${encodeURIComponent(handoffId)}&v3_pm=1#portal`;
        let openedWin = null;
        try {
            openedWin = window.open(targetUrl, '_blank');
        } catch (e) {}

        // 3. 背景並行：寫入 2KB 極輕量 Firestore 憑證（供無 opener 環境備援）＋ 同步班級資料至雲端
        (async () => {
            try {
                if (!firestorePayload.authSessionStr) {
                    const rec = await getV3FirebaseAuthSessionRecord(450);
                    if (rec) {
                        const recStr = JSON.stringify(rec);
                        cachedAuthSessionStr = recStr;
                        firestorePayload.authSessionStr = recStr;
                        pmPayload.authSessionStr = recStr;
                    }
                }
            } catch (e) {}

            // 備援軌道：寫入極輕量 Firestore 憑證（不含 appData，與 syncDataToCloud 並行互不阻塞）
            const writeHandoffPromise = (async () => {
                if (!fbDb) return;
                try {
                    await setDoc(
                        doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', handoffId),
                        firestorePayload
                    );
                } catch (err) {
                    console.warn('Write lightweight v3 handoff doc notice:', err);
                }
            })();

            // 同時在背景把最新本機班級資料推送到雙版本共用雲端通道
            const syncClassDataPromise = (async () => {
                try {
                    await flushPendingSave();
                    await syncDataToCloud();
                } catch (err) {}
            })();

            // 若 Popup 被瀏覽器完全攔截，等待極輕量憑證寫入（最多 1.2s）後於當前分頁直達新版
            if (!openedWin) {
                try {
                    await Promise.race([
                        writeHandoffPromise,
                        new Promise(resolve => setTimeout(resolve, 1200))
                    ]);
                } catch (e) {}
                window.location.href = targetUrl;
            } else {
                await Promise.allSettled([writeHandoffPromise, syncClassDataPromise]);
            }
        })();
    });

    const alwaysCollapsed = readAlwaysCollapsePref();
    syncCheckboxWithPref();
    applyExpandedState(userSessionExpandedOverride !== null ? userSessionExpandedOverride : !alwaysCollapsed);

    return container;
}

export function refreshNewVersionNotice(forceRebuild = false) {
    try {
        const container = ensureNoticeBannerElement(Boolean(forceRebuild));
        container.classList.remove('hidden');
        syncCheckboxWithPref();

        const accountLabel = getActiveAccountDisplay();
        lastRenderedAccountLabel = accountLabel;
        if (accountLabel) {
            prefetchV3AuthSession();
        } else {
            cachedAuthSessionStr = null;
        }

        const badgeEl = document.getElementById('palclass-notice-account-badge');
        const badgeTextEl = document.getElementById('palclass-notice-account-text');
        const launchLabelEl = document.getElementById('palclass-notice-launch-label');
        if (badgeEl && badgeTextEl) {
            if (accountLabel) {
                badgeTextEl.textContent = `將自動使用「${accountLabel}」登入新版並同步所有班級資料`;
                badgeEl.classList.remove('hidden');
            } else {
                badgeTextEl.textContent = '';
                badgeEl.classList.add('hidden');
            }
        }
        if (launchLabelEl) {
            launchLabelEl.textContent = accountLabel
                ? `前往新版（以 ${accountLabel} 自動登入）`
                : '前往新版 PalClass';
        }

        const shouldExpand = userSessionExpandedOverride !== null
            ? userSessionExpandedOverride
            : !readAlwaysCollapsePref();
        applyExpandedState(shouldExpand);
        return true;
    } catch (e) {
        return false;
    }
}

export function initNewVersionNotice(options = {}) {
    const forceRebuild = Boolean(options && options.forceRebuild);
    ensureHandoffMessageListener();
    refreshNewVersionNotice(forceRebuild);
    if (typeof window !== 'undefined') {
        window.__refreshV3NewVersionNotice = refreshNewVersionNotice;
        if (!window.__v3NoticeStorageBound) {
            window.__v3NoticeStorageBound = true;
            window.addEventListener('storage', (ev) => {
                if (!ev || ev.key === ALWAYS_COLLAPSE_KEY) {
                    userSessionExpandedOverride = null;
                }
                refreshNewVersionNotice();
            });
        }
        if (window.__v3NoticeWatchTimer) {
            try { clearInterval(window.__v3NoticeWatchTimer); } catch (e) {}
        }
        window.__v3NoticeWatchTimer = setInterval(() => {
            try {
                const curLabel = getActiveAccountDisplay();
                const el = document.getElementById('palclass-new-version-notice');
                if (!el || curLabel !== lastRenderedAccountLabel) {
                    refreshNewVersionNotice();
                }
            } catch (e) {}
        }, 1000);
    }
}
