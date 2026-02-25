// --- Constants & State ---
const GOAL = 100;
const RADIUS = 110;   // matches SVG circle r
const CENTER = { x: 150, y: 150 };
const TWO_PI = Math.PI * 2;

// Daily storage key
const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

let reps = 0;
let lastTick = -1;

// --- Elements ---
const dial = document.getElementById('dial');
const progress = document.getElementById('progress');
const thumb = document.getElementById('thumb');
const repsText = document.getElementById('repsText');
const progressPct = document.getElementById('progressPct');
const streakLabel = document.getElementById('streak');

const plus1 = document.getElementById('plus1');
const plus5 = document.getElementById('plus5');
const resetBtn = document.getElementById('reset');

// --- Persistence ---
function loadLogs() {
  const raw = localStorage.getItem('repsLogs.v1');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function saveLogs(logs) {
  localStorage.setItem('repsLogs.v1', JSON.stringify(logs));
}
function getTodayReps() {
  const logs = loadLogs();
  return logs[todayKey()] ?? 0;
}
function setTodayReps(val) {
  const logs = loadLogs();
  logs[todayKey()] = Math.max(0, Math.min(GOAL, Math.round(val)));
  saveLogs(logs);
}

// Streak = consecutive days with reps >= GOAL including today
function currentStreak() {
  const logs = loadLogs();
  let streak = 0;
  const d = new Date();
  const fmt = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  while (true) {
    const key = fmt(d);
    if ((logs[key] ?? 0) >= GOAL) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

// --- UI Updates ---
function updateA11y() {
  dial.setAttribute('aria-valuenow', String(reps));
}
function setThumbForValue(val) {
  const frac = Math.min(1, Math.max(0, val / GOAL));
  const angle = -Math.PI / 2 + frac * TWO_PI;
  const x = CENTER.x + Math.cos(angle) * RADIUS;
  const y = CENTER.y + Math.sin(angle) * RADIUS;
  thumb.setAttribute('cx', x.toFixed(2));
  thumb.setAttribute('cy', y.toFixed(2));
}
function setProgress(val) {
  const frac = Math.min(1, Math.max(0, val / GOAL));
  const circumference = 2 * Math.PI * RADIUS;
  const dash = (circumference * frac).toFixed(2);
  progress.setAttribute('stroke-dasharray', `${dash} ${circumference}`);
}
function render() {
  repsText.textContent = String(reps);
  progressPct.textContent = `${Math.floor((reps / GOAL) * 100)}% of daily goal`;
  setThumbForValue(reps);
  setProgress(reps);
  updateA11y();

  const streak = currentStreak();
  streakLabel.textContent = streak > 0 ? `🔥 Streak: ${streak}` : 'Let’s start a streak!';
  renderHistory(30);
}

// --- Haptics (Vibration API) ---
function tickHaptic() { if (navigator.vibrate) navigator.vibrate(5); }
function successHaptic() { if (navigator.vibrate) navigator.vibrate([10, 20, 10]); }

// --- Dial Interaction ---
function pointToValue(clientX, clientY) {
  const rect = dial.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  // Normalize to SVG viewBox 300x300
  const nx = (x * (300 / rect.width)) - CENTER.x;
  const ny = (y * (300 / rect.height)) - CENTER.y;
  let ang = Math.atan2(ny, nx) + Math.PI / 2; // 0 at top
  if (ang < 0) ang += TWO_PI;
  const frac = ang / TWO_PI;
  return Math.round(frac * GOAL);
}

let isDragging = false;
function onPointerDown(e) {
  isDragging = true;
  const val = pointToValue(e.clientX ?? e.touches?.[0].clientX, e.clientY ?? e.touches?.[0].clientY);
  setValue(val);
}
function onPointerMove(e) {
  if (!isDragging) return;
  const touch = e.touches?.[0] ?? e;
  const val = pointToValue(touch.clientX, touch.clientY);
  setValue(val);
}
function onPointerUp() { isDragging = false; }

function setValue(val) {
  val = Math.max(0, Math.min(GOAL, val));
  const prev = reps;
  reps = val;
  setTodayReps(reps);
  render();
  if (reps !== prev) tickHaptic();
  if (reps === GOAL && prev !== GOAL) successHaptic();
}

// Buttons
plus1.addEventListener('click', () => setValue(reps + 1));
plus5.addEventListener('click', () => setValue(reps + 5));
resetBtn.addEventListener('click', () => setValue(0));

// Pointer/touch events

dial.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);

dial.addEventListener('touchstart', onPointerDown, { passive: true });
window.addEventListener('touchmove', onPointerMove, { passive: true });
window.addEventListener('touchend', onPointerUp);

// Keyboard accessibility

dial.tabIndex = 0;
dial.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setValue(reps + 1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setValue(reps - 1);
});

// --- Midnight rollover (auto refresh UI) ---
function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next - now;
}
function scheduleMidnightRollover() {
  setTimeout(() => {
    reps = getTodayReps();
    render();
    scheduleMidnightRollover();
  }, msUntilNextMidnight());
}

// --- History (list + sparkline + export) ---
function lastNDays(n) {
  const days = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.unshift({ key: `${y}-${m}-${day}`, date: new Date(d) });
    d.setDate(d.getDate() - 1);
  }
  return days;
}

function renderHistory(n = 30) {
  const logs = loadLogs();
  const days = lastNDays(n);

  // List
  const ul = document.getElementById('historyList');
  ul.innerHTML = '';
  // newest first in UI
  days.slice().reverse().forEach(({ key }) => {
    const v = logs[key] ?? 0;
    const li = document.createElement('li');
    li.innerHTML = `<span>${key}</span><b>${v}</b>`;
    ul.prepend(li);
  });

  // Sparkline
  const chartDiv = document.getElementById('historyChart');
  const width = chartDiv.getBoundingClientRect().width || 320;
  const height = 80;
  const pad = 6;
  const max = Math.max(1, ...days.map(d => logs[d.key] ?? 0), GOAL);

  const points = days.map((d, i) => {
    const x = pad + (i / (days.length - 1)) * (width - pad * 2);
    const val = logs[d.key] ?? 0;
    const y = height - pad - (val / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const goalY = height - pad - (GOAL / max) * (height - pad * 2);

  chartDiv.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <polyline fill="none" stroke="rgba(245,158,11,0.9)" stroke-width="2"
        points="${points.join(' ')}" />
      <line x1="${pad}" y1="${goalY}" x2="${width - pad}" y2="${goalY}"
        stroke="rgba(251,191,36,0.6)" stroke-dasharray="4 4" />
    </svg>`;
}

function exportCsv() {
  const logs = loadLogs();
  const rows = [['date','reps']];
  Object.keys(logs).sort().forEach(k => rows.push([k, logs[k]]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'reps-history.csv'; a.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const logs = loadLogs();
  const ordered = Object.keys(logs).sort().map(k => ({ date: k, reps: logs[k] }));
  const blob = new Blob([JSON.stringify(ordered, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'reps-history.json'; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('exportCsv').addEventListener('click', exportCsv);
document.getElementById('exportJson').addEventListener('click', exportJson);

// --- Service worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

// --- Init ---
function init() {
  reps = getTodayReps();
  render();
  scheduleMidnightRollover();
}
init();
