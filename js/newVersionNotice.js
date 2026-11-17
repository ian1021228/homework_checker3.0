/**
 * PalClass 新版本通知與雙版本同帳號自動同步引導 (homework_checker3.0)
 * 目前測試階段：僅對特定測試帳號 (ianw.solar@gmail.com) 顯示，確認無誤後即可開放全體使用者。
 */

import { state } from './state.js';
import { fbAuth, syncDataToCloud } from './firebase.js';
import { flushPendingSave } from './storage.js';

// 僅對此白名單帳號顯示新版本通知（測試無誤後改為 ALLOW_ALL = true 或移除白名單限制）
const ALLOW_ALL_USERS = false;
const ALLOWED_PREVIEW_EMAILS = ['ianw.solar@gmail.com'];
const NEW_VERSION_URL = 'https://palclass.pages.dev/?from=v3#portal';
const DISMISS_SESSION_KEY = 'hw3_dismiss_palclass_notice_v64';

function getActiveUserEmail() {
    const candidates = [
        fbAuth?.currentUser?.email,
        state.currentUser?.email,
        state.currentUser?.authEmail
    ];
    for (const raw of candidates) {
        const clean = String(raw || '').trim().toLowerCase();
        if (clean) return clean;
    }
    return '';
}

export function isEligibleForNewVersionNotice() {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('app_is_guest_mode') === 'true') {
        return false;
    }
    if (state.adminViewModeUserId || state.currentUser?.isGuest) {
        return false;
    }
    if (!fbAuth?.currentUser && !state.currentUser) {
        return false;
    }
    if (ALLOW_ALL_USERS) return true;
    const email = getActiveUserEmail();
    return Boolean(email && ALLOWED_PREVIEW_EMAILS.includes(email));
}

function ensureNoticeBannerElement() {
    let banner = document.getElementById('palclass-new-version-notice');
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = 'palclass-new-version-notice';
    banner.className = 'fixed bottom-4 right-4 z-[95] max-w-sm w-[calc(100vw-2rem)] hidden transition-all duration-300';
    banner.innerHTML = `
        <div class="rounded-2xl bg-white/95 backdrop-blur-xl border-2 border-indigo-500/80 shadow-2xl p-4 text-slate-800">
            <div class="flex items-start justify-between gap-2.5">
                <div class="flex items-start gap-2.5 min-w-0">
                    <span class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm shrink-0 shadow-sm">
                        <i class="fa-solid fa-rocket" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">新版上線預告</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">雙版本自動同步</span>
                        </div>
                        <h4 class="text-sm font-black text-slate-900 mt-1 leading-snug">新版 PalClass 已準備就緒</h4>
                    </div>
                </div>
                <button type="button" id="palclass-notice-close-btn" class="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0" title="暫時隱藏通知" aria-label="暫時隱藏新版通知">
                    <i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i>
                </button>
            </div>
            <p class="text-xs text-slate-600 font-medium leading-relaxed mt-2">
                只要於新版 <span class="font-bold text-slate-800">PalClass</span> 使用<b>同一個帳號登入</b>，您的全部班級、作業、聯絡簿與成績將自動即時雙向同步，還可改用更直覺的個人專屬連結！
            </p>
            <div class="mt-3 flex items-center gap-2">
                <button type="button" id="palclass-notice-launch-btn" class="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95">
                    <i class="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true"></i>
                    <span>前往新版 PalClass</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('palclass-notice-close-btn')?.addEventListener('click', () => {
        try { sessionStorage.setItem(DISMISS_SESSION_KEY, '1'); } catch (e) {}
        banner.classList.add('hidden');
    });

    document.getElementById('palclass-notice-launch-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('palclass-notice-launch-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[11px]" aria-hidden="true"></i><span>正在同步最新資料...</span>';
        }
        try {
            await Promise.race([
                (async () => {
                    await flushPendingSave();
                    await syncDataToCloud();
                })(),
                new Promise(resolve => setTimeout(resolve, 3500))
            ]);
        } catch (e) {}
        window.open(NEW_VERSION_URL, '_blank', 'noopener');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true"></i><span>前往新版 PalClass</span>';
        }
    });

    return banner;
}

export function refreshNewVersionNotice() {
    try {
        const existing = document.getElementById('palclass-new-version-notice');
        const dismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DISMISS_SESSION_KEY) === '1';
        if (!isEligibleForNewVersionNotice() || dismissed) {
            if (existing) existing.classList.add('hidden');
            return false;
        }
        const banner = ensureNoticeBannerElement();
        banner.classList.remove('hidden');
        return true;
    } catch (e) {
        return false;
    }
}

export function initNewVersionNotice() {
    refreshNewVersionNotice();
    if (typeof window !== 'undefined') {
        window.__refreshV3NewVersionNotice = refreshNewVersionNotice;
        window.addEventListener('storage', refreshNewVersionNotice);
    }
}
