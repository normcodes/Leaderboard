const STORAGE_KEY = "sadlier-leaderboard-v3";
const SYNC_CHANNEL = "sadlier-leaderboard-sync";
const modes = ["In Order", "Out of Order"];
const SADLIER_URL = "https://www.sadlierconnect.com/anonymous/product/vw?productId=4&programId=240&subjectId=1&gradeId=9&programSeriesId=1&hash=dW5kZWZpbmVk";

const state = { mode: modes[0], scores: loadScores(), timer: { startedAt: null, elapsed: 0, interval: null, running: false } };
const $ = (id) => document.getElementById(id);
const scoreRows = $("scoreRows"), emptyState = $("emptyState"), timerModal = $("timerModal");
const runnerName = $("runnerName"), runMode = $("runMode"), runUnit = $("runUnit"), runPoints = $("runPoints");
const timerDisplay = $("timerDisplay"), timerState = $("timerState"), startTimerButton = $("startTimerButton"), stopTimerButton = $("stopTimerButton"), nameHint = $("nameHint"), pointsHint = $("pointsHint");

for (let unit = 1; unit <= 15; unit += 1) runUnit.add(new Option(`Unit ${unit}`, String(unit)));

let channel;
try { channel = new BroadcastChannel(SYNC_CHANNEL); channel.onmessage = (event) => receiveScores(event.data); } catch (_) { channel = null; }

function loadScores() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (_) { return {}; }
}
function persistScores() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
  if (channel) channel.postMessage({ type: "scores-updated", scores: state.scores });
  $("syncText").textContent = "Saved & synced";
  window.setTimeout(() => { $("syncText").textContent = "Local sync on"; }, 1500);
}
function receiveScores(incoming) {
  if (!incoming || incoming.type !== "scores-updated") return;
  state.scores = incoming.scores || {}; renderScores();
  $("syncText").textContent = "Updated from another tab";
  window.setTimeout(() => { $("syncText").textContent = "Local sync on"; }, 1800);
}
window.addEventListener("storage", (event) => { if (event.key === STORAGE_KEY) { state.scores = loadScores(); renderScores(); } });

function formatTime(milliseconds) {
  const safe = Math.max(0, Math.round(milliseconds));
  return `${String(Math.floor(safe / 60000)).padStart(2, "0")}:${String(Math.floor((safe % 60000) / 1000)).padStart(2, "0")}.${String(safe % 1000).padStart(3, "0")}`;
}
function sortScores(scores) { return [...scores].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0) || a.time - b.time); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function renderScores() {
  const scores = sortScores(state.scores[state.mode] || []);
  $("modeLabel").textContent = state.mode; $("scoreCount").textContent = `${scores.length} ${scores.length === 1 ? "run" : "runs"}`;
  scoreRows.innerHTML = scores.map((score, index) => `<tr><td>${String(index + 1).padStart(2, "0")}</td><td>${escapeHtml(score.name)}</td><td>${Number(score.points) || 0} pts</td><td>${formatTime(score.time)}</td><td>Unit ${escapeHtml(score.unit)}</td><td>${escapeHtml(score.date)}</td></tr>`).join("");
  emptyState.classList.toggle("hidden", scores.length > 0);
}
function setMode(mode) {
  if (!modes.includes(mode)) return;
  state.mode = mode; runMode.value = mode;
  document.querySelectorAll(".category-tab").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  renderScores();
}
document.querySelectorAll(".category-tab").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
runMode.addEventListener("change", () => setMode(runMode.value));

function updateTimer() { if (state.timer.running) state.timer.elapsed = performance.now() - state.timer.startedAt; timerDisplay.textContent = formatTime(state.timer.elapsed); }
function startTimer() {
  if (state.timer.running) return;
  state.timer.startedAt = performance.now() - state.timer.elapsed; state.timer.running = true;
  startTimerButton.disabled = true; stopTimerButton.disabled = false; timerState.textContent = "Timer running — find the words!";
  state.timer.interval = window.setInterval(updateTimer, 16);
}
function resetTimer() {
  window.clearInterval(state.timer.interval); state.timer = { startedAt: null, elapsed: 0, interval: null, running: false };
  updateTimer(); startTimerButton.disabled = false; stopTimerButton.disabled = true; timerState.textContent = "Open Word Search, click Restart, then start the timer.";
}
function openTimer() { timerModal.classList.remove("hidden"); runnerName.focus(); }
function closeTimer() { if (state.timer.running) logRun(); timerModal.classList.add("hidden"); resetTimer(); }
function logRun() {
  if (!state.timer.running) return;
  updateTimer(); window.clearInterval(state.timer.interval); state.timer.running = false;
  const name = runnerName.value.trim().replace(/ +/g, " ");
  const points = Number.parseInt(runPoints.value, 10);
  if (!/^[a-zA-Z]+(?: [a-zA-Z]+)*$/.test(name) || name.length > 10 || !Number.isInteger(points) || points < 0) return;
  const score = { name, points, unit: runUnit.value, time: Math.max(1, Math.round(state.timer.elapsed)), date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) };
  state.scores[state.mode] = sortScores([...(state.scores[state.mode] || []), score]).slice(0, 100); persistScores(); renderScores();
  timerState.textContent = `Saved ${formatTime(score.time)} for ${name}.`; startTimerButton.disabled = false; stopTimerButton.disabled = true;
}

$("openTimerButton").addEventListener("click", openTimer);
$("closeTimerButton").addEventListener("click", closeTimer);
$("resetTimerButton").addEventListener("click", resetTimer);
$("openSadlierButton").addEventListener("click", () => window.open(SADLIER_URL, "_blank", "noopener,noreferrer"));
startTimerButton.addEventListener("click", startTimer);
timerModal.addEventListener("click", (event) => { if (event.target === timerModal) closeTimer(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeTimer(); });
runnerName.addEventListener("input", () => { runnerName.value = runnerName.value.replace(/[^a-zA-Z ]/g, "").slice(0, 10); nameHint.textContent = "Letters and spaces only."; nameHint.classList.remove("error"); });
$("runForm").addEventListener("submit", (event) => { event.preventDefault(); if (!state.timer.running) return; logRun(); window.setTimeout(() => { closeTimer(); runnerName.value = ""; runPoints.value = "0"; }, 850); });
$("clearButton").addEventListener("click", () => { if (!state.scores[state.mode]?.length || !window.confirm(`Clear all ${state.mode} scores?`)) return; state.scores[state.mode] = []; persistScores(); renderScores(); });
window.addEventListener("pagehide", () => { if (state.timer.running) logRun(); });

renderScores(); setMode(state.mode); updateTimer();
