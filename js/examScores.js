/**
 * 親師作業點收X聯絡簿系統 3.0 - 全螢幕班級成績與測驗管理系統 (Exam Scores Management System)
 */

import { state } from './state.js';
import { globalAppId } from './constants.js';
import { showToast, showConfirmModal, openModal, closeModal, safeCopyToClipboard } from './utils.js';
import { fbDb, doc, getDoc, setDoc, collection, query, where, onSnapshot, syncClassExamsToCloud, syncDataToCloud } from './firebase.js';
import { saveData } from './storage.js';

// ==========================================
// 1. 課綱六大領域與 21 門學科配置
// ==========================================
export const DOMAINS_CONFIG = [
  { id: "lang", name: "語文領域", color: "bg-indigo-500", lightBg: "bg-indigo-50", textColor: "text-indigo-700", borderColor: "border-indigo-200", subjects: ["國語文", "英語文"] },
  { id: "math", name: "數學領域", color: "bg-blue-500", lightBg: "bg-blue-50", textColor: "text-blue-700", borderColor: "border-blue-200", subjects: ["數學"] },
  { id: "social", name: "社會領域", color: "bg-amber-500", lightBg: "bg-amber-50", textColor: "text-amber-700", borderColor: "border-amber-200", subjects: ["歷史", "地理", "公民與社會", "綜合社會"] },
  { id: "nature", name: "自然科學", color: "bg-emerald-500", lightBg: "bg-emerald-50", textColor: "text-emerald-700", borderColor: "border-emerald-200", subjects: ["生物", "理化", "地球科學", "綜合自然"] },
  { id: "arts-tech", name: "藝術與科技", color: "bg-purple-500", lightBg: "bg-purple-50", textColor: "text-purple-700", borderColor: "border-purple-200", subjects: ["音樂", "視覺藝術", "表演藝術", "資訊科技", "生活科技"] },
  { id: "health-comp", name: "健體與綜合活動", color: "bg-rose-500", lightBg: "bg-rose-50", textColor: "text-rose-700", borderColor: "border-rose-200", subjects: ["健康教育", "體育", "家政", "童軍", "輔導"] }
];

export const ALL_21_SUBJECTS = DOMAINS_CONFIG.flatMap(d => d.subjects);

export function getDomainBySubject(subName) {
  return DOMAINS_CONFIG.find(d => d.subjects.includes(subName)) || DOMAINS_CONFIG[0];
}

// 狀態變數
let currentSelectedExamId = null;
let currentExportFormat = 'xlsx';
let currentExportDateRange = 'all';
let hideScoresPrivacy = false; // 勾選隱藏成績（防偷窺/大螢幕隱私模式）
let hideCompletedStudents = false; // 填寫完分數要隱藏（避免重複填寫）
let currentSyncClassCode = null;
let unsubscribeStudentScores = null;

// ==========================================
// 2. 六大分數區段分析計算器 (100, 90~99, 80~89, 70~79, 60~69, <60)
// ==========================================
export function calculateScoreSegments(scoresList) {
  const segments = {
    '100': { key: '100', label: '100 分', min: 100, max: 100, count: 0, color: 'bg-emerald-500', textColor: 'text-emerald-700', bgLight: 'bg-emerald-50', border: 'border-emerald-200' },
    '90-99': { key: '90-99', label: '90 ~ 99 分', min: 90, max: 99, count: 0, color: 'bg-teal-500', textColor: 'text-teal-700', bgLight: 'bg-teal-50', border: 'border-teal-200' },
    '80-89': { key: '80-89', label: '80 ~ 89 分', min: 80, max: 89, count: 0, color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-50', border: 'border-blue-200' },
    '70-79': { key: '70-79', label: '70 ~ 79 分', min: 70, max: 79, count: 0, color: 'bg-indigo-500', textColor: 'text-indigo-700', bgLight: 'bg-indigo-50', border: 'border-indigo-200' },
    '60-69': { key: '60-69', label: '60 ~ 69 分', min: 60, max: 69, count: 0, color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50', border: 'border-amber-200' },
    'below-60': { key: 'below-60', label: '低於 60 分', min: 0, max: 59, count: 0, color: 'bg-rose-500', textColor: 'text-rose-700', bgLight: 'bg-rose-50', border: 'border-rose-200' }
  };

  scoresList.forEach(s => {
    const val = Number(s);
    if (isNaN(val)) return;
    if (val === 100) segments['100'].count++;
    else if (val >= 90) segments['90-99'].count++;
    else if (val >= 80) segments['80-89'].count++;
    else if (val >= 70) segments['70-79'].count++;
    else if (val >= 60) segments['60-69'].count++;
    else segments['below-60'].count++;
  });

  return segments;
}

// ==========================================
// 3. 班級最後座號流轉規則
// ==========================================
export function getCurrentClass() {
  if (!state.currentClassId) return null;
  return (state.appData?.classes || []).find(c => c.id === state.currentClassId) || null;
}

/**
 * 檢查是否需要彈出初次設定班級最後座號彈窗
 */
export function checkInitialMaxSeatSetup() {
  const curClass = getCurrentClass();
  if (!curClass) return;
  // 若該班尚未設定過最後座號，彈窗引導設定
  if (!curClass.hasConfiguredMaxSeat) {
    const modal = document.getElementById('initial-max-seat-modal');
    const input = document.getElementById('initial-max-seat-input');
    if (modal && input) {
      input.value = curClass.lastMaxSeat || 30;
      openModal(modal);
    }
  }
}

/**
 * 更新班級最後座號並套用至全班作業
 */
export async function updateClassMaxSeat(classId, newMaxSeat) {
  const targetClass = (state.appData?.classes || []).find(c => c.id === classId);
  if (!targetClass) return false;

  const validMax = Math.max(1, Math.min(100, parseInt(newMaxSeat, 10) || 30));
  targetClass.lastMaxSeat = validMax;
  targetClass.hasConfiguredMaxSeat = true;

  // 全班所有作業同步套用座號變更
  (state.appData.homeworks || []).forEach(hw => {
    if (hw.classId === classId) {
      const existingStudents = hw.students || [];
      const studentMap = new Map();
      existingStudents.forEach(s => studentMap.set(s.seat, s));

      const updatedStudents = [];
      const defaultStatus = (hw.typeId && state.appData.homeworkTypes?.find(t => t.id === hw.typeId)?.statuses?.[0]?.key) || 'not_submitted';

      for (let seat = 1; seat <= validMax; seat++) {
        if (studentMap.has(seat)) {
          updatedStudents.push(studentMap.get(seat));
        } else {
          updatedStudents.push({ seat, status: defaultStatus });
        }
      }
      hw.students = updatedStudents;
    }
  });

  // 儲存並同步至雲端
  saveData();
  await syncDataToCloud();
  return true;
}

/**
 * 啟動學生端填寫成績與教師端實時雙向同步
 * 監聽 userProfiles 中 classCode 為當前班級之所有學生獨立個人資料，即刻匯總至全班 exams
 */
export function startRealtimeStudentScoresSync(curClass) {
  if (!curClass || !curClass.accessCode) return;
  const cleanCode = String(curClass.accessCode).trim();
  if (currentSyncClassCode === cleanCode && unsubscribeStudentScores) {
    return;
  }
  if (unsubscribeStudentScores) {
    try { unsubscribeStudentScores(); } catch (e) {}
    unsubscribeStudentScores = null;
  }
  currentSyncClassCode = cleanCode;

  if (!fbDb) return;
  try {
    const q = query(
      collection(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles'),
      where('classCode', '==', cleanCode)
    );
    unsubscribeStudentScores = onSnapshot(q, (snapshot) => {
      let changed = false;
      curClass.exams = curClass.exams || [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!data || data.seat === undefined || data.seat === null) return;
        const seatStr = String(data.seat);
        const scores = Array.isArray(data.scores) ? data.scores : [];
        scores.forEach(s => {
          const examId = s.examId || s.id;
          const exam = curClass.exams.find(e => e.id === examId || (e.name === s.name && e.subject === s.subject));
          if (exam) {
            exam.submissions = exam.submissions || {};
            const existingSub = exam.submissions[seatStr];
            const incomingScore = Number(s.score);
            if (!existingSub || Number(existingSub.score) !== incomingScore || existingSub.correction !== s.correction || existingSub.remark !== s.remark) {
              exam.submissions[seatStr] = {
                score: incomingScore,
                correction: s.correction || '已完成訂正',
                remark: s.remark || '',
                originalScore: s.originalScore !== undefined ? s.originalScore : (existingSub ? existingSub.originalScore : null),
                lastModified: s.lastModified || existingSub?.lastModified || '',
                isMakeup: Boolean(s.isMakeup),
                updatedAt: data.updatedAt || new Date().toISOString()
              };
              changed = true;
            }
          }
        });
      });

      if (changed) {
        renderSelectedExamDetails();
        const examListContainer = document.getElementById('scores-exam-list');
        if (examListContainer) {
          curClass.exams.forEach(exam => {
            const card = examListContainer.querySelector(`[data-exam-id="${exam.id}"]`);
            if (card) {
              const count = Object.keys(exam.submissions || {}).length;
              const maxSeat = curClass.lastMaxSeat || 30;
              const badge = card.querySelector('.exam-fill-status-badge');
              if (badge) badge.textContent = `${count}/${maxSeat} 已填`;
            }
          });
        }
        saveData();
        syncClassExamsToCloud(curClass);
      }
    }, (err) => {
      console.warn("Realtime student scores sync warning:", err);
    });
  } catch (err) {
    console.warn("startRealtimeStudentScoresSync error:", err);
  }
}

// ==========================================
// 4. 全螢幕成績系統渲染 (Fullscreen View Render)
// ==========================================
export function renderExamScoresView() {
  const curClass = getCurrentClass();
  const fullscreenView = document.getElementById('exam-scores-fullscreen-view');
  if (!fullscreenView || !curClass) return;

  // 啟動實時雙向同步
  startRealtimeStudentScoresSync(curClass);

  // 1. 頂部標題與班級徽章
  const classBadge = document.getElementById('scores-view-class-badge');
  if (classBadge) {
    classBadge.textContent = `${curClass.name} (座號 1~${curClass.lastMaxSeat || 30} 號)`;
  }

  // 2. 考試科目篩選下拉選單
  const filterSubjectSelect = document.getElementById('filter-exam-subject');
  if (filterSubjectSelect && filterSubjectSelect.children.length <= 1) {
    filterSubjectSelect.innerHTML = '<option value="all">所有學科 (21門)</option>';
    DOMAINS_CONFIG.forEach(d => {
      const optGroup = document.createElement('optgroup');
      optGroup.label = d.name;
      d.subjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = sub;
        optGroup.appendChild(opt);
      });
      filterSubjectSelect.appendChild(optGroup);
    });
  }

  // 3. 渲染左側考試清單
  const exams = Array.isArray(curClass.exams) ? curClass.exams : [];
  const selectedSubject = filterSubjectSelect?.value || 'all';

  let filteredExams = exams.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  if (selectedSubject !== 'all') {
    filteredExams = filteredExams.filter(e => e.subject === selectedSubject);
  }

  const examCountBadge = document.getElementById('scores-exam-count-badge');
  if (examCountBadge) examCountBadge.textContent = `${filteredExams.length} 場`;

  const examListContainer = document.getElementById('scores-exam-list');
  if (examListContainer) {
    examListContainer.innerHTML = '';
    if (filteredExams.length === 0) {
      examListContainer.innerHTML = `
        <div class="text-center py-12 px-4 space-y-3">
          <div class="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center text-2xl mx-auto border border-teal-100">
            <i class="fa-solid fa-pen-ruler"></i>
          </div>
          <div>
            <p class="text-xs font-black text-slate-700">目前尚無已發布的小考</p>
            <p class="text-[11px] text-slate-400 mt-0.5">點擊右上角「新增考試」即可出題發布！</p>
          </div>
          <button type="button" class="btn-create-exam-inline px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer">
            + 立即新增考試
          </button>
        </div>
      `;
      examListContainer.querySelector('.btn-create-exam-inline')?.addEventListener('click', () => openExamEditorModal());
    } else {
      if (!currentSelectedExamId || !exams.find(e => e.id === currentSelectedExamId)) {
        currentSelectedExamId = filteredExams[0]?.id || null;
      }

      filteredExams.forEach(exam => {
        const isSelected = exam.id === currentSelectedExamId;
        const domain = getDomainBySubject(exam.subject);
        const submissions = exam.submissions || {};
        const submissionKeys = Object.keys(submissions);
        const maxSeat = curClass.lastMaxSeat || 30;
        const filledCount = submissionKeys.length;
        const scores = submissionKeys.map(k => Number(submissions[k]?.score)).filter(s => !isNaN(s));
        const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '--';

        const card = document.createElement('div');
        card.className = `p-3.5 rounded-2xl border transition-all cursor-pointer ${
          isSelected
            ? 'bg-teal-50/70 border-teal-500 shadow-sm ring-2 ring-teal-500/20'
            : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
        }`;
        card.dataset.examId = exam.id;

        const missingSeatsArr = Array.isArray(exam.missingSeats) ? exam.missingSeats : (exam.missingSeats ? String(exam.missingSeats).split(/[,，\s]+/).filter(Boolean) : []);
        const missingBadge = missingSeatsArr.length > 0
          ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">缺考 ${missingSeatsArr.length} 人</span>`
          : '';

        card.innerHTML = `
          <div class="flex items-start justify-between gap-2 mb-1.5">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-black ${domain.lightBg} ${domain.textColor} border ${domain.borderColor}">
              ${exam.subject}
            </span>
            <span class="text-[11px] font-bold text-slate-400">📅 ${exam.date || '未定'}</span>
          </div>
          <h4 class="font-extrabold text-sm text-slate-900 leading-snug line-clamp-1 mb-2">${exam.name}</h4>
          <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-600">${filledCount}/${maxSeat} 已填</span>
              ${missingBadge}
            </div>
            <div class="font-black ${scores.length > 0 ? (avgScore >= 80 ? 'text-teal-700' : avgScore >= 60 ? 'text-slate-800' : 'text-rose-600') : 'text-slate-400'}">
              均分: ${avgScore}
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-100/60">
            <button type="button" class="btn-edit-exam-action text-[11px] font-bold text-slate-500 hover:text-teal-600 px-2 py-0.5 rounded hover:bg-slate-100 transition-colors" data-exam-id="${exam.id}">
              <i class="fa-solid fa-pen-to-square mr-1"></i>編輯
            </button>
            <button type="button" class="btn-delete-exam-action text-[11px] font-bold text-slate-400 hover:text-rose-600 px-2 py-0.5 rounded hover:bg-rose-50 transition-colors" data-exam-id="${exam.id}">
              <i class="fa-solid fa-trash mr-1"></i>刪除
            </button>
          </div>
        `;

        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-edit-exam-action') || e.target.closest('.btn-delete-exam-action')) return;
          currentSelectedExamId = exam.id;
          renderExamScoresView();
        });

        card.querySelector('.btn-edit-exam-action')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openExamEditorModal(exam.id);
        });

        card.querySelector('.btn-delete-exam-action')?.addEventListener('click', (e) => {
          e.stopPropagation();
          showConfirmModal('刪除考試確認', `確定要刪除「${exam.name}」嗎？此測驗的所有全班學生成績與紀錄將一併移除且無法復原！`, async () => {
            await deleteExam(exam.id);
          });
        });

        examListContainer.appendChild(card);
      });
    }
  }

  // 4. 渲染右側選中考試之資訊摘要、6 大分數區段分析長條圖與學生成績表
  renderSelectedExamDetails();
}

/**
 * 渲染右欄當前選中測驗之摘要與全班 6 大分數區段分析
 */
function renderSelectedExamDetails() {
  const curClass = getCurrentClass();
  const headerContainer = document.getElementById('selected-exam-header-container');
  const tbody = document.getElementById('scores-students-tbody');
  if (!headerContainer || !tbody || !curClass) return;

  const exams = Array.isArray(curClass.exams) ? curClass.exams : [];
  const curExam = exams.find(e => e.id === currentSelectedExamId);

  if (!curExam) {
    headerContainer.innerHTML = `
      <div class="p-6 text-center text-slate-400 font-bold text-xs">
        請從左側清單選擇一場測驗查看全班成績，或點擊上方「新增考試」建立新測驗。
      </div>
    `;
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-slate-400 font-medium text-xs">無選中測驗</td>
      </tr>
    `;
    return;
  }

  const domain = getDomainBySubject(curExam.subject);
  const submissions = curExam.submissions || {};
  const maxSeat = curClass.lastMaxSeat || 30;
  const missingSeatsArr = Array.isArray(curExam.missingSeats)
    ? curExam.missingSeats.map(String)
    : (curExam.missingSeats ? String(curExam.missingSeats).split(/[,，\s]+/).filter(Boolean) : []);

  const scoresList = Object.keys(submissions).map(k => Number(submissions[k]?.score)).filter(s => !isNaN(s));
  const filledCount = scoresList.length;
  const avgScore = filledCount > 0 ? (scoresList.reduce((a, b) => a + b, 0) / filledCount).toFixed(1) : '--';
  const maxScore = filledCount > 0 ? Math.max(...scoresList) : '--';
  const minScore = filledCount > 0 ? Math.min(...scoresList) : '--';

  const displayAvg = hideScoresPrivacy ? (filledCount > 0 ? '🔒 ***' : '--') : (avgScore !== '--' ? `${avgScore} 分` : '--');
  const displayMax = hideScoresPrivacy ? (filledCount > 0 ? '🔒 ***' : '--') : (maxScore !== '--' ? `${maxScore} 分` : '--');
  const displayMin = hideScoresPrivacy ? (filledCount > 0 ? '🔒 ***' : '--') : (minScore !== '--' ? `${minScore} 分` : '--');

  // 計算 6 大分數區段
  const segments = calculateScoreSegments(scoresList);

  // 渲染摘要列
  headerContainer.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2 flex-wrap mb-1">
          <span class="px-2.5 py-0.5 rounded-lg text-xs font-black ${domain.lightBg} ${domain.textColor} border ${domain.borderColor}">
            ${curExam.subject}
          </span>
          <span class="text-xs font-bold text-slate-500">📅 測驗日期：${curExam.date || '未定'}</span>
          ${missingSeatsArr.length > 0 ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">缺考座號：${missingSeatsArr.join(', ')} 號（填寫後將自動標註「補考」）</span>` : ''}
        </div>
        <h3 class="text-lg font-black text-slate-900">${curExam.name}</h3>
      </div>

      <!-- 快捷數據看板 -->
      <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
        <div class="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
          <span class="text-[10px] font-bold text-slate-400 block">填寫進度</span>
          <span class="text-sm font-black text-slate-800">${filledCount} / ${maxSeat} 人</span>
        </div>
        <div class="px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-center">
          <span class="text-[10px] font-bold text-teal-600 block">班級平均分</span>
          <span class="text-sm font-black text-teal-800">${displayAvg}</span>
        </div>
        <div class="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-center">
          <span class="text-[10px] font-bold text-indigo-600 block">最高分</span>
          <span class="text-sm font-black text-indigo-800">${displayMax}</span>
        </div>
        <div class="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
          <span class="text-[10px] font-bold text-rose-600 block">最低分</span>
          <span class="text-sm font-black text-rose-800">${displayMin}</span>
        </div>
      </div>
    </div>

    <!-- 全班 6 大分數區段分析視覺化 (100, 90~99, 80~89, 70~79, 60~69, <60) -->
    <div class="pt-3 border-t border-slate-100">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-black text-slate-700 flex items-center gap-1.5">
          <i class="fa-solid fa-chart-column text-teal-600"></i>
          <span>全班 6 大成績分數區段分析</span>
        </span>
        <span class="text-[11px] font-bold text-slate-400">已填寫樣本：${filledCount} 人</span>
      </div>

      <!-- 區段長條圖 -->
      <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        ${Object.values(segments).map(seg => {
          const pct = filledCount > 0 ? ((seg.count / filledCount) * 100).toFixed(0) : 0;
          return `
            <div class="p-2.5 rounded-xl border ${seg.border} ${seg.bgLight} flex flex-col justify-between">
              <div class="flex items-center justify-between text-[11px] font-black ${seg.textColor} mb-1">
                <span>${seg.label}</span>
                <span>${seg.count} 人</span>
              </div>
              <div class="w-full bg-white/80 rounded-full h-2 overflow-hidden mb-1">
                <div class="${seg.color} h-2 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
              </div>
              <span class="text-[10px] font-bold text-slate-400 text-right">${pct}%</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // 渲染學生座號表 (1 ~ maxSeat)
  tbody.innerHTML = '';
  let visibleCount = 0;
  for (let seat = 1; seat <= maxSeat; seat++) {
    const seatStr = String(seat);
    const sub = submissions[seatStr] || null;
    const isFilled = sub && sub.score !== undefined && sub.score !== null && sub.score !== '';
    const isMissingOriginally = missingSeatsArr.includes(seatStr);

    // 填寫完分數要隱藏（避免重複填寫）
    if (hideCompletedStudents && isFilled) {
      continue;
    }
    visibleCount++;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 transition-colors';

    // 1. 填寫狀態徽章
    let statusBadge = '';
    if (sub) {
      if (isMissingOriginally || sub.isMakeup) {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">補考</span>';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">已填寫</span>';
      }
    } else if (isMissingOriginally) {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-300">缺考 (待補)</span>';
    } else {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">未填寫</span>';
    }

    // 2. 分數欄 (若勾選隱藏成績，顯示防偷窺 ***)
    let scoreDisplay = '';
    if (isFilled) {
      const scoreNum = Number(sub.score);
      const scoreColor = scoreNum >= 90 ? 'text-indigo-600' : scoreNum >= 60 ? 'text-slate-800' : 'text-rose-600';
      if (hideScoresPrivacy) {
        scoreDisplay = `
          <div class="text-center">
            <span class="text-base font-black text-slate-400 select-none tracking-widest font-mono">*** 分</span>
            <div class="text-[10px] text-teal-600 font-bold mt-0.5">🔒 已隱藏 (隱私保護)</div>
          </div>
        `;
      } else {
        scoreDisplay = `
          <div class="text-center">
            <span class="text-base font-black ${scoreColor}">${scoreNum} 分</span>
            ${sub.originalScore !== undefined && sub.originalScore !== null && Number(sub.originalScore) !== scoreNum ? `
              <div class="text-[10px] text-amber-700 font-bold mt-0.5 leading-tight">
                原分: ${sub.originalScore} 分<br><span class="text-slate-400 font-medium">(${sub.lastModified || '已修改'})</span>
              </div>
            ` : (sub.lastModified ? `<div class="text-[10px] text-slate-400 font-medium mt-0.5">(${sub.lastModified})</div>` : '')}
          </div>
        `;
      }
    } else {
      scoreDisplay = '<span class="text-slate-300 font-bold block text-center">--</span>';
    }

    // 3. 訂正情形欄
    let correctionDisplay = '';
    if (sub && sub.correction) {
      let badgeClass = 'bg-slate-100 text-slate-700';
      if (sub.correction.includes('全對') || sub.correction.includes('免訂正')) {
        badgeClass = 'bg-purple-50 text-purple-700 border border-purple-200';
      } else if (sub.correction.includes('已完成')) {
        badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      } else if (sub.correction.includes('待訂正') || sub.correction.includes('需請教')) {
        badgeClass = 'bg-amber-50 text-amber-800 border border-amber-200';
      }
      correctionDisplay = `<span class="px-2 py-0.5 rounded-lg text-xs font-bold ${badgeClass}">${sub.correction}</span>`;
    } else {
      correctionDisplay = '<span class="text-slate-300 text-xs block text-center">--</span>';
    }

    // 4. 備註欄
    const remarkDisplay = sub && sub.remark ? `<span class="text-xs text-slate-700 font-medium">${sub.remark}</span>` : '<span class="text-slate-300 text-xs">無備註</span>';

    tr.innerHTML = `
      <td class="py-3 px-4 text-center font-black text-slate-800 text-sm">
        <span class="w-8 h-8 rounded-xl bg-slate-100 inline-flex items-center justify-center">${seat}</span>
      </td>
      <td class="py-3 px-4 text-center">${statusBadge}</td>
      <td class="py-3 px-4 text-center">${scoreDisplay}</td>
      <td class="py-3 px-4 text-center">${correctionDisplay}</td>
      <td class="py-3 px-4">${remarkDisplay}</td>
      <td class="py-3 px-4 text-center">
        <button type="button" class="btn-open-teacher-edit px-3 py-1.5 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-black transition-colors cursor-pointer shadow-2xs" data-seat="${seat}">
          <i class="fa-solid fa-pen-to-square mr-1"></i>修改
        </button>
      </td>
    `;

    tr.querySelector('.btn-open-teacher-edit')?.addEventListener('click', () => {
      openTeacherEditScoreModal(curExam.id, seat);
    });

    tbody.appendChild(tr);
  }

  if (visibleCount === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-12 text-emerald-600 font-bold text-sm">
          <i class="fa-solid fa-circle-check text-2xl mb-2 block"></i>
          全班學生皆已完成填寫！目前無待填寫或缺考學生。
        </td>
      </tr>
    `;
  }

  const filterStatsEl = document.getElementById('scores-table-filter-stats');
  if (filterStatsEl) {
    if (hideCompletedStudents) {
      filterStatsEl.textContent = `(已隱藏 ${filledCount} 位已填寫，目前顯示 ${visibleCount} 位待填寫/缺考)`;
    } else {
      filterStatsEl.textContent = `(全班共 ${maxSeat} 位學生，已填寫 ${filledCount} 位)`;
    }
  }
}

// ==========================================
// 5. 新增 / 編輯考試彈窗邏輯
// ==========================================
export function openExamEditorModal(examId = null) {
  const curClass = getCurrentClass();
  const modal = document.getElementById('modal-exam-editor');
  if (!modal || !curClass) return;

  const form = document.getElementById('form-exam-editor');
  const title = document.getElementById('exam-editor-title');
  const editIdInput = document.getElementById('exam-edit-id');
  const subjectInput = document.getElementById('exam-subject-input');
  const subjectBadge = document.getElementById('exam-selected-subject-badge');
  const nameInput = document.getElementById('exam-name-input');
  const dateInput = document.getElementById('exam-date-input');
  const missingInput = document.getElementById('exam-missing-seats-input');
  const chipsContainer = document.getElementById('exam-missing-seats-chips');
  const subjectPicker = document.getElementById('exam-subject-picker-container');

  // 1. 動態渲染六大領域與 21 門科目按鈕
  if (subjectPicker) {
    subjectPicker.innerHTML = '';
    DOMAINS_CONFIG.forEach(d => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'space-y-1';
      groupDiv.innerHTML = `
        <div class="text-[11px] font-black text-slate-500 uppercase flex items-center gap-1">
          <span class="w-2 h-2 rounded-full ${d.color}"></span>
          <span>${d.name}</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${d.subjects.map(sub => `
            <button type="button" data-sub="${sub}" class="sub-picker-btn px-2.5 py-1 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:border-teal-500 hover:bg-teal-50 transition-all cursor-pointer">
              ${sub}
            </button>
          `).join('')}
        </div>
      `;
      subjectPicker.appendChild(groupDiv);
    });

    subjectPicker.querySelectorAll('.sub-picker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.dataset.sub;
        if (subjectInput) subjectInput.value = sub;
        if (subjectBadge) subjectBadge.textContent = sub;
        subjectPicker.querySelectorAll('.sub-picker-btn').forEach(b => {
          b.classList.remove('border-teal-600', 'bg-teal-100/70', 'text-teal-900', 'font-black');
        });
        btn.classList.add('border-teal-600', 'bg-teal-100/70', 'text-teal-900', 'font-black');
      });
    });
  }

  // 2. 渲染缺考座號快速點選按鈕 (1 ~ maxSeat)
  const maxSeat = curClass.lastMaxSeat || 30;
  if (chipsContainer) {
    chipsContainer.innerHTML = '';
    for (let i = 1; i <= maxSeat; i++) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-seat-btn px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[11px] font-bold hover:bg-slate-200 transition-colors cursor-pointer';
      chip.textContent = `${i}號`;
      chip.dataset.seat = String(i);
      chip.addEventListener('click', () => {
        const curSeats = missingInput.value.split(/[,，\s]+/).filter(Boolean);
        const seatStr = String(i);
        const idx = curSeats.indexOf(seatStr);
        if (idx >= 0) {
          curSeats.splice(idx, 1);
          chip.classList.remove('bg-amber-500', 'text-white', 'border-amber-600');
        } else {
          curSeats.push(seatStr);
          curSeats.sort((a, b) => Number(a) - Number(b));
          chip.classList.add('bg-amber-500', 'text-white', 'border-amber-600');
        }
        missingInput.value = curSeats.join(', ');
      });
      chipsContainer.appendChild(chip);
    }
  }

  // 3. 設定初始表單值
  if (examId) {
    const exams = Array.isArray(curClass.exams) ? curClass.exams : [];
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;
    if (title) title.textContent = '編輯考試內容';
    if (editIdInput) editIdInput.value = exam.id;
    if (subjectInput) subjectInput.value = exam.subject;
    if (subjectBadge) subjectBadge.textContent = exam.subject;
    if (nameInput) nameInput.value = exam.name;
    if (dateInput) dateInput.value = exam.date || '';
    const missingArr = Array.isArray(exam.missingSeats) ? exam.missingSeats : (exam.missingSeats ? String(exam.missingSeats).split(/[,，\s]+/).filter(Boolean) : []);
    if (missingInput) missingInput.value = missingArr.join(', ');

    // Highlight selected subject
    const targetSubBtn = subjectPicker?.querySelector(`[data-sub="${exam.subject}"]`);
    if (targetSubBtn) targetSubBtn.classList.add('border-teal-600', 'bg-teal-100/70', 'text-teal-900', 'font-black');

    // Highlight selected missing seats
    missingArr.forEach(seat => {
      const chip = chipsContainer?.querySelector(`[data-seat="${seat}"]`);
      if (chip) chip.classList.add('bg-amber-500', 'text-white', 'border-amber-600');
    });
  } else {
    if (title) title.textContent = '新增考試';
    if (editIdInput) editIdInput.value = '';
    const defaultSub = '國語文';
    if (subjectInput) subjectInput.value = defaultSub;
    if (subjectBadge) subjectBadge.textContent = defaultSub;
    if (nameInput) nameInput.value = '';
    // 預設今日
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateInput) dateInput.value = todayStr;
    if (missingInput) missingInput.value = '';

    const firstSubBtn = subjectPicker?.querySelector(`[data-sub="${defaultSub}"]`);
    if (firstSubBtn) firstSubBtn.classList.add('border-teal-600', 'bg-teal-100/70', 'text-teal-900', 'font-black');
  }

  openModal(modal);
}

/**
 * 儲存發布考試 (新增或修改)
 */
export async function saveExamFromForm() {
  const curClass = getCurrentClass();
  if (!curClass) return;

  const editId = document.getElementById('exam-edit-id')?.value.trim();
  const subject = document.getElementById('exam-subject-input')?.value.trim() || '國語文';
  const name = document.getElementById('exam-name-input')?.value.trim();
  const date = document.getElementById('exam-date-input')?.value.trim() || new Date().toISOString().split('T')[0];
  const missingRaw = document.getElementById('exam-missing-seats-input')?.value.trim() || '';

  if (!name) {
    showToast('請填寫考試名稱！', 'warning');
    return;
  }

  const missingSeats = missingRaw.split(/[,，\s]+/).filter(Boolean).map(s => String(parseInt(s, 10))).filter(s => s !== 'NaN');

  if (!Array.isArray(curClass.exams)) {
    curClass.exams = [];
  }

  if (editId) {
    const examIndex = curClass.exams.findIndex(e => e.id === editId);
    if (examIndex >= 0) {
      curClass.exams[examIndex].subject = subject;
      curClass.exams[examIndex].name = name;
      curClass.exams[examIndex].date = date;
      curClass.exams[examIndex].missingSeats = missingSeats;
      curClass.exams[examIndex].updatedAt = new Date().toISOString();
      showToast('小考內容已更新！', 'success');
    }
  } else {
    const newExam = {
      id: 'exam_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      subject,
      name,
      date,
      missingSeats,
      submissions: {},
      createdAt: new Date().toISOString()
    };
    curClass.exams.unshift(newExam);
    currentSelectedExamId = newExam.id;
    showToast('已發布新考試！學生端已同步開放填寫分數', 'success');
  }

  saveData();
  await syncClassExamsToCloud(curClass);
  await syncDataToCloud();

  closeModal(document.getElementById('modal-exam-editor'));
  renderExamScoresView();
}

/**
 * 刪除考試
 */
export async function deleteExam(examId) {
  const curClass = getCurrentClass();
  if (!curClass || !Array.isArray(curClass.exams)) return;

  curClass.exams = curClass.exams.filter(e => e.id !== examId);
  if (currentSelectedExamId === examId) {
    currentSelectedExamId = curClass.exams[0]?.id || null;
  }

  saveData();
  await syncClassExamsToCloud(curClass);
  await syncDataToCloud();

  showToast('考試已刪除！', 'info');
  renderExamScoresView();
}

// ==========================================
// 6. 教師修改學生分數邏輯 (Teacher Edit Student Score)
// ==========================================
export function openTeacherEditScoreModal(examId, seat) {
  const curClass = getCurrentClass();
  const modal = document.getElementById('modal-teacher-edit-score');
  if (!modal || !curClass) return;

  const exam = (curClass.exams || []).find(e => e.id === examId);
  if (!exam) return;

  const sub = exam.submissions?.[String(seat)] || null;

  document.getElementById('teacher-edit-exam-id').value = examId;
  document.getElementById('teacher-edit-seat').value = seat;
  document.getElementById('teacher-edit-seat-display').textContent = `${seat} 號`;
  document.getElementById('teacher-edit-exam-name-display').textContent = `【${exam.subject}】${exam.name}`;

  const scoreInput = document.getElementById('teacher-input-score');
  const correctionSelect = document.getElementById('teacher-select-correction');
  const remarkInput = document.getElementById('teacher-input-remark');
  const originalScoreBox = document.getElementById('teacher-edit-original-score-box');

  if (sub) {
    scoreInput.value = sub.score !== undefined && sub.score !== null ? sub.score : '';
    correctionSelect.value = sub.correction || '已完成訂正';
    remarkInput.value = sub.remark || '';
    if (sub.originalScore !== undefined && sub.originalScore !== null && Number(sub.originalScore) !== Number(sub.score)) {
      originalScoreBox.classList.remove('hidden');
      originalScoreBox.innerHTML = `⚠️ 原登記分數為：<b>${sub.originalScore} 分</b>（最後修改時間：${sub.lastModified || '未知'}）`;
    } else {
      originalScoreBox.classList.add('hidden');
    }
  } else {
    scoreInput.value = '';
    correctionSelect.value = '已完成訂正';
    remarkInput.value = '';
    originalScoreBox.classList.add('hidden');
  }

  openModal(modal);
}

/**
 * 儲存教師修改學生分數
 */
export async function saveTeacherEditScore() {
  const curClass = getCurrentClass();
  if (!curClass) return;

  const examId = document.getElementById('teacher-edit-exam-id')?.value;
  const seat = document.getElementById('teacher-edit-seat')?.value;
  const scoreVal = document.getElementById('teacher-input-score')?.value.trim();
  const correction = document.getElementById('teacher-select-correction')?.value;
  const remark = document.getElementById('teacher-input-remark')?.value.trim();

  if (!scoreVal || isNaN(Number(scoreVal)) || Number(scoreVal) < 0 || Number(scoreVal) > 100) {
    showToast('請輸入 0 到 100 之間的分數！', 'warning');
    return;
  }

  const exam = (curClass.exams || []).find(e => e.id === examId);
  if (!exam) return;

  if (!exam.submissions) exam.submissions = {};

  const seatStr = String(seat);
  const existingSub = exam.submissions[seatStr] || null;
  const newScoreNum = Number(scoreVal);
  const nowStr = new Date().toLocaleString('zh-TW', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  let originalScore = existingSub?.originalScore;
  if (existingSub && existingSub.score !== undefined && existingSub.score !== null) {
    if (Number(existingSub.score) !== newScoreNum && originalScore === undefined) {
      originalScore = existingSub.score;
    }
  }

  const missingSeatsArr = Array.isArray(exam.missingSeats) ? exam.missingSeats.map(String) : [];
  const isMakeup = missingSeatsArr.includes(seatStr) || existingSub?.isMakeup || false;

  exam.submissions[seatStr] = {
    score: newScoreNum,
    correction: correction || '已完成訂正',
    remark: remark || '',
    originalScore: originalScore !== undefined ? originalScore : null,
    lastModified: nowStr,
    isMakeup,
    updatedAt: new Date().toISOString()
  };

  saveData();
  await syncClassExamsToCloud(curClass);

  // 同步更新學生端獨立 profile 儲存槽，確保學生端與家長端即刻顯示
  if (fbDb && curClass.accessCode) {
    try {
      const code = String(curClass.accessCode).trim();
      const profileDocRef = doc(fbDb, 'artifacts', globalAppId, 'public', 'data', 'userProfiles', `studentScores_${code}_seat${seatStr}`);
      const snap = await getDoc(profileDocRef);
      let existingScores = [];
      if (snap.exists() && Array.isArray(snap.data()?.scores)) {
        existingScores = [...snap.data().scores];
      }
      const itemIdx = existingScores.findIndex(s => s.id === exam.id || s.examId === exam.id);
      const scoreObj = {
        id: exam.id,
        examId: exam.id,
        name: exam.name,
        subject: exam.subject,
        date: exam.date,
        score: newScoreNum,
        correction: correction || '已完成訂正',
        remark: remark || '',
        originalScore: originalScore !== undefined ? originalScore : null,
        lastModified: nowStr,
        isMakeup,
        updatedAt: new Date().toISOString()
      };
      if (itemIdx >= 0) {
        existingScores[itemIdx] = { ...existingScores[itemIdx], ...scoreObj };
      } else {
        existingScores.unshift(scoreObj);
      }
      await setDoc(profileDocRef, {
        classCode: code,
        seat: Number(seatStr),
        scores: existingScores,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn("sync student profile error:", e);
    }
  }

  closeModal(document.getElementById('modal-teacher-edit-score'));
  showToast(`已成功修改 ${seat} 號學生成績！`, 'success');
  renderExamScoresView();
}

// ==========================================
// 7. 成績多格式一鍵匯出精靈 (Export Wizard)
// ==========================================
export function openExportScoresModal() {
  const curClass = getCurrentClass();
  const modal = document.getElementById('modal-export-scores');
  if (!modal || !curClass) return;

  // 1. 渲染 21 門科目核取方塊
  const checklist = document.getElementById('export-subjects-checklist');
  if (checklist) {
    checklist.innerHTML = ALL_21_SUBJECTS.map(sub => `
      <label class="flex items-center gap-1.5 p-1.5 rounded-xl hover:bg-white text-xs font-bold text-slate-700 cursor-pointer">
        <input type="checkbox" name="export-sub-cb" value="${sub}" checked class="rounded border-slate-300 text-teal-600 focus:ring-teal-500">
        <span>${sub}</span>
      </label>
    `).join('');
  }

  // 2. 格式選擇預設 xlsx
  currentExportFormat = 'xlsx';
  updateExportFormatButtonsUI();

  // 3. 預設時間全部
  currentExportDateRange = 'all';
  updateExportTimeRangeUI();

  openModal(modal);
}

function updateExportFormatButtonsUI() {
  document.querySelectorAll('.export-fmt-btn').forEach(btn => {
    const fmt = btn.dataset.format;
    if (fmt === currentExportFormat) {
      btn.className = 'export-fmt-btn p-3 rounded-2xl border-2 border-teal-500 bg-teal-50/70 text-teal-800 text-center transition-all cursor-pointer shadow-xs ring-1 ring-teal-500/20';
    } else {
      btn.className = 'export-fmt-btn p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-center transition-all cursor-pointer';
    }
  });
}

function updateExportTimeRangeUI() {
  document.querySelectorAll('.time-range-btn').forEach(btn => {
    const range = btn.dataset.range;
    if (range === currentExportDateRange) {
      btn.className = 'time-range-btn px-3 py-1.5 rounded-xl border border-teal-500 bg-teal-50 text-teal-800 text-xs font-black cursor-pointer';
    } else {
      btn.className = 'time-range-btn px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold cursor-pointer';
    }
  });

  const startInput = document.getElementById('export-date-start');
  const endInput = document.getElementById('export-date-end');
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  if (currentExportDateRange === 'today') {
    if (startInput) startInput.value = todayStr;
    if (endInput) endInput.value = todayStr;
  } else if (currentExportDateRange === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    if (startInput) startInput.value = weekAgo;
    if (endInput) endInput.value = todayStr;
  } else if (currentExportDateRange === 'month') {
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
    if (startInput) startInput.value = monthAgo;
    if (endInput) endInput.value = todayStr;
  } else {
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
  }
}

/**
 * 執行一鍵匯出下載 (xlsx, docx, pdf, html, csv)
 */
export function executeExportScores() {
  const curClass = getCurrentClass();
  if (!curClass) return;

  const exams = Array.isArray(curClass.exams) ? curClass.exams : [];
  if (exams.length === 0) {
    showToast('目前尚無任何小考紀錄可供匯出！', 'warning');
    return;
  }

  // 1. 取得篩選勾選之學科
  const checkedSubs = Array.from(document.querySelectorAll('input[name="export-sub-cb"]:checked')).map(cb => cb.value);
  if (checkedSubs.length === 0) {
    showToast('請至少選擇一門匯出學科！', 'warning');
    return;
  }

  // 2. 取得時間篩選
  const startDateStr = document.getElementById('export-date-start')?.value;
  const endDateStr = document.getElementById('export-date-end')?.value;

  let targetExams = exams.filter(e => checkedSubs.includes(e.subject));
  if (startDateStr) {
    targetExams = targetExams.filter(e => e.date >= startDateStr);
  }
  if (endDateStr) {
    targetExams = targetExams.filter(e => e.date <= endDateStr);
  }

  if (targetExams.length === 0) {
    showToast('在所選的時間與學科範圍內無任何測驗！', 'warning');
    return;
  }

  // 依日期排序由舊到新排列各欄
  targetExams.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  const maxSeat = curClass.lastMaxSeat || 30;
  const fileName = `${curClass.name}_班級成績匯出報表_${new Date().toISOString().split('T')[0]}`;

  // 建立二維資料陣列 (AOA: Array of Arrays)
  // 標題列：座號, [各場測驗標題：科目-名稱(日期)], 總平均, 填寫次數
  const headerRow = ['座號'];
  targetExams.forEach(e => {
    headerRow.push(`【${e.subject}】${e.name} (${e.date})`);
  });
  headerRow.push('個人平均分', '填寫測驗數');

  const rows = [headerRow];

  for (let seat = 1; seat <= maxSeat; seat++) {
    const seatStr = String(seat);
    const row = [`${seat} 號`];
    const scores = [];

    targetExams.forEach(e => {
      const sub = e.submissions?.[seatStr];
      if (sub && sub.score !== undefined && sub.score !== null && sub.score !== '') {
        const num = Number(sub.score);
        scores.push(num);
        let note = `${num}`;
        if (sub.isMakeup) note += ' (補考)';
        if (sub.originalScore !== undefined && sub.originalScore !== null && Number(sub.originalScore) !== num) {
          note += ` [原分:${sub.originalScore}]`;
        }
        row.push(note);
      } else if (e.missingSeats && (Array.isArray(e.missingSeats) ? e.missingSeats.includes(seatStr) : String(e.missingSeats).includes(seatStr))) {
        row.push('缺考');
      } else {
        row.push('--');
      }
    });

    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '--';
    row.push(avg, `${scores.length} 次`);
    rows.push(row);
  }

  // 底端全班摘要列
  const classAvgRow = ['全班平均'];
  targetExams.forEach(e => {
    const subs = e.submissions || {};
    const eScores = Object.values(subs).map(s => Number(s.score)).filter(n => !isNaN(n));
    const eAvg = eScores.length > 0 ? (eScores.reduce((a, b) => a + b, 0) / eScores.length).toFixed(1) : '--';
    classAvgRow.push(eAvg);
  });
  classAvgRow.push('--', '--');
  rows.push(classAvgRow);

  // 根據選擇的格式分發下載
  if (currentExportFormat === 'xlsx') {
    exportToXlsx(rows, fileName);
  } else if (currentExportFormat === 'csv') {
    exportToCsv(rows, fileName);
  } else if (currentExportFormat === 'html') {
    exportToHtml(rows, curClass.name, fileName);
  } else if (currentExportFormat === 'docx') {
    exportToDocx(rows, curClass.name, fileName);
  } else if (currentExportFormat === 'pdf') {
    exportToPdf(rows, curClass.name);
  }

  closeModal(document.getElementById('modal-export-scores'));
  showToast(`已成功匯出 ${currentExportFormat.toUpperCase()} 報表！`, 'success');
}

/**
 * 匯出 XLSX (SheetJS)
 */
function exportToXlsx(rows, fileName) {
  if (typeof window.XLSX === 'undefined') {
    showToast('匯出組件載入中，請稍候重試', 'warning');
    return;
  }
  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "班級成績表");
  window.XLSX.writeFile(wb, `${fileName}.xlsx`);
}

/**
 * 匯出 CSV (UTF-8 BOM)
 */
function exportToCsv(rows, fileName) {
  const csvContent = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${fileName}.csv`);
}

/**
 * 匯出獨立自給自足的網頁報表 HTML
 */
function exportToHtml(rows, className, fileName) {
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <title>${className} 班級成績報表</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; margin: 0; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); padding: 24px; max-width: 1200px; margin: 0 auto; overflow-x: auto; }
    h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 8px; }
    p { font-size: 12px; color: #64748b; margin-top: 0; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: center; }
    th { background: #f1f5f9; color: #334155; font-weight: 800; }
    tr:nth-child(even) { background: #f8fafc; }
    tr:last-child { background: #e0f2fe; font-weight: 800; }
    .footer { margin-top: 20px; font-size: 11px; text-align: center; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📊 ${className} 班級成績匯出報表</h1>
    <p>匯出時間：${new Date().toLocaleString('zh-TW')} ｜ 資料來源：親師作業點收X聯絡簿系統</p>
    <table>
      <thead>
        <tr>${rows[0].map(h => `<th>${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    <div class="footer">由 親師作業點收X聯絡簿系統 自動生成</div>
  </div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  triggerDownload(blob, `${fileName}.html`);
}

/**
 * 匯出 Word DOCX (MHTML/XML 格式)
 */
function exportToDocx(rows, className, fileName) {
  const docxContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${className} 班級成績報表</title>
  <style>
    body { font-family: "標楷體", "Microsoft JhengHei", Arial; }
    h2 { text-align: center; color: #1e293b; }
    table { border-collapse: collapse; width: 100%; margin-top: 15px; }
    th, td { border: 1px solid #666; padding: 6px 8px; font-size: 10pt; text-align: center; }
    th { background-color: #f2f2f2; font-weight: bold; }
    .footer { text-align: center; font-size: 9pt; color: #777; margin-top: 20px; }
  </style>
</head>
<body>
  <h2>📊 ${className} 班級學生成績分析報表</h2>
  <p style="text-align:center;font-size:9pt;color:#666;">匯出日期：${new Date().toLocaleDateString('zh-TW')}</p>
  <table>
    <thead>
      <tr>${rows[0].map(h => `<th>${h}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <p class="footer">親師作業點收系統 3.0</p>
</body>
</html>`;

  const blob = new Blob(['\ufeff', docxContent], { type: 'application/msword' });
  triggerDownload(blob, `${fileName}.docx`);
}

/**
 * 匯出 PDF 報表 (透過列印視窗預覽與儲存)
 */
function exportToPdf(rows, className) {
  const printableHtml = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <title>${className} 班級成績報表</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1e293b; margin: 0; padding: 10px; }
    h2 { font-size: 18px; font-weight: 800; margin: 0 0 4px 0; }
    p { font-size: 11px; color: #64748b; margin: 0 0 12px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: center; }
    th { background: #f8fafc; font-weight: 800; }
    tr:last-child { background: #f0fdf4; font-weight: 800; }
  </style>
</head>
<body>
  <h2>📊 ${className} 班級成績報表</h2>
  <p>匯出時間：${new Date().toLocaleString('zh-TW')} ｜ 親師作業點收系統</p>
  <table>
    <thead>
      <tr>${rows[0].map(h => `<th>${h}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printableHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  } else {
    showToast('瀏覽器封鎖了彈跳視窗，請允許彈窗以預覽列印 PDF！', 'warning');
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// 8. 綁定成績系統相關 DOM 事件
// ==========================================
export function setupExamScoresEvents() {
  // 開啟全螢幕成績系統
  const openScoresSystem = () => {
    const curClass = getCurrentClass();
    if (!curClass) {
      showToast('請先建立或選擇班級後再使用成績系統！', 'warning');
      return;
    }
    const fullscreenView = document.getElementById('exam-scores-fullscreen-view');
    if (fullscreenView) {
      fullscreenView.classList.remove('hidden');
      fullscreenView.classList.add('flex');
      renderExamScoresView();
    }
  };

  document.getElementById('exam-scores-system-btn')?.addEventListener('click', openScoresSystem);
  document.getElementById('hw-list-scores-btn')?.addEventListener('click', openScoresSystem);

  // 關閉全螢幕成績系統
  document.getElementById('btn-close-exam-scores-view')?.addEventListener('click', () => {
    const fullscreenView = document.getElementById('exam-scores-fullscreen-view');
    if (fullscreenView) {
      fullscreenView.classList.add('hidden');
      fullscreenView.classList.remove('flex');
    }
    if (unsubscribeStudentScores) {
      try { unsubscribeStudentScores(); } catch (e) {}
      unsubscribeStudentScores = null;
      currentSyncClassCode = null;
    }
  });

  // 勾選隱藏成績（防偷窺/大螢幕隱私）
  document.getElementById('toggle-hide-scores-privacy')?.addEventListener('change', (e) => {
    hideScoresPrivacy = e.target.checked;
    renderSelectedExamDetails();
  });

  // 填寫完分數要隱藏（避免重複填寫）
  document.getElementById('toggle-hide-completed-students')?.addEventListener('change', (e) => {
    hideCompletedStudents = e.target.checked;
    renderSelectedExamDetails();
  });

  // 學生端直達連結按鈕
  document.getElementById('btn-copy-student-link-from-scores')?.addEventListener('click', () => {
    const curClass = getCurrentClass();
    if (!curClass || !curClass.accessCode) {
      showToast('此班級尚未設定權限代碼！', 'warning');
      return;
    }
    const studentUrl = `${window.location.origin}/student.html?code=${encodeURIComponent(curClass.accessCode)}`;
    safeCopyToClipboard(studentUrl);
    showToast(`已複製【${curClass.name}】學生端直達連結！`, 'success');
  });

  // PIN 碼設定按鈕 (直接觸發班級 PIN 碼管理)
  document.getElementById('btn-open-pins-from-scores')?.addEventListener('click', () => {
    const curClass = getCurrentClass();
    if (!curClass) return;
    if (typeof window.openStudentPinsModal === 'function') {
      window.openStudentPinsModal(curClass.id);
    } else {
      const pinBtn = document.querySelector(`.manage-student-pins-btn[data-class-id="${curClass.id}"]`);
      if (pinBtn) pinBtn.click();
    }
  });

  // 新增考試按鈕
  document.getElementById('btn-create-exam')?.addEventListener('click', () => openExamEditorModal());

  // 關閉考試編輯器彈窗
  document.getElementById('close-exam-editor-btn')?.addEventListener('click', () => {
    closeModal(document.getElementById('modal-exam-editor'));
  });
  document.getElementById('cancel-exam-editor-btn')?.addEventListener('click', () => {
    closeModal(document.getElementById('modal-exam-editor'));
  });

  // 儲存發布考試表單
  document.getElementById('form-exam-editor')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveExamFromForm();
  });

  // 篩選學科變更
  document.getElementById('filter-exam-subject')?.addEventListener('change', () => {
    renderExamScoresView();
  });

  // 教師修改學生分數彈窗關閉
  document.getElementById('close-teacher-edit-score-btn')?.addEventListener('click', () => {
    closeModal(document.getElementById('modal-teacher-edit-score'));
  });
  document.getElementById('cancel-teacher-edit-score-btn')?.addEventListener('click', () => {
    closeModal(document.getElementById('modal-teacher-edit-score'));
  });

  // 儲存教師修改學生分數表單
  document.getElementById('form-teacher-edit-score')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTeacherEditScore();
  });

  // 開啟匯出成績精靈彈窗
  document.getElementById('btn-open-export-modal')?.addEventListener('click', () => openExportScoresModal());

  // 匯出格式選擇按鈕
  document.querySelectorAll('.export-fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentExportFormat = btn.dataset.format || 'xlsx';
      updateExportFormatButtonsUI();
    });
  });

  // 匯出時間快速按鈕
  document.querySelectorAll('.time-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentExportDateRange = btn.dataset.range || 'all';
      updateExportTimeRangeUI();
    });
  });

  // 匯出學科全選與清空
  document.getElementById('btn-export-select-all-subs')?.addEventListener('click', () => {
    document.querySelectorAll('input[name="export-sub-cb"]').forEach(cb => cb.checked = true);
  });
  document.getElementById('btn-export-clear-subs')?.addEventListener('click', () => {
    document.querySelectorAll('input[name="export-sub-cb"]').forEach(cb => cb.checked = false);
  });

  // 關閉匯出彈窗
  document.getElementById('close-export-scores-btn')?.addEventListener('click', () => {
    closeModal(document.getElementById('modal-export-scores'));
  });
  document.getElementById('cancel-export-scores-btn')?.addEventListener('click', () => {
    closeModal(document.getElementById('modal-export-scores'));
  });

  // 確認匯出下載
  document.getElementById('btn-confirm-export-scores')?.addEventListener('click', () => {
    executeExportScores();
  });

  // 初次/快速修改班級最後座號確認按鈕
  document.getElementById('btn-save-initial-max-seat')?.addEventListener('click', async () => {
    const curClass = getCurrentClass();
    if (!curClass) return;
    const input = document.getElementById('initial-max-seat-input');
    const val = parseInt(input?.value, 10);
    if (!val || val < 1 || val > 100) {
      showToast('請輸入 1 至 100 之間的有效座號！', 'warning');
      return;
    }
    await updateClassMaxSeat(curClass.id, val);
    const countInput = document.getElementById('student-count');
    if (countInput) countInput.value = val;
    closeModal(document.getElementById('initial-max-seat-modal'));
    showToast(`已成功設定班級最後座號為 ${val} 號，並同步套用至全班作業！`, 'success');
  });

  // 關閉最後座號設定彈窗
  document.getElementById('btn-close-initial-max-seat')?.addEventListener('click', () => {
    closeModal(document.getElementById('initial-max-seat-modal'));
  });

  // 新增作業彈窗中最後座號後方的 [修改] 紫色小字按鈕（使用站內自訂 Modal）
  document.getElementById('btn-quick-edit-max-seat')?.addEventListener('click', () => {
    const curClass = getCurrentClass();
    if (!curClass) return;
    const currentMax = curClass.lastMaxSeat || 30;
    const modal = document.getElementById('initial-max-seat-modal');
    if (!modal) return;

    const titleEl = document.getElementById('max-seat-modal-title');
    const descEl = document.getElementById('max-seat-modal-desc');
    const inputEl = document.getElementById('initial-max-seat-input');
    const closeBtn = document.getElementById('btn-close-initial-max-seat');

    if (titleEl) titleEl.textContent = `修改【${curClass.name}】最後座號`;
    if (descEl) descEl.textContent = '請輸入最新的最後座號（學生總人數）。修改後，全班現有作業與預設座號將同步套用！';
    if (inputEl) inputEl.value = currentMax;
    if (closeBtn) closeBtn.classList.remove('hidden');

    openModal(modal);
  });
}

