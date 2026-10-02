const STORAGE_KEY = "sadlier-leaderboard-v4";
const THEME_KEY = "sadlier-leaderboard-theme";
const DEFAULT_NAME_KEY = "sadlier-leaderboard-default-name";
const SYNC_CHANNEL = "sadlier-leaderboard-sync";
const CLEAR_SCORES_PASSCODE = "0527";
const SUPABASE_URL = "https://aqogklmsnyoeiifpjrbw.supabase.co";
const SUPABASE_KEY = "sb_publishable_RHQZ0Hie-jkjHVyrIDrOBQ_35g-dcNR";
const CLOUD_TABLE = `${SUPABASE_URL}/rest/v1/leaderboard_runs`;
const modes = ["In Order", "Out of Order"];
const SADLIER_URL = "https://www.sadlierconnect.com/anonymous/product/vw?productId=5&programId=241&subjectId=1&gradeId=10&programTOCId=2658&programSeriesId=1&hash=dW5kZWZpbmVk";

const state = {
  mode: modes[0],
  unitFilter: "all",
  sortBy: "points",
  search: "",
  scores: loadScores(),
  theme: localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark",
  defaultName: localStorage.getItem(DEFAULT_NAME_KEY) || "",
  timer: { startedAt: null, elapsed: 0, interval: null, running: false },
};

const $ = (id) => document.getElementById(id);
const scoreRows = $("scoreRows");
const emptyState = $("emptyState");
const timerModal = $("timerModal");
const settingsPanel = $("settingsPanel");
const openSettingsButton = $("openSettingsButton");
const themeToggle = $("themeToggle");
const darkThemeButton = $("darkThemeButton");
const lightThemeButton = $("lightThemeButton");
const defaultNameInput = $("defaultName");
const runnerName = $("runnerName");
const runMode = $("runMode");
const runUnit = $("runUnit");
const runPoints = $("runPoints");
const unitFilter = $("unitFilter");
const searchInput = $("searchInput");
const sortFilter = $("sortFilter");
const setupFields = $("setupFields");
const modalIntro = $("modalIntro");
const activeRunSection = $("activeRunSection");
const finishRunSection = $("finishRunSection");
const timerDisplay = $("timerDisplay");
const recordedTime = $("recordedTime");
const timerState = $("timerState");
const startTimerButton = $("startTimerButton");
const stopTimerButton = $("stopTimerButton");
const nameHint = $("nameHint");
const pointsHint = $("pointsHint");

for (let unit = 1; unit <= 15; unit += 1) {
  runUnit.add(new Option(`Unit ${unit}`, String(unit)));
  unitFilter.add(new Option(`Unit ${unit}`, String(unit)));
}

let channel;
try {
  channel = new BroadcastChannel(SYNC_CHANNEL);
  channel.onmessage = (event) => receiveScores(event.data);
} catch (_) {
  channel = null;
}

function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
  if (channel) channel.postMessage({ type: "scores-updated", scores: state.scores });
}

function setSyncText(text, reset = true) {
  $("syncText").textContent = text;
  if (reset) window.setTimeout(() => { $("syncText").textContent = "Cloud sync on"; }, 1800);
}

function receiveScores(incoming) {
  if (!incoming || incoming.type !== "scores-updated") return;
  state.scores = incoming.scores || {};
  renderScores();
  setSyncText("Updated from this tab");
}

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    state.scores = loadScores();
    renderScores();
  }
});

async function cloudRequest(options = {}) {
  const { url = CLOUD_TABLE, ...requestOptions } = options;
  return fetch(url, {
    ...requestOptions,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(requestOptions.headers || {}),
    },
  });
}

async function pullCloudScores() {
  try {
    const response = await cloudRequest({ method: "GET" });
    if (!response.ok) {
      if (response.status === 404) setSyncText("Cloud table needs setup", false);
      return;
    }
    const rows = await response.json();
    const cloudScores = {};
    rows.forEach((row) => {
      if (!cloudScores[row.mode]) cloudScores[row.mode] = [];
      cloudScores[row.mode].push({ id: row.id, name: row.name, points: row.points, unit: String(row.unit), time: row.time_ms, date: row.date });
    });
    state.scores = cloudScores;
    saveLocal();
    renderScores();
    setSyncText("Cloud sync on", false);
  } catch (_) {
    setSyncText("Offline — local backup", false);
  }
}

async function pushScore(score, mode) {
  try {
    const response = await cloudRequest({
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ mode, name: score.name, points: score.points, unit: Number(score.unit), time_ms: score.time, date: score.date }),
    });
    if (!response.ok) {
      setSyncText("Cloud table needs setup", false);
      return;
    }
    setSyncText("Saved to everyone");
    await pullCloudScores();
  } catch (_) {
    setSyncText("Saved locally — offline", false);
  }
}

async function clearCloudScores() {
  try {
    const response = await cloudRequest({
      url: `${CLOUD_TABLE}?id=not.is.null`,
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return response.ok || response.status === 404;
  } catch (_) {
    return false;
  }
}

setInterval(pullCloudScores, 4000);

function formatTime(milliseconds) {
  const safe = Math.max(0, Math.round(milliseconds));
  return `${String(Math.floor(safe / 60000)).padStart(2, "0")}:${String(Math.floor((safe % 60000) / 1000)).padStart(2, "0")}.${String(safe % 1000).padStart(3, "0")}`;
}

function sortScores(scores) {
  return [...scores].sort((a, b) => state.sortBy === "time"
    ? a.time - b.time || (Number(b.points) || 0) - (Number(a.points) || 0)
    : (Number(b.points) || 0) - (Number(a.points) || 0) || a.time - b.time);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

function renderScores() {
  let scores = sortScores(state.scores[state.mode] || []);
  if (state.unitFilter !== "all") scores = scores.filter((score) => String(score.unit) === state.unitFilter);
  if (state.search) {
    const query = state.search.toLowerCase().replace(/\s+/g, " ").trim();
    const unitQuery = query.replace(/^unit\s*/, "");
    scores = scores.filter((score) => {
      const unit = String(score.unit);
      return score.name.toLowerCase().includes(query)
        || unit === unitQuery
        || `unit ${unit}` === query;
    });
  }
  $("modeLabel").textContent = state.mode;
  $("scoreCount").textContent = `${scores.length} ${scores.length === 1 ? "run" : "runs"}`;
  scoreRows.innerHTML = scores.map((score, index) => `<tr><td>${String(index + 1).padStart(2, "0")}</td><td>${escapeHtml(score.name)}</td><td>${Number(score.points) || 0} pts</td><td>${formatTime(score.time)}</td><td>Unit ${escapeHtml(score.unit)}</td><td>${escapeHtml(score.date)}</td></tr>`).join("");
  emptyState.classList.toggle("hidden", scores.length > 0);
}

function setMode(mode) {
  if (!modes.includes(mode)) return;
  state.mode = mode;
  runMode.value = mode;
  document.querySelectorAll(".category-tab").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  renderScores();
}

document.querySelectorAll(".category-tab").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
runMode.addEventListener("change", () => setMode(runMode.value));
unitFilter.addEventListener("change", () => { state.unitFilter = unitFilter.value; renderScores(); });
searchInput.addEventListener("input", () => { state.search = searchInput.value.trim(); renderScores(); });
$("searchButton").addEventListener("click", () => { state.search = searchInput.value.trim(); renderScores(); searchInput.focus(); });
sortFilter.addEventListener("change", () => { state.sortBy = sortFilter.value; renderScores(); });

function showSetupStage() {
  modalIntro.classList.remove("hidden");
  setupFields.classList.remove("hidden");
  activeRunSection.classList.add("hidden");
  finishRunSection.classList.add("hidden");
  startTimerButton.disabled = false;
  stopTimerButton.disabled = true;
  timerState.textContent = "Open Word Search, click Restart, then start the timer.";
}

function showActiveStage() {
  modalIntro.classList.add("hidden");
  setupFields.classList.add("hidden");
  activeRunSection.classList.remove("hidden");
  finishRunSection.classList.add("hidden");
  startTimerButton.disabled = true;
  stopTimerButton.disabled = false;
  timerState.textContent = "Timer running — find the words!";
}

function showFinishStage() {
  modalIntro.classList.add("hidden");
  setupFields.classList.add("hidden");
  activeRunSection.classList.add("hidden");
  finishRunSection.classList.remove("hidden");
  recordedTime.textContent = formatTime(state.timer.elapsed);
  runPoints.value = "";
  pointsHint.textContent = "Enter the points you earned, then save your run.";
  pointsHint.classList.remove("error");
  window.setTimeout(() => runPoints.focus(), 0);
}

function updateTimer() {
  if (state.timer.running) state.timer.elapsed = performance.now() - state.timer.startedAt;
  timerDisplay.textContent = formatTime(state.timer.elapsed);
}

function validRunnerName(name) {
  return /^[a-zA-Z]+(?: [a-zA-Z]+)*$/.test(name) && name.length <= 30;
}

function startTimer() {
  const name = runnerName.value.trim().replace(/ +/g, " ");
  if (!validRunnerName(name)) {
    nameHint.textContent = "Enter a valid name using letters and spaces only.";
    nameHint.classList.add("error");
    runnerName.focus();
    return;
  }
  runnerName.value = name;
  state.mode = runMode.value;
  state.timer.startedAt = performance.now() - state.timer.elapsed;
  state.timer.running = true;
  showActiveStage();
  state.timer.interval = window.setInterval(updateTimer, 16);
}

function stopTimer() {
  if (!state.timer.running) return;
  updateTimer();
  window.clearInterval(state.timer.interval);
  state.timer.interval = null;
  state.timer.running = false;
  showFinishStage();
}

function resetTimer() {
  window.clearInterval(state.timer.interval);
  state.timer = { startedAt: null, elapsed: 0, interval: null, running: false };
  runPoints.value = "";
  updateTimer();
  showSetupStage();
}

function openTimer() {
  resetTimer();
  runnerName.value = state.defaultName;
  timerModal.classList.remove("hidden");
  runnerName.focus();
}

function closeTimer() {
  timerModal.classList.add("hidden");
  resetTimer();
}

function saveRun() {
  if (state.timer.running || state.timer.elapsed <= 0) return;
  const name = runnerName.value.trim().replace(/ +/g, " ");
  const points = Number.parseInt(runPoints.value, 10);
  let valid = true;

  if (!validRunnerName(name)) {
    nameHint.textContent = "Enter a valid name using letters and spaces only.";
    nameHint.classList.add("error");
    valid = false;
  }
  if (!Number.isInteger(points) || points < 0 || points > 999999) {
    pointsHint.textContent = "Enter a whole-number score from 0 to 999,999.";
    pointsHint.classList.add("error");
    valid = false;
  }
  if (!valid) return;

  const score = {
    name,
    points,
    unit: runUnit.value,
    time: Math.max(1, Math.round(state.timer.elapsed)),
    date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
  };
  state.scores[state.mode] = sortScores([...(state.scores[state.mode] || []), score]).slice(0, 100);
  saveLocal();
  renderScores();
  pushScore(score, state.mode);
  pointsHint.textContent = `Saved ${formatTime(score.time)} with ${score.points} points.`;
  pointsHint.classList.remove("error");
  window.setTimeout(() => {
    closeTimer();
    runnerName.value = "";
  }, 700);
}

function setSettingsOpen(isOpen) {
  settingsPanel.classList.toggle("hidden", !isOpen);
  openSettingsButton.setAttribute("aria-expanded", String(isOpen));
}

async function clearScores() {
  const passcode = window.prompt("Enter the organizer passcode to clear all scores:");
  if (passcode === null) return;
  if (passcode !== CLEAR_SCORES_PASSCODE) {
    window.alert("Incorrect passcode. Scores were not cleared.");
    return;
  }
  if (!window.confirm("Clear all saved scores from this leaderboard?")) return;

  state.scores = {};
  saveLocal();
  renderScores();
  const cloudCleared = await clearCloudScores();
  setSyncText(cloudCleared ? "Scores cleared everywhere" : "Cloud clear needs setup", false);
  setSettingsOpen(false);
}

function applyTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light-mode", state.theme === "light");
  document.documentElement.style.colorScheme = state.theme;
  localStorage.setItem(THEME_KEY, state.theme);
  themeToggle.textContent = state.theme === "light" ? "☾" : "☀";
  themeToggle.setAttribute("aria-label", state.theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  darkThemeButton.classList.toggle("selected", state.theme === "dark");
  lightThemeButton.classList.toggle("selected", state.theme === "light");
  darkThemeButton.setAttribute("aria-pressed", String(state.theme === "dark"));
  lightThemeButton.setAttribute("aria-pressed", String(state.theme === "light"));
}

function saveDefaultName() {
  const cleaned = defaultNameInput.value.replace(/[^a-zA-Z ]/g, "").replace(/ +/g, " ").trim().slice(0, 30);
  defaultNameInput.value = cleaned;
  state.defaultName = cleaned;
  localStorage.setItem(DEFAULT_NAME_KEY, cleaned);
}

$("openTimerButton").addEventListener("click", openTimer);
$("closeTimerButton").addEventListener("click", closeTimer);
$("openSadlierButton").addEventListener("click", () => window.open(SADLIER_URL, "_blank", "noopener,noreferrer"));
startTimerButton.addEventListener("click", startTimer);
stopTimerButton.addEventListener("click", stopTimer);
$("runForm").addEventListener("submit", (event) => { event.preventDefault(); saveRun(); });

$("closeSettingsButton").addEventListener("click", () => setSettingsOpen(false));
openSettingsButton.addEventListener("click", () => setSettingsOpen(settingsPanel.classList.contains("hidden")));
$("clearScoresButton").addEventListener("click", clearScores);
themeToggle.addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));
darkThemeButton.addEventListener("click", () => applyTheme("dark"));
lightThemeButton.addEventListener("click", () => applyTheme("light"));
defaultNameInput.addEventListener("input", saveDefaultName);

timerModal.addEventListener("click", (event) => { if (event.target === timerModal) closeTimer(); });
settingsPanel.addEventListener("click", (event) => { if (event.target === settingsPanel) setSettingsOpen(false); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!settingsPanel.classList.contains("hidden")) setSettingsOpen(false);
    else if (!timerModal.classList.contains("hidden")) closeTimer();
  }
});

runnerName.addEventListener("input", () => {
  runnerName.value = runnerName.value.replace(/[^a-zA-Z ]/g, "").slice(0, 30);
  nameHint.textContent = "Letters and spaces only.";
  nameHint.classList.remove("error");
});
runPoints.addEventListener("input", () => {
  pointsHint.textContent = "Enter the points you earned, then save your run.";
  pointsHint.classList.remove("error");
});

window.addEventListener("pagehide", () => {
  if (state.timer.running) {
    updateTimer();
    window.clearInterval(state.timer.interval);
    state.timer.running = false;
  }
});

renderScores();
setMode(state.mode);
updateTimer();
defaultNameInput.value = state.defaultName;
applyTheme(state.theme);
pullCloudScores();
