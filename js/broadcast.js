import { fbDb, fbAuth, doc, setDoc, getDoc, updateDoc, onSnapshot, isGoogleAdmin } from './firebase.js';
import { globalAppId } from './constants.js';
import { state } from './state.js';
import { safeCopyToClipboard, showToast, formatDate } from './utils.js';

// HTML 安全轉義工具
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;');
}

// 取得當前使用者身分資訊
export function getCurrentUserIdentity() {
    const isGuest = sessionStorage.getItem('app_is_guest_mode') === 'true';
    if (!isGuest && (state.currentUser || fbAuth?.currentUser)) {
        const u = state.currentUser || fbAuth?.currentUser;
        return {
            id: u.uid || 'user_' + Date.now(),
            email: u.email || '',
            displayName: u.displayName || u.email?.split('@')[0] || '使用者',
            isGuest: false,
            isAdmin: isGoogleAdmin(u)
        };
    }
    const visitorId = localStorage.getItem('visitor_id') || 'guest_' + Math.random().toString(36).slice(2, 7);
    const visitorName = localStorage.getItem('visitor_name') || '訪客老師';
    return {
        id: visitorId,
        email: '',
        displayName: `訪客 (${visitorName})`,
        isGuest: true,
        isAdmin: false
    };
}

// 初始化廣播小鈴鐺系統
export function initBroadcastBell() {
    const bellBtn = document.getElementById('broadcast-bell-btn');
    const panel = document.getElementById('broadcast-panel');
    const closeBtn = document.getElementById('broadcast-panel-close-btn');
    const refreshBtn = document.getElementById('broadcast-refresh-btn');
    const noticesTab = document.getElementById('broadcast-tab-notices');
    const repliesTab = document.getElementById('broadcast-tab-replies');
    const publishTab = document.getElementById('broadcast-tab-publish');

    if (!bellBtn || !panel) return;

    // 點擊鈴鐺切換開關
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBroadcastPanel();
    });

    // 關閉按鈕
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBroadcastPanel(false);
        });
    }

    // 重新整理
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            refreshBtn.classList.add('animate-spin');
            setTimeout(() => refreshBtn.classList.remove('animate-spin'), 600);
            renderBroadcastPanel();
            showToast("已重新同步廣播資訊", "info");
        });
    }

    // 點擊外部自動收合
    document.addEventListener('click', (e) => {
        if (!state.isBellOpen) return;
        const container = document.getElementById('broadcast-bell-container');
        if (container && !container.contains(e.target)) {
            toggleBroadcastPanel(false);
        }
    });

    // 阻止面板內部點擊冒泡導致關閉
    panel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 頁籤切換
    if (noticesTab) {
        noticesTab.addEventListener('click', () => {
            state.activeBellTab = 'notices';
            updateTabsUI();
            renderBroadcastPanel();
        });
    }
    if (repliesTab) {
        repliesTab.addEventListener('click', () => {
            state.activeBellTab = 'replies';
            updateTabsUI();
            renderBroadcastPanel();
        });
    }
    if (publishTab) {
        publishTab.addEventListener('click', () => {
            state.activeBellTab = 'publish';
            updateTabsUI();
            renderBroadcastPanel();
        });
    }

    // 開始監聽 Firestore 廣播與回覆即時變動
    listenToBroadcastsAndReplies();
}

// 切換小鈴鐺展開/收合
export function toggleBroadcastPanel(forceOpen) {
    const panel = document.getElementById('broadcast-panel');
    const bellIcon = document.getElementById('broadcast-bell-icon');
    if (!panel) return;

    const willOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.isBellOpen;
    state.isBellOpen = willOpen;

    if (willOpen) {
        panel.classList.remove('hidden');
        requestAnimationFrame(() => {
            panel.classList.remove('scale-95', 'opacity-0');
            panel.classList.add('scale-100', 'opacity-100');
        });
        if (bellIcon) bellIcon.classList.add('text-amber-200');
        
        // 開啟時檢查管理員身分並更新頁籤
        const currentUser = getCurrentUserIdentity();
        const publishTab = document.getElementById('broadcast-tab-publish');
        const adminBadge = document.getElementById('broadcast-admin-badge');
        const repliesLabel = document.getElementById('broadcast-tab-replies-label');

        if (currentUser.isAdmin) {
            if (publishTab) publishTab.classList.remove('hidden');
            if (adminBadge) adminBadge.classList.remove('hidden');
            if (repliesLabel) repliesLabel.textContent = '💬 使用者回覆';
        } else {
            if (publishTab) publishTab.classList.add('hidden');
            if (adminBadge) adminBadge.classList.add('hidden');
            if (repliesLabel) repliesLabel.textContent = '💬 我的回覆';
        }

        // 記錄最後檢視時間，消除未讀紅點
        localStorage.setItem('last_read_broadcast_time', new Date().toISOString());
        updateBellBadge();
        updateTabsUI();
        renderBroadcastPanel();
    } else {
        panel.classList.add('scale-95', 'opacity-0');
        panel.classList.remove('scale-100', 'opacity-100');
        setTimeout(() => {
            if (!state.isBellOpen) panel.classList.add('hidden');
        }, 200);
        if (bellIcon) bellIcon.classList.remove('text-amber-200');
    }
}

// 更新頁籤外觀
function updateTabsUI() {
    const noticesTab = document.getElementById('broadcast-tab-notices');
    const repliesTab = document.getElementById('broadcast-tab-replies');
    const publishTab = document.getElementById('broadcast-tab-publish');

    const activeClasses = "bg-white text-stone-800 shadow-xs border border-stone-200/80 font-black";
    const inactiveClasses = "text-stone-500 hover:text-stone-800 hover:bg-stone-100/80 font-bold border-transparent";

    [noticesTab, repliesTab, publishTab].forEach(t => {
        if (!t) return;
        t.className = t.className.replace(activeClasses, '').replace(inactiveClasses, '');
    });

    if (state.activeBellTab === 'notices' && noticesTab) {
        noticesTab.className = "flex-1 py-1.5 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 " + activeClasses + " cursor-pointer";
    } else if (noticesTab) {
        noticesTab.className = "flex-1 py-1.5 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 " + inactiveClasses + " cursor-pointer";
    }

    if (state.activeBellTab === 'replies' && repliesTab) {
        repliesTab.className = "flex-1 py-1.5 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 " + activeClasses + " cursor-pointer";
    } else if (repliesTab) {
        repliesTab.className = "flex-1 py-1.5 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 " + inactiveClasses + " cursor-pointer";
    }

    if (state.activeBellTab === 'publish' && publishTab) {
        publishTab.className = "py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1 " + activeClasses + " cursor-pointer";
    } else if (publishTab) {
        publishTab.className = "py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1 " + inactiveClasses + " cursor-pointer";
    }
}

// 監聽雲端廣播與回覆
export function listenToBroadcastsAndReplies() {
    if (!fbDb) {
        console.warn("fbDb 尚未就緒，使用本地廣播暫存模式");
        loadLocalBroadcastFallback();
        return;
    }

    // 1. 監聽全體系統廣播文檔
    const broadcastRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'systemBroadcasts', 'main');
    if (state.unsubBroadcasts) state.unsubBroadcasts();
    state.unsubBroadcasts = onSnapshot(broadcastRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const list = [];
            if (data.current && data.current.message && data.active !== false) {
                list.push({
                    id: data.current.id || 'current_bcast',
                    message: data.current.message,
                    author: data.current.authorName || data.current.author || '系統管理員',
                    createdAt: data.current.createdAt || new Date().toISOString(),
                    isGlobal: true
                });
            }
            if (Array.isArray(data.history)) {
                data.history.forEach(item => {
                    if (item && item.message && (!data.current || item.id !== data.current.id)) {
                        list.push({
                            id: item.id || 'hist_' + Math.random(),
                            message: item.message,
                            author: item.authorName || item.author || '系統管理員',
                            createdAt: item.createdAt || new Date().toISOString(),
                            isGlobal: true
                        });
                    }
                });
            }
            state.broadcasts = list;
            localStorage.setItem('cached_system_broadcasts', JSON.stringify(list));
        } else {
            // 文檔不存在時，建立預設示範公告
            const defaultBroadcast = {
                id: 'init_welcome_bcast',
                message: '歡迎使用作業檢查點收系統！有任何問題或意見，請點選下方「回覆廣播」，系統管理員將會第一時間在小鈴鐺收到並協助處理。',
                author: '系統管理員',
                createdAt: new Date().toISOString(),
                isGlobal: true
            };
            state.broadcasts = [defaultBroadcast];
        }
        updateBellBadge();
        if (state.isBellOpen) renderBroadcastPanel();
    }, (err) => {
        console.warn("Broadcast snapshot notice:", err?.message || err);
        loadLocalBroadcastFallback();
    });

    // 2. 監聽回覆文檔 feed
    const repliesRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'systemBroadcasts', 'repliesFeed');
    if (state.unsubReplies) state.unsubReplies();
    state.unsubReplies = onSnapshot(repliesRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.broadcastReplies = Array.isArray(data.replies) ? data.replies : [];
            localStorage.setItem('cached_broadcast_replies', JSON.stringify(state.broadcastReplies));
        } else {
            state.broadcastReplies = [];
        }
        updateBellBadge();
        if (state.isBellOpen) renderBroadcastPanel();
    }, (err) => {
        console.warn("Replies snapshot notice:", err?.message || err);
        const cached = localStorage.getItem('cached_broadcast_replies');
        if (cached) {
            try { state.broadcastReplies = JSON.parse(cached); } catch(e) {}
        }
        updateBellBadge();
        if (state.isBellOpen) renderBroadcastPanel();
    });
}

function loadLocalBroadcastFallback() {
    const cachedBcasts = localStorage.getItem('cached_system_broadcasts');
    if (cachedBcasts) {
        try { state.broadcasts = JSON.parse(cachedBcasts); } catch(e) {}
    } else {
        state.broadcasts = [{
            id: 'local_welcome',
            message: '歡迎使用作業檢查點收系統！此處可即時查閱系統公告，點擊「回覆廣播」即可與管理員聯繫。',
            author: '系統管理員',
            createdAt: new Date().toISOString(),
            isGlobal: true
        }];
    }
    const cachedReplies = localStorage.getItem('cached_broadcast_replies');
    if (cachedReplies) {
        try { state.broadcastReplies = JSON.parse(cachedReplies); } catch(e) {}
    }
    updateBellBadge();
    if (state.isBellOpen) renderBroadcastPanel();
}

// 計算未讀與更新鈴鐺 Badge
export function updateBellBadge() {
    const bellBadge = document.getElementById('broadcast-bell-badge');
    const noticesBadge = document.getElementById('broadcast-tab-notices-badge');
    const repliesBadge = document.getElementById('broadcast-tab-replies-badge');
    const bellBtn = document.getElementById('broadcast-bell-btn');
    if (!bellBadge) return;

    const user = getCurrentUserIdentity();
    let totalUnread = 0;
    let unreadReplies = 0;
    let unreadNotices = 0;

    // 計算未讀公告
    const lastReadTime = localStorage.getItem('last_read_broadcast_time') || '1970-01-01';
    const recentNotices = (state.broadcasts || []).filter(b => new Date(b.createdAt) > new Date(lastReadTime));
    unreadNotices = recentNotices.length;

    if (user.isAdmin) {
        // 管理者：顯示使用者未讀回覆數量
        const unreadList = (state.broadcastReplies || []).filter(r => !r.readByAdmin);
        unreadReplies = unreadList.length;
        totalUnread = unreadReplies;
    } else {
        // 一般使用者：顯示新廣播數量
        totalUnread = unreadNotices;
        const myReplies = (state.broadcastReplies || []).filter(r => r.userId === user.id);
        unreadReplies = myReplies.length;
    }

    // 更新外層鈴鐺按鈕徽章
    if (totalUnread > 0) {
        bellBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        bellBadge.classList.remove('hidden');
        if (bellBtn) bellBtn.classList.add('animate-bounce');
        setTimeout(() => { if (bellBtn) bellBtn.classList.remove('animate-bounce'); }, 1500);
    } else {
        bellBadge.classList.add('hidden');
    }

    // 更新頁籤內部徽章
    if (noticesBadge) {
        if (unreadNotices > 0) {
            noticesBadge.textContent = unreadNotices;
            noticesBadge.classList.remove('hidden');
        } else {
            noticesBadge.classList.add('hidden');
        }
    }
    if (repliesBadge) {
        if (unreadReplies > 0) {
            repliesBadge.textContent = unreadReplies;
            repliesBadge.classList.remove('hidden');
        } else {
            repliesBadge.classList.add('hidden');
        }
    }
}

// 格式化時間相對顯示
function formatTimeRelative(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return '剛剛';
        if (diffMin < 60) return `${diffMin} 分鐘前`;
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return `${diffHours} 小時前`;
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch(e) {
        return dateStr;
    }
}

// 渲染面板主內容
export function renderBroadcastPanel() {
    const body = document.getElementById('broadcast-panel-body');
    const identitySpan = document.getElementById('broadcast-footer-identity');
    if (!body) return;

    const user = getCurrentUserIdentity();
    if (identitySpan) {
        identitySpan.textContent = user.isAdmin ? `👑 管理者 (${user.email})` : `👤 ${user.displayName}`;
    }

    if (state.activeBellTab === 'notices') {
        renderNoticesView(body, user);
    } else if (state.activeBellTab === 'replies') {
        renderRepliesView(body, user);
    } else if (state.activeBellTab === 'publish' && user.isAdmin) {
        renderPublishView(body, user);
    } else {
        renderNoticesView(body, user);
    }
}

// 1. 渲染廣播公告列表
function renderNoticesView(container, user) {
    const allBroadcasts = [];

    // 若該使用者在資料庫中有被針對的個別橫幅，亦加入此處顯示
    if (state.personalBanner && state.personalBanner.message) {
        allBroadcasts.push({
            id: state.personalBanner.id || 'personal_banner',
            message: state.personalBanner.message,
            author: '系統管理員 (專屬指定)',
            createdAt: state.personalBanner.createdAt || new Date().toISOString(),
            isTargeted: true
        });
    }

    if (Array.isArray(state.broadcasts)) {
        state.broadcasts.forEach(b => {
            if (!allBroadcasts.some(existing => existing.id === b.id)) {
                allBroadcasts.push(b);
            }
        });
    }

    if (allBroadcasts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 px-4">
                <div class="text-4xl mb-3">📭</div>
                <h5 class="font-black text-stone-800 text-sm mb-1">目前尚無廣播通知</h5>
                <p class="text-xs text-stone-400 font-medium">系統發布最新消息或個別通知時，將自動在此呈現。</p>
            </div>
        `;
        return;
    }

    // 依時間排序 (最新在最前)
    allBroadcasts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let html = '';
    allBroadcasts.forEach(item => {
        const timeStr = formatTimeRelative(item.createdAt);
        const isTargeted = item.isTargeted;
        const cardBorder = isTargeted ? 'border-orange-300 bg-orange-50/30' : 'border-amber-100/90 bg-white';
        const tagClass = isTargeted ? 'bg-orange-500 text-white' : 'bg-amber-100 text-amber-900';
        const tagText = isTargeted ? '🎯 個人專屬通知' : '📢 系統全體廣播';

        html += `
            <div class="rounded-2xl border ${cardBorder} shadow-xs p-3.5 transition-all hover:border-amber-300">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[11px] ${tagClass} font-black px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-xs">
                            ${tagText}
                        </span>
                        <span class="text-[10px] text-stone-400 font-medium">${timeStr}</span>
                    </div>
                    <span class="text-[11px] text-stone-500 font-medium flex items-center gap-1">
                        <i class="fa-solid fa-shield-halved text-amber-500 text-[10px]"></i>
                        ${escapeHtml(item.author)}
                    </span>
                </div>

                <div class="bg-stone-50/90 rounded-xl p-3 text-stone-800 text-xs sm:text-sm font-medium leading-relaxed mb-3 whitespace-pre-wrap select-text border border-stone-200/60 shadow-inner">
                    ${escapeHtml(item.message)}
                </div>

                <div class="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                    <button class="broadcast-copy-btn text-xs font-bold text-stone-600 hover:text-amber-700 bg-stone-100 hover:bg-amber-50 active:scale-95 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer" data-text="${escapeAttr(item.message)}">
                        <i class="fa-regular fa-copy text-[11px]"></i>
                        <span>複製內容</span>
                    </button>
                    <button class="broadcast-toggle-reply-btn text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-100/80 hover:bg-amber-200/80 active:scale-95 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs" data-id="${item.id}">
                        <i class="fa-regular fa-comment-dots text-[11px]"></i>
                        <span>回覆廣播</span>
                    </button>
                </div>

                <!-- 折疊的回覆輸入表單 -->
                <div id="reply-form-${item.id}" class="hidden mt-3 pt-3 border-t border-amber-200/60">
                    <label class="block text-[11px] font-bold text-amber-900 mb-1">
                        💬 回覆此廣播給管理員：
                    </label>
                    <textarea id="reply-input-${item.id}" rows="2" class="w-full text-xs p-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none resize-none bg-stone-50/80" placeholder="請輸入您的回覆或疑問（管理者會收到此則回覆）..."></textarea>
                    <div class="flex justify-end items-center gap-2 mt-2">
                        <button class="broadcast-cancel-reply-btn text-xs text-stone-500 hover:text-stone-700 px-2.5 py-1 rounded-lg cursor-pointer" data-id="${item.id}">
                            取消
                        </button>
                        <button class="broadcast-submit-reply-btn text-xs bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold px-3.5 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer" data-id="${item.id}" data-preview="${escapeAttr(item.message.slice(0, 40))}">
                            <span>送出回覆</span>
                            <i class="fa-solid fa-paper-plane text-[10px]"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // 綁定複製內容按鈕
    container.querySelectorAll('.broadcast-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const text = btn.getAttribute('data-text');
            if (text) {
                const ok = await safeCopyToClipboard(text, "已複製廣播內容至剪貼簿！");
                if (ok) {
                    btn.innerHTML = `<i class="fa-solid fa-check text-emerald-600 text-[11px]"></i><span class="text-emerald-700">已複製！</span>`;
                    setTimeout(() => {
                        btn.innerHTML = `<i class="fa-regular fa-copy text-[11px]"></i><span>複製內容</span>`;
                    }, 1800);
                }
            }
        });
    });

    // 綁定展開回覆按鈕
    container.querySelectorAll('.broadcast-toggle-reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const form = document.getElementById(`reply-form-${id}`);
            const input = document.getElementById(`reply-input-${id}`);
            if (form) {
                form.classList.toggle('hidden');
                if (!form.classList.contains('hidden') && input) {
                    input.focus();
                }
            }
        });
    });

    // 綁定取消回覆
    container.querySelectorAll('.broadcast-cancel-reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const form = document.getElementById(`reply-form-${id}`);
            if (form) form.classList.add('hidden');
        });
    });

    // 綁定送出回覆
    container.querySelectorAll('.broadcast-submit-reply-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const preview = btn.getAttribute('data-preview');
            const input = document.getElementById(`reply-input-${id}`);
            const text = input ? input.value.trim() : '';

            if (!text) {
                showToast("請輸入回覆內容！", "warning");
                if (input) input.focus();
                return;
            }

            btn.disabled = true;
            btn.innerHTML = `<span>送出中...</span>`;

            try {
                await sendBroadcastReply(id, text, preview);
                showToast("已送出回覆！管理者將可即時查看。", "success");
                if (input) input.value = '';
                const form = document.getElementById(`reply-form-${id}`);
                if (form) form.classList.add('hidden');
            } catch(err) {
                showToast("送出回覆失敗：" + (err.message || '連線逾時'), "error");
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<span>送出回覆</span><i class="fa-solid fa-paper-plane text-[10px]"></i>`;
            }
        });
    });
}

// 2. 渲染回覆列表 (管理者視角：全部使用者回覆 / 使用者視角：自己的回覆)
function renderRepliesView(container, user) {
    const allReplies = Array.isArray(state.broadcastReplies) ? [...state.broadcastReplies] : [];

    // 依時間排序 (最新在最前)
    allReplies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 非管理者只篩選自己帳號的回覆
    const displayReplies = user.isAdmin ? allReplies : allReplies.filter(r => r.userId === user.id || (user.email && r.userEmail === user.email));

    if (displayReplies.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 px-4">
                <div class="text-4xl mb-3">💬</div>
                <h5 class="font-black text-stone-800 text-sm mb-1">目前尚無回覆紀錄</h5>
                <p class="text-xs text-stone-400 font-medium">
                    ${user.isAdmin ? '當其他使用者對廣播發表回覆或提問時，會即時顯示於此。' : '在廣播公告中點選「回覆廣播」，即可在此檢視您送出的回覆訊息。'}
                </p>
            </div>
        `;
        return;
    }

    let html = '';
    if (user.isAdmin) {
        const unreadCount = displayReplies.filter(r => !r.readByAdmin).length;
        html += `
            <div class="flex items-center justify-between pb-1 px-1">
                <span class="text-xs font-black text-stone-700">
                    共 ${displayReplies.length} 則回覆 ${unreadCount > 0 ? `（<span class="text-rose-600 font-black">${unreadCount} 則新訊息</span>）` : ''}
                </span>
                ${unreadCount > 0 ? `
                    <button id="mark-all-read-btn" class="text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 px-2 py-1 rounded-lg transition-colors cursor-pointer">
                        ✓ 全部標示已讀
                    </button>
                ` : ''}
            </div>
        `;
    }

    displayReplies.forEach(reply => {
        const timeStr = formatTimeRelative(reply.createdAt);
        const isUnread = user.isAdmin && !reply.readByAdmin;
        const cardBg = isUnread ? 'border-rose-300 bg-rose-50/25 ring-1 ring-rose-200/50' : 'border-stone-200/90 bg-white';

        html += `
            <div class="rounded-2xl border ${cardBg} shadow-xs p-3.5 transition-all relative">
                <div class="flex items-center justify-between gap-2 mb-1.5">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-xs font-black text-stone-900 flex items-center gap-1">
                            👤 ${escapeHtml(reply.userName || reply.userEmail || '使用者')}
                        </span>
                        ${reply.userEmail ? `<span class="text-[10px] text-stone-400">(${escapeHtml(reply.userEmail)})</span>` : ''}
                        ${isUnread ? '<span class="text-[9px] bg-rose-500 text-white font-black px-1.5 py-0.2 rounded-full shadow-xs animate-pulse">NEW</span>' : ''}
                    </div>
                    <span class="text-[10px] text-stone-400 font-medium">${timeStr}</span>
                </div>

                <div class="text-[11px] text-stone-500 mb-2 truncate">
                    原廣播：<span class="text-stone-700 font-medium">「${escapeHtml(reply.broadcastPreview || '廣播公告')}」</span>
                </div>

                <div class="bg-stone-50/90 rounded-xl p-2.5 text-xs text-stone-800 font-medium whitespace-pre-wrap select-text border border-stone-200/60 mb-2.5 shadow-inner">
                    ${escapeHtml(reply.message)}
                </div>

                <div class="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                    <button class="reply-copy-btn text-xs font-bold text-stone-600 hover:text-amber-700 bg-stone-100 hover:bg-stone-200 active:scale-95 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer" data-text="${escapeAttr(reply.message)}">
                        <i class="fa-regular fa-copy text-[11px]"></i>
                        <span>複製回覆</span>
                    </button>
                    <div class="flex items-center gap-1.5">
                        ${(user.isAdmin && isUnread) ? `
                            <button class="reply-mark-read-btn text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer border border-emerald-200/60" data-id="${reply.id}">
                                <i class="fa-solid fa-check text-[10px]"></i>
                                <span>標示已讀</span>
                            </button>
                        ` : ''}
                        ${user.isAdmin ? `
                            <button class="reply-delete-btn text-xs text-stone-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer" title="刪除此紀錄" data-id="${reply.id}">
                                <i class="fa-regular fa-trash-can"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // 複製回覆
    container.querySelectorAll('.reply-copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const text = btn.getAttribute('data-text');
            if (text) {
                const ok = await safeCopyToClipboard(text, "已複製回覆內容至剪貼簿！");
                if (ok) {
                    btn.innerHTML = `<i class="fa-solid fa-check text-emerald-600 text-[11px]"></i><span class="text-emerald-700">已複製！</span>`;
                    setTimeout(() => {
                        btn.innerHTML = `<i class="fa-regular fa-copy text-[11px]"></i><span>複製回覆</span>`;
                    }, 1800);
                }
            }
        });
    });

    // 標示單一回覆已讀
    container.querySelectorAll('.reply-mark-read-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (id) {
                await markReplyAsRead(id);
            }
        });
    });

    // 全部標示已讀
    const markAllBtn = container.querySelector('#mark-all-read-btn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            await markAllRepliesAsRead();
        });
    }

    // 刪除回覆紀錄 (管理者權限)
    container.querySelectorAll('.reply-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (id && confirm("確定要刪除這筆回覆紀錄嗎？")) {
                await deleteReplyRecord(id);
            }
        });
    });
}

// 3. 渲染發布全體廣播 (管理者專用)
function renderPublishView(container, user) {
    container.innerHTML = `
        <div class="bg-white rounded-2xl border border-amber-200/90 p-4 shadow-sm">
            <h5 class="font-black text-xs text-amber-900 mb-1.5 flex items-center gap-1.5">
                <span>📢 發布全體系統廣播</span>
                <span class="text-[10px] text-amber-600 font-normal">（所有在線使用者小鈴鐺即時同步）</span>
            </h5>
            <p class="text-[11px] text-stone-500 mb-3">
                發布後，此公告將即時出現在所有使用者的右下角小鈴鐺中，使用者亦可直接回覆此公告。
            </p>
            <textarea id="admin-broadcast-input" rows="4" class="w-full text-xs p-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none resize-none bg-stone-50/80 mb-3 leading-relaxed" placeholder="請輸入欲推播給全系統使用者的公告訊息..."></textarea>
            
            <div class="flex items-center justify-between gap-2">
                <button id="admin-broadcast-clear-btn" type="button" class="text-xs text-stone-500 hover:text-rose-600 bg-stone-100 hover:bg-rose-50 px-3 py-2 rounded-xl font-bold transition-all cursor-pointer">
                    📴 撤除目前全體廣播
                </button>
                <button id="admin-broadcast-send-btn" type="button" class="text-xs bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-95 text-white font-bold px-4 py-2 rounded-xl shadow-md shadow-amber-600/25 transition-all flex items-center gap-1.5 cursor-pointer">
                    <i class="fa-solid fa-bullhorn text-xs"></i>
                    <span>立即推播發布</span>
                </button>
            </div>
        </div>
    `;

    const sendBtn = container.querySelector('#admin-broadcast-send-btn');
    const clearBtn = container.querySelector('#admin-broadcast-clear-btn');
    const input = container.querySelector('#admin-broadcast-input');

    if (sendBtn && input) {
        sendBtn.addEventListener('click', async () => {
            const msg = input.value.trim();
            if (!msg) {
                showToast("請輸入廣播內容！", "warning");
                input.focus();
                return;
            }

            sendBtn.disabled = true;
            sendBtn.innerHTML = `<span>發布中...</span>`;

            try {
                await publishSystemBroadcast(msg);
                showToast("全體系統廣播發布成功！已即時推播至在線使用者小鈴鐺。", "success");
                input.value = '';
                state.activeBellTab = 'notices';
                updateTabsUI();
                renderBroadcastPanel();
            } catch(err) {
                showToast("發布失敗：" + (err.message || '權限或網路問題'), "error");
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `<i class="fa-solid fa-bullhorn text-xs"></i><span>立即推播發布</span>`;
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (!confirm("確定要撤除目前的全體廣播公告嗎？")) return;
            try {
                await clearSystemBroadcast();
                showToast("已撤除全體廣播公告", "info");
                state.activeBellTab = 'notices';
                updateTabsUI();
                renderBroadcastPanel();
            } catch(err) {
                showToast("撤除失敗：" + err.message, "error");
            }
        });
    }
}

// 發送對廣播的回覆
export async function sendBroadcastReply(broadcastId, replyText, broadcastPreview) {
    const user = getCurrentUserIdentity();
    const replyItem = {
        id: 'reply_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        broadcastId: broadcastId || 'general',
        broadcastPreview: broadcastPreview || '系統公告',
        userEmail: user.email,
        userName: user.displayName,
        userId: user.id,
        isGuest: user.isGuest,
        message: replyText,
        createdAt: new Date().toISOString(),
        readByAdmin: false
    };

    // 本地快取先插入以獲得瞬間反饋
    state.broadcastReplies = [replyItem, ...(state.broadcastReplies || [])];
    localStorage.setItem('cached_broadcast_replies', JSON.stringify(state.broadcastReplies));
    updateBellBadge();

    // 寫入 Firestore
    if (fbDb) {
        const repliesRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'systemBroadcasts', 'repliesFeed');
        let currentFeed = [];
        try {
            const snap = await getDoc(repliesRef);
            if (snap.exists() && Array.isArray(snap.data().replies)) {
                currentFeed = snap.data().replies;
            }
        } catch(e) {}

        currentFeed = [replyItem, ...currentFeed].slice(0, 80); // 保留最新 80 筆
        await setDoc(repliesRef, { replies: currentFeed, updatedAt: new Date().toISOString() }, { merge: true });
    }
}

// 管理者：發布全新全體廣播
export async function publishSystemBroadcast(message) {
    const user = getCurrentUserIdentity();
    const newBroadcast = {
        id: 'bcast_' + Date.now(),
        message: message,
        author: user.email || '系統管理員',
        authorName: '系統管理員',
        createdAt: new Date().toISOString()
    };

    if (fbDb) {
        const broadcastRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'systemBroadcasts', 'main');
        let history = [];
        try {
            const snap = await getDoc(broadcastRef);
            if (snap.exists() && Array.isArray(snap.data().history)) {
                history = snap.data().history;
            }
        } catch(e) {}

        history = [newBroadcast, ...history].slice(0, 20); // 保留歷史 20 則
        await setDoc(broadcastRef, {
            active: true,
            current: newBroadcast,
            history: history,
            updatedAt: new Date().toISOString()
        });
    }

    state.broadcasts = [newBroadcast, ...(state.broadcasts || [])];
    localStorage.setItem('cached_system_broadcasts', JSON.stringify(state.broadcasts));
    updateBellBadge();
}

// 管理者：撤除目前全體廣播
export async function clearSystemBroadcast() {
    if (fbDb) {
        const broadcastRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'systemBroadcasts', 'main');
        await updateDoc(broadcastRef, {
            active: false,
            updatedAt: new Date().toISOString()
        });
    }
    state.broadcasts = [];
    localStorage.removeItem('cached_system_broadcasts');
    updateBellBadge();
}

// 管理者：標示單筆回覆已讀
export async function markReplyAsRead(replyId) {
    state.broadcastReplies = (state.broadcastReplies || []).map(r => {
        if (r.id === replyId) return { ...r, readByAdmin: true };
        return r;
    });
    localStorage.setItem('cached_broadcast_replies', JSON.stringify(state.broadcastReplies));
    updateBellBadge();
    renderBroadcastPanel();

    if (fbDb) {
        try {
            const repliesRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'systemBroadcasts', 'repliesFeed');
            await updateDoc(repliesRef, { replies: state.broadcastReplies });
        } catch(e) {
            console.warn("Mark read update notice:", e);
        }
    }
}

// 管理者：標示全部回覆已讀
export async function markAllRepliesAsRead() {
    state.broadcastReplies = (state.broadcastReplies || []).map(r => ({ ...r, readByAdmin: true }));
    localStorage.setItem('cached_broadcast_replies', JSON.stringify(state.broadcastReplies));
    updateBellBadge();
    renderBroadcastPanel();
    showToast("已將所有回覆標示為已讀", "success");

    if (fbDb) {
        try {
            const repliesRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'systemBroadcasts', 'repliesFeed');
            await updateDoc(repliesRef, { replies: state.broadcastReplies });
        } catch(e) {
            console.warn("Mark all read update notice:", e);
        }
    }
}

// 管理者：刪除單筆回覆紀錄
export async function deleteReplyRecord(replyId) {
    state.broadcastReplies = (state.broadcastReplies || []).filter(r => r.id !== replyId);
    localStorage.setItem('cached_broadcast_replies', JSON.stringify(state.broadcastReplies));
    updateBellBadge();
    renderBroadcastPanel();
    showToast("已移除該則回覆紀錄", "info");

    if (fbDb) {
        try {
            const repliesRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'systemBroadcasts', 'repliesFeed');
            await updateDoc(repliesRef, { replies: state.broadcastReplies });
        } catch(e) {
            console.warn("Delete reply update notice:", e);
        }
    }
}
