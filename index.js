'use strict';

const STORAGE_KEY = 'class-duty-planner-v1';
const TASKS = [
  { id: 'task1', title: 'Lau bảng, đổ nước, đổ rác', count: 1, type: 'heavy' },
  { id: 'task2', title: 'Quét lớp + quét hành lang', count: 2, type: 'heavy' },
  { id: 'task3', title: 'Lau lớp + lau hành lang', count: 2, type: 'light' },
];
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const $ = (selector) => document.querySelector(selector);
const els = {
  studentForm: $('#studentForm'), studentName: $('#studentName'), bulkStudentNames: $('#bulkStudentNames'), addBulkStudents: $('#addBulkStudents'), studentList: $('#studentList'), emptyStudents: $('#emptyStudents'),
  punishmentPicker: $('#punishmentPicker'), savePunishments: $('#savePunishments'), punishmentStatus: $('#punishmentStatus'),
  availableList: $('#availableList'), currentPunishmentList: $('#currentPunishmentList'), completedList: $('#completedList'),
  assignmentDate: $('#assignmentDate'), weekNotice: $('#weekNotice'), randomAll: $('#randomAll'), saveAssignment: $('#saveAssignment'),
  assignmentStatus: $('#assignmentStatus'), savedAssignments: $('#savedAssignments'), emptyAssignments: $('#emptyAssignments'), toast: $('#toast'),
};

let state = loadState();
let draft = emptyDraft();
let draftFallbackIds = new Set();
let toastTimer;

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function emptyDraft() { return { task1: [], task2: [], task3: [] }; }
function defaultState() {
  return { version: 1, students: [], currentPunishmentIds: [], penaltyWeeks: {}, assignments: [], cycle: 1, darkMode: false };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.students)) return defaultState();
    return { ...defaultState(), ...saved, students: saved.students.map((s) => ({
      id: String(s.id), name: String(s.name || ''), favorite: Boolean(s.favorite), disliked: Boolean(s.disliked),
      remaining: Number.isFinite(s.remaining) ? Math.max(0, s.remaining) : 1, cycle: Number.isFinite(s.cycle) ? s.cycle : 1,
    })), currentPunishmentIds: Array.isArray(saved.currentPunishmentIds) ? saved.currentPunishmentIds : [], penaltyWeeks: saved.penaltyWeeks || {}, assignments: Array.isArray(saved.assignments) ? saved.assignments : [] };
  } catch (error) {
    console.warn('Không đọc được dữ liệu đã lưu:', error);
    return defaultState();
  }
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { showToast('Không lưu được dữ liệu. Có thể bộ nhớ trình duyệt đã đầy.'); console.error(error); }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function createId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}
// Monday is the start of a school week. The returned value is YYYY-MM-DD.
function mondayOf(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function addDays(iso, amount) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function penaltyRecordForDate(iso) {
  const weekStart = mondayOf(iso);
  const record = state.penaltyWeeks[weekStart];
  return record || { ids: [], remaining: {} };
}
function isPenaltyActive(id, iso) {
  const record = penaltyRecordForDate(iso);
  return record.ids.includes(id) && (record.remaining[id] || 0) > 0;
}
function penaltyRemaining(id, iso) {
  return penaltyRecordForDate(iso).remaining[id] || 0;
}
function studentById(id) { return state.students.find((student) => student.id === id); }
function studentStatus(student) {
  if (student.remaining <= 0) return 'Hết lượt trong vòng';
  return `${student.remaining} lượt còn lại`;
}
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}
function renderStats() {
  $('#totalStudents').textContent = state.students.length;
  $('#availableCount').textContent = state.students.filter((s) => s.remaining > 0).length;
  $('#penaltyCount').textContent = state.currentPunishmentIds.length;
  $('#assignmentCount').textContent = state.assignments.length;
}
function renderStudents() {
  els.studentList.innerHTML = state.students.map((student) => {
    const flags = [student.favorite ? '<span class="flag flag-favorite">Ưa thích · việc nhẹ</span>' : '', student.disliked ? '<span class="flag flag-dislike">Không ưa · việc nặng</span>' : '', student.remaining <= 0 ? '<span class="flag flag-done">Hết lượt</span>' : ''].filter(Boolean).join('');
    return `<article class="student-row">
      <div class="avatar">${escapeHTML(student.name.trim().charAt(0).toUpperCase() || '?')}</div>
      <div class="student-main"><div class="student-name">${escapeHTML(student.name)}</div><div class="student-meta">${escapeHTML(studentStatus(student))}</div><div class="student-flags">${flags}</div></div>
      <div class="student-tools">
        <button class="icon-button favorite-toggle" type="button" data-action="favorite" data-id="${escapeHTML(student.id)}" aria-pressed="${student.favorite}" title="Đánh dấu ưa thích">♥</button>
        <button class="icon-button dislike-toggle" type="button" data-action="disliked" data-id="${escapeHTML(student.id)}" aria-pressed="${student.disliked}" title="Đánh dấu không ưa">↗</button>
        <button class="icon-button" type="button" data-action="edit" data-id="${escapeHTML(student.id)}" title="Sửa tên">✎</button>
        <button class="icon-button" type="button" data-action="delete" data-id="${escapeHTML(student.id)}" title="Xóa thành viên">×</button>
      </div>
    </article>`;
  }).join('');
  els.emptyStudents.hidden = state.students.length > 0;
  renderPunishmentPicker();
}
function renderPunishmentPicker() {
  const selected = new Set(state.currentPunishmentIds);
  els.punishmentPicker.innerHTML = state.students.map((student) => `<label class="check-row"><input type="checkbox" data-punishment-id="${escapeHTML(student.id)}" ${selected.has(student.id) ? 'checked' : ''}><span>${escapeHTML(student.name)}</span></label>`).join('');
  if (!state.students.length) els.punishmentPicker.innerHTML = '<span class="muted">Thêm thành viên trước khi chọn danh sách phạt.</span>';
}
function renderChipList(container, students, emptyText) {
  container.innerHTML = students.length ? students.map((student) => `<span class="name-chip">${escapeHTML(student.name)}</span>`).join('') : `<span class="name-chip empty">${escapeHTML(emptyText)}</span>`;
}
function renderStatusLists() {
  const available = state.students.filter((s) => s.remaining > 0);
  const completed = state.students.filter((s) => s.remaining <= 0);
  renderChipList(els.availableList, available, 'Không có ai — sẽ bắt đầu vòng mới khi random');
  renderChipList(els.currentPunishmentList, state.students.filter((s) => state.currentPunishmentIds.includes(s.id)), 'Chưa có bạn nào bị phạt');
  renderChipList(els.completedList, completed, 'Chưa có ai hết lượt');
}
function renderDraft() {
  const date = els.assignmentDate.value || todayISO();
  const allSelected = TASKS.flatMap((task) => draft[task.id]);

  for (const task of TASKS) {
    const target = $(`#${task.id}Selection`);
    target.innerHTML = Array.from({ length: task.count }, (_, slotIndex) => {
      const selectedId = draft[task.id][slotIndex] || '';
      const usedByOtherSlot = new Set(allSelected.filter((id) => id !== selectedId));
      const options = state.students.map((student) => {
        const penaltyRecord = penaltyRecordForDate(date);
        const isPenaltyMember = penaltyRecord.ids.includes(student.id);
        const penaltyLeft = penaltyRecord.remaining[student.id] || 0;
        const exhaustedPenalty = isPenaltyMember && penaltyLeft <= 0;
        const isFallback = !isPenaltyMember && student.remaining <= 0;
        const tags = [
          isPenaltyMember && penaltyLeft > 0 ? `phạt còn ${penaltyLeft} lượt` : '',
          exhaustedPenalty ? 'đã hết lượt phạt' : '',
          isFallback ? 'hết lượt thường — dùng bổ sung' : '',
          student.favorite ? 'ưa thích' : '',
          student.disliked ? 'không ưa' : '',
        ].filter(Boolean);
        const disabled = (usedByOtherSlot.has(student.id) || exhaustedPenalty) && student.id !== selectedId;
        return `<option value="${escapeHTML(student.id)}" ${student.id === selectedId ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHTML(student.name)}${tags.length ? ` (${escapeHTML(tags.join(' · '))})` : ''}</option>`;
      }).join('');
      return `<label class="assignment-slot"><span>Người ${slotIndex + 1}</span><select data-task-select="${task.id}" data-slot-index="${slotIndex}" aria-label="Chọn người ${slotIndex + 1} cho ${escapeHTML(task.title)}"><option value="">-- Chọn thành viên --</option>${options}</select></label>`;
    }).join('');
  }
}
function renderWeekNotice() {
  const date = els.assignmentDate.value || todayISO();
  const weekStart = mondayOf(date);
  const record = state.penaltyWeeks[weekStart];
  const active = record ? record.ids.filter((id) => (record.remaining[id] || 0) > 0).map((id) => studentById(id)?.name).filter(Boolean) : [];
  if (active.length) {
    els.weekNotice.hidden = false;
    els.weekNotice.textContent = `Tuần này có bạn bị phạt cần ưu tiên: ${active.join(', ')}. Mỗi bạn còn ${Math.max(...record.ids.map((id) => record.remaining[id] || 0), 0)} lượt phạt trong tuần.`;
  } else {
    els.weekNotice.hidden = true;
    els.weekNotice.textContent = '';
  }
}
function renderAssignments() {
  const sorted = [...state.assignments].sort((a, b) => b.date.localeCompare(a.date));
  els.savedAssignments.innerHTML = sorted.map((assignment) => {
    const taskMarkup = TASKS.map((task) => {
      const names = (assignment.tasks[task.id] || []).map((id) => studentById(id)?.name || assignment.names?.[id] || 'Thành viên đã xóa');
      return `<div class="saved-task"><span class="saved-task-label">${escapeHTML(task.title)}</span><span class="saved-task-names">${names.map(escapeHTML).join(', ') || 'Chưa có người'}</span></div>`;
    }).join('');
    return `<article class="saved-card"><div class="saved-card-header"><strong>${escapeHTML(formatDate(assignment.date))}</strong><div class="saved-actions"><button class="button button-secondary" type="button" data-copy-assignment="${escapeHTML(assignment.id)}">▣ Copy</button><button class="button button-danger-ghost" type="button" data-delete-assignment="${escapeHTML(assignment.id)}">Xóa lịch</button></div></div><div class="saved-card-body">${taskMarkup}</div></article>`;
  }).join('');
  els.emptyAssignments.hidden = state.assignments.length > 0;
}
function renderAll() {
  document.body.classList.toggle('dark', Boolean(state.darkMode));
  $('#themeToggle').textContent = state.darkMode ? '☀ Giao diện sáng' : '☾ Giao diện tối';
  renderStats(); renderStudents(); renderStatusLists(); renderDraft(); renderWeekNotice(); renderAssignments();
}
function rotateCycleIfNeeded() {
  if (state.students.length && state.students.every((student) => student.remaining <= 0)) {
    state.cycle += 1;
    state.students.forEach((student) => { student.remaining = 1; student.cycle = state.cycle; });
    showToast(`Đã bắt đầu vòng trực nhật số ${state.cycle}.`);
  }
}
function weightedShuffle(list, weightFn) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  // Weighted random ranking: candidates with a stronger priority tend to appear first.
  return result.map((student) => ({ student, score: Math.random() / Math.max(0.01, weightFn(student)) }))
    .sort((a, b) => a.score - b.score).map((entry) => entry.student);
}
function isEligibleForDate(student, date) {
  const record = penaltyRecordForDate(date);
  // During their assigned penalty week, the five penalty credits replace the normal one-turn quota.
  if (record.ids.includes(student.id)) return (record.remaining[student.id] || 0) > 0;
  return student.remaining > 0;
}
function candidatePool(date, selectedIds = [], includeExhaustedNormal = false) {
  const alreadySelected = new Set(selectedIds);
  return state.students.filter((student) => {
    if (alreadySelected.has(student.id)) return false;
    if (isEligibleForDate(student, date)) return true;
    // Exhausted non-penalty students may be used as a fallback to fill all five jobs.
    return includeExhaustedNormal && !isPenaltyActive(student.id, date) && !penaltyRecordForDate(date).ids.includes(student.id);
  });
}
function rankCandidates(candidates, taskType, date) {
  return weightedShuffle(candidates, (student) => {
    let weight = 1;
    if (isPenaltyActive(student.id, date)) weight *= 100;
    if (taskType === 'light' && student.favorite) weight *= 12;
    if (taskType === 'heavy' && student.disliked) weight *= 12;
    // If someone is disliked, don't make them more likely to get light work.
    if (taskType === 'light' && student.disliked && !student.favorite) weight *= 0.6;
    if (taskType === 'heavy' && student.favorite && !student.disliked) weight *= 0.75;
    return weight;
  });
}
function drawTask(taskId) {
  const task = TASKS.find((item) => item.id === taskId);
  const date = els.assignmentDate.value || todayISO();
  if (!state.students.length) { showToast('Hãy thêm thành viên trước.'); return; }
  const already = TASKS.filter((item) => item.id !== taskId).flatMap((item) => draft[item.id]);
  let candidates = candidatePool(date, already);
  if (candidates.length < task.count) {
    candidates = candidatePool(date, already, true);
    if (candidates.length < task.count) { showToast(`Không đủ thành viên để chọn ${task.title}.`); return; }
  }
  const previousTaskIds = new Set(draft[taskId]);
  previousTaskIds.forEach((id) => draftFallbackIds.delete(id));
  const picks = rankCandidates(candidates, task.type, date).slice(0, task.count).map((student) => student.id);
  picks.forEach((id) => { const student = studentById(id); if (student && !isEligibleForDate(student, date)) draftFallbackIds.add(id); });
  draft[taskId] = picks;
  renderAll();
}
function randomAll() {
  if (!state.students.length) { showToast('Hãy thêm thành viên trước.'); return; }
  const date = els.assignmentDate.value || todayISO();
  const eligible = state.students.filter((student) => isEligibleForDate(student, date));
  const candidates = eligible.length >= 5 ? eligible : candidatePool(date, [], true);
  if (candidates.length < 5) { showToast('Lớp chưa có đủ 5 thành viên để lấp đủ các vị trí.'); return; }
  const chosen = [];
  const nextDraft = emptyDraft();
  const fallbackIds = new Set();
  for (const task of TASKS) {
    const available = candidates.filter((student) => !chosen.includes(student.id));
    const ranked = rankCandidates(available, task.type, date);
    const picks = ranked.slice(0, task.count).map((student) => student.id);
    nextDraft[task.id] = picks;
    picks.forEach((id) => { if (!isEligibleForDate(studentById(id), date)) fallbackIds.add(id); });
    chosen.push(...picks);
  }
  draft = nextDraft;
  draftFallbackIds = fallbackIds;
  renderAll();
  els.assignmentStatus.textContent = fallbackIds.size ? `Đã random đủ 5 vị trí, dùng bổ sung ${fallbackIds.size} bạn đã hết lượt. Khi lưu, hệ thống sẽ bắt đầu vòng mới cho các bạn bình thường.` : 'Đã random xong. Có thể random lại hoặc chỉnh từng công việc trước khi lưu.';
}
function validateDraft() {
  const allIds = TASKS.flatMap((task) => draft[task.id]).filter(Boolean);
  if (TASKS.some((task) => draft[task.id].filter(Boolean).length !== task.count)) return 'Hãy chọn đủ người cho cả 3 công việc.';
  if (new Set(allIds).size !== allIds.length) return 'Một bạn không thể nhận hai công việc trong cùng một ngày.';
  for (const id of allIds) {
    const student = studentById(id);
    if (!student || (!isEligibleForDate(student, els.assignmentDate.value || todayISO()) && !draftFallbackIds.has(id))) return 'Có bạn đã hết lượt hoặc không còn trong danh sách. Hãy random lại.';
  }
  return '';
}
function saveAssignment() {
  const error = validateDraft();
  if (error) { els.assignmentStatus.textContent = error; showToast(error); return; }
  const date = els.assignmentDate.value || todayISO();
  const existing = state.assignments.find((item) => item.date === date);
  if (existing && !confirm('Ngày này đã có lịch trực. Lưu lại sẽ thay thế lịch cũ và không trừ lượt lần thứ hai. Tiếp tục?')) return;

  if (existing) {
    // Restore the counts from the old assignment before applying the replacement.
    for (const ids of Object.values(existing.tasks)) for (const id of ids) {
      const student = studentById(id); if (student) student.remaining += 1;
      const week = penaltyRecordForDate(existing.date);
      if (week.ids.includes(id)) week.remaining[id] = Math.min(5, (week.remaining[id] || 0) + 1);
    }
    state.assignments = state.assignments.filter((item) => item.id !== existing.id);
  }

  const tasks = Object.fromEntries(TASKS.map((task) => [task.id, draft[task.id].filter(Boolean)]));
  const names = {};
  const assignedIds = TASKS.flatMap((task) => tasks[task.id]);
  const usedFallback = assignedIds.some((id) => draftFallbackIds.has(id));
  // If we had to borrow exhausted students, start a fresh normal-duty round after this save.
  // Reset only normal students; penalty credits remain tied to their assigned week.
  if (usedFallback) {
    state.students.forEach((student) => {
      if (!penaltyRecordForDate(date).ids.includes(student.id)) student.remaining = 1;
    });
  }
  for (const id of assignedIds) {
    const student = studentById(id);
    names[id] = student.name;
    const penalty = penaltyRecordForDate(date);
    if (penalty.ids.includes(id)) {
      if ((penalty.remaining[id] || 0) > 0) penalty.remaining[id] -= 1;
    } else {
      student.remaining = Math.max(0, student.remaining - 1);
    }
  }
  state.assignments.push({ id: createId(), date, tasks, names, savedAt: new Date().toISOString() });
  persist();
  els.assignmentStatus.textContent = `Đã lưu lịch trực ngày ${formatDate(date)}. Lượt trực đã được trừ${usedFallback ? ' và vòng trực thông thường đã được làm mới' : ''}.`;
  draft = emptyDraft();
  draftFallbackIds = new Set();
  renderAll();
  showToast('Đã lưu lịch trực nhật!');
}
function assignmentText(assignment) {
  const lines = [`PHÂN CÔNG TRỰC NHẬT — ${formatDate(assignment.date)}`, ''];
  for (const task of TASKS) {
    const names = (assignment.tasks[task.id] || []).map((id) => studentById(id)?.name || assignment.names?.[id] || 'Thành viên đã xóa');
    lines.push(`${task.title}: ${names.join(', ') || 'Chưa có người'}`);
  }
  return lines.join('\n');
}
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select();
      const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('Copy command failed');
    }
    showToast('Đã copy vào clipboard.');
  } catch (error) { showToast('Không copy tự động được. Hãy thử mở trang qua localhost hoặc HTTPS.'); }
}
function addStudent(name) {
  const cleanName = name.trim();
  if (!cleanName) return false;
  if (state.students.some((student) => student.name.toLocaleLowerCase('vi') === cleanName.toLocaleLowerCase('vi'))) return false;
  state.students.push({ id: createId(), name: cleanName, favorite: false, disliked: false, remaining: 1, cycle: state.cycle });
  return true;
}
function addBulkStudents() {
  const rawNames = els.bulkStudentNames.value.split(/[\n,;\t]+/).map((name) => name.trim()).filter(Boolean);
  if (!rawNames.length) { showToast('Hãy dán hoặc nhập danh sách tên trước.'); return; }
  let added = 0;
  let skipped = 0;
  rawNames.forEach((name) => { if (addStudent(name)) added += 1; else skipped += 1; });
  if (added) { persist(); renderAll(); }
  els.bulkStudentNames.value = '';
  showToast(`Đã thêm ${added} thành viên${skipped ? `, bỏ qua ${skipped} tên trống hoặc trùng` : ''}.`);
}
function deleteStudent(id) {
  const student = studentById(id);
  if (!student || !confirm(`Xóa ${student.name} khỏi danh sách thành viên? Lịch sử cũ vẫn được giữ.`)) return;
  state.students = state.students.filter((item) => item.id !== id);
  state.currentPunishmentIds = state.currentPunishmentIds.filter((item) => item !== id);
  for (const record of Object.values(state.penaltyWeeks)) { record.ids = record.ids.filter((item) => item !== id); delete record.remaining[id]; }
  draft = Object.fromEntries(Object.entries(draft).map(([taskId, ids]) => [taskId, ids.filter((item) => item !== id)]));
  persist(); renderAll();
}
function saveCurrentPunishments() {
  const selected = [...els.punishmentPicker.querySelectorAll('input[data-punishment-id]:checked')].map((input) => input.dataset.punishmentId);
  state.currentPunishmentIds = selected;
  const nextWeekStart = addDays(mondayOf(todayISO()), 7);
  const previous = state.penaltyWeeks[nextWeekStart];
  const remaining = {};
  selected.forEach((id) => { remaining[id] = previous?.ids.includes(id) ? Math.max(previous.remaining[id] || 0, 5) : 5; });
  state.penaltyWeeks[nextWeekStart] = { ids: selected, remaining };
  persist(); renderAll();
  const weekEnd = addDays(nextWeekStart, 4);
  els.punishmentStatus.textContent = selected.length ? `Đã lưu ${selected.length} bạn. Lượt phạt sẽ áp dụng từ ${formatDate(nextWeekStart)} đến ${formatDate(weekEnd)}.` : 'Đã lưu danh sách trống; tuần kế tiếp không có lượt phạt mới.';
  showToast('Đã lưu danh sách phạt cho tuần kế tiếp.');
}
function editStudent(id) {
  const student = studentById(id); if (!student) return;
  const name = prompt('Sửa tên học sinh:', student.name);
  if (name === null) return;
  const cleanName = name.trim(); if (!cleanName) { showToast('Tên không được để trống.'); return; }
  if (state.students.some((other) => other.id !== id && other.name.toLocaleLowerCase('vi') === cleanName.toLocaleLowerCase('vi'))) { showToast('Tên này đã có trong danh sách.'); return; }
  student.name = cleanName; persist(); renderAll();
}
function loadSampleData() {
  if (state.students.length && !confirm('Thêm dữ liệu mẫu vào danh sách hiện tại?')) return;
  const names = ['An', 'Bình', 'Chi', 'Dũng', 'Hà', 'Huy', 'Linh', 'Minh', 'Nam', 'Phương', 'Quân', 'Trang'];
  names.forEach((name) => {
    if (!state.students.some((student) => student.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) state.students.push({ id: createId(), name, favorite: ['An', 'Chi', 'Linh'].includes(name), disliked: ['Dũng', 'Nam'].includes(name), remaining: 1, cycle: state.cycle });
  });
  persist(); renderAll(); showToast('Đã thêm dữ liệu mẫu. Hãy chỉnh lại theo lớp của bạn.');
}

els.studentForm.addEventListener('submit', (event) => { event.preventDefault(); const added = addStudent(els.studentName.value); if (added) { persist(); renderAll(); showToast('Đã thêm thành viên.'); } else showToast('Tên này đã tồn tại hoặc không hợp lệ.'); els.studentName.value = ''; els.studentName.focus(); });
els.addBulkStudents.addEventListener('click', addBulkStudents);
els.studentList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const { action, id } = button.dataset; const student = studentById(id); if (!student) return;
  if (action === 'favorite') { student.favorite = !student.favorite; if (student.favorite) student.disliked = false; }
  if (action === 'disliked') { student.disliked = !student.disliked; if (student.disliked) student.favorite = false; }
  if (action === 'edit') { editStudent(id); return; }
  if (action === 'delete') { deleteStudent(id); return; }
  persist(); renderAll();
});
els.punishmentPicker.addEventListener('change', () => { els.punishmentStatus.textContent = 'Bạn vừa thay đổi lựa chọn. Nhấn “Lưu danh sách phạt tuần này” để xác nhận.'; });
els.savePunishments.addEventListener('click', saveCurrentPunishments);
document.querySelector('.task-grid').addEventListener('change', (event) => {
  const select = event.target.closest('select[data-task-select]');
  if (!select) return;
  const { taskSelect: taskId, slotIndex: rawIndex } = select.dataset;
  const slotIndex = Number(rawIndex);
  const selectedId = select.value;
  if (selectedId && TASKS.some((task) => task.id !== taskId && draft[task.id].includes(selectedId))) {
    showToast('Một bạn không thể nhận hai công việc trong cùng ngày.');
    renderDraft();
    return;
  }
  const oldId = draft[taskId][slotIndex];
  if (oldId) draftFallbackIds.delete(oldId);
  while (draft[taskId].length < TASKS.find((task) => task.id === taskId).count) draft[taskId].push('');
  draft[taskId][slotIndex] = selectedId || '';
  draft[taskId] = draft[taskId].slice(0, TASKS.find((task) => task.id === taskId).count);
  if (selectedId) {
    const student = studentById(selectedId);
    const date = els.assignmentDate.value || todayISO();
    const penalty = penaltyRecordForDate(date);
    if (student && !isEligibleForDate(student, date) && !penalty.ids.includes(student.id)) draftFallbackIds.add(selectedId);
  }
  // Keep slot positions stable when selecting manually; normalize blank slots at the end only.
  renderAll();
  els.assignmentStatus.textContent = 'Đã cập nhật lựa chọn thủ công. Kiểm tra đủ 5 người rồi bấm Lưu phân công.';
});
document.querySelectorAll('.task-random').forEach((button) => button.addEventListener('click', () => drawTask(button.dataset.task)));
els.randomAll.addEventListener('click', randomAll);
els.saveAssignment.addEventListener('click', saveAssignment);
els.assignmentDate.value = todayISO();
els.assignmentDate.addEventListener('change', () => { draft = emptyDraft(); draftFallbackIds = new Set(); renderAll(); els.assignmentStatus.textContent = ''; });
$('#loadSample').addEventListener('click', loadSampleData);
$('#clearStudents').addEventListener('click', () => {
  if (!state.students.length) return;
  if (!confirm('Xóa toàn bộ thành viên? Lịch sử phân công đã lưu vẫn còn, nhưng danh sách phạt sẽ được xóa.')) return;
  state.students = []; state.currentPunishmentIds = []; state.penaltyWeeks = {}; draft = emptyDraft(); draftFallbackIds = new Set(); persist(); renderAll(); showToast('Đã xóa danh sách thành viên.');
});
els.savedAssignments.addEventListener('click', (event) => {
  const copyButton = event.target.closest('[data-copy-assignment]');
  if (copyButton) { const assignment = state.assignments.find((item) => item.id === copyButton.dataset.copyAssignment); if (assignment) copyText(assignmentText(assignment)); return; }
  const deleteButton = event.target.closest('[data-delete-assignment]');
  if (deleteButton) {
    const assignment = state.assignments.find((item) => item.id === deleteButton.dataset.deleteAssignment); if (!assignment || !confirm(`Xóa lịch ${formatDate(assignment.date)}? Lượt đã trừ sẽ được hoàn lại.`)) return;
    for (const ids of Object.values(assignment.tasks)) for (const id of ids) {
      const student = studentById(id); if (student) student.remaining += 1;
      const record = penaltyRecordForDate(assignment.date);
      if (record.ids.includes(id)) record.remaining[id] = Math.min(5, (record.remaining[id] || 0) + 1);
    }
    state.assignments = state.assignments.filter((item) => item.id !== assignment.id); persist(); renderAll(); showToast('Đã xóa lịch và hoàn lại lượt trực.');
  }
});
$('#copyAll').addEventListener('click', () => {
  const sorted = [...state.assignments].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) { showToast('Chưa có lịch nào để copy.'); return; }
  copyText(sorted.map(assignmentText).join('\n\n--------------------\n\n'));
});
$('#themeToggle').addEventListener('click', () => { state.darkMode = !state.darkMode; persist(); renderAll(); });

renderAll();


// Collapsible workflow sections: the heading remains visible while the content can be tucked away.
document.querySelectorAll('.panel > .section-heading').forEach((heading, index) => {
  const panel = heading.closest('.panel');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'collapse-toggle';
  button.setAttribute('aria-expanded', 'true');
  button.innerHTML = '<span>Thu gọn</span> <span class="collapse-chevron" aria-hidden="true">⌃</span>';
  button.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.innerHTML = collapsed
      ? '<span>Mở rộng</span> <span class="collapse-chevron" aria-hidden="true">⌄</span>'
      : '<span>Thu gọn</span> <span class="collapse-chevron" aria-hidden="true">⌃</span>';
  });
  heading.appendChild(button);
});
