import { state } from './state.js';
import { safeStringify, safeClone, sanitizeAppData, fixDates, formatDate, generateId, showToast, showAlertModal, closeModal } from './utils.js';
import { syncDataToCloud } from './firebase.js';
import { DEFAULT_TYPES } from './constants.js';

export function getDB() { 
    return new Promise((resolve, reject) => { 
        const request = indexedDB.open('HomeworkAppLocalDB', 1); 
        request.onupgradeneeded = (e) => e.target.result.createObjectStore('settings'); 
        request.onsuccess = (e) => resolve(e.target.result); 
        request.onerror = (e) => reject(e.target.error); 
    }); 
}

export async function saveFileHandle(handle) { 
    const db = await getDB(); 
    return new Promise((resolve) => { 
        const tx = db.transaction('settings', 'readwrite'); 
        tx.objectStore('settings').put(handle, 'fileHandle'); 
        tx.oncomplete = () => resolve(); 
    }); 
}

export async function getFileHandle() { 
    const db = await getDB(); 
    return new Promise((resolve) => { 
        const tx = db.transaction('settings', 'readonly'); 
        const req = tx.objectStore('settings').get('fileHandle'); 
        req.onsuccess = () => resolve(req.result); 
        req.onerror = () => resolve(null); 
    }); 
}

export async function clearFileHandle() { 
    const db = await getDB(); 
    return new Promise((resolve) => { 
        const tx = db.transaction('settings', 'readwrite'); 
        tx.objectStore('settings').delete('fileHandle'); 
        tx.oncomplete = () => resolve(); 
    }); 
}

let lastBackupTime = 0;
export function runAutoBackup() {
    const now = Date.now();
    if (now - lastBackupTime < 300000) return; // 每 5 分鐘最多執行一次
    lastBackupTime = now;
    try {
        const today = formatDate(new Date(), 'YYYY-MM-DD'); 
        const backupKey = `hw_backup_${today}`;
        localStorage.setItem(backupKey, safeStringify(state.appData));
        const keys = Object.keys(localStorage).filter(k => k.startsWith('hw_backup_')).sort();
        if (keys.length > 3) keys.slice(0, keys.length - 3).forEach(k => localStorage.removeItem(k));
    } catch (e) {}
}

export function saveData() {
    if (state.adminViewModeUserId) {
        showToast("唯讀模式：無法修改用戶資料", "warning");
        return Promise.resolve();
    }
    state.isLocalEmptyOnBoot = false; 

    // ⚡ 1. 立即同步寫入 localStorage，客戶端 0 延遲與即時更新
    try {
        localStorage.setItem('homeworkAppData', safeStringify(state.appData));
    } catch (err) {
        console.error("Local storage save error:", err);
    }

    // ⚡ 2. 背景非同步防抖處理磁碟寫入與雲端備份，完全不卡死 UI 執行緒
    if (state.saveTimeout) clearTimeout(state.saveTimeout);
    state.isSaving = true;
    state.saveTimeout = setTimeout(async () => {
        try {
            runAutoBackup();
            if (state.fileHandle && (await state.fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
                const writable = await state.fileHandle.createWritable();
                await writable.write(safeStringify(state.appData));
                await writable.close();
            }
            if (sessionStorage.getItem('app_is_guest_mode') !== 'true') {
                await syncDataToCloud();
            }
        } catch (error) { 
            console.error("Background sync error:", error); 
        } finally { 
            state.isSaving = false; 
        }
    }, 600);

    return Promise.resolve();
}

export async function syncFromFileHandle(onUpdateCallback) {
    if (!state.fileHandle) return false;
    try {
        const file = await state.fileHandle.getFile(); 
        const text = await file.text();
        if (text) { 
            state.appData = sanitizeAppData(JSON.parse(text)); 
            fixDates(state.appData); 
            localStorage.setItem('homeworkAppData', safeStringify(state.appData)); 
            runAutoBackup(); 
            if (onUpdateCallback) onUpdateCallback();
            return true; 
        }
    } catch (e) {
        showAlertModal("連線遺失", "讀取本地實體檔案失敗，可能是檔案已被移動或刪除。系統將自動切換為暫存模式。");
        await clearFileHandle(); 
        state.fileHandle = null; 
        if (onUpdateCallback) onUpdateCallback();
    }
    return false;
}

export async function syncFromFileHandleSilently(onUpdateCallback) {
    if (!state.fileHandle) return false;
    try {
        const file = await state.fileHandle.getFile(); 
        const text = await file.text();
        if (text) {
            const newData = sanitizeAppData(JSON.parse(text));
            if (safeStringify(newData) !== safeStringify(state.appData)) { 
                state.appData = newData; 
                fixDates(state.appData); 
                localStorage.setItem('homeworkAppData', safeStringify(state.appData)); 
                if (onUpdateCallback) onUpdateCallback();
                return true; 
            }
        }
    } catch (e) {} 
    return false;
}

export function checkAndCleanupStorage() {
    try {
        const fullBytes = new Blob([safeStringify(state.appData)]).size;
        const sizeKB = (fullBytes / 1024).toFixed(1);
        if (fullBytes > 4 * 1024 * 1024) { // 超過 4MB 警告
            showToast(`⚠️ 本地資料量較大 (${sizeKB} KB)，建議使用匯出備份。`, 'warning');
        }
    } catch(e) {}
}

function isSameTypeContent(typeA, typeB) {
    if (!typeA || !typeB) return false;
    if ((typeA.name || '').trim() !== (typeB.name || '').trim()) return false;
    const statusesA = typeA.statuses || [];
    const statusesB = typeB.statuses || [];
    if (statusesA.length !== statusesB.length) return false;
    for (let i = 0; i < statusesA.length; i++) {
        const sA = statusesA[i], sB = statusesB[i];
        if (!sA || !sB) return false;
        if ((sA.text || '').trim() !== (sB.text || '').trim()) return false;
        if (sA.color !== sB.color) return false;
        if (Boolean(sA.isCompleted) !== Boolean(sB.isCompleted)) return false;
    }
    return true;
}

export async function executeCopyClassData(sourceClass, targetClass, { syncHw, syncTypes, syncBarcodes, syncContact }, mode, onDoneCallback) {
    let hwAddedCount = 0;
    let contactAddedCount = 0;
    let typeIdMap = {};

    function getHwType(typeId) {
        return state.appData.homeworkTypes.find(t => t.id === typeId) || state.appData.homeworkTypes.find(t => t.id === 'default') || DEFAULT_TYPES[0];
    }

    // 1. 作業種類處理
    if (syncTypes) {
        (state.appData.homeworkTypes || []).forEach(srcType => {
            const existingMatch = state.appData.homeworkTypes.find(existingType => 
                existingType.id === srcType.id || isSameTypeContent(existingType, srcType)
            );
            if (existingMatch) {
                typeIdMap[srcType.id] = existingMatch.id;
            } else {
                const newTypeId = generateId();
                state.appData.homeworkTypes.push({
                    id: newTypeId,
                    name: srcType.name,
                    statuses: JSON.parse(safeStringify(srcType.statuses || []))
                });
                typeIdMap[srcType.id] = newTypeId;
            }
        });
    }

    // 2. 條碼設定處理
    if (syncBarcodes) {
        if (mode === 'overwrite') {
            targetClass.studentBarcodes = JSON.parse(safeStringify(sourceClass.studentBarcodes || {}));
            if (sourceClass.lastMaxSeat) targetClass.lastMaxSeat = sourceClass.lastMaxSeat;
        } else {
            targetClass.studentBarcodes = targetClass.studentBarcodes || {};
            const srcBarcodes = sourceClass.studentBarcodes || {};
            for (const [seat, code] of Object.entries(srcBarcodes)) {
                if (!targetClass.studentBarcodes[seat]) {
                    targetClass.studentBarcodes[seat] = code;
                }
            }
            if (!targetClass.lastMaxSeat && sourceClass.lastMaxSeat) {
                targetClass.lastMaxSeat = sourceClass.lastMaxSeat;
            }
        }
    }

    // 3. 聯絡簿記事處理
    if (syncContact) {
        const srcContact = sourceClass.contactBook || {};
        if (mode === 'overwrite') {
            targetClass.contactBook = {};
            for (const [dateStr, items] of Object.entries(srcContact)) {
                if (Array.isArray(items)) {
                    targetClass.contactBook[dateStr] = items.map(it => typeof it === 'string' ? it : (it && it.text ? String(it.text) : String(it || '')));
                    contactAddedCount += targetClass.contactBook[dateStr].length;
                }
            }
        } else {
            targetClass.contactBook = targetClass.contactBook || {};
            for (const [dateStr, items] of Object.entries(srcContact)) {
                if (!targetClass.contactBook[dateStr]) {
                    targetClass.contactBook[dateStr] = [];
                }
                const targetItems = targetClass.contactBook[dateStr];
                (items || []).forEach(srcItem => {
                    const rawText = typeof srcItem === 'string' ? srcItem : (srcItem && srcItem.text ? srcItem.text : String(srcItem || ''));
                    const cleanText = rawText.trim();
                    const isDup = targetItems.some(ti => (typeof ti === 'string' ? ti.trim() : (ti.text || '').trim()) === cleanText);
                    if (!isDup && cleanText) {
                        targetItems.push(rawText);
                        contactAddedCount++;
                    }
                });
            }
        }
    }

    // 4. 作業清單處理
    if (syncHw) {
        const sourceHws = state.appData.homeworks.filter(h => h.classId === sourceClass.id);
        const targetMaxSeat = targetClass.lastMaxSeat || 30;

        if (mode === 'overwrite') {
            state.appData.homeworks = state.appData.homeworks.filter(h => h.classId !== targetClass.id);
            sourceHws.forEach(srcHw => {
                const targetTypeId = typeIdMap[srcHw.typeId] || srcHw.typeId || 'default';
                const targetType = getHwType(targetTypeId);
                const defaultStatus = targetType.statuses[0]?.key || 'not-submitted';
                
                const newStudents = [];
                for (let i = 1; i <= targetMaxSeat; i++) {
                    const existingSrcStudent = (srcHw.students || []).find(s => s.seat === i);
                    newStudents.push({
                        seat: i,
                        status: existingSrcStudent ? existingSrcStudent.status : defaultStatus
                    });
                }

                state.appData.homeworks.push({
                    id: generateId(),
                    classId: targetClass.id,
                    name: srcHw.name,
                    studentCount: newStudents.length,
                    typeId: targetTypeId,
                    createdAt: srcHw.createdAt || new Date().toISOString(),
                    students: newStudents
                });
                hwAddedCount++;
            });
        } else {
            const existingTargetHws = state.appData.homeworks.filter(h => h.classId === targetClass.id);

            sourceHws.forEach(srcHw => {
                const targetTypeId = typeIdMap[srcHw.typeId] || srcHw.typeId || 'default';
                const srcTypeName = (getHwType(srcHw.typeId)?.name || '').trim();

                const isDup = existingTargetHws.some(th => {
                    const thTypeName = (getHwType(th.typeId)?.name || '').trim();
                    return th.name.trim() === srcHw.name.trim() && thTypeName === srcTypeName;
                });

                if (!isDup) {
                    const targetType = getHwType(targetTypeId);
                    const defaultStatus = targetType.statuses[0]?.key || 'not-submitted';
                    
                    const newStudents = [];
                    for (let i = 1; i <= targetMaxSeat; i++) {
                        const existingSrcStudent = (srcHw.students || []).find(s => s.seat === i);
                        newStudents.push({
                            seat: i,
                            status: existingSrcStudent ? existingSrcStudent.status : defaultStatus
                        });
                    }

                    const newHw = {
                        id: generateId(),
                        classId: targetClass.id,
                        name: srcHw.name,
                        studentCount: newStudents.length,
                        typeId: targetTypeId,
                        createdAt: srcHw.createdAt || new Date().toISOString(),
                        students: newStudents
                    };
                    state.appData.homeworks.push(newHw);
                    existingTargetHws.push(newHw);
                    hwAddedCount++;
                }
            });
        }
    }

    await saveData();
    if (onDoneCallback) onDoneCallback();
    closeModal(document.getElementById('copy-class-modal'));
    closeModal(document.getElementById('settings-modal'));
    showToast(`✅ 資料同步完成！${syncHw ? ` (新增 ${hwAddedCount} 項作業)` : ''}`, 'success');
}
