/**
 * PalClass 新版本通知與雙版本同帳號自動同步引導 (homework_checker3.0)
 * 全用戶永久顯示，無法關閉，僅能收合為右下角快捷提示並可勾選「一律收合」。
 */

import { state } from './state.js';
import { fbAuth, syncDataToCloud } from './firebase.js';
import { flushPendingSave } from './storage.js';

const NEW_VERSION_URL = 'https://palclass.pages.dev/?from=v3#portal';
const ALWAYS_COLLAPSE_KEY = 'hw3_palclass_notice_always_collapse_v1';

let userSessionExpandedOverride = null;

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
        pill.classList.add('hidden');
    } else {
        card.classList.add('hidden');
        pill.classList.remove('hidden');
    }
}

function syncCheckboxWithPref() {
    const chk = document.getElementById('palclass-notice-always-collapse');
    if (chk) {
        chk.checked = readAlwaysCollapsePref();
    }
}

function ensureNoticeBannerElement() {
    let container = document.getElementById('palclass-new-version-notice');
    if (container) return container;

    container = document.createElement('aside');
    container.id = 'palclass-new-version-notice';
    container.setAttribute('aria-label', 'PalClass 新版本通知');
    container.className = 'fixed bottom-4 right-4 z-[95] select-none flex flex-col items-end pointer-events-none max-w-[calc(100vw-2rem)]';
    container.innerHTML = `
        <div id="palclass-notice-card" class="pointer-events-auto w-[calc(100vw-2rem)] sm:w-[360px] max-w-[360px] rounded-2xl bg-white/95 backdrop-blur-xl border-2 border-indigo-500/80 shadow-2xl p-4 text-slate-800">
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
                只要於新版 <span class="font-bold text-slate-800">PalClass</span> 使用<b>同一個帳號登入</b>，您的全部班級、作業、聯絡簿與成績將自動即時雙向同步，還可改用更直覺的個人專屬連結！
            </p>
            <div class="mt-3 flex flex-col gap-2">
                <button type="button" id="palclass-notice-launch-btn" class="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95">
                    <i class="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true"></i>
                    <span>前往新版 PalClass</span>
                </button>
                <label for="palclass-notice-always-collapse" class="flex items-center gap-2 text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer select-none px-0.5">
                    <input type="checkbox" id="palclass-notice-always-collapse" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer">
                    <span>一律收合（下次進入自動收合為快捷提示）</span>
                </label>
            </div>
        </div>

        <button type="button" id="palclass-notice-pill-btn" class="hidden pointer-events-auto px-3.5 py-2 rounded-full bg-white/95 hover:bg-indigo-50 text-slate-800 hover:text-indigo-900 border border-indigo-300 shadow-lg backdrop-blur-md flex items-center gap-2 text-xs font-black transition-all active:scale-95 cursor-pointer max-w-full" title="展開新版 PalClass 通知" aria-label="展開新版 PalClass 通知">
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
        const hasSignedInAccount = Boolean(
            (fbAuth?.currentUser || state.currentUser) &&
            !state.currentUser?.isGuest &&
            !(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('app_is_guest_mode') === 'true')
        );
        if (hasSignedInAccount) {
            launchBtn.disabled = true;
            launchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[11px]" aria-hidden="true"></i><span>正在同步最新資料...</span>';
            try {
                await Promise.race([
                    (async () => {
                        await flushPendingSave();
                        await syncDataToCloud();
                    })(),
                    new Promise(resolve => setTimeout(resolve, 3500))
                ]);
            } catch (e) {}
        }
        window.open(NEW_VERSION_URL, '_blank', 'noopener');
        if (hasSignedInAccount) {
            launchBtn.disabled = false;
            launchBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true"></i><span>前往新版 PalClass</span>';
        }
    });

    const alwaysCollapsed = readAlwaysCollapsePref();
    syncCheckboxWithPref();
    applyExpandedState(userSessionExpandedOverride !== null ? userSessionExpandedOverride : !alwaysCollapsed);

    return container;
}

export function refreshNewVersionNotice() {
    try {
        const container = ensureNoticeBannerElement();
        container.classList.remove('hidden');
        syncCheckboxWithPref();
        const shouldExpand = userSessionExpandedOverride !== null
            ? userSessionExpandedOverride
            : !readAlwaysCollapsePref();
        applyExpandedState(shouldExpand);
        return true;
    } catch (e) {
        return false;
    }
}

export function initNewVersionNotice() {
    refreshNewVersionNotice();
    if (typeof window !== 'undefined') {
        window.__refreshV3NewVersionNotice = refreshNewVersionNotice;
        window.addEventListener('storage', (ev) => {
            if (!ev || ev.key === ALWAYS_COLLAPSE_KEY) {
                userSessionExpandedOverride = null;
            }
            refreshNewVersionNotice();
        });
    }
}
