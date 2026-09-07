/**
 * 親師作業點收X聯絡簿系統 3.0 - SVG 圖標庫
 * 提供純向量、零依賴、無延遲、杜絕缺字多條橫線 (Missing Glyphs) 的 SVG 圖標
 */

export const ICONS = {
    // 箭頭類
    'arrow-right': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M4 12h12.17l-4.58-4.59L13 6l7 7l-7 7l-1.41-1.41L16.17 14H4v-2z"/></svg>`,
    'arrow-down': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M11 4v12.17l-4.59-4.58L5 13l7 7l7-7l-1.41-1.41L13 16.17V4h-2z"/></svg>`,
    'chevron-right': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M8.59 16.59L13.17 12L8.59 7.41L10 6l6 6l-6 6l-1.41-1.41z"/></svg>`,
    'arrow-right-from-bracket': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M5 5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h7v-2H5V5zm11.59 2.41L15.17 8.83L17.34 11H9v2h8.34l-2.17 2.17l1.42 1.42L21.17 12l-4.58-4.59z"/></svg>`,

    // 狀態與標章
    'circle-check': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5l1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
    'circle-info': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
    'triangle-exclamation': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M1 21h22L12 2L1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
    'wand-magic-sparkles': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M7.5 5.6L5 7l1.4-2.5L5 2l2.5 1.4L10 2L8.6 4.5L10 7L7.5 5.6zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14l-2.5 1.4zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5L22 2zm-7.63 8.29l-9.14 9.14a1.49 1.49 0 0 1-2.12 0a1.49 1.49 0 0 1 0-2.12l9.14-9.14a1.49 1.49 0 0 1 2.12 0a1.49 1.49 0 0 1 0 2.12z"/></svg>`,
    'shield-halved': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>`,

    // 業務功能
    'barcode': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M2 4h2v16H2V4zm3 0h1v16H5V4zm3 0h2v16H8V4zm3 0h1v16h-1V4zm2 0h3v16h-3V4zm4 0h1v16h-1V4zm2 0h2v16h-2V4zm3 0h1v16h-1V4z"/></svg>`,
    'comment-dots': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6.5 11c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8s1.5.67 1.5 1.5S7.33 11 6.5 11zm5.5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5s1.5.67 1.5 1.5s-.67 1.5-1.5 1.5zm5.5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5s1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>`,
    'envelope': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5l-8-5V6l8 5l8-5v2z"/></svg>`,
    'envelope-circle-check': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h8c1.1 0 2-.9 2-2v-8c0-5.52-4.48-10-10-10zm0 3c1.38 0 2.67.35 3.8 1L12 9.2L8.2 6c1.13-.65 2.42-1 3.8-1zm-6 2.37l5.4 4.5c.35.29.85.29 1.2 0L18 7.37V10c-.63 0-1.24.12-1.8.34L12 14.5l-6-5V7.37zm12 12.63l-3-3l1.41-1.41L18 17.17l5.59-5.59L25 13l-7 7z"/></svg>`,
    'copy': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
    'laptop-code': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6zm5.29 8.71L10.7 13.3L8.41 11l2.29-2.29l-1.41-1.42L6 10.58l3.29 3.71zm5.42 0l3.29-3.71L14.71 7.29l-1.41 1.42L15.59 11l-2.29 2.3l1.41 1.41z"/></svg>`,
    'magnifying-glass-plus': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14zm.5-7H9v2H7v1h2v2h1v-2h2V9h-2V7z"/></svg>`,
    'heart': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    'house': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3L2 12h3v8z"/></svg>`,
    'key': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2s2 .9 2 2s-.9 2-2 2z"/></svg>`,
    'eye': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5s5 2.24 5 5s-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3s3-1.34 3-3s-1.34-3-3-3z"/></svg>`,
    'eye-slash': `<svg class="inline-block fill-current" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75c-1.73-4.39-6-7.5-11-7.5c-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28l.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5c1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22L21 20.73L3.27 3L2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65c0 1.66 1.34 3 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53c-2.76 0-5-2.24-5-5c0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15l.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`,
    'spinner': `<svg class="inline-block animate-spin" viewBox="0 0 24 24" width="1em" height="1em"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>`
};

/**
 * 取得指定名稱的純向量 SVG 字串
 * @param {string} name 圖標名稱
 * @param {string} [extraClass] 附加 CSS 類別
 * @returns {string} SVG HTML
 */
export function getSvgIcon(name, extraClass = '') {
    const raw = ICONS[name] || ICONS['circle-info'];
    if (!extraClass) return raw;
    return raw.replace('<svg class="', `<svg class="${extraClass} `);
}
