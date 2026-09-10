import { fbDb, fbAuth, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, getDocs, isGoogleAdmin, signInAnonymously } from './firebase.js';
import { globalAppId } from './constants.js';
import { state } from './state.js';
import { safeCopyToClipboard, showToast } from './utils.js';

// HTML 安全跳脫工具
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

// 相對時間格式化
function formatChatTime(dateStr) {
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
        if (diffHours < 24) {
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch(e) {
        return dateStr;
    }
}

// 取得當前使用者身分資訊
export function getCurrentChatUser() {
    const isGuest = sessionStorage.getItem('app_is_guest_mode') === 'true';
    if (!isGuest && (state.currentUser || fbAuth?.currentUser)) {
        const u = state.currentUser || fbAuth?.currentUser;
        return {
            uid: u.uid || 'user_' + Date.now(),
            name: u.displayName || u.email?.split('@')[0] || '使用者',
            email: u.email || '',
            isGuest: false,
            isAdmin: isGoogleAdmin(u)
        };
    }

    let visitorId = localStorage.getItem('visitor_id');
    if (!visitorId) {
        visitorId = 'guest_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('visitor_id', visitorId);
    }
    const visitorName = localStorage.getItem('visitor_name') || '訪客老師';
    return {
        uid: visitorId,
        name: `訪客 (${visitorName})`,
        email: '',
        isGuest: true,
        isAdmin: false
    };
}

// 初始化訊息系統
export function initSystemChat() {
    const toggleBtn = document.getElementById('chat-toggle-btn');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close-btn');
    const refreshBtn = document.getElementById('chat-refresh-btn');
    const backBtn = document.getElementById('chat-admin-back-btn');
    const sendBtn = document.getElementById('chat-send-btn');
    const input = document.getElementById('chat-message-input');

    if (!toggleBtn || !panel) return;

    // 點擊訊息按鈕切換展開/收合
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleChatPanel();
    });

    // 關閉按鈕
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChatPanel(false);
        });
    }

    // 點擊面板外收合
    document.addEventListener('click', (e) => {
        if (!state.isChatOpen) return;
        const container = document.getElementById('system-chat-container');
        if (container && !container.contains(e.target)) {
            toggleChatPanel(false);
        }
    });

    // 阻止面板點擊冒泡
    panel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 重新整理
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            refreshBtn.classList.add('animate-spin');
            setTimeout(() => refreshBtn.classList.remove('animate-spin'), 600);
            renderChatView();
            showToast("已同步對話訊息", "info");
        });
    }

    // 管理者返回聊天室列表按鈕
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.activeChatRoomId = null;
            renderChatView();
        });
    }

    // 發送按鈕與 Enter 送出
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            handleSendMessage();
        });
    }

    if (input) {
        // 輸入時自動調適高度，防止高度僵死
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    // 啟動雲端監聽
    listenToChatRealtime();

    // 依目前頁面確認是否顯示懸浮按鈕
    updateChatVisibility();
}

// 根據目前所在頁面更新懸浮訊息按鈕可見度
// 規則：該按鈕只會顯示在系統中，首頁不顯示
export function updateChatVisibility() {
    const container = document.getElementById('system-chat-container');
    if (!container) return;

    const portalPage = document.getElementById('portal-page');
    const isPortalVisible = portalPage && !portalPage.classList.contains('hidden');

    if (isPortalVisible) {
        container.classList.add('hidden');
        container.classList.remove('flex');
        // 若在首頁，確保面板是關閉的
        if (state.isChatOpen) {
            toggleChatPanel(false);
        }
    } else {
        container.classList.remove('hidden');
        container.classList.add('flex');
    }
}

// 切換聊天面板展開/收合
export function toggleChatPanel(forceOpen) {
    const panel = document.getElementById('chat-panel');
    const btnIcon = document.getElementById('chat-btn-icon');
    if (!panel) return;

    const willOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.isChatOpen;
    state.isChatOpen = willOpen;

    if (willOpen) {
        panel.classList.remove('hidden');
        requestAnimationFrame(() => {
            panel.classList.remove('scale-95', 'opacity-0');
            panel.classList.add('scale-100', 'opacity-100');
        });
        if (btnIcon) btnIcon.classList.add('text-indigo-200');

        renderChatView();
        scrollToBottom();
    } else {
        panel.classList.add('scale-95', 'opacity-0');
        panel.classList.remove('scale-100', 'opacity-100');
        setTimeout(() => {
            if (!state.isChatOpen) panel.classList.add('hidden');
        }, 200);
        if (btnIcon) btnIcon.classList.remove('text-indigo-200');
    }
}

// 即時監聽聊天資料
export async function listenToChatRealtime() {
    // 若當前尚未登入且存在 fbAuth，嘗試匿名登入以取得合法的 Firestore 讀寫憑證
    if (fbAuth && !fbAuth.currentUser) {
        try {
            await signInAnonymously(fbAuth);
        } catch (authErr) {
            // 若專案未啟用匿名登入，優雅保留訪客狀態並走本機安全快取
        }
    }

    const user = getCurrentChatUser();

    if (user.isAdmin) {
        // 管理者：監聽所有聊天室列表與摘要
        listenAsAdmin();
    } else {
        // 一般使用者：監聽自己的對話聊天室
        listenAsUser(user.uid);
    }
}

// 監聽管理者視角 (全部聊天室)
function listenAsAdmin() {
    if (!fbDb) return;
    if (state.unsubChatRooms) state.unsubChatRooms();

    // 先讀取本機快取
    const cached = localStorage.getItem('cached_admin_chat_rooms');
    if (cached) {
        try { state.chatRooms = JSON.parse(cached); } catch(e) {}
    }

    // 監聽 chatMeta/allRooms
    const metaRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'chatMeta', 'allRooms');
    state.unsubChatRooms = onSnapshot(metaRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.chatRooms = Array.isArray(data.rooms) ? data.rooms : [];
            localStorage.setItem('cached_admin_chat_rooms', JSON.stringify(state.chatRooms));
        } else if (!state.chatRooms || state.chatRooms.length === 0) {
            state.chatRooms = [];
        }
        updateChatUnreadBadge();
        if (state.isChatOpen) renderChatView();
    }, (err) => {
        // 遇到權限或連線通知時，平順使用快取不中斷使用者操作
        if (err?.code !== 'permission-denied') {
            console.warn("Admin chatRooms meta listen notice:", err?.message || err);
        }
        updateChatUnreadBadge();
        if (state.isChatOpen) renderChatView();
    });

    // 如果當前管理者已點進特定聊天室，亦監聽該室的詳細訊息
    if (state.activeChatRoomId) {
        listenToActiveRoom(state.activeChatRoomId);
    }
}

// 監聽特定房間詳細內容
function listenToActiveRoom(roomId) {
    if (!fbDb || !roomId) return;
    if (state.unsubChat) state.unsubChat();

    const cached = localStorage.getItem(`cached_room_${roomId}`);
    if (cached) {
        try { state.activeRoomDetail = JSON.parse(cached); } catch(e) {}
    }

    const roomRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'chatRooms', roomId);
    state.unsubChat = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
            state.activeRoomDetail = docSnap.data();
            localStorage.setItem(`cached_room_${roomId}`, JSON.stringify(state.activeRoomDetail));
        } else if (!state.activeRoomDetail) {
            state.activeRoomDetail = { messages: [] };
        }
        if (state.isChatOpen && state.activeChatRoomId === roomId) {
            renderConversationView();
        }
    }, (err) => {
        if (err?.code !== 'permission-denied') {
            console.warn("Room detail listen notice:", err?.message || err);
        }
    });
}

// 監聽一般使用者視角 (自己的房間)
function listenAsUser(uid) {
    if (!fbDb || !uid) return;
    if (state.unsubChat) state.unsubChat();

    // 優先載入本機快取
    const cached = localStorage.getItem('cached_my_chat_room');
    if (cached) {
        try { state.myChatRoom = JSON.parse(cached); } catch(e) {}
    }

    const userRoomRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'chatRooms', uid);
    state.unsubChat = onSnapshot(userRoomRef, (docSnap) => {
        if (docSnap.exists()) {
            state.myChatRoom = docSnap.data();
            localStorage.setItem('cached_my_chat_room', JSON.stringify(state.myChatRoom));
        } else if (!state.myChatRoom) {
            state.myChatRoom = { messages: [] };
        }
        updateChatUnreadBadge();
        if (state.isChatOpen) renderChatView();
    }, (err) => {
        const isPermError = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permissions');
        if (isPermError) {
            // 訪客體驗模式或尚未開放未登入讀取時，安靜使用本機對話與快取，不噴紅字警告
            tryFallbackUserChat(uid);
        } else {
            console.warn("User chat listen notice:", err?.message || err);
        }
        updateChatUnreadBadge();
        if (state.isChatOpen) renderChatView();
    });
}

// 備援查詢：若 chatRooms 權限受限，嘗試由 userProfiles 讀取對話備援
async function tryFallbackUserChat(uid) {
    if (!fbDb || !uid) return;
    try {
        const upRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', uid);
        const snap = await getDoc(upRef);
        if (snap.exists() && snap.data()?.chatRoom) {
            state.myChatRoom = snap.data().chatRoom;
            localStorage.setItem('cached_my_chat_room', JSON.stringify(state.myChatRoom));
            updateChatUnreadBadge();
            if (state.isChatOpen) renderChatView();
        }
    } catch(e) {}
}

// 更新未讀訊息紅點 Badge
export function updateChatUnreadBadge() {
    const badge = document.getElementById('chat-unread-badge');
    const toggleBtn = document.getElementById('chat-toggle-btn');
    if (!badge) return;

    const user = getCurrentChatUser();
    let unreadCount = 0;

    if (user.isAdmin) {
        // 管理者：加總所有使用者的未讀訊息 (unreadAdminCount)
        (state.chatRooms || []).forEach(room => {
            unreadCount += Number(room.unreadAdminCount || 0);
        });
    } else {
        // 一般使用者：顯示管理員回覆的未讀數量 (unreadUserCount)
        unreadCount = Number(state.myChatRoom?.unreadUserCount || 0);
    }

    if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.remove('hidden');
        if (toggleBtn) {
            toggleBtn.classList.add('animate-bounce');
            setTimeout(() => { if (toggleBtn) toggleBtn.classList.remove('animate-bounce'); }, 1600);
        }
    } else {
        badge.classList.add('hidden');
    }
}

// 渲染面板視圖主入口
export function renderChatView() {
    const user = getCurrentChatUser();
    const titleEl = document.getElementById('chat-header-title');
    const subtitleEl = document.getElementById('chat-header-subtitle');
    const adminBadge = document.getElementById('chat-header-admin-badge');
    const backBtn = document.getElementById('chat-admin-back-btn');
    const roomsListView = document.getElementById('chat-rooms-list-view');
    const conversationView = document.getElementById('chat-conversation-view');

    if (user.isAdmin) {
        if (adminBadge) adminBadge.classList.remove('hidden');

        if (!state.activeChatRoomId) {
            // 管理者在聊天室列表視圖
            if (titleEl) titleEl.textContent = "使用者訊息中心";
            if (subtitleEl) subtitleEl.textContent = `共 ${state.chatRooms?.length || 0} 位使用者對話`;
            if (backBtn) backBtn.classList.add('hidden');
            if (roomsListView) roomsListView.classList.remove('hidden');
            if (conversationView) conversationView.classList.add('hidden');
            renderAdminRoomsListView();
        } else {
            // 管理者點進指定使用者的聊天室視圖
            if (backBtn) backBtn.classList.remove('hidden');
            if (roomsListView) roomsListView.classList.add('hidden');
            if (conversationView) conversationView.classList.remove('hidden');

            const currentRoom = (state.chatRooms || []).find(r => r.userId === state.activeChatRoomId);
            if (titleEl) titleEl.textContent = currentRoom ? (currentRoom.userName || currentRoom.userEmail || '使用者') : '使用者對話';
            if (subtitleEl) subtitleEl.textContent = currentRoom?.userEmail ? currentRoom.userEmail : (currentRoom?.isGuest ? '體驗訪客' : '雲端帳號');
            renderConversationView();
        }
    } else {
        // 一般使用者 / 訪客視圖
        if (adminBadge) adminBadge.classList.add('hidden');
        if (backBtn) backBtn.classList.add('hidden');
        if (roomsListView) roomsListView.classList.add('hidden');
        if (conversationView) conversationView.classList.remove('hidden');

        if (titleEl) titleEl.textContent = "聯絡系統管理員";
        if (subtitleEl) subtitleEl.textContent = "管理員 ianw.solar@gmail.com 在線服務";
        renderConversationView();
    }
}

// 1. 渲染管理者「聊天室列表」
function renderAdminRoomsListView() {
    const listContainer = document.getElementById('chat-rooms-list');
    if (!listContainer) return;

    const rooms = Array.isArray(state.chatRooms) ? [...state.chatRooms] : [];
    // 依最新時間排序
    rooms.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));

    if (rooms.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-16 px-4">
                <div class="text-4xl mb-3">💬</div>
                <h5 class="font-black text-stone-800 text-sm mb-1">目前尚無使用者對話</h5>
                <p class="text-xs text-stone-400 font-medium">當使用者在系統內發送訊息時，會即時顯示於此列表供您回覆。</p>
            </div>
        `;
        return;
    }

    let html = '';
    rooms.forEach(room => {
        const timeStr = formatChatTime(room.lastUpdated);
        const unreadCount = Number(room.unreadAdminCount || 0);
        const isGuest = room.isGuest;
        const initial = (room.userName || room.userEmail || 'U').charAt(0).toUpperCase();

        html += `
            <div class="chat-room-item flex items-center gap-3 p-3.5 bg-white hover:bg-indigo-50/50 rounded-2xl border ${unreadCount > 0 ? 'border-indigo-300 bg-indigo-50/20 shadow-sm' : 'border-stone-200/80'} transition-all cursor-pointer group" data-userid="${escapeAttr(room.userId)}">
                <!-- 使用者頭像 -->
                <div class="w-11 h-11 rounded-2xl ${isGuest ? 'bg-amber-500' : 'bg-indigo-600'} text-white font-black text-base flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                    ${initial}
                </div>

                <!-- 資訊欄 -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1 mb-1">
                        <div class="flex items-center gap-1.5 truncate">
                            <span class="text-xs font-black text-stone-900 truncate">
                                ${escapeHtml(room.userName || '使用者')}
                            </span>
                            ${isGuest ? '<span class="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-md">訪客</span>' : ''}
                        </div>
                        <span class="text-[10px] text-stone-400 flex-shrink-0 font-medium">${timeStr}</span>
                    </div>

                    ${room.userEmail ? `<div class="text-[10px] text-stone-400 truncate mb-1">${escapeHtml(room.userEmail)}</div>` : ''}

                    <div class="flex items-center justify-between gap-2">
                        <p class="text-xs ${unreadCount > 0 ? 'text-indigo-900 font-black' : 'text-stone-500'} truncate">
                            ${escapeHtml(room.lastMessage || '尚無訊息內容')}
                        </p>
                        ${unreadCount > 0 ? `
                            <span class="text-[10px] bg-rose-500 text-white font-black px-1.5 py-0.2 rounded-full flex-shrink-0 shadow-xs animate-pulse">
                                ${unreadCount}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = html;

    // 綁定點擊進入房間
    listContainer.querySelectorAll('.chat-room-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.getAttribute('data-userid');
            if (userId) {
                selectChatRoomAsAdmin(userId);
            }
        });
    });
}

// 管理者點選進入某個聊天室
export async function selectChatRoomAsAdmin(userId) {
    state.activeChatRoomId = userId;
    listenToActiveRoom(userId);
    renderChatView();

    // 進入時自動將此房間未讀歸零
    if (fbDb) {
        try {
            const roomRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'chatRooms', userId);
            await updateDoc(roomRef, { unreadAdminCount: 0 });

            // 更新 meta
            state.chatRooms = (state.chatRooms || []).map(r => {
                if (r.userId === userId) return { ...r, unreadAdminCount: 0 };
                return r;
            });
            const metaRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'chatMeta', 'allRooms');
            await setDoc(metaRef, { rooms: state.chatRooms }, { merge: true });
            updateChatUnreadBadge();
        } catch(e) {
            console.warn("Clear room unread notice:", e);
        }
    }
}

// 2. 渲染對話視圖（一般使用者自己的對話 或 管理者檢視選中之對話）
function renderConversationView() {
    const thread = document.getElementById('chat-messages-thread');
    if (!thread) return;

    const user = getCurrentChatUser();
    let messages = [];

    if (user.isAdmin) {
        // 從 activeRoomDetail 或 local 快取讀取
        const detail = state.activeRoomDetail;
        if (detail && Array.isArray(detail.messages)) {
            messages = detail.messages;
        } else {
            const cached = localStorage.getItem(`cached_room_${state.activeChatRoomId}`);
            if (cached) {
                try { messages = JSON.parse(cached).messages || []; } catch(e) {}
            }
        }
    } else {
        // 一般使用者從 myChatRoom 讀取
        if (state.myChatRoom && Array.isArray(state.myChatRoom.messages)) {
            messages = state.myChatRoom.messages;
        } else {
            const cached = localStorage.getItem('cached_my_chat_room');
            if (cached) {
                try { messages = JSON.parse(cached).messages || []; } catch(e) {}
            }
        }

        // 使用者打開自己的聊天室時，將 unreadUserCount 歸零
        if (state.myChatRoom && state.myChatRoom.unreadUserCount > 0 && fbDb) {
            state.myChatRoom.unreadUserCount = 0;
            updateDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'chatRooms', user.uid), { unreadUserCount: 0 }).catch(() => {});
            updateChatUnreadBadge();
        }
    }

    if (messages.length === 0) {
        thread.innerHTML = `
            <div class="text-center py-16 px-4">
                <div class="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl mx-auto mb-3 shadow-inner">
                    💬
                </div>
                <h5 class="font-black text-stone-800 text-sm mb-1.5">
                    ${user.isAdmin ? '開始與此使用者交談' : '👋 您好！有任何問題皆可在此發問'}
                </h5>
                <p class="text-xs text-stone-400 font-medium max-w-xs mx-auto leading-relaxed">
                    ${user.isAdmin ? '請在下方輸入回覆內容，使用者將會即時收到通知與回覆。' : '直接在下方輸入訊息傳送給系統管理員，管理員會即時收到並在線上為您解答。'}
                </p>
            </div>
        `;
        return;
    }

    let html = '';
    messages.forEach(msg => {
        const timeStr = formatChatTime(msg.timestamp);
        const isFromAdmin = msg.sender === 'admin';
        
        // 判斷氣泡是靠右還是靠左：
        // 如果當前是管理員：管理員自己發的訊息靠右，使用者訊息靠左
        // 如果當前是一般使用者：使用者自己發的訊息靠右，管理員回覆靠左
        const isSelf = user.isAdmin ? isFromAdmin : !isFromAdmin;
        const cleanText = (msg.text || '').trim();

        if (isSelf) {
            // 自己的訊息 (靠右，靛藍漸層氣泡，底色高度緊密貼合文字行數)
            html += `
                <div class="flex flex-col items-end mb-2">
                    <div class="inline-block max-w-[82%] w-fit bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white px-3.5 py-1.5 rounded-2xl rounded-tr-xs text-xs sm:text-sm font-medium leading-normal whitespace-pre-wrap select-text shadow-xs break-words">${escapeHtml(cleanText)}</div>
                    <span class="text-[10px] text-stone-400 font-medium px-1 mt-0.5">${timeStr}</span>
                </div>
            `;
        } else {
            // 對方的訊息 (靠左，優雅石板白氣泡，底色高度緊密貼合文字行數)
            html += `
                <div class="flex flex-col items-start mb-2">
                    <div class="flex items-center gap-1.5 px-1 mb-0.5">
                        <span class="text-[11px] font-bold ${isFromAdmin ? 'text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded-md' : 'text-stone-700'}">
                            ${isFromAdmin ? '🛡️ 系統管理員' : escapeHtml(msg.senderName || '使用者')}
                        </span>
                    </div>
                    <div class="inline-block max-w-[82%] w-fit bg-white text-stone-800 border border-stone-200/80 px-3.5 py-1.5 rounded-2xl rounded-tl-xs text-xs sm:text-sm font-medium leading-normal whitespace-pre-wrap select-text shadow-xs break-words">${escapeHtml(cleanText)}</div>
                    <span class="text-[10px] text-stone-400 font-medium px-1 mt-0.5">${timeStr}</span>
                </div>
            `;
        }
    });

    thread.innerHTML = html;
    scrollToBottom();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        const thread = document.getElementById('chat-messages-thread');
        if (thread) thread.scrollTop = thread.scrollHeight;
    });
}

// 發送訊息核心邏輯
export async function handleSendMessage() {
    const input = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input) return;

    const text = input.value.trim();
    if (!text) {
        showToast("請輸入訊息內容！", "warning");
        input.focus();
        return;
    }

    const user = getCurrentChatUser();
    const targetRoomId = user.isAdmin ? state.activeChatRoomId : user.uid;

    if (!targetRoomId) {
        showToast("請先選擇要對話的聊天室！", "error");
        return;
    }

    const newMsg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        sender: user.isAdmin ? 'admin' : 'user',
        senderName: user.name,
        senderEmail: user.email,
        text: text,
        timestamp: new Date().toISOString()
    };

    // 清空輸入框並還原預設高度
    input.value = '';
    input.style.height = 'auto';
    if (sendBtn) sendBtn.disabled = true;

    try {
        // 本地立即樂觀更新
        if (user.isAdmin) {
            if (!state.activeRoomDetail) state.activeRoomDetail = { messages: [] };
            state.activeRoomDetail.messages = [...(state.activeRoomDetail.messages || []), newMsg];
        } else {
            if (!state.myChatRoom) state.myChatRoom = { messages: [] };
            state.myChatRoom.messages = [...(state.myChatRoom.messages || []), newMsg];
        }
        renderConversationView();

        // 寫入 Firestore
        if (fbDb) {
            const roomRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'chatRooms', targetRoomId);
            let currentMessages = [];
            let roomData = {};

            try {
                const snap = await getDoc(roomRef);
                if (snap.exists()) {
                    roomData = snap.data();
                    currentMessages = Array.isArray(roomData.messages) ? roomData.messages : [];
                }
            } catch(e) {}

            // 若尚未包含新訊息則加入
            if (!currentMessages.some(m => m.id === newMsg.id)) {
                currentMessages.push(newMsg);
            }
            // 保留最多 100 筆對話紀錄
            if (currentMessages.length > 100) {
                currentMessages = currentMessages.slice(currentMessages.length - 100);
            }

            const unreadAdmin = user.isAdmin ? 0 : Number(roomData.unreadAdminCount || 0) + 1;
            const unreadUser = user.isAdmin ? Number(roomData.unreadUserCount || 0) + 1 : 0;

            const updatedRoomObj = {
                userId: targetRoomId,
                userName: user.isAdmin ? (roomData.userName || '使用者') : user.name,
                userEmail: user.isAdmin ? (roomData.userEmail || '') : user.email,
                isGuest: user.isAdmin ? (roomData.isGuest || false) : user.isGuest,
                lastMessage: text,
                lastUpdated: new Date().toISOString(),
                unreadAdminCount: unreadAdmin,
                unreadUserCount: unreadUser,
                messages: currentMessages
            };

            // 寫入 chatRooms
            try {
                await setDoc(roomRef, updatedRoomObj, { merge: true });
                updateChatMetaFeed(updatedRoomObj).catch(() => {});
            } catch(writeErr) {
                // 若遇權限限制，嘗試寫入 userProfiles 作為備援儲存
                try {
                    const upRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', targetRoomId);
                    await setDoc(upRef, { chatRoom: updatedRoomObj }, { merge: true });
                } catch(upErr) {}
            }

            // 更新本機快取
            if (!user.isAdmin) {
                localStorage.setItem('cached_my_chat_room', JSON.stringify(updatedRoomObj));
            } else {
                localStorage.setItem(`cached_room_${targetRoomId}`, JSON.stringify(updatedRoomObj));
            }
        }

        showToast(user.isAdmin ? "已回覆訊息" : "訊息已發送給管理員", "success");
    } catch(err) {
        showToast("發送失敗：" + (err.message || '連線逾時'), "error");
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
    }
}

// 輔助：更新 chatMeta/allRooms 列表摘要
async function updateChatMetaFeed(roomObj) {
    if (!fbDb) return;
    try {
        const metaRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'chatMeta', 'allRooms');
        let currentRooms = [];
        try {
            const snap = await getDoc(metaRef);
            if (snap.exists() && Array.isArray(snap.data().rooms)) {
                currentRooms = snap.data().rooms;
            }
        } catch(e) {}

        const filtered = currentRooms.filter(r => r.userId !== roomObj.userId);
        const summary = {
            userId: roomObj.userId,
            userName: roomObj.userName,
            userEmail: roomObj.userEmail,
            isGuest: roomObj.isGuest,
            lastMessage: roomObj.lastMessage,
            lastUpdated: roomObj.lastUpdated,
            unreadAdminCount: roomObj.unreadAdminCount,
            unreadUserCount: roomObj.unreadUserCount
        };

        const newRooms = [summary, ...filtered].slice(0, 50);
        await setDoc(metaRef, { rooms: newRooms, updatedAt: new Date().toISOString() }, { merge: true });
    } catch(e) {
        console.warn("Update chat meta feed notice:", e);
    }
}
