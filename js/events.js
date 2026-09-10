/**
 * 親師作業點收X聯絡簿系統 3.0 - DOM 事件監聽與交互管理
 */

import { state } from './state.js';

import {
    DEFAULT_TYPES,
    STATUS_COLORS,
    globalAppId
} from './constants.js';

import {
    generateId,
    formatDate,
    safeClone,
    safeStringify,
    generateRandomAccessCode,
    sanitizeAppData,
    fixDates,
    showToast,
    showAlertModal,
    showConfirmModal,
    showNamePromptModal,
    safeCopyToClipboard,
    openModal,
    closeModal,
    bindClick,
    bindSubmit,
    bindChange
} from './utils.js';

import {
    fbAuth,
    fbDb,
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signOut,
    sendPasswordResetEmail,
    sendEmailVerification,
    reload,
    applyActionCode,
    doc,
    setDoc,
    getDocs,
    collection,
    isGoogleAdmin,
    loadAllUsersForAdmin,
    loadDataFromCloud,
    syncUserProfile,
    deleteCloudParentClass,
    syncDataToCloud
} from './firebase.js';

import {
    saveData,
    saveFileHandle,
    getFileHandle,
    clearFileHandle,
    syncFromFileHandle,
    executeCopyClassData
} from './storage.js';

import {
    getHomeworkType,
    updateSingleStudentUI,
    updateSummaryUI,
    updateTypeSelects,
    renderClassSelector,
    renderClassList,
    renderHomeworkList,
    renderStudentGrid,
    renderStudentDetailsPage,
    renderHomeworkTypesPage,
    renderContactBookItems,
    renderCalendar,
    updateDataManagementUI,
    updatePortalUI,
    } from './render.js';

import {
    applyCheckMode,
    pushPageState,
    showPortalPage,
    showMainPage,
    showDetailPage,
    showStudentDetailsPage,
    showContactBookPage,
    showHomeworkTypesPage,
    promptSystemUsageAndNavigate,
    openPortalAuthModal,
    closePortalAuthModal,
    proceedIntoSystem,
    openCopyClassModal,
    showWelcomeStep2
, fullRender } from './navigation.js';

export function setupButtonEvents() {
    // 訪客體驗懸浮回首頁
    bindClick('guest-home-btn', () => {
        showPortalPage(false);
    });

    // 系統內部點擊 Logo（平滑回到頁面頂部）
    bindClick('main-logo-btn', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 首頁導覽列與頁尾 Logo
    bindClick('portal-nav-logo-btn', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    bindClick('portal-footer-logo-btn', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 導覽列按鈕
    bindClick('portal-nav-login-btn', () => openPortalAuthModal('signin'));
    bindClick('portal-nav-signup-btn', () => openPortalAuthModal('signup'));
    bindClick('portal-nav-enter-btn', () => {
        sessionStorage.removeItem('app_is_guest_mode');
        proceedIntoSystem();
    });

    // 首頁 Hero / 行動按鈕
    bindClick('portal-hero-start-btn', () => {
        promptSystemUsageAndNavigate();
    });
    bindClick('portal-hero-guest-btn', () => {
        sessionStorage.setItem('app_is_guest_mode', 'true');
        showToast("已進入免帳號快速體驗模式（本地暫存，不寫入雲端）", "info");
        proceedIntoSystem();
    });
    bindClick('portal-cta-start-btn', () => {
        promptSystemUsageAndNavigate();
    });

    // 詢問是否使用過系統之互動按鈕
    bindClick('usage-inquiry-yes-btn', () => {
        const modal = document.getElementById('usage-inquiry-modal');
        if (modal) closeModal(modal);
        openPortalAuthModal('signin');
    });
    bindClick('usage-inquiry-no-btn', () => {
        const modal = document.getElementById('usage-inquiry-modal');
        if (modal) closeModal(modal);
        openPortalAuthModal('signup');
    });
    bindClick('usage-inquiry-close-btn', () => {
        const modal = document.getElementById('usage-inquiry-modal');
        if (modal) closeModal(modal);
    });
    const inquiryModal = document.getElementById('usage-inquiry-modal');
    if (inquiryModal) {
        inquiryModal.addEventListener('click', (e) => {
            if (e.target === inquiryModal) {
                closeModal(inquiryModal);
            }
        });
    }

    bindClick('floating-guest-home-btn', () => {
        showPortalPage(false);
    });

    // ==========================================
    // 系統頂部主要導覽按鈕（作業種類、聯絡簿、學生詳情、管理班級、設定、新增作業、條碼）
    // ==========================================

    // 1. 作業種類按鈕
    bindClick('show-types-modal-btn', () => {
        showHomeworkTypesPage();
    });

    // 2. 聯絡簿按鈕
    bindClick('contact-book-btn', () => {
        if (!state.currentClassId || state.appData.classes.length === 0) {
            showAlertModal("提示", "請先建立或選擇班級，方可使用聯絡簿功能！");
            renderClassList();
            openModal(document.getElementById('manage-classes-modal'));
            return;
        }
        showContactBookPage();
    });

    // 3. 學生詳情按鈕
    bindClick('student-details-btn', () => {
        if (!state.currentClassId || state.appData.classes.length === 0) {
            showAlertModal("提示", "請先建立或選擇班級，方可查閱學生詳情！");
            renderClassList();
            openModal(document.getElementById('manage-classes-modal'));
            return;
        }
        showStudentDetailsPage();
    });

    // 4. 管理班級按鈕
    bindClick('manage-classes-btn', () => {
        renderClassList();
        openModal(document.getElementById('manage-classes-modal'));
    });

    // 5. 系統設定按鈕
    bindClick('settings-btn', () => {
        updateDataManagementUI();
        openModal(document.getElementById('settings-modal'));
    });

    // 6. 新增作業按鈕
    bindClick('show-add-modal-btn', () => {
        if (!state.currentClassId || state.appData.classes.length === 0) {
            showAlertModal("提示", "請先在「管理班級」建立班級後，再新增作業！");
            renderClassList();
            openModal(document.getElementById('manage-classes-modal'));
            return;
        }
        const modal = document.getElementById('add-homework-modal');
        if (!modal) return;
        const titleEl = document.getElementById('homework-modal-title');
        if (titleEl) titleEl.textContent = '新增作業';
        document.getElementById('student-count')?.setAttribute('required', 'required');
        modal.querySelector('form')?.reset();
        const hwNameInput = document.getElementById('homework-name');
        if (hwNameInput) hwNameInput.value = '';
        const editHwIdInput = document.getElementById('edit-homework-id');
        if (editHwIdInput) editHwIdInput.value = '';
        const scContainer = document.getElementById('student-count-container');
        if (scContainer) scContainer.style.display = 'grid';
        const htContainer = document.getElementById('homework-type-container');
        if (htContainer) htContainer.style.display = 'block';
        const msHint = document.getElementById('missing-seats-hint');
        if (msHint) msHint.style.display = 'block';
        updateTypeSelects();
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        const studentCountInput = document.getElementById('student-count');
        const missingSeatsInput = document.getElementById('homework-missing-seats');
        if (currentClass && currentClass.lastMaxSeat) {
            if (studentCountInput) studentCountInput.value = currentClass.lastMaxSeat;
            if (missingSeatsInput) missingSeatsInput.value = currentClass.lastMissingSeats || '';
        } else {
            const classHws = state.appData.homeworks.filter(h => h.classId === state.currentClassId);
            if (classHws.length > 0) {
                let maxSeat = 0;
                (classHws[classHws.length - 1].students || []).forEach(s => maxSeat = Math.max(maxSeat, s.seat));
                if (studentCountInput) studentCountInput.value = maxSeat || 30;
            } else {
                if (studentCountInput) studentCountInput.value = 30;
            }
        }
        openModal(modal);
    });

    // 7. 條碼設定按鈕
    function renderBarcodeModalInputs() {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        const maxSeatInput = document.getElementById('barcode-max-seat');
        const container = document.getElementById('barcode-inputs-container');
        if (!container) return;
        const maxSeat = parseInt(maxSeatInput?.value || currentClass?.lastMaxSeat || 30, 10);
        if (maxSeatInput) maxSeatInput.value = maxSeat;
        
        container.innerHTML = '';
        const barcodes = currentClass?.barcodes || {};
        for (let i = 1; i <= maxSeat; i++) {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-100 shadow-xs';
            row.innerHTML = `
                <span class="w-12 text-center text-xs font-bold text-slate-500 font-mono">${i} 號</span>
                <input type="text" data-seat="${i}" value="${barcodes[i] || ''}" placeholder="請輸入或刷取條碼" class="barcode-seat-input flex-grow text-xs p-2 rounded-md border border-slate-200 font-mono focus:ring-1 focus:ring-indigo-500">
            `;
            container.appendChild(row);
        }
    }

    bindClick('set-barcodes-btn', () => {
        if (!state.currentClassId || state.appData.classes.length === 0) {
            showAlertModal("提示", "請先建立或選擇班級，方可進行學生條碼設定！");
            renderClassList();
            openModal(document.getElementById('manage-classes-modal'));
            return;
        }
        renderBarcodeModalInputs();
        openModal(document.getElementById('barcodes-modal'));
    });

    bindClick('update-barcode-seats-btn', () => {
        renderBarcodeModalInputs();
        showToast("已更新座號輸入清單", "info");
    });

    bindClick('auto-gen-barcodes-btn', () => {
        const inputs = document.querySelectorAll('#barcode-inputs-container input');
        if (inputs.length < 2) return;
        const val1 = parseInt(inputs[0]?.value, 10);
        const val2 = parseInt(inputs[1]?.value, 10);
        if (isNaN(val1) || isNaN(val2)) {
            showAlertModal("無法推算", "請至少在 1 號與 2 號輸入連續純數字條碼，系統方能自動等差推算。");
            return;
        }
        const diff = val2 - val1;
        inputs.forEach((input, idx) => {
            input.value = val1 + (diff * idx);
        });
        showToast("⚡ 條碼已自動推算完成！請記得點選「儲存配置」", "success");
    });

    bindClick('save-barcodes-btn', async () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        const barcodes = {};
        const inputs = document.querySelectorAll('#barcode-inputs-container input');
        inputs.forEach(input => {
            const seat = input.dataset.seat;
            const val = input.value.trim();
            if (seat && val) barcodes[seat] = val;
        });
        currentClass.barcodes = barcodes;
        const maxSeatInput = document.getElementById('barcode-max-seat');
        if (maxSeatInput) currentClass.lastMaxSeat = parseInt(maxSeatInput.value, 10) || 30;
        await saveData();
        closeModal(document.getElementById('barcodes-modal'));
        showToast("✅ 班級條碼配置已成功儲存！", "success");
    });

    // 8. 各子分頁返回按鈕
    bindClick('back-to-main-btn', () => showMainPage());
    bindClick('back-from-student-details-btn', () => showMainPage());
    bindClick('back-from-types-btn', () => showMainPage());
    bindClick('back-from-contact-book-btn', () => showMainPage());

    // 彈窗關閉
    bindClick('portal-modal-close-btn', () => closePortalAuthModal());
    const authModalEl = document.getElementById('portal-auth-modal');
    if (authModalEl) {
        authModalEl.addEventListener('click', (e) => {
            if (e.target === authModalEl) closePortalAuthModal();
        });
    }

    // 聯絡作者與意見反饋
    const openAuthorFeedbackModal = () => {
        const modal = document.getElementById('author-feedback-modal');
        if (modal) modal.classList.remove('hidden');
    };
    const closeAuthorFeedbackModal = () => {
        const modal = document.getElementById('author-feedback-modal');
        if (modal) modal.classList.add('hidden');
    };
    const copyAuthorEmail = async () => {
        const email = 'ianw.solar@gmail.com';
        await safeCopyToClipboard(email, "已複製作者信箱：ianw.solar@gmail.com");
        const copyBtnText = document.getElementById('author-copy-btn-text');
        if (copyBtnText) {
            copyBtnText.textContent = "已複製！";
            setTimeout(() => { copyBtnText.textContent = "複製信箱"; }, 2000);
        }
    };

    bindClick('portal-ribbon-feedback-btn', openAuthorFeedbackModal);
    bindClick('portal-nav-feedback-btn', openAuthorFeedbackModal);
    bindClick('portal-hero-feedback-btn', openAuthorFeedbackModal);
    bindClick('portal-footer-feedback-btn', openAuthorFeedbackModal);
    bindClick('portal-footer-copy-email-btn', copyAuthorEmail);
    bindClick('author-feedback-close-btn', closeAuthorFeedbackModal);
    bindClick('author-feedback-copy-btn', copyAuthorEmail);

    const feedbackModalEl = document.getElementById('author-feedback-modal');
    if (feedbackModalEl) {
        feedbackModalEl.addEventListener('click', (e) => {
            if (e.target === feedbackModalEl) closeAuthorFeedbackModal();
        });
    }

    // 功能介面截圖大圖放大預覽 Lightbox
    const lightboxModal = document.getElementById('feature-lightbox-modal');
    const lightboxImg = document.getElementById('lightbox-modal-img');
    const lightboxTitle = document.getElementById('lightbox-modal-title');
    const closeLightbox = () => {
        if (lightboxModal) lightboxModal.classList.add('hidden');
    };
    bindClick('feature-lightbox-close-btn', closeLightbox);
    if (lightboxModal) {
        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) closeLightbox();
        });
    }

    document.querySelectorAll('.feature-screenshot-wrapper').forEach(wrapper => {
        wrapper.addEventListener('click', () => {
            const title = wrapper.getAttribute('data-title') || '功能介面預覽';
            const src = wrapper.getAttribute('data-src');
            const fallback = wrapper.getAttribute('data-fallback') || src;
            if (lightboxTitle) lightboxTitle.textContent = title;
            if (lightboxImg) {
                lightboxImg.src = src;
                lightboxImg.onerror = () => {
                    lightboxImg.onerror = null;
                    lightboxImg.src = fallback;
                };
            }
            if (lightboxModal) lightboxModal.classList.remove('hidden');
        });
    });

    // 登入 / 註冊 / 忘記密碼視圖切換
    bindClick('portal-to-signup-btn', () => {
        document.getElementById('portal-view-signin')?.classList.add('hidden');
        document.getElementById('portal-view-forgot')?.classList.add('hidden');
        document.getElementById('portal-view-signup')?.classList.remove('hidden');
    });

    bindClick('portal-signup-to-signin-btn', () => {
        document.getElementById('portal-view-signup')?.classList.add('hidden');
        document.getElementById('portal-view-forgot')?.classList.add('hidden');
        document.getElementById('portal-view-signin')?.classList.remove('hidden');
    });

    bindClick('portal-to-forgot-btn', () => {
        document.getElementById('portal-view-signin')?.classList.add('hidden');
        document.getElementById('portal-view-signup')?.classList.add('hidden');
        document.getElementById('portal-view-forgot')?.classList.remove('hidden');
    });

    bindClick('portal-forgot-to-signin-btn', () => {
        document.getElementById('portal-view-forgot')?.classList.add('hidden');
        document.getElementById('portal-view-signup')?.classList.add('hidden');
        document.getElementById('portal-view-signin')?.classList.remove('hidden');
    });

    bindClick('portal-enter-app-btn', () => {
        proceedIntoSystem();
    });

    bindClick('portal-switch-account-btn', () => {
        document.getElementById('portal-view-loggedin')?.classList.add('hidden');
        document.getElementById('portal-view-signin')?.classList.remove('hidden');
    });

    // 登出邏輯
    const performFullLogout = async () => {
        localStorage.removeItem('app_user_session');
        localStorage.removeItem('localAdminSession');
        localStorage.removeItem('adminPassword');
        localStorage.removeItem('storageSelected');
        sessionStorage.clear();
        sessionStorage.setItem('is_explicit_logout', 'true');
        state.isDevMode = false;

        if (fbAuth && state.currentUser) {
            try {
                await signOut(fbAuth);
            } catch (err) {
                console.error("Logout error:", err);
            }
        }
        state.currentUser = null;
        state.appData = { classes: [], homeworks: [], homeworkTypes: JSON.parse(safeStringify(DEFAULT_TYPES)) };
        state.currentClassId = null;
        localStorage.removeItem('homeworkAppData');
        localStorage.removeItem('currentClassId');

        closeModal(document.getElementById('settings-modal'));
        closeModal(document.getElementById('admin-modal'));
        closeModal(document.getElementById('portal-auth-modal'));
        closeModal(document.getElementById('email-verify-modal'));
        closeModal(document.getElementById('account-picker-modal'));
        document.getElementById('admin-modal-btn')?.classList.add('hidden');
        document.getElementById('admin-btn')?.classList.add('hidden');
        updateDataManagementUI();
        updatePortalUI();
        showPortalPage(true);
        showToast("已成功登出並返回網站首頁", "info");
    };
    bindClick('portal-logout-btn', performFullLogout);
    bindClick('portal-nav-logout-btn', performFullLogout);
    bindClick('close-account-picker-btn', () => {
        closeModal(document.getElementById('account-picker-modal'));
    });

    // 信箱驗證等待機制狀態與輔助函式
    let verifyPollingTimer = null;
    let currentPendingVerification = null;

    const stopVerificationPolling = () => {
        if (verifyPollingTimer) {
            clearInterval(verifyPollingTimer);
            verifyPollingTimer = null;
        }
    };

    const completeVerificationAndLogin = async (targetInfo) => {
        stopVerificationPolling();
        closeModal(document.getElementById('email-verify-modal'));
        closeModal(document.getElementById('portal-auth-modal'));
        closeModal(document.getElementById('account-picker-modal'));

        const targetEmail = targetInfo.email || targetInfo.authEmail || '';
        const isAdminUser = targetEmail.toLowerCase() === 'ianw.solar@gmail.com';
        const userObj = {
            uid: targetInfo.uid,
            email: targetEmail,
            authEmail: targetInfo.authEmail || targetEmail,
            displayName: targetInfo.displayName || targetInfo.name || targetInfo.username || targetInfo.accountName || '一般帳號',
            emailVerified: true,
            isGoogleAuth: false,
            isAdmin: isAdminUser,
            isGuest: false
        };

        state.currentUser = userObj;
        sessionStorage.setItem('auth_provider', 'password');
        sessionStorage.removeItem('is_explicit_logout');
        localStorage.setItem('app_user_session', JSON.stringify(userObj));
        localStorage.setItem('storageSelected', 'true');
        updateDataManagementUI();
        try { updatePortalUI(); } catch(e) {}
        if (isAdminUser) {
            document.getElementById('admin-modal-btn')?.classList.remove('hidden');
            document.getElementById('admin-btn')?.classList.remove('hidden');
        } else {
            document.getElementById('admin-modal-btn')?.classList.add('hidden');
            document.getElementById('admin-btn')?.classList.add('hidden');
        }

        // 更新本地與雲端的 boundAccounts 記錄為 emailVerified: true (適用所有使用者信箱)
        try {
            let localBounds = JSON.parse(localStorage.getItem('bound_accounts_all') || localStorage.getItem('bound_accounts_ianw') || '[]');
            const idx = localBounds.findIndex(b => b.id === userObj.uid || b.uid === userObj.uid);
            if (idx >= 0) {
                localBounds[idx].emailVerified = true;
                localStorage.setItem('bound_accounts_all', JSON.stringify(localBounds));
                if (isAdminUser) {
                    localStorage.setItem('bound_accounts_ianw', JSON.stringify(localBounds));
                }
            }
            if (fbDb) {
                await setDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'boundAccounts', userObj.uid), {
                    emailVerified: true
                }, { merge: true });
            }
        } catch(e) { console.warn("Update boundAccount verified status err:", e); }

        showToast("🎉 信箱驗證成功！歡迎進入系統", "success");
        showAlertModal(
            "🎉 信箱驗證成功！",
            `恭喜您！您的電子信箱已通過驗證，帳號【${userObj.displayName}】已正式啟用！\n\n日後登入時，您只需輸入使用者名稱【${userObj.displayName}】與密碼即可快速進入系統。`
        );

        showToast("⏳ 正在同步雲端資料...", "info");
        await syncUserProfile();
        await loadDataFromCloud(true);
        await syncDataToCloud();
        proceedIntoSystem();
    };

    const openEmailVerificationModal = (targetEmail, userToWatch, extraData = {}) => {
        stopVerificationPolling();
        currentPendingVerification = {
            user: userToWatch,
            targetEmail: targetEmail,
            ...extraData
        };

        const modal = document.getElementById('email-verify-modal');
        const displayEl = document.getElementById('verify-email-display');
        if (displayEl) displayEl.textContent = targetEmail;

        const statusTitle = document.getElementById('verify-status-title');
        if (statusTitle) statusTitle.textContent = "正在自動偵測驗證狀態...";
        const manualContainer = document.getElementById('manual-verify-container');
        if (manualContainer) manualContainer.classList.add('hidden');
        const manualInput = document.getElementById('manual-verify-input');
        if (manualInput) manualInput.value = '';

        openModal(modal);

        // 每 3 秒背景自動輪詢偵測使用者的 emailVerified 狀態
        verifyPollingTimer = setInterval(async () => {
            try {
                if (!fbAuth?.currentUser) return;
                await reload(fbAuth.currentUser);
                if (fbAuth.currentUser.emailVerified) {
                    await completeVerificationAndLogin({
                        uid: fbAuth.currentUser.uid,
                        email: currentPendingVerification?.displayEmail || currentPendingVerification?.targetEmail || fbAuth.currentUser.email,
                        authEmail: fbAuth.currentUser.email,
                        displayName: currentPendingVerification?.name || fbAuth.currentUser.displayName || '一般帳號',
                        isIanw: currentPendingVerification?.isIanw
                    });
                }
            } catch (e) {
                console.warn("Verify polling check err:", e);
            }
        }, 3000);
    };

    // 帳號挑選 Modal 輔助函式 (針對同信箱多組帳號)
    const openAccountPickerModal = (candidates, onSelect) => {
        const modal = document.getElementById('account-picker-modal');
        const list = document.getElementById('account-picker-list');
        if (!modal || !list) return;
        list.innerHTML = '';
        candidates.forEach((cand, idx) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'w-full p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/40 transition-all flex items-center justify-between group text-left cursor-pointer shadow-xs';
            const dateStr = cand.createdAt ? new Date(cand.createdAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : `帳號 ${idx + 1}`;
            const displayEmailStr = cand.email || '已綁定帳號';
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-indigo-100/80 text-indigo-700 font-black flex items-center justify-center text-sm shadow-xs">
                        👤
                    </div>
                    <div>
                        <div class="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">${cand.username || cand.displayName || cand.accountName || '一般帳號'}</div>
                        <div class="text-[11px] text-slate-400 font-medium mt-0.5">${displayEmailStr} · 建立於 ${dateStr}</div>
                    </div>
                </div>
                <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-all">登入</span>
            `;
            item.onclick = () => {
                closeModal(modal);
                onSelect(cand);
            };
            list.appendChild(item);
        });
        openModal(modal);
    };

    // 密碼顯示/隱藏切換
    const setupPasswordToggle = (btnId, inputId) => {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (btn && input) {
            btn.addEventListener('click', () => {
                const isPwd = input.type === 'password';
                input.type = isPwd ? 'text' : 'password';
                btn.innerHTML = isPwd 
                    ? `<svg class="w-4 h-4 fill-current inline-block" viewBox="0 0 24 24"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75c-1.73-4.39-6-7.5-11-7.5c-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28l.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5c1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22L21 20.73L3.27 3L2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65c0 1.66 1.34 3 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53c-2.76 0-5-2.24-5-5c0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15l.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`
                    : `<svg class="w-4 h-4 fill-current inline-block" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5s5 2.24 5 5s-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3s3-1.34 3-3s-1.34-3-3-3z"/></svg>`;
            });
        }
    };
    setupPasswordToggle('toggle-signin-password', 'portal-signin-password');
    setupPasswordToggle('toggle-signup-password', 'portal-signup-password');

    // 登入表單 (支援所有使用者以「使用者名稱」或「電子信箱」搭配密碼登入)
    bindSubmit('portal-signin-form', async (e) => {
        e.preventDefault();
        const accountInput = document.getElementById('portal-signin-email')?.value.trim();
        const password = document.getElementById('portal-signin-password')?.value;
        if (!accountInput || !password) return;
        if (!fbAuth) { showAlertModal("無法登入", "尚未設定 Firebase 參數。"); return; }
        const submitBtn = document.getElementById('portal-signin-btn');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '正在驗證登入...';
        }

        try {
            // 1. 取得所有綁定帳號記錄 (從本地與 Firestore boundAccounts 同步)
            let boundList = [];
            try { boundList = JSON.parse(localStorage.getItem('bound_accounts_all') || localStorage.getItem('bound_accounts_ianw') || '[]'); } catch(e) {}
            if (fbDb) {
                try {
                    const boundSnap = await getDocs(collection(fbDb, 'artifacts', globalAppId, 'public', 'data', 'boundAccounts'));
                    boundSnap.forEach(d => {
                        const dData = d.data();
                        const existingIdx = boundList.findIndex(b => (b.id && b.id === dData.id) || (b.uid && b.uid === dData.uid));
                        if (existingIdx >= 0) {
                            boundList[existingIdx] = { ...boundList[existingIdx], ...dData };
                        } else {
                            boundList.push(dData);
                        }
                    });
                    localStorage.setItem('bound_accounts_all', JSON.stringify(boundList));
                } catch(e) {
                    console.warn("Fetch boundAccounts error:", e);
                }
            }

            const inputLower = accountInput.toLowerCase();

            // 2. 比對候選帳號：優先以使用者名稱 (username / accountName / displayName) 精確比對
            let matchingCandidates = boundList.filter(b => 
                (b.username && b.username.toLowerCase() === inputLower) ||
                (b.accountName && b.accountName.toLowerCase() === inputLower) ||
                (b.displayName && b.displayName.toLowerCase() === inputLower)
            );

            // 若使用者輸入的是電子信箱，也支援以 email / authEmail 比對
            if (matchingCandidates.length === 0 && (accountInput.includes('@') || inputLower === 'ianw.solar@gmail.com')) {
                matchingCandidates = boundList.filter(b => 
                    (b.email && b.email.toLowerCase() === inputLower) ||
                    (b.authEmail && b.authEmail.toLowerCase() === inputLower)
                );
            }

            // 3. 執行指定帳號登入程序
            const executeLoginForCandidate = async (cand) => {
                if (cand.isGoogleAuth) {
                    showAlertModal("請使用 Google 快速登入", `帳號「${cand.displayName || cand.username || cand.email}」為 Google 授權帳號，請直接點選彈窗下方的「Google 帳號快速登入」按鈕進行登入。`);
                    return;
                }
                let cred = null;
                const targetEmail = cand.authEmail || cand.email;
                try {
                    cred = await signInWithEmailAndPassword(fbAuth, targetEmail, password);
                } catch (signInErr) {
                    if (cand.email && cand.email !== targetEmail) {
                        try { cred = await signInWithEmailAndPassword(fbAuth, cand.email, password); } catch(e) {}
                    }
                    if (!cred) {
                        if (cand.password && cand.password !== password) {
                            showAlertModal("登入失敗", "密碼錯誤，請確認後重試。若忘記密碼請點選下方「忘記密碼？」");
                            return;
                        }
                        if (signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/wrong-password' || signInErr.code === 'auth/user-not-found') {
                            if ((cand.email || '').toLowerCase() === 'ianw.solar@gmail.com' || (cand.email || '').toLowerCase().includes('@gmail.com')) {
                                showAlertModal("登入提示", "帳號或密碼不相符。\n\n💡 提示：若此帳號平時是使用 Google 授權登入，請直接點選下方「使用 Google 帳號快速登入」按鈕！");
                            } else {
                                showAlertModal("登入失敗", "密碼錯誤或憑證無效，請確認後重試。若忘記密碼請點選下方「忘記密碼？」");
                            }
                            return;
                        }
                        throw signInErr;
                    }
                }

                if (cred?.user && !cred.user.emailVerified) {
                    showToast("⚠️ 此帳號尚未完成信箱驗證，請先驗證信箱", "warning");
                    openEmailVerificationModal(cand.email || cred.user.email, cred.user, {
                        displayEmail: cand.email || cred.user.email,
                        authEmail: targetEmail,
                        name: cand.displayName || cand.username || cand.accountName,
                        username: cand.username || cand.accountName,
                        isIanw: (cand.email || '').toLowerCase() === 'ianw.solar@gmail.com'
                    });
                    return;
                }

                const isUserAdmin = (cand.email || cred.user.email).toLowerCase() === 'ianw.solar@gmail.com';
                const userObj = {
                    uid: cred ? cred.user.uid : (cand.uid || cand.id),
                    email: cand.email || (cred ? cred.user.email : ''),
                    authEmail: targetEmail,
                    displayName: cand.displayName || cand.username || cand.accountName || '一般使用者',
                    emailVerified: true,
                    isGoogleAuth: false,
                    isAdmin: isUserAdmin,
                    isGuest: false
                };
                state.currentUser = userObj;
                sessionStorage.setItem('auth_provider', 'password');
                sessionStorage.removeItem('is_explicit_logout');
                localStorage.setItem('app_user_session', JSON.stringify(userObj));
                localStorage.setItem('storageSelected', 'true');
                updateDataManagementUI();
                try { updatePortalUI(); } catch(e) {}
                if (isUserAdmin) {
                    document.getElementById('admin-modal-btn')?.classList.remove('hidden');
                    document.getElementById('admin-btn')?.classList.remove('hidden');
                } else {
                    document.getElementById('admin-modal-btn')?.classList.add('hidden');
                    document.getElementById('admin-btn')?.classList.add('hidden');
                }
                showToast(`✅ 登入成功！歡迎 ${userObj.displayName}`, "success");

                // 清除上一帳號的暫存資料，再載入此帳號專屬之雲端資料
                state.appData = { classes: [], homeworks: [], homeworkTypes: JSON.parse(safeStringify(DEFAULT_TYPES)) };
                state.currentClassId = null;
                localStorage.removeItem('homeworkAppData');
                localStorage.removeItem('currentClassId');

                showToast("⏳ 正在同步雲端資料...", "info");
                await loadDataFromCloud(true);
                proceedIntoSystem();
            };

            if (matchingCandidates.length === 1) {
                await executeLoginForCandidate(matchingCandidates[0]);
                return;
            } else if (matchingCandidates.length > 1) {
                const pwdMatches = matchingCandidates.filter(b => b.password === password);
                if (pwdMatches.length === 1) {
                    await executeLoginForCandidate(pwdMatches[0]);
                    return;
                }
                openAccountPickerModal(pwdMatches.length > 0 ? pwdMatches : matchingCandidates, async (chosen) => {
                    await executeLoginForCandidate(chosen);
                });
                return;
            } else {
                // 4. 若在 boundAccounts 未找到符合項
                if (accountInput.includes('@')) {
                    // 若輸入的是 ianw.solar@gmail.com 或 Google 帳號，優先捕獲處理
                    let cred = null;
                    try {
                        cred = await signInWithEmailAndPassword(fbAuth, accountInput, password);
                    } catch(directErr) {
                        if (accountInput.toLowerCase() === 'ianw.solar@gmail.com' || accountInput.toLowerCase().includes('@gmail.com')) {
                            console.warn("Direct sign in notice for Google email:", directErr?.code);
                            showAlertModal("請使用 Google 快速登入", `帳號 (${accountInput}) 平常是以 Google 授權方式登入。\n\n請直接點選下方的「使用 Google 帳號快速登入」按鈕！`);
                            return;
                        }
                        throw directErr;
                    }
                    if (cred.user && !cred.user.emailVerified) {
                        showToast("⚠️ 此帳號尚未完成信箱驗證，請先驗證信箱", "warning");
                        openEmailVerificationModal(cred.user.email, cred.user, {
                            displayEmail: cred.user.email,
                            name: cred.user.displayName || cred.user.email.split('@')[0],
                            isIanw: cred.user.email.toLowerCase() === 'ianw.solar@gmail.com'
                        });
                        return;
                    }
                    sessionStorage.setItem('auth_provider', 'password');
                    sessionStorage.removeItem('is_explicit_logout');
                    const isUserAdmin = cred.user.email.toLowerCase() === 'ianw.solar@gmail.com';
                    const userObj = {
                        uid: cred.user.uid,
                        email: cred.user.email,
                        displayName: cred.user.displayName || cred.user.email.split('@')[0],
                        emailVerified: true,
                        isGoogleAuth: false,
                        isAdmin: isUserAdmin,
                        isGuest: false
                    };
                    state.currentUser = userObj;
                    localStorage.setItem('app_user_session', JSON.stringify(userObj));
                    localStorage.setItem('storageSelected', 'true');
                    if (isUserAdmin) {
                        document.getElementById('admin-modal-btn')?.classList.remove('hidden');
                        document.getElementById('admin-btn')?.classList.remove('hidden');
                    } else {
                        document.getElementById('admin-modal-btn')?.classList.add('hidden');
                        document.getElementById('admin-btn')?.classList.add('hidden');
                    }
                    showToast(`✅ 登入成功！歡迎 ${userObj.displayName}`, "success");
                    showToast("⏳ 正在同步雲端資料...", "info");
                    await loadDataFromCloud(true);
                    proceedIntoSystem();
                    return;
                }

                showAlertModal("登入失敗", "查無此使用者名稱或密碼錯誤，請確認後重試。若忘記密碼請點選下方「忘記密碼？」");
                return;
            }
        } catch (err) {
            console.warn("Sign in notice:", err?.code || err?.message);
            let msg = err?.message || "登入失敗";
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
                if (accountInput.toLowerCase().includes('@gmail.com') || accountInput.toLowerCase() === 'ianw.solar@gmail.com') {
                    msg = "帳號或密碼不符。\n\n💡 提示：若您的帳號是透過 Google 快速授權建立的，請直接點選下方的「使用 Google 帳號快速登入」按鈕！";
                } else {
                    msg = "使用者名稱或密碼錯誤，請確認後重試。若忘記密碼請點選下方「忘記密碼？」";
                }
            } else if (err.code === 'auth/too-many-requests') {
                msg = "登入失敗次數過多，此帳號已被暫時保護，請稍後再試或透過郵件重設密碼。";
            } else if (err.code === 'auth/invalid-email') {
                msg = "電子信箱格式不正確，請輸入合法的 Email 地址。";
            }
            showAlertModal("登入失敗", msg);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origText;
            }
        }
    });

    // 註冊表單 (支援所有信箱申請多組帳號，必填使用者名稱)
    bindSubmit('portal-signup-form', async (e) => {
        e.preventDefault();
        const name = document.getElementById('portal-signup-name')?.value.trim();
        const email = document.getElementById('portal-signup-email')?.value.trim();
        const password = document.getElementById('portal-signup-password')?.value;
        const confirmPassword = document.getElementById('portal-signup-confirm')?.value;

        if (!name) {
            showAlertModal("請輸入使用者名稱", "註冊時「使用者名稱」為必填項目，日後登入時只需輸入此使用者名稱與密碼。");
            return;
        }
        if (!email || !password) return;
        if (password !== confirmPassword) {
            showAlertModal("密碼不一致", "兩次輸入的密碼不相同，請重新確認後再送出。");
            return;
        }
        if (password.length < 6) {
            showAlertModal("密碼長度不足", "為保障帳號安全，密碼長度需至少 6 個字元。");
            return;
        }

        if (!fbAuth) { showAlertModal("無法註冊", "尚未設定 Firebase 參數。"); return; }
        const submitBtn = document.getElementById('portal-signup-btn');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '正在建立帳號並發送驗證郵件...';
        }

        const isIanw = email.toLowerCase() === 'ianw.solar@gmail.com';

        try {
            // 檢查使用者名稱是否已被其他人註冊
            let boundList = [];
            try { boundList = JSON.parse(localStorage.getItem('bound_accounts_all') || localStorage.getItem('bound_accounts_ianw') || '[]'); } catch(e) {}
            if (fbDb) {
                try {
                    const boundSnap = await getDocs(collection(fbDb, 'artifacts', globalAppId, 'public', 'data', 'boundAccounts'));
                    boundSnap.forEach(d => {
                        const dData = d.data();
                        if (!boundList.some(b => (b.id && b.id === dData.id) || (b.uid && b.uid === dData.uid))) {
                            boundList.push(dData);
                        }
                    });
                    localStorage.setItem('bound_accounts_all', JSON.stringify(boundList));
                } catch(e) {
                    console.warn("Fetch bound accounts error:", e);
                }
            }

            const nameLower = name.toLowerCase();
            const existingUser = boundList.find(b => 
                (b.username && b.username.toLowerCase() === nameLower) ||
                (b.accountName && b.accountName.toLowerCase() === nameLower) ||
                (b.displayName && b.displayName.toLowerCase() === nameLower)
            );
            if (existingUser) {
                showAlertModal(
                    "使用者名稱已被使用", 
                    `使用者名稱「${name}」已經被註冊使用了。\n\n由於日後登入時只需輸入使用者名稱與密碼，為了確保系統能精確識別您的帳號，請換一個不同的專屬使用者名稱（例如加上班級、職稱或姓名）。`
                );
                return;
            }

            let cred = null;
            let finalAuthEmail = email;

            // 支援所有信箱皆可重複申請多組獨立帳號 (透過 sub-addressing 建立獨立 Firebase Auth 實體)
            try {
                cred = await createUserWithEmailAndPassword(fbAuth, email, password);
                finalAuthEmail = email;
            } catch (firstCreateErr) {
                if (firstCreateErr.code === 'auth/email-already-in-use') {
                    // 同一個信箱申辦第二組以上帳號：為該信箱建立次位址別名實體
                    const atIdx = email.indexOf('@');
                    const localPart = email.substring(0, atIdx).replace(/\+.*$/, '');
                    const domainPart = email.substring(atIdx);
                    const randomId = Date.now().toString(36) + '_' + Math.floor(Math.random() * 900 + 100);
                    const subEmail = `${localPart}+acc${randomId}${domainPart}`;
                    try {
                        cred = await createUserWithEmailAndPassword(fbAuth, subEmail, password);
                        finalAuthEmail = subEmail;
                    } catch(subErr) {
                        throw subErr;
                    }
                } else if (firstCreateErr.code === 'auth/weak-password') {
                    showAlertModal("密碼強度不足", "為保障帳號安全，密碼長度需至少 6 個字元。");
                    return;
                } else if (firstCreateErr.code === 'auth/invalid-email') {
                    showAlertModal("電子信箱格式錯誤", "請輸入合法的 Email 地址。");
                    return;
                } else {
                    throw firstCreateErr;
                }
            }

            // 更新使用者 DisplayName
            if (cred?.user) {
                try { await updateProfile(cred.user, { displayName: name }); } catch(e) {}
                try { await sendEmailVerification(cred.user); } catch(e) {
                    console.warn("sendEmailVerification err:", e);
                }
            }

            // 將使用者帳號與使用者名稱記錄至 boundAccounts (所有信箱帳號均同步記錄，支援日後以使用者名稱直接登入)
            const boundDoc = {
                id: cred.user.uid,
                uid: cred.user.uid,
                email: email, // 使用者真實收信信箱
                authEmail: finalAuthEmail, // Firebase Auth 實體信箱
                username: name,
                displayName: name,
                accountName: name,
                password: password,
                emailVerified: false,
                createdAt: new Date().toISOString()
            };

            if (fbDb) {
                try {
                    await setDoc(doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'boundAccounts', cred.user.uid), boundDoc);
                } catch(e) { console.warn("Firestore save boundAccount err:", e); }
            }

            let localBounds = [];
            try { localBounds = JSON.parse(localStorage.getItem('bound_accounts_all') || localStorage.getItem('bound_accounts_ianw') || '[]'); } catch(e) {}
            localBounds = localBounds.filter(b => b.id !== cred.user.uid && b.uid !== cred.user.uid);
            localBounds.push(boundDoc);
            localStorage.setItem('bound_accounts_all', JSON.stringify(localBounds));
            if (isIanw) {
                localStorage.setItem('bound_accounts_ianw', JSON.stringify(localBounds));
            }

            // 為新建立帳號初始化獨立乾淨的本地狀態 (不殘留舊帳號資料)
            state.appData = { classes: [], homeworks: [], homeworkTypes: JSON.parse(safeStringify(DEFAULT_TYPES)) };
            state.currentClassId = null;
            localStorage.setItem('homeworkAppData', safeStringify(state.appData));
            localStorage.removeItem('currentClassId');

            // 關閉註冊表單 Modal
            closeModal(document.getElementById('portal-auth-modal'));

            // 啟動信箱驗證等待機制：註冊後需等待驗證完成才能進入系統
            showToast("📧 驗證郵件已寄出！請至信箱開啟郵件並點選驗證連結", "info");
            openEmailVerificationModal(email, cred.user, {
                displayEmail: email,
                authEmail: finalAuthEmail,
                name: name,
                username: name,
                isIanw: isIanw
            });
        } catch (err) {
            console.error("Sign up error:", err);
            let msg = err.message;
            if (err.code === 'auth/weak-password') {
                msg = "密碼強度不足，請至少輸入 6 個字元。";
            } else if (err.code === 'auth/invalid-email') {
                msg = "電子信箱格式錯誤，請確認後重試。";
            }
            showAlertModal("註冊失敗", msg);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origText;
            }
        }
    });

    // 信箱驗證 Modal 各按鈕事件處理
    // 1. 我已點擊信件連結 (立即手動觸發狀態檢查)
    bindClick('confirm-email-verified-btn', async () => {
        const btn = document.getElementById('confirm-email-verified-btn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在檢查信箱驗證狀態...';
        }
        try {
            if (!fbAuth?.currentUser) {
                showAlertModal("請先登入或註冊", "尚未偵測到待驗證的帳號，請返回登入頁面。");
                return;
            }
            await reload(fbAuth.currentUser);
            if (fbAuth.currentUser.emailVerified) {
                await completeVerificationAndLogin({
                    uid: fbAuth.currentUser.uid,
                    email: currentPendingVerification?.displayEmail || currentPendingVerification?.targetEmail || fbAuth.currentUser.email,
                    authEmail: fbAuth.currentUser.email,
                    displayName: currentPendingVerification?.name || fbAuth.currentUser.displayName || '一般帳號',
                    isIanw: currentPendingVerification?.isIanw
                });
            } else {
                showAlertModal(
                    "尚未完成信箱驗證",
                    `系統目前尚未收到 ${currentPendingVerification?.targetEmail || '您的信箱'} 的驗證確認。\n\n` +
                    "【請依下列步驟啟用帳號】：\n" +
                    "1. 前往您的電子信箱。\n" +
                    "2. ⚠️ 特別注意：請務必查看【垃圾郵件匣 (Spam)】或【促銷內容】！\n" +
                    "3. 點選郵件中的「驗證連結」。\n" +
                    "4. 點選後，返回此視窗再次按下本按鈕即可順利進入系統！\n\n" +
                    "若仍未收到信件，可點選下方「重新發送驗證信」。"
                );
            }
        } catch (err) {
            console.error("Check verify status err:", err);
            showAlertModal("檢查失敗", "檢查驗證狀態時發生錯誤：" + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origText;
            }
        }
    });

    // 2. 重新發送驗證信 (含 60 秒冷卻防灌水)
    let resendCooldownTimer = null;
    bindClick('resend-verify-email-btn', async () => {
        const btn = document.getElementById('resend-verify-email-btn');
        if (!fbAuth?.currentUser) {
            showAlertModal("無法發送", "目前無待驗證的使用者，請重新登入或註冊。");
            return;
        }
        try {
            await sendEmailVerification(fbAuth.currentUser);
            showToast("📧 驗證郵件已重新發送！請檢查信箱及垃圾郵件匣", "success");

            let remaining = 60;
            if (btn) {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                btn.innerHTML = `<i class="fa-solid fa-clock"></i> 重新發送 (${remaining}s)`;
            }
            if (resendCooldownTimer) clearInterval(resendCooldownTimer);
            resendCooldownTimer = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(resendCooldownTimer);
                    if (btn) {
                        btn.disabled = false;
                        btn.classList.remove('opacity-50', 'cursor-not-allowed');
                        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 重新發送驗證信';
                    }
                } else if (btn) {
                    btn.innerHTML = `<i class="fa-solid fa-clock"></i> 重新發送 (${remaining}s)`;
                }
            }, 1000);
        } catch (err) {
            console.error("Resend verify err:", err);
            showAlertModal("發送失敗", "重新發送驗證信時發生錯誤：" + err.message);
        }
    });

    // 3. 取消驗證並返回登入頁面
    bindClick('cancel-verify-code-btn', async () => {
        stopVerificationPolling();
        try {
            if (fbAuth?.currentUser && !fbAuth.currentUser.emailVerified) {
                await signOut(fbAuth);
            }
        } catch(e) {}
        closeModal(document.getElementById('email-verify-modal'));
        document.getElementById('portal-view-signup')?.classList.add('hidden');
        document.getElementById('portal-view-signin')?.classList.remove('hidden');
    });

    // 4. 手動貼上連結/代碼展開切換
    bindClick('toggle-manual-verify-btn', () => {
        const container = document.getElementById('manual-verify-container');
        if (container) container.classList.toggle('hidden');
    });

    // 5. 手動驗證代碼/連結提交
    bindClick('manual-verify-submit-btn', async () => {
        const input = document.getElementById('manual-verify-input');
        let codeOrUrl = input?.value.trim();
        if (!codeOrUrl) return;
        let oobCode = codeOrUrl;
        if (codeOrUrl.includes('oobCode=')) {
            try {
                const urlObj = new URL(codeOrUrl);
                oobCode = urlObj.searchParams.get('oobCode') || oobCode;
            } catch(e) {
                const match = codeOrUrl.match(/oobCode=([^&]+)/);
                if (match) oobCode = match[1];
            }
        }
        const btn = document.getElementById('manual-verify-submit-btn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '正在驗證代碼...';
        }
        try {
            await applyActionCode(fbAuth, oobCode);
            if (fbAuth?.currentUser) await reload(fbAuth.currentUser);
            await completeVerificationAndLogin({
                uid: fbAuth?.currentUser?.uid || currentPendingVerification?.user?.uid,
                email: currentPendingVerification?.displayEmail || currentPendingVerification?.targetEmail || fbAuth?.currentUser?.email,
                authEmail: fbAuth?.currentUser?.email,
                displayName: currentPendingVerification?.name || fbAuth?.currentUser?.displayName || '一般帳號',
                isIanw: currentPendingVerification?.isIanw
            });
        } catch (err) {
            console.error("Apply action code error:", err);
            showAlertModal("驗證失敗", "驗證代碼可能已過期或不正確，請點選郵件中的原始連結或點選「重新發送驗證信」。");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origText;
            }
        }
    });

    // 忘記密碼表單 (支援輸入使用者名稱或電子信箱)
    bindSubmit('portal-forgot-form', async (e) => {
        e.preventDefault();
        const inputVal = document.getElementById('portal-forgot-email')?.value.trim();
        if (!inputVal) return;
        if (!fbAuth) { showAlertModal("無法發送", "尚未設定 Firebase 參數。"); return; }
        const submitBtn = document.getElementById('portal-forgot-submit-btn');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '正在發送繁體中文重設信件...';
        }
        try {
            let targetEmail = inputVal;
            let targetAuthEmail = inputVal;

            // 若輸入的不是信箱格式，先從 boundAccounts 比對使用者名稱查出信箱
            let boundList = [];
            try { boundList = JSON.parse(localStorage.getItem('bound_accounts_all') || localStorage.getItem('bound_accounts_ianw') || '[]'); } catch(e) {}
            if (fbDb && !inputVal.includes('@')) {
                try {
                    const boundSnap = await getDocs(collection(fbDb, 'artifacts', globalAppId, 'public', 'data', 'boundAccounts'));
                    boundSnap.forEach(d => {
                        const dData = d.data();
                        if (!boundList.some(b => (b.id && b.id === dData.id) || (b.uid && b.uid === dData.uid))) {
                            boundList.push(dData);
                        }
                    });
                } catch(e) {}
            }

            const inputLower = inputVal.toLowerCase();
            const matched = boundList.find(b => 
                (b.username && b.username.toLowerCase() === inputLower) ||
                (b.accountName && b.accountName.toLowerCase() === inputLower) ||
                (b.displayName && b.displayName.toLowerCase() === inputLower)
            );

            if (matched) {
                targetEmail = matched.email;
                targetAuthEmail = matched.authEmail || matched.email;
            }

            await sendPasswordResetEmail(fbAuth, targetAuthEmail);
            showAlertModal(
                "📧 重設密碼郵件已發送！", 
                `系統已向下列信箱寄出繁體中文密碼重設信件：\n\n${targetEmail}\n\n==============================\n⚠️【最重要提醒 — 請至垃圾郵件匣查收】：\n信件極高機率會被 Gmail 或收件伺服器自動歸類到【垃圾郵件匣 (Spam)】或【促銷內容】！\n\n若 1~3 分鐘內未在收件匣看見信件，請務必前往【垃圾郵件匣】搜尋寄件者，點選信中專屬安全連結即可重設密碼！\n==============================`
            );
            document.getElementById('portal-view-forgot')?.classList.add('hidden');
            document.getElementById('portal-view-signin')?.classList.remove('hidden');
        } catch (err) {
            console.error("Forgot password error:", err);
            let msg = err.message;
            if (err.code === 'auth/user-not-found') {
                msg = "查無此使用者名稱或 Email 註冊的帳號，請確認是否輸入正確。";
            } else if (err.code === 'auth/invalid-email') {
                msg = "輸入格式不正確，請輸入合法的使用者名稱或電子信箱。";
            }
            showAlertModal("發送失敗", msg);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origText;
            }
        }
    });

    // Google 登入
    const handleGoogleLogin = () => {
        if (!fbAuth) { showAlertModal("無法登入", "尚未設定 Firebase 參數。"); return; }
        showToast("正在開啟 Google 登入視窗...", "info");
        signInWithPopup(fbAuth, new GoogleAuthProvider()).then(async (cred) => {
            sessionStorage.setItem('auth_provider', 'google');
            sessionStorage.removeItem('is_explicit_logout');
            const userObj = {
                uid: cred.user.uid,
                email: cred.user.email,
                displayName: cred.user.displayName,
                isGoogleAuth: true
            };
            state.currentUser = userObj;
            localStorage.setItem('app_user_session', JSON.stringify(userObj));
            localStorage.setItem('storageSelected', 'true');
            updateDataManagementUI();
            try { updatePortalUI(); } catch(e) {}

            const isAdmin = isGoogleAdmin(userObj);
            if (isAdmin) {
                document.getElementById('admin-modal-btn')?.classList.remove('hidden');
                document.getElementById('admin-btn')?.classList.remove('hidden');
                showToast("🛡️ 歡迎最高管理員 (Google 帳號授權登入)", "success");
            } else {
                document.getElementById('admin-modal-btn')?.classList.add('hidden');
                document.getElementById('admin-btn')?.classList.add('hidden');
                showToast("✅ Google 帳號登入成功！", "success");
            }

            if (state.isLocalEmptyOnBoot) {
                showToast("⏳ 登入成功！正在檢查雲端資料...", "info");
                const hasData = await loadDataFromCloud(true);
                if (hasData) state.isLocalEmptyOnBoot = false;
            }
            proceedIntoSystem();
        }).catch((error) => {
            console.warn("Google login popup error:", error?.code || error);
            if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                if (error.code === 'auth/invalid-credential') {
                    showAlertModal("Google 登入憑證無效", "Google 登入授權憑證無效或已過期，請重新嘗試登入。");
                } else {
                    showAlertModal("Google 登入失敗", "錯誤細節：" + (error.message || error.code));
                }
            }
        });
    };

    bindClick('portal-google-btn', handleGoogleLogin);
    bindClick('google-login-btn', handleGoogleLogin);
    bindClick('welcome-google-btn', handleGoogleLogin);

    // 歡迎精靈 Step 1 儲存方式選項
    bindClick('welcome-skip-btn', () => {
        localStorage.setItem('storageSelected', 'true');
        showWelcomeStep2();
    });

    bindClick('welcome-link-btn', async () => {
        if (!window.showSaveFilePicker) {
            showConfirmModal("硬碟直寫限制", "您的瀏覽器環境不支援直接存取本機硬碟。\n\n是否以「瀏覽器暫存」模式繼續？", () => {
                localStorage.setItem('storageSelected', 'true');
                showWelcomeStep2();
            });
            return;
        }
        try {
            const handle = await window.showSaveFilePicker({ suggestedName: '作業點收資料.json', types: [{ description: 'JSON 檔案', accept: { 'application/json': ['.json'] } }] });
            showNamePromptModal(async (name) => {
                if (name) {
                    localStorage.setItem('visitor_name', name.trim());
                    state.fileHandle = handle;
                    await saveFileHandle(handle);
                    const hasData = await syncFromFileHandle();
                    if (hasData) state.isLocalEmptyOnBoot = false;
                    await saveData();
                    localStorage.setItem('storageSelected', 'true');
                    showToast("✅ 已成功綁定本機硬碟檔案", "success");
                    showWelcomeStep2();
                }
            });
        } catch (e) {
            if (e.name !== 'AbortError') showAlertModal("無法連結檔案", e.message);
        }
    });

    // 歡迎精靈 Step 2 點收習慣選擇
    let currentWelcomeHabit = localStorage.getItem('checkMode') || 'manual';
    const updateWelcomeStep2UI = (selectedMode) => {
        currentWelcomeHabit = selectedMode;
        const manualBtn = document.getElementById('welcome-sel-manual');
        const scanBtn = document.getElementById('welcome-sel-scan');
        const finishBtn = document.getElementById('welcome-finish-btn');

        if (manualBtn && scanBtn) {
            if (selectedMode === 'manual') {
                manualBtn.className = "w-full p-4 border-2 border-indigo-600 bg-indigo-50/80 rounded-2xl shadow-sm ring-2 ring-indigo-500/20 transition-all text-left flex items-start gap-3.5 group cursor-pointer";
                scanBtn.className = "w-full p-4 border-2 border-slate-200 bg-white hover:border-indigo-300 rounded-2xl transition-all text-left flex items-start gap-3.5 group cursor-pointer";
            } else {
                scanBtn.className = "w-full p-4 border-2 border-indigo-600 bg-indigo-50/80 rounded-2xl shadow-sm ring-2 ring-indigo-500/20 transition-all text-left flex items-start gap-3.5 group cursor-pointer";
                manualBtn.className = "w-full p-4 border-2 border-slate-200 bg-white hover:border-indigo-300 rounded-2xl transition-all text-left flex items-start gap-3.5 group cursor-pointer";
            }
        }
        if (finishBtn) {
            finishBtn.disabled = false;
            finishBtn.classList.remove('disabled:opacity-50', 'disabled:cursor-not-allowed', 'opacity-50', 'cursor-not-allowed');
            finishBtn.classList.add('cursor-pointer');
        }
    };

    const finishCheckModeSelection = (modeToApply) => {
        const mode = modeToApply || currentWelcomeHabit || 'manual';
        applyCheckMode(mode);
        localStorage.setItem('hasSeenWelcome_final', 'true');
        closeModal(document.getElementById('welcome-modal'));
        showMainPage();
        if (state.appData.classes.length === 0) {
            openModal(document.getElementById('manage-classes-modal'));
        }
        showToast(mode === 'manual' ? "已選擇「手動點收」模式，開始使用！" : "已選擇「條碼掃描」模式，開始使用！", "success");
    };

    bindClick('welcome-sel-manual', () => {
        updateWelcomeStep2UI('manual');
    });

    const manualSelEl = document.getElementById('welcome-sel-manual');
    if (manualSelEl) {
        manualSelEl.addEventListener('dblclick', () => {
            finishCheckModeSelection('manual');
        });
    }

    bindClick('welcome-sel-scan', () => {
        updateWelcomeStep2UI('scan');
    });

    const scanSelEl = document.getElementById('welcome-sel-scan');
    if (scanSelEl) {
        scanSelEl.addEventListener('dblclick', () => {
            finishCheckModeSelection('scan');
        });
    }

    bindClick('welcome-finish-btn', () => {
        finishCheckModeSelection();
    });

    bindClick('welcome-modal-close-btn', () => {
        closeModal(document.getElementById('welcome-modal'));
        const modal = document.getElementById('welcome-modal');
        if (modal) modal.classList.add('hidden');
        if (document.getElementById('main-page')?.classList.contains('hidden') && 
            document.getElementById('detail-page')?.classList.contains('hidden') &&
            document.getElementById('student-details-page')?.classList.contains('hidden') &&
            document.getElementById('types-page')?.classList.contains('hidden') &&
            document.getElementById('contact-book-page')?.classList.contains('hidden')) {
            showMainPage();
            if (state.appData.classes.length === 0) {
                openModal(document.getElementById('manage-classes-modal'));
            }
        }
    });

    // 頂部導覽列點收方式切換按鈕
    bindClick('top-check-mode-btn', () => {
        openModal(document.getElementById('welcome-modal'));
        showWelcomeStep2();
    });

    // 作業詳細座號頁 (detail-page) 上的模式切換按鈕
    bindClick('mode-manual-btn', () => {
        applyCheckMode('manual');
        showToast("已切換為「手動點擊模式」", "success");
    });

    bindClick('mode-scan-btn', () => {
        applyCheckMode('scan');
        showToast("已切換為「條碼掃描模式」", "success");
    });

    window.addEventListener('welcome-step-2-opened', () => {
        currentWelcomeHabit = localStorage.getItem('checkMode') || state.currentCheckMode || 'manual';
        updateWelcomeStep2UI(currentWelcomeHabit);
    });

    // 系統設定 Modal 內的點收模式切換按鈕
    bindClick('setting-mode-manual-btn', () => {
        applyCheckMode('manual');
        showToast("已切換為「手動點收」模式", "success");
    });

    bindClick('setting-mode-scan-btn', () => {
        applyCheckMode('scan');
        showToast("已切換為「條碼掃描」模式", "success");
    });

    // 系統管理中心 (Admin) Modal 開啟
    const handleOpenAdminModal = () => {
        openModal(document.getElementById('admin-modal'));
        loadAllUsersForAdmin((targetId, targetEmail) => {
            closeModal(document.getElementById('admin-modal'));
            state.adminViewModeUserId = targetId;
            state.adminViewModeUserEmail = targetEmail;
            showToast(`已切換為「${targetEmail}」之唯讀檢視模式`, "info");
            loadDataFromCloud(true).then(() => {
                showToast(`已載入「${targetEmail}」之作業點收資料`, "success");
            });
        });
    };
    bindClick('admin-modal-btn', handleOpenAdminModal);
    bindClick('admin-btn', handleOpenAdminModal);

    // 本地硬碟連結
    bindClick('portal-link-file-btn', async () => {
        if (!window.showSaveFilePicker) {
            showConfirmModal("硬碟直寫限制", "您的瀏覽器環境不支援直接存取本機硬碟（推薦使用 Chrome 或 Edge 桌面版）。\n\n是否以「瀏覽器暫存」模式進入系統？", () => {
                localStorage.setItem('storageSelected', 'true');
                proceedIntoSystem();
            });
            return;
        }
        try {
            const handle = await window.showSaveFilePicker({ suggestedName: '作業點收資料.json', types: [{ description: 'JSON 檔案', accept: { 'application/json': ['.json'] } }] });
            showNamePromptModal(async (name) => {
                if (name) {
                    localStorage.setItem('visitor_name', name.trim());
                    state.fileHandle = handle;
                    await saveFileHandle(handle);
                    const hasData = await syncFromFileHandle();
                    if (hasData) state.isLocalEmptyOnBoot = false;
                    await saveData();
                    localStorage.setItem('storageSelected', 'true');
                    showToast("✅ 已成功綁定本機硬碟檔案", "success");
                    syncUserProfile();
                    proceedIntoSystem();
                }
            });
        } catch (e) {
            if (e.name !== 'AbortError') showAlertModal("無法連結檔案", e.message);
        }
    });

    bindClick('portal-browser-only-btn', () => {
        showNamePromptModal((name) => {
            if (name) {
                sessionStorage.setItem('app_is_guest_mode', 'true');
                localStorage.setItem('visitor_name', name.trim());
                localStorage.setItem('storageSelected', 'true');
                showToast("已選擇瀏覽器暫存模式 (免帳號體驗，不寫入雲端)", "info");
                proceedIntoSystem();
            }
        });
    });

    bindClick('google-logout-btn', performFullLogout);
    bindClick('settings-exit-system-btn', performFullLogout);
    bindClick('cloud-load-btn', async () => { await loadDataFromCloud(false); });
    bindClick('link-file-btn', async () => { 
        try { 
            if (!window.showSaveFilePicker) throw new Error("瀏覽器不支援硬碟直寫"); 
            const handle = await window.showSaveFilePicker({ suggestedName: '作業點收資料.json', types: [{ description: 'JSON 檔案', accept: { 'application/json': ['.json'] } }] }); 
            state.fileHandle = handle; 
            await saveFileHandle(handle); 
            await syncFromFileHandle(); 
            await saveData(); 
            document.getElementById('sync-banner').classList.add('hidden'); 
            document.body.classList.remove('has-banner'); 
            updateDataManagementUI(); 
            fullRender(); 
            showToast("已安全連結硬碟！", "success"); 
        } catch (e) { 
            if (e.name !== 'AbortError') showAlertModal("無法連結檔案", e.message); 
        } 
    });
    bindClick('unlink-file-btn', async () => { 
        showConfirmModal('解除安全連結', '確定解除連結嗎？資料將僅儲存於瀏覽器暫存。', async () => { 
            await clearFileHandle(); 
            state.fileHandle = null; 
            updateDataManagementUI(); 
            showToast("已解除連結", "info"); 
        }); 
    });

    // 班級同步複製
    bindClick('open-copy-class-modal-btn', openCopyClassModal);

    bindSubmit('copy-class-form', async (e) => {
        e.preventDefault();
        if (!state.currentClassId) {
            showToast("請先選擇目標班級！", "error");
            return;
        }
        const targetClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!targetClass) {
            showToast("找不到目標班級！", "error");
            return;
        }

        const sourceClassId = document.getElementById('copy-source-class')?.value;
        if (!sourceClassId) {
            showToast("請選擇來源班級！", "error");
            return;
        }
        const sourceClass = state.appData.classes.find(c => c.id === sourceClassId);
        if (!sourceClass) {
            showToast("找不到來源班級！", "error");
            return;
        }

        const syncHw = document.getElementById('copy-opt-hw')?.checked || false;
        const syncTypes = document.getElementById('copy-opt-types')?.checked || false;
        const syncBarcodes = document.getElementById('copy-opt-barcodes')?.checked || false;
        const syncContact = document.getElementById('copy-opt-contact')?.checked || false;

        if (!syncHw && !syncTypes && !syncBarcodes && !syncContact) {
            showToast("請至少勾選一項要同步的內容！", "error");
            return;
        }

        const mode = document.querySelector('input[name="copy-mode"]:checked')?.value || 'merge';
        const modeLabel = mode === 'overwrite' ? '【覆蓋現有資料】' : '【保留目前資料並新增】';
        
        const items = [];
        if (syncHw) items.push('作業清單');
        if (syncTypes) items.push('作業種類');
        if (syncBarcodes) items.push('條碼設定');
        if (syncContact) items.push('聯絡簿');

        const confirmMsg = `確定要將「${sourceClass.name}」的【${items.join('、')}】同步至「${targetClass.name}」嗎？\n\n處理模式：${modeLabel}${mode === 'overwrite' ? '\n⚠️ 警告：目標班級勾選項目的現有資料將被清除並完全覆蓋！' : '\n💡 提示：相同作業或重複內容將自動略過。'}`;

        showConfirmModal('確認班級資料同步', confirmMsg, async () => {
            await executeCopyClassData(sourceClass, targetClass, { syncHw, syncTypes, syncBarcodes, syncContact }, mode);
        });
    });

    // 匯出 / 匯入
    bindClick('export-data-btn', () => {
        const exportHw = document.getElementById('export-hw-chk').checked, exportTypes = document.getElementById('export-types-chk').checked, exportContact = document.getElementById('export-contact-chk').checked;
        let exportData = JSON.parse(safeStringify(appData));
        if (!exportHw) exportData.homeworks = []; 
        if (!exportTypes) exportData.homeworkTypes = DEFAULT_TYPES; 
        if (!exportContact) exportData.classes.forEach(c => c.contactBook = {}); 
        else { 
            const thirtyDaysAgo = new Date(); 
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30); 
            const limitDateStr = formatDate(thirtyDaysAgo, 'YYYY-MM-DD'); 
            exportData.classes.forEach(c => { 
                if (c.contactBook) { 
                    const filteredBook = {}; 
                    for (const [date, items] of Object.entries(c.contactBook)) { 
                        if (date >= limitDateStr) filteredBook[date] = items; 
                    } 
                    c.contactBook = filteredBook; 
                } 
            }); 
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(safeStringify(exportData)); 
        const downloadAnchorNode = document.createElement('a'); 
        downloadAnchorNode.setAttribute("href", dataStr); 
        downloadAnchorNode.setAttribute("download", `作業點收備份_${formatDate(new Date(), 'YYYY-MM-DD')}.json`); 
        document.body.appendChild(downloadAnchorNode); 
        downloadAnchorNode.click(); 
        downloadAnchorNode.remove(); 
        closeModal(document.getElementById('settings-modal')); 
        showToast("下載 JSON 備份檔成功！", "success");
    });

    bindClick('trigger-import-btn', () => document.getElementById('import-file-input').click());
    bindChange('import-file-input', (e) => {
        const file = e.target.files[0]; 
        if (!file) return; 
        const reader = new FileReader();
        reader.onload = async (e) => { 
            try { 
                const data = sanitizeAppData(JSON.parse(e.target.result)); 
                if(!data.classes || !data.homeworks || !data.homeworkTypes) throw new Error("無效備份格式"); 
                showConfirmModal('覆蓋資料', '確定將 JSON 完整覆蓋目前資料嗎？', async () => { 
                    closeModal(document.getElementById('settings-modal')); 
                    state.appData = data; 
                    fixDates(appData); 
                    localStorage.setItem('homeworkAppData', safeStringify(appData)); 
                    try { await saveData(); } catch(saveErr) {} 
                    showToast("資料匯入成功！", "success"); 
                    setTimeout(() => window.location.reload(), 500); 
                }); 
            } catch(err) { 
                showAlertModal("匯入失敗", err.message); 
            } 
        }; 
        reader.readAsText(file); 
        e.target.value = ''; 
    });

    // 新增作業表單
    bindSubmit('add-homework-form', async (e) => {
        e.preventDefault(); 
        const editId = document.getElementById('edit-homework-id').value, name = document.getElementById('homework-name').value.trim(), typeId = document.getElementById('homework-type-select').value; 
        closeModal(document.getElementById('add-homework-modal'));
        if (editId) { 
            const hw = state.appData.homeworks.find(h => h.id === editId); 
            if (hw && name) { 
                hw.name = name; 
                await saveData(); 
                showToast("修改名稱成功！"); 
                renderHomeworkList(); 
            } 
        } else { 
            const studentCount = parseInt(document.getElementById('student-count').value), missingInput = document.getElementById('homework-missing-seats').value; 
            let missingSeats = []; 
            const parts = missingInput.replace(/，/g, ',').split(/[\s,]+/);
            for (let part of parts) { 
                part = part.trim(); 
                if (!part) continue; 
                if (part.includes('-')) { 
                    const [startStr, endStr] = part.split('-'); 
                    const start = parseInt(startStr), end = parseInt(endStr); 
                    if (!isNaN(start) && !isNaN(end) && start <= end) { 
                        for (let i = start; i <= end; i++) missingSeats.push(i); 
                    } 
                } else { 
                    const num = parseInt(part); 
                    if (!isNaN(num)) missingSeats.push(num); 
                } 
            }
            if (name && studentCount > 0 && state.currentClassId) { 
                const typeConfig = getHomeworkType(typeId); 
                const initialStatus = typeConfig.statuses[0].key; 
                const students = []; 
                for (let i = 1; i <= studentCount; i++) { 
                    if (!missingSeats.includes(i)) students.push({ seat: i, status: initialStatus }); 
                } 
                const currentClass = state.appData.classes.find(c => c.id === state.currentClassId); 
                if (currentClass) { 
                    currentClass.lastMaxSeat = studentCount; 
                    currentClass.lastMissingSeats = missingInput; 
                } 
                state.appData.homeworks.push({ id: generateId(), classId: state.currentClassId, name, studentCount: students.length, typeId, createdAt: new Date(), students: students }); 
                await saveData(); 
                showToast("新增項目成功！", "success"); 
                renderHomeworkList(); 
            }
        }
    });

    // 批次狀態切換
    bindClick('batch-status-btn', async () => { 
        if (!state.currentHomeworkId) return; 
        const targetStatus = document.getElementById('batch-status-select').value, 
              statusText = document.querySelector('#batch-status-select option:checked').textContent, 
              hw = state.appData.homeworks.find(h => h.id === state.currentHomeworkId); 
        if (!hw) return; 
        showConfirmModal('套用變更', `確定全部套用為「${statusText}」嗎？`, async () => { 
            (hw.students || []).forEach(s => s.status = targetStatus); 
            renderStudentGrid(state.currentHomeworkId); 
            await saveData(); 
            showToast("已套用全班變更！", "success"); 
        }); 
    });

    // 作業種類管理
    bindClick('add-new-type-btn', async () => { 
        state.appData.homeworkTypes.push({ 
            id: `custom-${Date.now()}`, 
            name: '新作業種類', 
            statuses: [ 
                { key: 's1', text: '未繳交', color: 'bg-slate-200', textColor: 'text-slate-500', isCompleted: false }, 
                { key: 's2', text: '已完成', color: 'bg-emerald-500', textColor: 'text-white', isCompleted: true } 
            ] 
        }); 
        await saveData(); 
        showToast("已新增自訂種類！"); 
        renderHomeworkTypesPage(); 
    });

    const typesList = document.getElementById('types-list');
    if (typesList) {
        typesList.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-type-btn')) { 
                const idx = parseInt(e.target.dataset.typeIndex); 
                if (state.appData.homeworkTypes[idx].id === 'default') return; 
                showConfirmModal('刪除種類', `確定刪除「${state.appData.homeworkTypes[idx].name}」嗎？`, async () => { 
                    state.appData.homeworkTypes.splice(idx, 1); 
                    await saveData(); 
                    renderHomeworkTypesPage(); 
                    showToast("已刪除", "info"); 
                }); 
                return; 
            }
            if (e.target.classList.contains('add-status-btn')) { 
                const idx = parseInt(e.target.dataset.typeIndex); 
                if (state.appData.homeworkTypes[idx].statuses.length >= 4) { 
                    showToast("最多 4 個狀態", "error"); 
                    return; 
                } 
                state.appData.homeworkTypes[idx].statuses.push({ key: `s${Date.now()}`, text: '新狀態', color: 'bg-slate-200', textColor: 'text-slate-500', isCompleted: false }); 
                await saveData(); 
                renderHomeworkTypesPage(); 
                showToast("已新增狀態"); 
                return; 
            }
            if (e.target.classList.contains('delete-status-btn')) { 
                const typeIdx = parseInt(e.target.dataset.typeIndex), statusIdx = parseInt(e.target.dataset.statusIndex); 
                if (state.appData.homeworkTypes[typeIdx].statuses.length <= 2) { 
                    showToast("最少需 2 個狀態", "error"); 
                    return; 
                } 
                state.appData.homeworkTypes[typeIdx].statuses.splice(statusIdx, 1); 
                await saveData(); 
                renderHomeworkTypesPage(); 
                showToast("已移除狀態"); 
                return; 
            }
            if (e.target.classList.contains('color-dot')) { 
                const typeIdx = parseInt(e.target.dataset.typeIndex), statusIdx = parseInt(e.target.dataset.statusIndex); 
                const currentClass = state.appData.homeworkTypes[typeIdx].statuses[statusIdx].color; 
                let colorIndex = STATUS_COLORS.findIndex(c => c.class === currentClass); 
                if(colorIndex === -1) colorIndex = 0; 
                const nextColor = STATUS_COLORS[(colorIndex + 1) % STATUS_COLORS.length]; 
                state.appData.homeworkTypes[typeIdx].statuses[statusIdx].color = nextColor.class; 
                state.appData.homeworkTypes[typeIdx].statuses[statusIdx].textColor = nextColor.textClass; 
                await saveData(); 
                renderHomeworkTypesPage(); 
                return; 
            }
        });
        typesList.addEventListener('change', async (e) => {
            if (e.target.classList.contains('type-name-input')) { 
                state.appData.homeworkTypes[parseInt(e.target.dataset.typeIndex)].name = e.target.value.trim(); 
                await saveData(); 
            }
            if (e.target.classList.contains('status-name-input')) { 
                state.appData.homeworkTypes[parseInt(e.target.dataset.typeIndex)].statuses[parseInt(e.target.dataset.statusIndex)].text = e.target.value.trim(); 
                await saveData(); 
            }
            if (e.target.classList.contains('is-completed-check')) { 
                state.appData.homeworkTypes[parseInt(e.target.dataset.typeIndex)].statuses[parseInt(e.target.dataset.statusIndex)].isCompleted = e.target.checked; 
                await saveData(); 
            }
        });
    }

    // 搜尋與篩選
    bindChange('sort-homework', renderHomeworkList); 
    bindChange('sort-student-detail', renderStudentDetailsPage);
    const searchInput = document.getElementById('search-homework');
    if (searchInput) { 
        let searchTimeout = null;
        searchInput.addEventListener('input', () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(renderHomeworkList, 100);
        }); 
    }
    bindChange('filter-type', renderHomeworkList);
    bindChange('filter-date-start', renderHomeworkList);
    bindChange('filter-date-end', renderHomeworkList);

    // 班級管理與權限碼
    const PARENT_DASHBOARD_URL = 'https://ian1021228.github.io/ian_homework_checker2.0_online_parent_dashboard/';

    bindClick('gen-code-btn', () => {
        const input = document.getElementById('class-access-code');
        if (input) input.value = generateRandomAccessCode();
    });

    bindSubmit('add-class-form', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('class-name');
        const codeInput = document.getElementById('class-access-code');
        const className = nameInput ? nameInput.value.trim() : '';
        let accessCode = codeInput ? codeInput.value.trim().toUpperCase() : '';
        if (!accessCode) {
            accessCode = generateRandomAccessCode();
        }
        if(className) {
            if (accessCode && state.appData.classes.some(c => c.accessCode && c.accessCode.toUpperCase() === accessCode)) {
                showToast("⚠️ 權限碼與現有班級重複，已為您隨機產生新權限碼！", "warning");
                accessCode = generateRandomAccessCode();
            }
            state.appData.classes.push({ 
                id: generateId(), 
                name: className, 
                accessCode: accessCode,
                contactBook: {}, 
                studentBarcodes: {} 
            }); 
            await saveData(); 
            if (nameInput) nameInput.value = ''; 
            if (codeInput) codeInput.value = '';
            renderClassSelector(); 
            renderClassList(); 
            if(state.appData.classes.length === 1 || !state.currentClassId || !state.appData.classes.some(c=>c.id===state.currentClassId)) { 
                state.currentClassId = state.appData.classes[0].id; 
                localStorage.setItem('state.currentClassId', state.currentClassId); 
                renderHomeworkList(); 
            } 
            showToast(`新增班級「${className}」(權限碼：${accessCode})！`, "success"); 
        }
    });

    // 作業清單項目點擊
    const hwListEl = document.getElementById('homework-list');
    if (hwListEl) {
        hwListEl.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-hw-btn'), editBtn = e.target.closest('.edit-hw-btn');
            if (deleteBtn) { 
                e.stopPropagation(); 
                const homeworkId = deleteBtn.dataset.id; 
                const hw = state.appData.homeworks.find(h => h.id === homeworkId); 
                showConfirmModal('刪除作業', `確定移除「${hw.name}」嗎？`, async () => { 
                    state.appData.homeworks = state.appData.homeworks.filter(h => h.id !== homeworkId); 
                    await saveData(); 
                    showToast("已刪除", "info"); 
                    renderHomeworkList(); 
                }); 
                return; 
            }
            if (editBtn) { 
                e.stopPropagation(); 
                const homeworkId = editBtn.dataset.id; 
                const hw = state.appData.homeworks.find(h => h.id === homeworkId); 
                const modal = document.getElementById('add-homework-modal'); 
                document.getElementById('homework-modal-title').textContent = '更改作業名稱'; 
                modal.querySelector('form').reset(); 
                document.getElementById('homework-name').value = hw ? hw.name : ''; 
                document.getElementById('edit-homework-id').value = homeworkId; 
                document.getElementById('student-count-container').style.display = 'none'; 
                document.getElementById('student-count').removeAttribute('required'); 
                document.getElementById('homework-type-container').style.display = 'none'; 
                document.getElementById('missing-seats-hint').style.display = 'none'; 
                openModal(modal); 
                return; 
            }
            const hwItem = e.target.closest('[data-id]'); 
            if (hwItem) { 
                document.getElementById('detail-page').dataset.from = 'main-page'; 
                showDetailPage(hwItem.dataset.id); 
            }
        });
    }

    // 班級清單操作
    const classListEl = document.getElementById('class-list');
    if (classListEl) {
        classListEl.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('.delete-class-btn');
            if (deleteBtn) {
                e.stopPropagation();
                const classId = deleteBtn.dataset.id;
                const className = deleteBtn.dataset.name;
                const targetClass = state.appData.classes.find(c => c.id === classId);
                const oldCode = targetClass ? targetClass.accessCode : '';
                showConfirmModal('移除班級', `確定移除「${className}」嗎？將會擦除所有記錄！`, async () => {
                    if (oldCode) await deleteCloudParentClass(oldCode);
                    state.appData.classes = state.appData.classes.filter(c => c.id !== classId);
                    state.appData.homeworks = state.appData.homeworks.filter(h => h.classId !== classId);
                    if(state.currentClassId === classId) {
                        state.currentClassId = state.appData.classes.length > 0 ? state.appData.classes[0].id : null;
                        if(state.currentClassId) localStorage.setItem('state.currentClassId', state.currentClassId);
                        else localStorage.removeItem('state.currentClassId');
                    }
                    await saveData();
                    renderClassSelector();
                    renderClassList();
                    renderHomeworkList();
                    showToast("已移除班級", "info");
                });
                return;
            }

            const regenBtn = e.target.closest('.regen-class-code-btn');
            if (regenBtn) {
                e.stopPropagation();
                const classId = regenBtn.dataset.classId;
                const input = classListEl.querySelector(`.class-code-input[data-class-id="${classId}"]`);
                if (input) {
                    input.value = generateRandomAccessCode();
                    input.focus();
                }
                return;
            }

            const saveBtn = e.target.closest('.save-class-code-btn');
            if (saveBtn) {
                e.stopPropagation();
                const classId = saveBtn.dataset.classId;
                const input = classListEl.querySelector(`.class-code-input[data-class-id="${classId}"]`);
                if (input) {
                    const newCode = input.value.trim().toUpperCase();
                    const cls = state.appData.classes.find(c => c.id === classId);
                    if (cls) {
                        const oldCode = cls.accessCode;
                        if (newCode && state.appData.classes.some(c => c.id !== classId && c.accessCode && c.accessCode.toUpperCase() === newCode)) {
                            showToast("⚠️ 此權限碼已被其他班級使用！", "error");
                            return;
                        }
                        if (oldCode && oldCode !== newCode) {
                            await deleteCloudParentClass(oldCode);
                        }
                        cls.accessCode = newCode;
                        await saveData();
                        renderClassList();
                        showToast(newCode ? `已設定「${cls.name}」權限碼：${newCode}` : `已清除「${cls.name}」權限碼`, "success");
                    }
                }
                return;
            }

            const copyCodeBtn = e.target.closest('.copy-class-code-btn');
            if (copyCodeBtn) {
                e.stopPropagation();
                const code = copyCodeBtn.dataset.code;
                const name = copyCodeBtn.dataset.name;
                await safeCopyToClipboard(code, `✅ 已複製「${name}」班級權限碼：${code}`);
                return;
            }
        });

        classListEl.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('class-code-input')) {
                e.preventDefault();
                const classId = e.target.dataset.classId;
                const newCode = e.target.value.trim().toUpperCase();
                const cls = state.appData.classes.find(c => c.id === classId);
                if (cls) {
                    const oldCode = cls.accessCode;
                    if (newCode && state.appData.classes.some(c => c.id !== classId && c.accessCode && c.accessCode.toUpperCase() === newCode)) {
                        showToast("⚠️ 此權限碼已被其他班級使用！", "error");
                        return;
                    }
                    if (oldCode && oldCode !== newCode) {
                        await deleteCloudParentClass(oldCode);
                    }
                    cls.accessCode = newCode;
                    await saveData();
                    renderClassList();
                    showToast(newCode ? `已設定「${cls.name}」權限碼：${newCode}` : `已清除「${cls.name}」權限碼`, "success");
                }
            }
        });
    }

    bindClick('copy-parent-link-btn', async () => {
        await safeCopyToClipboard(PARENT_DASHBOARD_URL, "✅ 已複製家長端連結！");
    });

    const studentDetailsList = document.getElementById('student-details-list');
    if (studentDetailsList) {
        studentDetailsList.addEventListener('click', (e) => { 
            if(e.target.classList.contains('homework-link')) { 
                document.getElementById('detail-page').dataset.from = 'student-details-page'; 
                showDetailPage(e.target.dataset.id); 
            } 
        });
    }

    bindChange('class-selector', (e) => { 
        state.currentClassId = e.target.value; 
        localStorage.setItem('state.currentClassId', state.currentClassId); 
        renderHomeworkList(); 
    });

    // 學生網格點擊
    const studentGrid = document.getElementById('student-grid');
    if (studentGrid) {
        studentGrid.addEventListener('click', async (e) => {
            const studentBtn = e.target.closest('.student-btn');
            if (studentBtn) {
                const seat = parseInt(studentBtn.dataset.seat); 
                const hw = state.appData.homeworks.find(h => h.id === state.currentHomeworkId); 
                if (!hw || !hw.students) return;
                const studentIndex = hw.students.findIndex(s => s.seat === seat); 
                if (studentIndex === -1) return;
                const student = hw.students[studentIndex]; 
                const typeConfig = getHomeworkType(hw.typeId);
                let currentIndex = typeConfig.statuses.findIndex(s => s.key === student.status); 
                if(currentIndex === -1) currentIndex = 0;
                const nextIndex = (currentIndex + 1) % typeConfig.statuses.length;
                const oldStatus = student.status; 
                const newStatus = typeConfig.statuses[nextIndex].key;
                hw.students[studentIndex].status = newStatus;
                updateSingleStudentUI(seat, oldStatus, newStatus, typeConfig);
                updateSummaryUI(hw);
                await saveData();
            }
        });
    }

    // 條碼掃描模式切換與狀態初始化 (指定狀態 vs 變更為下一個狀態，兩者擇一)
    const assignCheckbox = document.getElementById('scan-mode-assign-checkbox');
    const nextCheckbox = document.getElementById('scan-mode-next-checkbox');
    const targetSelect = document.getElementById('scan-target-status-select');

    if (assignCheckbox) {
        assignCheckbox.addEventListener('click', () => {
            setScanActionMode('assign');
            document.getElementById('barcode-scan-input')?.focus();
        });
    }

    if (nextCheckbox) {
        nextCheckbox.addEventListener('click', () => {
            setScanActionMode('next');
            document.getElementById('barcode-scan-input')?.focus();
        });
    }

    if (targetSelect) {
        targetSelect.addEventListener('change', () => {
            setScanActionMode('assign');
        });
        targetSelect.addEventListener('focus', () => {
            setScanActionMode('assign');
        });
    }

    // 依據儲存偏好初始化掃描行為模式
    const initialScanAction = localStorage.getItem('scan_action_type') || 'assign';
    setScanActionMode(initialScanAction);

    // 條碼掃描輸入
    const scanInput = document.getElementById('barcode-scan-input');
    if (scanInput) {
        scanInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                const barcode = scanInput.value.trim(); 
                scanInput.value = '';
                if (!barcode || !state.currentClassId || !state.currentHomeworkId) return;
                const currentClass = state.appData.classes.find(c => c.id === state.currentClassId), 
                      hw = state.appData.homeworks.find(h => h.id === state.currentHomeworkId);
                if (!currentClass || !hw) return;
                let foundSeat = null;
                const barcodeMap = currentClass.barcodes || currentClass.studentBarcodes || {};
                for (const [seat, code] of Object.entries(barcodeMap)) { 
                    if (code === barcode) { foundSeat = parseInt(seat); break; } 
                }
                if (!foundSeat) {
                    const parsedNum = parseInt(barcode, 10);
                    if (!isNaN(parsedNum) && hw.students.some(s => s.seat === parsedNum)) {
                        foundSeat = parsedNum;
                    }
                }
                if (!foundSeat) { showToast(`找不到條碼或座號 (${barcode}) 對應的學生`, "error"); return; }
                const studentIndex = hw.students.findIndex(s => s.seat === foundSeat); 
                if (studentIndex === -1) { showToast(`${foundSeat} 號不在作業名單中`, "error"); return; }
                const student = hw.students[studentIndex]; 
                const typeConfig = getHomeworkType(hw.typeId);
                
                const isNextMode = document.getElementById('scan-mode-next-checkbox')?.checked;
                const oldStatus = student.status;
                let newStatus = '';

                if (isNextMode) {
                    // 變更為下一個狀態（每掃描一次循環切換到下一個狀態）
                    let currentIndex = typeConfig.statuses.findIndex(s => s.key === student.status);
                    if (currentIndex === -1) currentIndex = 0;
                    const nextIndex = (currentIndex + 1) % typeConfig.statuses.length;
                    newStatus = typeConfig.statuses[nextIndex].key;
                } else {
                    // 變更為選單指定之狀態
                    const targetStatusKey = document.getElementById('scan-target-status-select')?.value;
                    newStatus = targetStatusKey || typeConfig.statuses[0].key;
                }

                hw.students[studentIndex].status = newStatus;
                updateSingleStudentUI(foundSeat, oldStatus, newStatus, typeConfig);
                updateSummaryUI(hw);
                const btn = document.getElementById(`btn-seat-${foundSeat}`); 
                if (btn) { 
                    btn.classList.add('scale-[1.1]', 'ring-indigo-400'); 
                    setTimeout(() => btn.classList.remove('scale-[1.1]', 'ring-indigo-400'), 250); 
                }
                const targetStatusText = typeConfig.statuses.find(s => s.key === newStatus)?.text || '已更新';
                showToast(`${foundSeat} 號更新：${targetStatusText}`, "success"); 
                await saveData();
            }
        });
    }

    // 黑板 / 聯絡簿字體與行距調整
    bindClick('font-increase-btn', () => { 
        state.blackboardFontSize = state.blackboardFontSize + 0.1; 
        document.getElementById('blackboard-content').style.fontSize = `${state.blackboardFontSize}rem`; 
        localStorage.setItem('hw_pref_fontSize', state.blackboardFontSize); 
    });
    bindClick('font-decrease-btn', () => { 
        if(state.blackboardFontSize > 0.5) { 
            state.blackboardFontSize = state.blackboardFontSize - 0.1; 
            document.getElementById('blackboard-content').style.fontSize = `${state.blackboardFontSize}rem`; 
            localStorage.setItem('hw_pref_fontSize', state.blackboardFontSize); 
        } 
    });
    bindClick('lineheight-increase-btn', () => { 
        state.blackboardLineHeight = state.blackboardLineHeight + 0.2; 
        document.getElementById('blackboard-content').style.lineHeight = `${state.blackboardLineHeight}`; 
        localStorage.setItem('hw_pref_lineHeight', state.blackboardLineHeight); 
    });
    bindClick('lineheight-decrease-btn', () => { 
        if(state.blackboardLineHeight > 1.0) { 
            state.blackboardLineHeight = state.blackboardLineHeight - 0.2; 
            document.getElementById('blackboard-content').style.lineHeight = `${state.blackboardLineHeight}`; 
            localStorage.setItem('hw_pref_lineHeight', state.blackboardLineHeight); 
        } 
    });

    // 聯絡簿新增與編輯
    bindSubmit('add-contact-item-form', async (e) => { 
        e.preventDefault(); 
        const input = document.getElementById('contact-book-input'), 
              newItem = input.value.trim(), 
              dateString = formatDate(state.selectedDate, 'YYYY-MM-DD'); 
        if (newItem && state.currentClassId) { 
            const currentClass = state.appData.classes.find(c => c.id === state.currentClassId); 
            if (!currentClass) return; 
            if(!currentClass.contactBook) currentClass.contactBook = {}; 
            if(!currentClass.contactBook[dateString]) currentClass.contactBook[dateString] = []; 
            currentClass.contactBook[dateString].push(newItem); 
            await saveData(); 
            renderContactBookItems(); 
            input.value = ''; 
            showToast("已寫上黑板！", "success"); 
        } 
    });

    bindSubmit('edit-contact-form', async (e) => {
        e.preventDefault();
        const index = parseInt(document.getElementById('edit-contact-index').value);
        const dateString = document.getElementById('edit-contact-date').value;
        const newText = document.getElementById('edit-contact-name').value.trim();
        closeModal(document.getElementById('edit-contact-modal'));
        if (newText && state.currentClassId) {
            const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
            if (currentClass && currentClass.contactBook[dateString]) {
                currentClass.contactBook[dateString][index] = newText;
                await saveData();
                renderContactBookItems();
                showToast("修改成功！");
            }
        }
    });

    const blackboardEl = document.getElementById('blackboard-content');
    if(blackboardEl) {
        blackboardEl.addEventListener('click', async (e) => {
            if (!state.currentClassId) return; 
            const currentClass = state.appData.classes.find(c => c.id === state.currentClassId), 
                  dateString = formatDate(state.selectedDate, 'YYYY-MM-DD');
            const deleteBtn = e.target.closest('.delete-contact-item-btn'); 
            if (deleteBtn) { 
                currentClass.contactBook[dateString] = currentClass.contactBook[dateString].filter((_, index) => index !== parseInt(deleteBtn.dataset.index)); 
                await saveData(); 
                renderContactBookItems(); 
                showToast("已擦除", "info"); 
                return; 
            }
            const editBtn = e.target.closest('.edit-contact-btn'); 
            if (editBtn) {
                const index = parseInt(editBtn.dataset.index);
                const text = currentClass.contactBook[dateString][index];
                const modal = document.getElementById('edit-contact-modal');
                document.getElementById('edit-contact-index').value = index;
                document.getElementById('edit-contact-date').value = dateString;
                document.getElementById('edit-contact-name').value = text;
                openModal(modal);
                return;
            }
            const toHwBtn = e.target.closest('.to-hw-btn'); 
            if (toHwBtn) { 
                const index = parseInt(toHwBtn.dataset.index), 
                      modal = document.getElementById('add-homework-modal'); 
                document.getElementById('homework-modal-title').textContent = '新增作業'; 
                document.getElementById('student-count').setAttribute('required', 'required'); 
                modal.querySelector('form').reset(); 
                document.getElementById('homework-name').value = currentClass.contactBook[dateString][index]; 
                document.getElementById('edit-homework-id').value = ''; 
                document.getElementById('student-count-container').style.display = 'grid'; 
                document.getElementById('homework-type-container').style.display = 'block'; 
                document.getElementById('missing-seats-hint').style.display = 'block'; 
                updateTypeSelects(); 
                if (currentClass && currentClass.lastMaxSeat) { 
                    document.getElementById('student-count').value = currentClass.lastMaxSeat; 
                    document.getElementById('homework-missing-seats').value = currentClass.lastMissingSeats || ''; 
                } else { 
                    const classHws = state.appData.homeworks.filter(h => h.classId === state.currentClassId); 
                    if(classHws.length > 0) { 
                        let maxSeat = 0; 
                        (classHws[classHws.length-1].students || []).forEach(s => maxSeat = Math.max(maxSeat, s.seat)); 
                        document.getElementById('student-count').value = maxSeat || 30; 
                    } else document.getElementById('student-count').value = 30; 
                } 
                openModal(modal); 
            }
        });
    }

    bindClick('clear-contact-book-btn', () => { 
        if (!state.currentClassId) return; 
        showConfirmModal('清空本日', `確定清空 ${formatDate(state.selectedDate)} 嗎？`, async () => { 
            state.appData.classes.find(c => c.id === state.currentClassId).contactBook[formatDate(state.selectedDate, 'YYYY-MM-DD')] = []; 
            await saveData(); 
            renderContactBookItems(); 
            showToast("已清空", "info"); 
        }); 
    });
    bindClick('clear-all-contact-book-btn', () => { 
        if (!state.currentClassId) return; 
        showConfirmModal('刪除全部', `確定刪除「所有日期」內容嗎？無法復原。`, async () => { 
            state.appData.classes.find(c => c.id === state.currentClassId).contactBook = {}; 
            await saveData(); 
            renderContactBookItems(); 
            showToast("已清空全部", "info"); 
        }); 
    });
    bindClick('apply-yesterday-btn', async () => { 
        if (!state.currentClassId) return; 
        const yesterday = new Date(state.selectedDate); 
        yesterday.setDate(state.selectedDate.getDate() - 1); 
        const yStr = formatDate(yesterday, 'YYYY-MM-DD'), 
              tStr = formatDate(state.selectedDate, 'YYYY-MM-DD'), 
              currentClass = state.appData.classes.find(c => c.id === state.currentClassId), 
              yesterdayItems = currentClass?.contactBook?.[yStr]; 
        if (!yesterdayItems || yesterdayItems.length === 0) { 
            showToast('無內容可套用', 'error'); 
            return; 
        } 
        showConfirmModal('套用昨日', '確定套用嗎？將覆蓋本日現有內容！', async () => { 
            if(!currentClass.contactBook) currentClass.contactBook = {}; 
            currentClass.contactBook[tStr] = [...yesterdayItems]; 
            await saveData(); 
            renderContactBookItems(); 
            showToast("已套用！", "success"); 
        }); 
    });

    // 日期選擇彈窗
    bindClick('open-date-picker-btn', () => { 
        state.calendarDate = new Date(state.selectedDate); 
        renderCalendar(); 
        openModal(document.getElementById('date-picker-modal')); 
    });
    bindClick('close-date-picker-btn', () => closeModal(document.getElementById('date-picker-modal')));
    bindClick('prev-month-btn', () => { 
        state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); 
        renderCalendar(); 
    });
    bindClick('next-month-btn', () => { 
        state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); 
        renderCalendar(); 
    });
    
    const calGrid = document.getElementById('calendar-grid');
    if(calGrid) {
        calGrid.addEventListener('click', (e) => { 
            const dayBtn = e.target.closest('.calendar-day'); 
            if (dayBtn) { 
                state.selectedDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth(), parseInt(dayBtn.dataset.day)); 
                renderContactBookItems(); 
                closeModal(document.getElementById('date-picker-modal')); 
            } 
        });
    }

    // 頂部同步旗標
    bindClick('resume-sync-btn', async () => { 
        if (!state.fileHandle) return; 
        try { 
            if ((await state.fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') { 
                document.getElementById('sync-banner').classList.add('hidden'); 
                document.body.classList.remove('has-banner'); 
                await syncFromFileHandle(); 
                fullRender(); 
                showToast("已恢復硬碟連線", "success"); 
            } 
        } catch(e) {} 
    });

    // 彈窗通用按鈕
    document.querySelectorAll('.cancel-btn, #close-warning-btn').forEach(btn => btn.addEventListener('click', (e) => closeModal(e.target.closest('.modal'))));

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal.id === 'confirm-modal' || modal.id === 'name-prompt-modal') return;
                closeModal(modal);
            }
        });
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal:not(.hidden)');
            if (openModals.length > 0) {
                const topModal = openModals[openModals.length - 1];
                if (topModal.id !== 'name-prompt-modal') {
                    closeModal(topModal);
                }
            }
        }
    });

    // PWA 安裝
    let deferredInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        const installBtn = document.getElementById('install-pwa-btn');
        if (installBtn) installBtn.classList.remove('hidden');
    });

    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                const { outcome } = await deferredInstallPrompt.userChoice;
                if (outcome === 'accepted') {
                    showToast("✅ 已成功安裝作業點收系統 App！", "success");
                }
                deferredInstallPrompt = null;
            } else {
                showToast("💡 提示：請點擊瀏覽器網址列右側的「安裝」圖示，或選單中的「加到主畫面」進行安裝。", "info");
            }
        });
    }

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        showToast("🎉 作業點收系統 App 安裝完成！", "success");
    });

    // 畫面尺寸調整
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (state.currentPage === 'detail-page' && state.currentHomeworkId) {
                renderStudentGrid(state.currentHomeworkId);
            }
        }, 100);
    });

    // ============================================
    // 秘技快捷鍵：在首頁依序按下 ianw0000 進入開發者模式
    // ============================================
    let devKeySequence = '';
    const TARGET_DEV_CODE = 'ianw0000';
    let devKeyTimer = null;

    window.addEventListener('keydown', (e) => {
        // 僅在首頁有效 (portal-page 未隱藏)
        const portalEl = document.getElementById('portal-page');
        if (!portalEl || portalEl.classList.contains('hidden')) {
            devKeySequence = '';
            return;
        }

        // 避免在表單輸入欄位 (例如帳號或密碼輸入框) 中打字時誤觸發
        const activeTag = document.activeElement?.tagName?.toUpperCase();
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
            return;
        }

        const key = (e.key || '').toLowerCase();
        if (key.length === 1) {
            devKeySequence += key;
            if (devKeySequence.length > TARGET_DEV_CODE.length) {
                devKeySequence = devKeySequence.slice(-TARGET_DEV_CODE.length);
            }

            if (devKeySequence === TARGET_DEV_CODE) {
                devKeySequence = '';
                e.preventDefault();
                enterDeveloperMode();
            }

            clearTimeout(devKeyTimer);
            devKeyTimer = setTimeout(() => {
                devKeySequence = '';
            }, 5000);
        }
    }, true);
}

export function enterDeveloperMode() {
    state.isDevMode = true;
    sessionStorage.setItem('app_dev_mode', 'true');
    sessionStorage.setItem('has_passed_portal_in_session', 'true');
    sessionStorage.removeItem('app_is_guest_mode');
    localStorage.setItem('storageSelected', 'true');

    if (!state.currentUser) {
        state.currentUser = {
            uid: 'dev_admin_' + (localStorage.getItem('visitor_id') || 'ianw'),
            email: 'ianw.solar@gmail.com',
            displayName: '開發者 (管理員模式)',
            isDevMode: true
        };
        try {
            localStorage.setItem('app_user_session', JSON.stringify(state.currentUser));
        } catch(e) {}
    } else {
        state.currentUser.isDevMode = true;
    }

    // 關閉首頁認證相關彈窗
    closePortalAuthModal();
    
    // 進入主系統
    proceedIntoSystem();
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) closeModal(welcomeModal);

    // 顯示管理員按鈕
    document.getElementById('admin-modal-btn')?.classList.remove('hidden');
    document.getElementById('admin-btn')?.classList.remove('hidden');

    // 更新管理介面與狀態
    updateDataManagementUI();
    try { updatePortalUI(); } catch(e) {}
    try {
        if (window.updateChatVisibility) window.updateChatVisibility();
        if (window.updateChatUnreadBadge) window.updateChatUnreadBadge();
    } catch(e) {}

    showToast("🛠️ 已進入開發者模式（管理員權限，已鎖定刪除帳號功能）", "success");
}
window.enterDeveloperMode = enterDeveloperMode;

export function setScanActionMode(mode) {
    const assignCheckbox = document.getElementById('scan-mode-assign-checkbox');
    const nextCheckbox = document.getElementById('scan-mode-next-checkbox');
    const assignBox = document.getElementById('scan-mode-assign-box');
    const nextBox = document.getElementById('scan-mode-next-box');
    const targetSelect = document.getElementById('scan-target-status-select');

    if (mode === 'next') {
        if (assignCheckbox) assignCheckbox.checked = false;
        if (nextCheckbox) nextCheckbox.checked = true;
        if (targetSelect) {
            targetSelect.disabled = true;
            targetSelect.classList.add('opacity-40', 'pointer-events-none', 'bg-slate-100');
            targetSelect.classList.remove('bg-white');
        }
        if (nextBox) {
            nextBox.classList.add('border-indigo-400', 'ring-2', 'ring-indigo-100', 'bg-indigo-50/30');
            nextBox.classList.remove('border-slate-200/80');
        }
        if (assignBox) {
            assignBox.classList.remove('border-indigo-400', 'ring-2', 'ring-indigo-100', 'bg-indigo-50/30');
            assignBox.classList.add('border-slate-200/80');
        }
        localStorage.setItem('scan_action_type', 'next');
    } else {
        if (assignCheckbox) assignCheckbox.checked = true;
        if (nextCheckbox) nextCheckbox.checked = false;
        if (targetSelect) {
            targetSelect.disabled = false;
            targetSelect.classList.remove('opacity-40', 'pointer-events-none', 'bg-slate-100');
            targetSelect.classList.add('bg-white');
        }
        if (assignBox) {
            assignBox.classList.add('border-indigo-400', 'ring-2', 'ring-indigo-100', 'bg-indigo-50/30');
            assignBox.classList.remove('border-slate-200/80');
        }
        if (nextBox) {
            nextBox.classList.remove('border-indigo-400', 'ring-2', 'ring-indigo-100', 'bg-indigo-50/30');
            nextBox.classList.add('border-slate-200/80');
        }
        localStorage.setItem('scan_action_type', 'assign');
    }
}
window.setScanActionMode = setScanActionMode;
