const STORAGE_KEY = "runline-leaderboard-v1";
const SYNC_CHANNEL = "runline-leaderboard-sync";
const categories = ["Sadlier Word Search", "Don't In Order", "Speed Run"];

const state = {
  category: categories[0],
  scores: loadScores(),
  timer: { startedAt: null, elapsed: 0, interval: null, running: false }
};

const $ = (id) => document.getElementById(id);
const scoreRows = $("scoreRows");
const emptyState = $("emptyState");
const timerModal = $("timerModal");
const runCategory = $("runCategory");
const runPoints = $("runPoints");
const timerDisplay = $("timerDisplay");
const timerState = $("timerState");
const startTimerButton = $("startTimerButton");
const stopTimerButton = $("stopTimerButton");
const pointsHint = $("pointsHint");

let channel;
try { channel = new BroadcastChannel(SYNC_CHANNEL); channel.onmessage = (event) => receiveScores(event.data); } catch (_) { channel = null; }

function loadScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    if (saved["Sadlier Not In Order"] && !saved["Sadlier Word Search"]) {
      saved["Sadlier Word Search"] = saved["Sadlier Not In Order"];
      delete saved["Sadlier Not In Order"];
    }
    return saved;
  } catch (_) { return {}; }
}

function persistScores() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
  if (channel) channel.postMessage({ type: "scores-updated", scores: state.scores });
  $("syncText").textContent = "Saved & synced";
  window.setTimeout(() => { $("syncText").textContent = "Local sync on"; }, 1500);
}

function receiveScores(incoming) {
  if (!incoming || incoming.type !== "scores-updated") return;
  state.scores = incoming.scores || {};
  renderScores();
  $("syncText").textContent = "Updated from another tab";
  window.setTimeout(() => { $("syncText").textContent = "Local sync on"; }, 1800);
}

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) {
    return;
  }
  state.scores = loadScores();
  renderScores();
});

function formatTime(milliseconds) {
  const safe = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function renderScores() {
  const scores = [...(state.scores[state.category] || [])].sort((a, b) => {
    if (state.category === "Sadlier Word Search") return (Number(b.points) || 0) - (Number(a.points) || 0) || a.time - b.time;
    return a.time - b.time;
  });
  $("categoryLabel").textContent = state.category;
  $("scoreCount").textContent = `${scores.length} ${scores.length === 1 ? "run" : "runs"}`;
  scoreRows.innerHTML = scores.map((score, index) => `
    <tr>
      <td>${String(index + 1).padStart(2, "0")}</td>
      <td>${state.category === "Sadlier Word Search" ? `${Number(score.points) || 0} pts` : "—"}</td>
      <td>${formatTime(score.time)}</td>
      <td>${escapeHtml(score.date)}</td>
    </tr>`).join("");
  emptyState.classList.toggle("hidden", scores.length > 0);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function setCategory(category) {
  if (!categories.includes(category)) return;
  state.category = category;
  document.querySelectorAll(".category-tab").forEach((button) => button.classList.toggle("active", button.dataset.category === category));
  runCategory.value = category;
  const isWordSearch = category === "Sadlier Word Search";
  runPoints.required = isWordSearch;
  $("pointsLabelHint").textContent = isWordSearch ? "required for Word Search" : "optional for this category";
  pointsHint.textContent = isWordSearch ? "Enter the points you earned in Sadlier Word Search." : "You can leave this at 0 for this category.";
  renderScores();
}

document.querySelectorAll(".category-tab").forEach((button) => button.addEventListener("click", () => setCategory(button.dataset.category)));
runCategory.addEventListener("change", () => setCategory(runCategory.value));

function updateTimer() {
  if (state.timer.running) state.timer.elapsed = performance.now() - state.timer.startedAt;
  timerDisplay.textContent = formatTime(state.timer.elapsed);
}

function startTimer() {
  if (state.timer.running) return;
  state.timer.startedAt = performance.now() - state.timer.elapsed;
  state.timer.running = true;
  startTimerButton.disabled = true;
  stopTimerButton.disabled = false;
  timerState.textContent = "Timer running — go!";
  state.timer.interval = window.setInterval(updateTimer, 16);
}

function resetTimer() {
  window.clearInterval(state.timer.interval);
  state.timer = { startedAt: null, elapsed: 0, interval: null, running: false };
  updateTimer();
  startTimerButton.disabled = false;
  stopTimerButton.disabled = true;
  timerState.textContent = "Timer ready";
}

function openTimer() {
  timerModal.classList.remove("hidden");
  runCategory.focus();
}

function closeTimer() {
  if (state.timer.running) return;
  timerModal.classList.add("hidden");
  resetTimer();
}

$("openTimerButton").addEventListener("click", openTimer);
$("closeTimerButton").addEventListener("click", closeTimer);
$("resetTimerButton").addEventListener("click", resetTimer);
startTimerButton.addEventListener("click", startTimer);

timerModal.addEventListener("click", (event) => { if (event.target === timerModal) closeTimer(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !state.timer.running) closeTimer(); });

$("runForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.timer.running) return;
  const points = Number.parseInt(runPoints.value, 10);
  if (!Number.isInteger(points) || points < 0 || points > 999999) {
    pointsHint.textContent = "Enter a whole number from 0 to 999,999.";
    pointsHint.classList.add("error");
    runPoints.focus();
    return;
  }
  updateTimer();
  window.clearInterval(state.timer.interval);
  state.timer.running = false;
  const category = runCategory.value;
  const score = { points, time: Math.max(1, Math.round(state.timer.elapsed)), date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) };
  state.scores[category] = [...(state.scores[category] || []), score].sort((a, b) => category === "Sadlier Word Search" ? (b.points - a.points || a.time - b.time) : a.time - b.time).slice(0, 100);
  persistScores();
  setCategory(category);
  timerState.textContent = category === "Sadlier Word Search" ? `Saved ${points} points.` : `Saved ${formatTime(score.time)}.`;
  startTimerButton.disabled = false;
  stopTimerButton.disabled = true;
  window.setTimeout(() => { closeTimer(); runPoints.value = "0"; }, 850);
});

$("clearButton").addEventListener("click", () => {
  const scores = state.scores[state.category] || [];
  if (!scores.length || !window.confirm(`Clear all ${state.category} scores?`)) return;
  state.scores[state.category] = [];
  persistScores();
  renderScores();
});

renderScores();
setCategory(state.category);
updateTimer();
