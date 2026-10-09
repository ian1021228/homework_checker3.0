/**
 * 24小時制時間滾輪選擇器模組 (24-Hour Time Wheel Picker)
 * 提供平滑滾動、居中對齊、實時 24H 數位預覽與學校常用時間快捷按鈕
 */

import { openModal, closeModal } from './utils.js';

let activeCallback = null;
let currentHour = 8;
let currentMinute = 0;
let isInitialized = false;

const ITEM_HEIGHT = 40; // 每個數字選項高度 40px

/**
 * 初始化時間滾輪 DOM 與事件監聽
 */
export function initTimeWheel() {
    if (isInitialized) return;
    const modal = document.getElementById('time-wheel-modal');
    if (!modal) return;

    const hoursContainer = document.getElementById('wheel-hours-container');
    const minutesContainer = document.getElementById('wheel-minutes-container');
    if (!hoursContainer || !minutesContainer) return;

    // 1. 建立小時項目 (00 ~ 23)
    hoursContainer.innerHTML = '';
    for (let h = 0; h < 24; h++) {
        const valStr = String(h).padStart(2, '0');
        const item = document.createElement('div');
        item.className = 'wheel-item h-10 flex items-center justify-center snap-center text-sm font-semibold font-mono text-slate-400 transition-all cursor-pointer hover:text-indigo-600 select-none';
        item.dataset.value = h;
        item.textContent = valStr;
        item.addEventListener('click', () => {
            scrollToHour(h, true);
        });
        hoursContainer.appendChild(item);
    }

    // 2. 建立分鐘項目 (00 ~ 59)
    minutesContainer.innerHTML = '';
    for (let m = 0; m < 60; m++) {
        const valStr = String(m).padStart(2, '0');
        const item = document.createElement('div');
        item.className = 'wheel-item h-10 flex items-center justify-center snap-center text-sm font-semibold font-mono text-slate-400 transition-all cursor-pointer hover:text-indigo-600 select-none';
        item.dataset.value = m;
        item.textContent = valStr;
        item.addEventListener('click', () => {
            scrollToMinute(m, true);
        });
        minutesContainer.appendChild(item);
    }

    // 3. 滾動事件監聽（更新居中狀態與預覽）
    let hourScrollTimer = null;
    hoursContainer.addEventListener('scroll', () => {
        clearTimeout(hourScrollTimer);
        updateWheelHighlight(hoursContainer);
        hourScrollTimer = setTimeout(() => {
            const h = Math.round(hoursContainer.scrollTop / ITEM_HEIGHT);
            const clamped = Math.max(0, Math.min(23, h));
            currentHour = clamped;
            updatePreview();
            updateWheelHighlight(hoursContainer);
        }, 50);
    });

    let minScrollTimer = null;
    minutesContainer.addEventListener('scroll', () => {
        clearTimeout(minScrollTimer);
        updateWheelHighlight(minutesContainer);
        minScrollTimer = setTimeout(() => {
            const m = Math.round(minutesContainer.scrollTop / ITEM_HEIGHT);
            const clamped = Math.max(0, Math.min(59, m));
            currentMinute = clamped;
            updatePreview();
            updateWheelHighlight(minutesContainer);
        }, 50);
    });

    // 4. 關閉與取消
    document.getElementById('time-wheel-close-btn')?.addEventListener('click', () => {
        closeModal(modal);
    });
    document.getElementById('time-wheel-cancel-btn')?.addEventListener('click', () => {
        closeModal(modal);
    });

    // 5. 確認儲存
    document.getElementById('time-wheel-confirm-btn')?.addEventListener('click', () => {
        const hStr = String(currentHour).padStart(2, '0');
        const mStr = String(currentMinute).padStart(2, '0');
        const resultTime = `${hStr}:${mStr}`;
        closeModal(modal);
        if (typeof activeCallback === 'function') {
            activeCallback(resultTime);
        }
    });

    // 6. 清除時間
    document.getElementById('time-wheel-clear-btn')?.addEventListener('click', () => {
        closeModal(modal);
        if (typeof activeCallback === 'function') {
            activeCallback('');
        }
    });

    // 7. 快捷標籤
    modal.querySelectorAll('.btn-time-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const timePreset = btn.dataset.time;
            if (timePreset === 'now') {
                const now = new Date();
                setTime(now.getHours(), now.getMinutes(), true);
            } else if (timePreset) {
                const [h, m] = timePreset.split(':').map(Number);
                setTime(h, m, true);
            }
        });
    });

    isInitialized = true;
}

/**
 * 滾動小時滾輪至指定小時
 */
function scrollToHour(h, smooth = false) {
    const hoursContainer = document.getElementById('wheel-hours-container');
    if (!hoursContainer) return;
    currentHour = Math.max(0, Math.min(23, h));
    hoursContainer.scrollTo({
        top: currentHour * ITEM_HEIGHT,
        behavior: smooth ? 'smooth' : 'auto'
    });
    updatePreview();
    updateWheelHighlight(hoursContainer);
}

/**
 * 滾動分鐘滾輪至指定分鐘
 */
function scrollToMinute(m, smooth = false) {
    const minutesContainer = document.getElementById('wheel-minutes-container');
    if (!minutesContainer) return;
    currentMinute = Math.max(0, Math.min(59, m));
    minutesContainer.scrollTo({
        top: currentMinute * ITEM_HEIGHT,
        behavior: smooth ? 'smooth' : 'auto'
    });
    updatePreview();
    updateWheelHighlight(minutesContainer);
}

/**
 * 設定時間並滾動
 */
function setTime(h, m, smooth = false) {
    scrollToHour(h, smooth);
    scrollToMinute(m, smooth);
}

/**
 * 更新即時 24H 數位看板預覽
 */
function updatePreview() {
    const hEl = document.getElementById('time-wheel-preview-hour');
    const mEl = document.getElementById('time-wheel-preview-min');
    if (hEl) hEl.textContent = String(currentHour).padStart(2, '0');
    if (mEl) mEl.textContent = String(currentMinute).padStart(2, '0');
}

/**
 * 更新滾輪選項高亮樣式
 */
function updateWheelHighlight(container) {
    if (!container) return;
    const activeIdx = Math.round(container.scrollTop / ITEM_HEIGHT);
    const items = container.querySelectorAll('.wheel-item');
    items.forEach((item, idx) => {
        if (idx === activeIdx) {
            item.className = 'wheel-item h-10 flex items-center justify-center snap-center text-xl font-black font-mono text-indigo-700 scale-110 transition-all cursor-pointer select-none';
        } else if (Math.abs(idx - activeIdx) === 1) {
            item.className = 'wheel-item h-10 flex items-center justify-center snap-center text-sm font-bold font-mono text-slate-500 transition-all cursor-pointer select-none';
        } else {
            item.className = 'wheel-item h-10 flex items-center justify-center snap-center text-xs font-semibold font-mono text-slate-300 opacity-60 transition-all cursor-pointer select-none';
        }
    });
}

/**
 * 開啟 24 小時制時間滾輪選擇視窗
 * @param {Object} options
 * @param {string} options.title 標題
 * @param {string} options.initialTime 初始時間字串 (HH:mm)
 * @param {Function} options.onSelect 確認選取後的回呼 callback(timeStr)
 * @param {boolean} options.allowClear 是否顯示清除按鈕
 */
export function openTimeWheelPicker({ title = '選擇到校時間 (24小時制)', initialTime = '', onSelect = null, allowClear = true } = {}) {
    initTimeWheel();
    const modal = document.getElementById('time-wheel-modal');
    if (!modal) return;

    activeCallback = onSelect;

    const titleEl = document.getElementById('time-wheel-title-text');
    if (titleEl) titleEl.textContent = title;

    const clearBtn = document.getElementById('time-wheel-clear-btn');
    if (clearBtn) {
        clearBtn.style.display = allowClear ? 'inline-block' : 'none';
    }

    // 解析初始時間
    let h = 8, m = 0;
    if (initialTime && initialTime.includes(':')) {
        const parts = initialTime.split(':').map(Number);
        if (!isNaN(parts[0])) h = parts[0];
        if (!isNaN(parts[1])) m = parts[1];
    } else {
        const now = new Date();
        h = now.getHours();
        m = now.getMinutes();
    }

    openModal(modal);

    // 稍微延遲以確保容器渲染與尺寸計算精確
    requestAnimationFrame(() => {
        setTime(h, m, false);
    });
}

// 掛載至 window 供全域使用
if (typeof window !== 'undefined') {
    window.openTimeWheelPicker = openTimeWheelPicker;
    window.initTimeWheel = initTimeWheel;
}
