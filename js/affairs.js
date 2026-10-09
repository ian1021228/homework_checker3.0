/**
 * 班級事務與問卷回條模組 (Class Affairs & Notice Slips)
 * 支援：建立通知單回條、單選/複選/意見欄、家長手寫電子簽章檢視、回條繳回率統計、未繳名單複製與 CSV 匯出
 */

import { state } from './state.js';
import { saveData } from './storage.js';
import { generateId, showToast, safeCopyToClipboard, openModal, closeModal, showConfirmDialog } from './utils.js';

export function renderAffairsPage() {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    currentClass.affairs = currentClass.affairs || [];
    currentClass.affairResponses = currentClass.affairResponses || {};

    const container = document.getElementById('affairs-list-container');
    if (!container) return;

    if (currentClass.affairs.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-16 flex flex-col items-center justify-center text-slate-400 bg-white/60 rounded-3xl border-2 border-dashed border-slate-200">
                <div class="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center text-3xl mb-3 shadow-xs">
                    <i class="fa-solid fa-folder-open"></i>
                </div>
                <h3 class="text-base font-black text-slate-700">目前尚無班級事務或問卷回條</h3>
                <p class="text-xs text-slate-400 mt-1">點擊右上角「＋ 新增問卷回條」，快速發布家長通知單與意願調查</p>
            </div>
        `;
        return;
    }

    const maxSeat = typeof currentClass.lastMaxSeat === 'number' && currentClass.lastMaxSeat > 0 
        ? currentClass.lastMaxSeat 
        : ((currentClass.students || []).length || 30);

    const cardsHtml = currentClass.affairs.map(item => {
        const responses = currentClass.affairResponses[item.id] || {};
        const isClosed = item.deadline && new Date(item.deadline) < new Date();

        let signedCount = 0;
        const seatBadges = [];
        for (let s = 1; s <= maxSeat; s++) {
            const studentInfo = (currentClass.students || []).find(st => Number(st.seat) === s);
            const name = studentInfo ? studentInfo.name : `${s}號`;
            const resp = responses[s] || responses[String(s)];
            const isSigned = Boolean(resp && (resp.signatureDataUrl || resp.signedAt || resp.selectedOptions));
            if (isSigned) signedCount++;

            seatBadges.push(`
                <div class="flex items-center justify-between p-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
                    isSigned 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs' 
                        : 'bg-rose-50/70 text-rose-600 border border-rose-200/80 shadow-2xs'
                }" title="${s}號 ${name}：${isSigned ? '已簽名' : '未簽名'}">
                    <span class="font-mono">${String(s).padStart(2, '0')}</span>
                    <span class="text-[10px] font-black flex items-center gap-0.5 ${isSigned ? 'text-emerald-700' : 'text-rose-500'}">
                        <i class="fa-solid ${isSigned ? 'fa-check text-emerald-600' : 'fa-xmark text-rose-500'}"></i>
                        ${isSigned ? '已簽' : '未簽'}
                    </span>
                </div>
            `);
        }

        const rate = maxSeat > 0 ? Math.round((signedCount / maxSeat) * 100) : 0;

        return `
            <div class="glass-card rounded-3xl p-6 border border-slate-200/90 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <span class="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-xl ${isClosed ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-600 border border-rose-200'}">
                            <i class="fa-solid ${isClosed ? 'fa-clock' : 'fa-circle-dot text-[9px]'}"></i>
                            ${isClosed ? '已截止' : '發布中'}
                        </span>
                        <span class="text-xs font-bold text-slate-400">
                            截止：${item.deadline || '無期限'}
                        </span>
                    </div>

                    <h3 class="text-lg font-black text-slate-900 line-clamp-1 mb-2">${item.title}</h3>
                    <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">${item.content || '無詳細說明'}</p>

                    <!-- 回條簽覆進度 -->
                    <div class="mb-3">
                        <div class="flex items-center justify-between text-xs font-black mb-1.5">
                            <span class="text-slate-600">繳回覆核率</span>
                            <span class="text-rose-600 font-mono">${signedCount} / ${maxSeat} 份 (${rate}%)</span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                            <div class="bg-gradient-to-r from-rose-500 to-pink-500 h-2.5 rounded-full transition-all duration-500" style="width: ${rate}%"></div>
                        </div>
                    </div>

                    <!-- 全班座號簽名情形 (標注已簽名 / 未簽名) -->
                    <div class="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/70 mb-4 space-y-2">
                        <div class="flex items-center justify-between text-xs font-black">
                            <span class="text-slate-700 flex items-center gap-1.5">
                                <i class="fa-solid fa-signature text-rose-500"></i>
                                全班各座號簽名情形
                            </span>
                            <span class="text-[11px] font-bold text-slate-500">
                                <span class="text-emerald-700 font-black">已簽名 ${signedCount}</span> / 
                                <span class="text-rose-600 font-black">未簽名 ${maxSeat - signedCount}</span>
                            </span>
                        </div>
                        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto pr-0.5 custom-scrollbar">
                            ${seatBadges.join('')}
                        </div>
                    </div>
                </div>

                <div class="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button 
                        type="button" 
                        class="view-affair-details-btn py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        data-id="${item.id}"
                    >
                        <i class="fa-solid fa-chart-pie"></i> 查看回條詳情與名單
                    </button>
                    <button 
                        type="button" 
                        class="delete-affair-btn w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-all cursor-pointer"
                        data-id="${item.id}"
                        title="刪除此回條"
                    >
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;

    // 綁定按鈕事件
    container.querySelectorAll('.view-affair-details-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            openAffairDetailsModal(id);
        });
    });

    container.querySelectorAll('.delete-affair-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            deleteAffair(id);
        });
    });
}

/**
 * 建立新問卷回條
 */
export function createNewAffair(data) {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    currentClass.affairs = currentClass.affairs || [];
    const newAffair = {
        id: 'affair_' + generateId(),
        title: data.title.trim(),
        content: data.content.trim(),
        deadline: data.deadline || '',
        type: data.type || 'single', // 'single' | 'multiple' | 'opinion'
        options: data.options || ['同意', '不同意'],
        requireSignature: Boolean(data.requireSignature),
        createdAt: new Date().toISOString()
    };

    currentClass.affairs.unshift(newAffair);
    saveData();
    showToast('問卷回條已成功發布！家長端可即時線上查閱並填寫簽署', 'success');
    renderAffairsPage();
}

/**
 * 刪除回條
 */
export async function deleteAffair(affairId) {
    const ok = await showConfirmDialog('刪除問卷回條', '確定要刪除此問卷回條嗎？已繳回之簽章紀錄將一併移除！', {
        okText: '確定刪除',
        okClass: 'bg-rose-500 text-white font-bold py-2.5 px-6 text-sm rounded-xl shadow-md hover:bg-rose-600 transition-colors'
    });
    if (!ok) return;

    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    currentClass.affairs = (currentClass.affairs || []).filter(a => a.id !== affairId);
    if (currentClass.affairResponses) {
        delete currentClass.affairResponses[affairId];
    }

    saveData();
    showToast('問卷回條已刪除！', 'info');
    renderAffairsPage();
}

/**
 * 開啟回條詳情統計與簽章檢視彈窗
 */
export function openAffairDetailsModal(affairId) {
    const currentClass = (state.appData?.classes || []).find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const affair = (currentClass.affairs || []).find(a => a.id === affairId);
    if (!affair) return;

    const modal = document.getElementById('affair-details-modal');
    if (!modal) return;

    const responses = currentClass.affairResponses?.[affairId] || {};
    const maxSeat = typeof currentClass.lastMaxSeat === 'number' && currentClass.lastMaxSeat > 0 
        ? currentClass.lastMaxSeat 
        : ((currentClass.students || []).length || 30);

    // 填充標題與內文
    document.getElementById('affair-detail-title').textContent = affair.title;
    document.getElementById('affair-detail-content').textContent = affair.content || '無詳細說明';
    document.getElementById('affair-detail-deadline').textContent = `截止日期：${affair.deadline || '無期限'}`;

    // 統計各選項票數
    const statsContainer = document.getElementById('affair-options-stats');
    if (statsContainer && affair.options && affair.options.length > 0) {
        const counts = {};
        affair.options.forEach(opt => counts[opt] = 0);
        Object.values(responses).forEach(res => {
            const chosen = Array.isArray(res.selectedOptions) ? res.selectedOptions : [res.selectedOptions];
            chosen.forEach(opt => {
                if (counts[opt] !== undefined) counts[opt]++;
            });
        });

        statsContainer.innerHTML = affair.options.map(opt => {
            const count = counts[opt] || 0;
            const pct = maxSeat > 0 ? Math.round((count / maxSeat) * 100) : 0;
            return `
                <div class="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                    <div class="flex items-center justify-between text-xs font-black mb-1">
                        <span class="text-slate-800">${opt}</span>
                        <span class="text-indigo-600 font-mono">${count} 票 (${pct}%)</span>
                    </div>
                    <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div class="bg-indigo-600 h-2 rounded-full" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 渲染學生座號繳回清單與簽名預覽
    const tableBody = document.getElementById('affair-responses-table-body');
    const unsubmittedSeats = [];
    let signedModalCount = 0;

    if (tableBody) {
        const rowsHtml = [];
        for (let s = 1; s <= maxSeat; s++) {
            const studentInfo = (currentClass.students || []).find(st => Number(st.seat) === s);
            const name = studentInfo ? studentInfo.name : `${s}號`;
            const resp = responses[s] || responses[String(s)];
            const isSigned = Boolean(resp && (resp.signatureDataUrl || resp.signedAt || resp.selectedOptions));

            if (!isSigned) {
                unsubmittedSeats.push(s);
                rowsHtml.push(`
                    <tr class="affair-row border-b border-slate-100 bg-rose-50/20" data-status="unsubmitted">
                        <td class="p-3 text-xs font-mono font-bold text-slate-700">${String(s).padStart(2, '0')}</td>
                        <td class="p-3 text-xs font-black text-slate-800">${name}</td>
                        <td class="p-3 text-xs font-black">
                            <span class="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 text-[11px] font-black inline-flex items-center gap-1 border border-rose-200">
                                <i class="fa-solid fa-circle-xmark text-rose-500"></i> 未簽名
                            </span>
                        </td>
                        <td class="p-3 text-xs text-rose-400 font-bold">未填寫繳回</td>
                        <td class="p-3 text-xs text-slate-400">-</td>
                        <td class="p-3 text-xs text-slate-400">-</td>
                        <td class="p-3 text-xs text-slate-400">-</td>
                    </tr>
                `);
            } else {
                signedModalCount++;
                const chosenText = Array.isArray(resp.selectedOptions) ? resp.selectedOptions.join('、') : (resp.selectedOptions || '-');
                const sigPreview = resp.signatureDataUrl 
                    ? `<img src="${resp.signatureDataUrl}" class="h-6 w-auto max-w-[90px] border border-slate-200 rounded bg-white p-0.5" alt="家長簽名">`
                    : `<span class="text-[11px] text-emerald-600 font-bold">線上已認證</span>`;
                
                rowsHtml.push(`
                    <tr class="affair-row border-b border-slate-100 hover:bg-slate-50" data-status="signed">
                        <td class="p-3 text-xs font-mono font-bold text-slate-700">${String(s).padStart(2, '0')}</td>
                        <td class="p-3 text-xs font-black text-slate-800">${name}</td>
                        <td class="p-3 text-xs font-black">
                            <span class="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-black inline-flex items-center gap-1 border border-emerald-200">
                                <i class="fa-solid fa-circle-check text-emerald-600"></i> 已簽名
                            </span>
                        </td>
                        <td class="p-3 text-xs font-black text-emerald-700">
                            <span class="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[11px]">${chosenText}</span>
                        </td>
                        <td class="p-3 text-xs text-slate-600 max-w-[150px] truncate" title="${resp.opinion || ''}">${resp.opinion || '-'}</td>
                        <td class="p-3 text-xs">${sigPreview}</td>
                        <td class="p-3 text-[11px] font-mono text-slate-400">${resp.signedAt ? resp.signedAt.slice(0, 16).replace('T', ' ') : '-'}</td>
                    </tr>
                `);
            }
        }
        tableBody.innerHTML = rowsHtml.join('');

        // 更新彈窗統計
        const signedCountEl = document.getElementById('affair-modal-signed-count');
        const unsubCountEl = document.getElementById('affair-modal-unsub-count');
        if (signedCountEl) signedCountEl.textContent = `已簽名 ${signedModalCount} 人`;
        if (unsubCountEl) unsubCountEl.textContent = `未簽名 ${unsubmittedSeats.length} 人`;

        // 綁定篩選按鈕
        const filterBtns = document.querySelectorAll('.affair-filter-btn');
        filterBtns.forEach(btn => {
            btn.onclick = () => {
                const filter = btn.dataset.filter;
                filterBtns.forEach(b => {
                    b.className = 'affair-filter-btn px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer';
                });
                btn.className = 'affair-filter-btn px-2.5 py-1 rounded-lg bg-slate-900 text-white cursor-pointer';

                const rows = tableBody.querySelectorAll('.affair-row');
                rows.forEach(r => {
                    if (filter === 'all') {
                        r.classList.remove('hidden');
                    } else if (filter === 'signed') {
                        r.classList.toggle('hidden', r.dataset.status !== 'signed');
                    } else if (filter === 'unsubmitted') {
                        r.classList.toggle('hidden', r.dataset.status !== 'unsubmitted');
                    }
                });
            };
        });
    }

    // 綁定複製未繳名單按鈕
    const copyUnsubBtn = document.getElementById('affair-copy-unsubmitted-btn');
    if (copyUnsubBtn) {
        copyUnsubBtn.onclick = () => {
            if (unsubmittedSeats.length === 0) {
                showToast('全班已全數繳回問卷！無未繳名單', 'success');
                return;
            }
            const txt = `📢 【${currentClass.name}】問卷回條未繳名單：\n` +
                        `📋 回條名稱：${affair.title}\n` +
                        `✘ 未繳回座號 (${unsubmittedSeats.length}人)：${unsubmittedSeats.map(s => String(s).padStart(2, '0')).join(', ')}\n` +
                        `請家長撥冗點開連結完成線上簽章，感謝您的配合！`;
            safeCopyToClipboard(txt);
            showToast('已複製未繳名單催簽文案！可傳至 LINE 群組', 'success');
        };
    }

    openModal(modal);
}
