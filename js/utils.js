import { DEFAULT_TYPES } from './constants.js';

export function generateId() { 
    return Date.now().toString(36) + Math.random().toString(36).substr(2); 
}

export function safeClone(obj, seen = new WeakSet()) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
    if (typeof HTMLElement !== 'undefined' && obj instanceof HTMLElement) return undefined;
    if (typeof Node !== 'undefined' && obj instanceof Node) return undefined;
    if (typeof Event !== 'undefined' && obj instanceof Event) return undefined;
    if (typeof Window !== 'undefined' && obj instanceof Window) return undefined;
    if (seen.has(obj)) return undefined;
    
    seen.add(obj);

    if (Array.isArray(obj)) {
        const arr = [];
        for (let i = 0; i < obj.length; i++) {
            const val = safeClone(obj[i], seen);
            arr.push(val === undefined ? null : val);
        }
        return arr;
    }

    const copy = {};
    for (const key of Object.keys(obj)) {
        if (key.startsWith('$$') || key.startsWith('__')) continue;
        try {
            const val = obj[key];
            if (typeof val === 'function' || typeof val === 'symbol') continue;
            const cloned = safeClone(val, seen);
            if (cloned !== undefined) {
                copy[key] = cloned;
            }
        } catch (e) {}
    }
    return copy;
}

export function safeStringify(obj) {
    if (obj === undefined) return undefined;
    try {
        const cleaned = safeClone(obj);
        return JSON.stringify(cleaned);
    } catch (e) {
        console.warn("safeStringify fallback:", e);
        try {
            if (obj && typeof obj === 'object' && ('classes' in obj || 'homeworks' in obj)) {
                return JSON.stringify(safeClone(sanitizeAppData(obj)));
            }
        } catch (err2) {}
        return '{}';
    }
}

export function sanitizeAppData(data) {
    if (!data || typeof data !== 'object') {
        return { classes: [], homeworks: [], homeworkTypes: safeClone(DEFAULT_TYPES) };
    }
    const cleanClasses = Array.isArray(data.classes) ? data.classes.map(c => {
        if (!c || typeof c !== 'object') return null;
        const cleanBarcodes = {};
        if (c.studentBarcodes && typeof c.studentBarcodes === 'object') {
            for (const [k, v] of Object.entries(c.studentBarcodes)) {
                if (typeof v === 'string' || typeof v === 'number') cleanBarcodes[k] = String(v);
            }
        }
        const cleanContact = {};
        if (c.contactBook && typeof c.contactBook === 'object') {
            for (const [date, items] of Object.entries(c.contactBook)) {
                if (Array.isArray(items)) {
                    cleanContact[date] = items.map(item => typeof item === 'string' ? item : (item && item.text ? String(item.text) : String(item || '')));
                }
            }
        }
        return {
            id: String(c.id || generateId()),
            name: String(c.name || '未命名班級'),
            accessCode: typeof c.accessCode === 'string' ? c.accessCode.trim() : (typeof c.accessCode === 'number' ? String(c.accessCode) : ''),
            lastMaxSeat: typeof c.lastMaxSeat === 'number' ? c.lastMaxSeat : (parseInt(c.lastMaxSeat, 10) || 30),
            lastMissingSeats: typeof c.lastMissingSeats === 'string' ? c.lastMissingSeats : '',
            studentBarcodes: cleanBarcodes,
            contactBook: cleanContact
        };
    }).filter(Boolean) : [];

    const cleanHomeworks = Array.isArray(data.homeworks) ? data.homeworks.map(h => {
        if (!h || typeof h !== 'object') return null;
        const cleanStudents = Array.isArray(h.students) ? h.students.map(s => {
            if (!s || typeof s !== 'object') return null;
            return {
                seat: typeof s.seat === 'number' ? s.seat : (parseInt(s.seat, 10) || 1),
                status: String(s.status || 'not-submitted')
            };
        }).filter(Boolean) : [];
        return {
            id: String(h.id || generateId()),
            classId: String(h.classId || ''),
            name: String(h.name || '未命名作業'),
            studentCount: typeof h.studentCount === 'number' ? h.studentCount : cleanStudents.length,
            typeId: String(h.typeId || 'default'),
            createdAt: h.createdAt ? (h.createdAt instanceof Date ? h.createdAt.toISOString() : String(h.createdAt)) : new Date().toISOString(),
            students: cleanStudents
        };
    }).filter(Boolean) : [];

    const cleanTypes = Array.isArray(data.homeworkTypes) && data.homeworkTypes.length > 0 ? data.homeworkTypes.map(t => {
        if (!t || typeof t !== 'object') return null;
        const cleanStatuses = Array.isArray(t.statuses) ? t.statuses.map(s => {
            if (!s || typeof s !== 'object') return null;
            return {
                key: String(s.key || 's1'),
                text: String(s.text || '狀態'),
                color: String(s.color || 'bg-slate-200'),
                textColor: String(s.textColor || 'text-slate-500'),
                isCompleted: !!s.isCompleted
            };
        }).filter(Boolean) : [];
        return {
            id: String(t.id || generateId()),
            name: String(t.name || '種類'),
            statuses: cleanStatuses.length > 0 ? cleanStatuses : [
                { key: 'not-submitted', text: '未繳交', color: 'bg-slate-200', textColor: 'text-slate-500', isCompleted: false },
                { key: 'completed', text: '已完成', color: 'bg-emerald-500', textColor: 'text-white', isCompleted: true }
            ]
        };
    }).filter(Boolean) : safeClone(DEFAULT_TYPES);

    return {
        classes: cleanClasses,
        homeworks: cleanHomeworks,
        homeworkTypes: cleanTypes
    };
}

export function formatDate(date, format) {
    if (!date) return '';
    let d = date;
    if (!(d instanceof Date)) d = new Date(d);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear(), month = d.getMonth() + 1, day = d.getDate();
    if (format === 'YYYY-MM-DD') return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return `${year}/${month}/${day}`;
}

export function fixDates(dataObj) {
    if (dataObj && dataObj.homeworks) { 
        dataObj.homeworks.forEach(h => { 
            if (h && h.createdAt && typeof h.createdAt === 'string') h.createdAt = new Date(h.createdAt); 
        }); 
    }
    if (dataObj && dataObj.homeworkTypes) { 
        dataObj.homeworkTypes.forEach(t => { 
            (t.statuses || []).forEach(s => { 
                if (s.color === 'bg-red-500') { s.color = 'bg-rose-500'; s.textColor = 'text-white'; } 
                else if (s.color === 'bg-yellow-500') { s.color = 'bg-amber-400'; s.textColor = 'text-amber-950'; } 
                else if (s.color === 'bg-green-500') { s.color = 'bg-emerald-500'; s.textColor = 'text-white'; } 
                else if (s.color === 'bg-gray-300') { s.color = 'bg-slate-200'; s.textColor = 'text-slate-500'; } 
            }); 
        }); 
    }
}

export async function safeCopyToClipboard(text, successMsg = "已複製至剪貼簿") {
    if (!text) return false;
    let copied = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
        }
    } catch (err) {
        copied = false;
    }

    if (!copied) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            copied = document.execCommand('copy');
            textArea.remove();
        } catch (e) {
            copied = false;
        }
    }

    if (copied) {
        if (successMsg) showToast(successMsg, "success");
        return true;
    } else {
        showToast("複製失敗，請手動複製", "error");
        return false;
    }
}

export function generateRandomAccessCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export function openModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden', 'opacity-0');
    modal.classList.add('flex', 'opacity-100');
    const content = modal.querySelector('.modal-content, .confirm-modal-content');
    if (content) {
        requestAnimationFrame(() => {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        });
    }
}

export function closeModal(modal) {
    if (!modal) return;
    const content = modal.querySelector('.modal-content, .confirm-modal-content');
    if (content) {
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            modal.classList.remove('flex', 'opacity-100');
            modal.classList.add('hidden', 'opacity-0');
        }, 150);
    } else {
        modal.classList.remove('flex', 'opacity-100');
        modal.classList.add('hidden', 'opacity-0');
    }
}

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    while (container.children.length >= 3) {
        container.firstElementChild.remove();
    }
    const toast = document.createElement('div');
    toast.className = `transform translate-y-3 opacity-0 transition-all duration-200 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-lg border text-sm font-bold z-[110] ${
        type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' :
        type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-100' :
        type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' :
        'bg-slate-900 text-white border-slate-800'
    }`;
    
    let icon = type === 'success' ? '<svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>' :
               type === 'error' ? '<svg class="w-4 h-4 text-rose-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>' :
               type === 'warning' ? '<svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>' :
               '<svg class="w-4 h-4 text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>';

    toast.innerHTML = `${icon}<span class="truncate">${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-3', 'opacity-0');
    });
    setTimeout(() => {
        toast.classList.add('translate-y-3', 'opacity-0');
        setTimeout(() => toast.remove(), 200);
    }, 2200);
}

export function showAlertModal(title, message, onOk) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const confirmOk = document.getElementById('confirm-ok');
    const confirmCancel = document.getElementById('confirm-cancel');
    confirmCancel.classList.add('hidden');
    openModal(document.getElementById('confirm-modal'));
    const okHandler = () => { 
        closeModal(document.getElementById('confirm-modal')); 
        cleanup(); 
        if (onOk) onOk(); 
    };
    const cleanup = () => { 
        confirmOk.removeEventListener('click', okHandler); 
        confirmCancel.classList.remove('hidden'); 
    };
    confirmOk.addEventListener('click', okHandler);
}

export function showConfirmModal(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title; 
    document.getElementById('confirm-message').textContent = message; 
    const confirmCancel = document.getElementById('confirm-cancel');
    const confirmOk = document.getElementById('confirm-ok');
    confirmCancel.classList.remove('hidden');
    openModal(document.getElementById('confirm-modal'));
    const confirmHandler = () => { 
        closeModal(document.getElementById('confirm-modal')); 
        cleanup(); 
        if (onConfirm) onConfirm(); 
    };
    const cancelHandler = () => { 
        closeModal(document.getElementById('confirm-modal')); 
        cleanup(); 
    };
    const cleanup = () => { 
        confirmOk.removeEventListener('click', confirmHandler); 
        confirmCancel.removeEventListener('click', cancelHandler); 
    };
    confirmOk.addEventListener('click', confirmHandler);
    confirmCancel.addEventListener('click', cancelHandler);
}

export function showNamePromptModal(callback) {
    const modal = document.getElementById('name-prompt-modal');
    if (!modal) {
        const name = prompt("請輸入您的尊姓大名或暱稱：", localStorage.getItem('visitor_name') || '親愛的老師');
        if (callback) callback(name);
        return;
    }
    const input = document.getElementById('name-prompt-input') || document.getElementById('visitor-name-input');
    const form = document.getElementById('name-prompt-form');
    const cancelBtn = document.getElementById('name-prompt-cancel') || modal.querySelector('.close-modal');
    if (input) input.value = localStorage.getItem('visitor_name') || '親愛的老師';
    openModal(modal);
    if (input) {
        setTimeout(() => {
            input.focus();
            input.select();
        }, 200);
    }
    const submitHandler = (e) => {
        e.preventDefault();
        cleanup();
        closeModal(modal);
        const name = input ? input.value.trim() : '';
        if (callback) callback(name || '親愛的老師');
    };
    const cancelHandler = () => {
        cleanup();
        closeModal(modal);
        if (callback) callback(null);
    };
    const cleanup = () => {
        if (form) form.removeEventListener('submit', submitHandler);
        if (cancelBtn) cancelBtn.removeEventListener('click', cancelHandler);
    };
    if (form) form.addEventListener('submit', submitHandler);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelHandler);
}

export const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
};

export const bindSubmit = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('submit', handler);
};

export const bindChange = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', handler);
};

// Attach globally for window convenience
window.showToast = showToast;
window.showAlertModal = showAlertModal;
window.showConfirmModal = showConfirmModal;
window.showNamePromptModal = showNamePromptModal;
window.safeCopyToClipboard = safeCopyToClipboard;
