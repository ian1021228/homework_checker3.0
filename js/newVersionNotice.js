/**
 * PalClass 新版本通知與雙版本同帳號自動同步引導 (homework_checker3.0)
 * 全用戶永久顯示，無法關閉，僅能收合為右下角快捷提示並可勾選「一律收合」。
 */

import { state } from './state.js';
import { fbAuth, fbDb, globalAppId, doc, setDoc, syncDataToCloud } from './firebase.js';
import { flushPendingSave } from './storage.js';
import { safeClone } from './utils.js';

const NEW_VERSION_URL = 'https://palclass.pages.dev/?from=v3#portal';
const ALWAYS_COLLAPSE_KEY = 'hw3_palclass_notice_always_collapse_v1';
const NOTICE_DOM_VERSION = '4.3.1';

let userSessionExpandedOverride = null;
let lastRenderedAccountLabel = '';

const stripSubAddressAlias = (raw) => String(raw || '').trim().replace(/\+acc[a-z0-9_]+(?=@)/i, '');

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

function getV3FirebaseAuthSessionRecord() {
    return new Promise((resolve) => {
        try {
            if (typeof indexedDB === 'undefined') {
                resolve(null);
                return;
            }
            const req = indexedDB.open('firebaseLocalStorageDb');
            req.onsuccess = () => {
                try {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
                        resolve(null);
                        return;
                    }
                    const tx = db.transaction(['firebaseLocalStorage'], 'readonly');
                    const store = tx.objectStore('firebaseLocalStorage');
                    const getAllReq = store.getAll();
                    getAllReq.onsuccess = () => {
                        const list = Array.isArray(getAllReq.result) ? getAllReq.result : [];
                        const rec = list.find(item => item && typeof item.fbase_key === 'string' && item.fbase_key.startsWith('firebase:authUser:'));
                        resolve(rec || null);
                    };
                    getAllReq.onerror = () => resolve(null);
                } catch (err) {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
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

    launchBtn?.addEventListener('click', async () => {
        if (!launchBtn) return;
        const { user: signedInUser, isSignedIn } = getSignedInStateSnapshot();
        const accountLabel = getActiveAccountDisplay();
        const canHandoff = Boolean(isSignedIn && signedInUser);

        let targetWin = null;
        if (canHandoff && fbDb) {
            try {
                targetWin = window.open('about:blank', '_blank');
                if (targetWin && targetWin.document) {
                    targetWin.document.title = '正在同步並自動登入新版 PalClass...';
                    targetWin.document.body.innerHTML = '<div style="font-family:system-ui,-apple-system,sans-serif;padding:48px 20px;text-align:center;color:#0f172a;"><h2 style="margin:0 0 8px;">正在同步資料並前往新版 PalClass...</h2><p style="margin:0;color:#64748b;font-size:14px;">即將自動為您登入帳號並同步所有班級資料，請稍候。</p></div>';
                }
            } catch (e) {}
        }

        let targetUrl = NEW_VERSION_URL;
        if (canHandoff) {
            launchBtn.disabled = true;
            launchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[11px]" aria-hidden="true"></i><span>正在同步並準備自動登入...</span>';
            try {
                await Promise.race([
                    (async () => {
                        await flushPendingSave();
                        await syncDataToCloud();
                    })(),
                    new Promise(resolve => setTimeout(resolve, 3500))
                ]);
            } catch (e) {}

            if (fbDb) {
                try {
                    const handoffId = `v3_handoff_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
                    let authSessionStr = null;
                    try {
                        const sessRec = await getV3FirebaseAuthSessionRecord();
                        if (sessRec) authSessionStr = JSON.stringify(sessRec);
                    } catch (e) {}

                    const activeUser = state.currentUser || signedInUser || {};
                    const authProvider = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_provider')) || (activeUser.isGoogleAuth ? 'google' : 'password');
                    const cleanUserObj = {
                        uid: activeUser.uid || activeUser.id || fbAuth?.currentUser?.uid || '',
                        id: activeUser.id || activeUser.uid || fbAuth?.currentUser?.uid || '',
                        username: activeUser.username || '',
                        email: stripSubAddressAlias(activeUser.email || fbAuth?.currentUser?.email || ''),
                        authEmail: stripSubAddressAlias(activeUser.authEmail || activeUser.email || fbAuth?.currentUser?.email || ''),
                        displayName: activeUser.displayName || activeUser.name || accountLabel || fbAuth?.currentUser?.displayName || '使用者',
                        photoURL: activeUser.photoURL || fbAuth?.currentUser?.photoURL || '',
                        isAdmin: !!activeUser.isAdmin,
                        isGoogleAuth: !!activeUser.isGoogleAuth || authProvider === 'google',
                        emailVerified: true,
                        isGuest: false
                    };
                    let sanitizedAppData = null;
                    try {
                        if (state.appData) sanitizedAppData = safeClone(state.appData);
                    } catch (e) {}

                    const handoffPayload = {
                        type: 'v3_auto_login_handoff',
                        status: 'authorized',
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
                        accountLabel: accountLabel || cleanUserObj.displayName || cleanUserObj.email,
                        userObj: cleanUserObj,
                        authProvider: String(authProvider),
                        authSessionStr: authSessionStr || null,
                        appData: sanitizedAppData
                    };
                    try {
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem('palclass_v3_handoff_local_' + handoffId, JSON.stringify(handoffPayload));
                        }
                    } catch (e) {}
                    await Promise.race([
                        setDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', handoffId), handoffPayload),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('handoff_timeout')), 3000))
                    ]);
                    targetUrl = `https://palclass.pages.dev/?from=v3&v3_handoff=${encodeURIComponent(handoffId)}#portal`;
                } catch (e) {
                    console.warn('Write v3 handoff doc fallback:', e);
                    targetUrl = NEW_VERSION_URL;
                }
            }
        }

        if (targetWin && !targetWin.closed) {
            try {
                targetWin.location.href = targetUrl;
            } catch (e) {
                window.open(targetUrl, '_blank', 'noopener');
            }
        } else {
            window.open(targetUrl, '_blank', 'noopener');
        }

        if (canHandoff) {
            launchBtn.disabled = false;
            const restoredLabel = accountLabel ? `前往新版（以 ${accountLabel} 自動登入）` : '前往新版 PalClass';
            launchBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true"></i><span id="palclass-notice-launch-label"></span>';
            const lbl = document.getElementById('palclass-notice-launch-label');
            if (lbl) lbl.textContent = restoredLabel;
        }
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
