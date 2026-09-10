import { DEFAULT_TYPES } from './constants.js';
import { safeClone } from './utils.js';

export const state = {
    appData: { classes: [], homeworks: [], homeworkTypes: safeClone(DEFAULT_TYPES) },
    currentUser: null,
    currentClassId: localStorage.getItem('currentClassId') || null,
    currentHomeworkId: null,
    selectedDate: new Date(),
    calendarDate: new Date(),
    blackboardFontSize: parseFloat(localStorage.getItem('hw_pref_fontSize')) || 1.25,
    blackboardLineHeight: parseFloat(localStorage.getItem('hw_pref_lineHeight')) || 1.75,
    currentCheckMode: localStorage.getItem('checkMode') || null,
    currentPage: 'main-page',
    scrollPositions: {},
    isSaving: false,
    saveTimeout: null,
    fileHandle: null,
    adminViewModeUserId: null,
    adminOriginalAppData: null,
    isLocalEmptyOnBoot: !localStorage.getItem('homeworkAppData'),
    lastCloudError: null,
    pendingEmailVerification: null,
    unsubProfile: null,
    adminViewUnsubscribe: null,
    unsubServerConfig: null,
    broadcasts: [],
    broadcastReplies: [],
    unsubBroadcasts: null,
    unsubReplies: null,
    isBellOpen: false,
    activeBellTab: 'notices',
    unreadRepliesCount: 0,
    isChatOpen: false,
    activeChatRoomId: null,
    chatRooms: [],
    activeRoomDetail: null,
    myChatRoom: null,
    unsubChat: null,
    unsubChatRooms: null,
    isDevMode: sessionStorage.getItem('app_dev_mode') === 'true'
};

// Also expose on window for legacy / event handler fallback if needed
window.appState = state;
