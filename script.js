const STORAGE_KEY = "sadlier-leaderboard-v4";
const THEME_KEY = "sadlier-leaderboard-theme";
const DEFAULT_NAME_KEY = "sadlier-leaderboard-default-name";
const SKIP_DELETE_CONFIRM_KEY = "sadlier-leaderboard-skip-delete-confirm";
const BANNED_NAMES_KEY = "sadlier-leaderboard-banned-names";
const DEVICE_TOKEN_KEY = "sadlier-leaderboard-device-token";
const ACTIVE_RUN_KEY = "sadlier-leaderboard-active-run";
const RUN_TIMEOUT_MS = 15 * 60 * 1000;
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
  skipDeleteConfirm: localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === "true",
  bannedNames: loadBannedNames(),
  devMode: false,
  deviceToken: getDeviceToken(),
  pendingDelete: null,
  pendingDeletes: null,
  contextScore: null,
  selectedScoreKeys: new Set(),
  editingScore: null,
  versionClicks: 0,
  versionClickTimer: null,
  timer: { startedAt: null, elapsed: 0, interval: null, running: false, token: null, timedOut: false },
};

const $ = (id) => document.getElementById(id);
const scoreRows = $("scoreRows");
const emptyState = $("emptyState");
const timerModal = $("timerModal");
const settingsPanel = $("settingsPanel");
const openSettingsButton = $("openSettingsButton");
const darkThemeButton = $("darkThemeButton");
const lightThemeButton = $("lightThemeButton");
const defaultNameInput = $("defaultName");
const skipDeleteConfirm = $("skipDeleteConfirm");
const skipDeleteSetting = $("skipDeleteSetting");
const adminPanel = $("adminPanel");
const adminPassword = $("adminPassword");
const adminHint = $("adminHint");
const unlockFields = $("unlockFields");
const devControls = $("devControls");
const confirmPanel = $("confirmPanel");
const confirmCopy = $("confirmCopy");
const confirmNever = $("confirmNever");
const editPanel = $("editPanel");
const editName = $("editName");
const editPoints = $("editPoints");
const editUnit = $("editUnit");
const editHint = $("editHint");
const scoreContextMenu = $("scoreContextMenu");
const contextEditButton = $("contextEditButton");
const contextDeleteButton = $("contextDeleteButton");
const contextBanButton = $("contextBanButton");
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
  editUnit.add(new Option(`Unit ${unit}`, String(unit)));
}

function getDeviceToken() {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

function loadBannedNames() {
  try { return JSON.parse(localStorage.getItem(BANNED_NAMES_KEY)) || []; } catch (_) { return []; }
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
      cloudScores[row.mode].push({ id: row.id, mode: row.mode, name: row.name, points: row.points, unit: String(row.unit), time: row.time_ms, date: row.date });
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

async function deleteCloudScore(score) {
  if (!score.id) return true;
  try {
    const response = await cloudRequest({ url: `${CLOUD_TABLE}?id=eq.${encodeURIComponent(score.id)}`, method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!response.ok) return false;
    const verify = await cloudRequest({ url: `${CLOUD_TABLE}?id=eq.${encodeURIComponent(score.id)}&select=id`, method: "GET" });
    if (!verify.ok) return false;
    const remaining = await verify.json();
    return Array.isArray(remaining) && remaining.length === 0;
  } catch (_) { return false; }
}

async function updateCloudScore(score) {
  if (!score.id) return true;
  try {
    const response = await cloudRequest({ url: `${CLOUD_TABLE}?id=eq.${encodeURIComponent(score.id)}`, method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name: score.name, points: score.points, unit: Number(score.unit) }) });
    if (!response.ok) return false;
    const updated = await response.json();
    return Array.isArray(updated) && updated.length > 0;
  } catch (_) { return false; }
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

function scoreKey(score) {
  return score.id || `${score.name}-${score.time}-${score.date}-${score.unit}`;
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
  scoreRows.innerHTML = scores.map((score, index) => `<tr><td>${String(index + 1).padStart(2, "0")}</td><td><button class="score-name-button" type="button" data-score-id="${escapeHtml(scoreKey(score))}">${escapeHtml(score.name)}</button></td><td>${Number(score.points) || 0} pts</td><td>${formatTime(score.time)}</td><td>Unit ${escapeHtml(score.unit)}</td><td>${escapeHtml(score.date)}</td></tr>`).join("");
  emptyState.classList.toggle("hidden", scores.length > 0);
  scoreRows.querySelectorAll(".score-name-button").forEach((button) => {
    const score = scores.find((item) => scoreKey(item) === button.dataset.scoreId);
    if (!score) return;
    button.classList.toggle("selected", state.selectedScoreKeys.has(scoreKey(score)));
    button.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey) {
        const key = scoreKey(score);
        if (state.selectedScoreKeys.has(key)) state.selectedScoreKeys.delete(key);
        else state.selectedScoreKeys.add(key);
        renderScores();
        return;
      }
      requestDeleteScore(score);
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (state.devMode) openScoreContextMenu(score, event.clientX, event.clientY);
    });
  });
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
  if (state.timer.running) {
    state.timer.elapsed = performance.now() - state.timer.startedAt;
    if (state.timer.elapsed >= RUN_TIMEOUT_MS) {
      state.timer.elapsed = RUN_TIMEOUT_MS;
      state.timer.running = false;
      state.timer.timedOut = true;
      window.clearInterval(state.timer.interval);
      state.timer.interval = null;
      localStorage.removeItem(ACTIVE_RUN_KEY);
      stopTimerButton.disabled = true;
      timerState.textContent = `This run timed out at ${formatTime(RUN_TIMEOUT_MS)}. You are timed out and cannot enter a score.`;
    }
  }
  timerDisplay.textContent = formatTime(state.timer.elapsed);
}

function validRunnerName(name) {
  return /^(?:[\p{L}\p{Extended_Pictographic}\u200d\ufe0f])+$/u.test(name) && [...name].length <= 30;
}

function cleanRunnerName(value) {
  return [...String(value)]
    .filter((character) => /[\p{L}\p{Extended_Pictographic}\u200d\ufe0f]/u.test(character))
    .join("")
    .slice(0, 30);
}

function startTimer() {
  const existingRun = JSON.parse(localStorage.getItem(ACTIVE_RUN_KEY) || "null");
  if (existingRun && existingRun.expiresAt > Date.now()) {
    nameHint.textContent = `This device already has an active run until ${new Date(existingRun.expiresAt).toLocaleTimeString()}.`;
    nameHint.classList.add("error");
    return;
  }
  localStorage.removeItem(ACTIVE_RUN_KEY);
  const name = runnerName.value.trim().replace(/ +/g, " ");
  if (state.bannedNames.includes(name.toLowerCase())) {
    nameHint.textContent = "This name is banned from entering scores on this device.";
    nameHint.classList.add("error");
    return;
  }
  if (!validRunnerName(name)) {
    nameHint.textContent = "Use letters and emojis only — no spaces or special characters.";
    nameHint.classList.add("error");
    runnerName.focus();
    return;
  }
  runnerName.value = name;
  state.mode = runMode.value;
  state.timer.token = `${state.deviceToken}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  state.timer.timedOut = false;
  localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ token: state.timer.token, deviceToken: state.deviceToken, expiresAt: Date.now() + RUN_TIMEOUT_MS }));
  state.timer.startedAt = performance.now() - state.timer.elapsed;
  state.timer.running = true;
  showActiveStage();
  state.timer.interval = window.setInterval(updateTimer, 16);
}

function stopTimer() {
  if (!state.timer.running || state.timer.timedOut) return;
  updateTimer();
  window.clearInterval(state.timer.interval);
  state.timer.interval = null;
  state.timer.running = false;
  localStorage.removeItem(ACTIVE_RUN_KEY);
  showFinishStage();
}

function resetTimer() {
  window.clearInterval(state.timer.interval);
  state.timer = { startedAt: null, elapsed: 0, interval: null, running: false, token: null, timedOut: false };
  localStorage.removeItem(ACTIVE_RUN_KEY);
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
    nameHint.textContent = "Use letters and emojis only — no spaces or special characters.";
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
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mode: state.mode,
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
  skipDeleteSetting.classList.toggle("hidden", !state.devMode);
  if (isOpen) skipDeleteConfirm.checked = state.skipDeleteConfirm;
}

function setPanel(panel, isOpen) { panel.classList.toggle("hidden", !isOpen); }

function openAdminUnlock() {
  unlockFields.classList.toggle("hidden", state.devMode);
  devControls.classList.toggle("hidden", !state.devMode);
  adminPassword.value = "";
  adminHint.textContent = state.devMode ? "Dev Mode is active for this tab." : "Password is hidden while you type.";
  adminHint.classList.remove("error");
  setPanel(adminPanel, true);
  if (!state.devMode) adminPassword.focus();
}

function enableDevMode() {
  if (adminPassword.value !== CLEAR_SCORES_PASSCODE) {
    adminHint.textContent = "Incorrect password.";
    adminHint.classList.add("error");
    adminPassword.focus();
    return;
  }
  state.devMode = true;
  setPanel(adminPanel, false);
  setSettingsOpen(false);
  setSyncText("Dev Mode enabled for this tab", false);
}

function turnOffDevMode() {
  state.devMode = false;
  state.skipDeleteConfirm = false;
  localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, "false");
  setPanel(adminPanel, false);
  setSettingsOpen(false);
  setSyncText("Dev Mode off", false);
}

function requestDeleteScore(score) {
  requestDeleteScores([score]);
}

function requestDeleteScores(scores) {
  if (!scores.length) return closeScoreContextMenu();
  closeScoreContextMenu();
  if (state.devMode && state.skipDeleteConfirm) return deleteSelectedScores(scores);
  state.pendingDeletes = scores;
  confirmNever.checked = false;
  confirmPanel.querySelector("#confirmTitle").textContent = scores.length === 1 ? "Delete this score?" : "Delete selected scores?";
  confirmCopy.textContent = scores.length === 1
    ? `Remove ${scores[0].name} with ${Number(scores[0].points) || 0} points?`
    : `Remove ${scores.length} selected scores?`;
  setPanel(confirmPanel, true);
}

function openScoreContextMenu(score, x, y) {
  if (!state.selectedScoreKeys.has(scoreKey(score))) state.selectedScoreKeys = new Set([scoreKey(score)]);
  state.contextScore = score;
  scoreContextMenu.classList.remove("hidden");
  scoreContextMenu.style.left = `${Math.min(x, window.innerWidth - 150)}px`;
  scoreContextMenu.style.top = `${Math.min(y, window.innerHeight - 100)}px`;
}

function closeScoreContextMenu() {
  scoreContextMenu.classList.add("hidden");
  state.contextScore = null;
}

function selectedScores() {
  return Object.values(state.scores).flat().filter((score) => state.selectedScoreKeys.has(scoreKey(score)));
}

async function deleteSelectedScores(scores = selectedScores()) {
  if (!scores.length) return closeScoreContextMenu();
  closeScoreContextMenu();
  scores.forEach((score) => {
    state.scores[score.mode || state.mode] = (state.scores[score.mode || state.mode] || []).filter((item) => scoreKey(item) !== scoreKey(score));
  });
  saveLocal();
  renderScores();
  const results = await Promise.all(scores.map((score) => deleteCloudScore(score)));
  state.selectedScoreKeys.clear();
  state.pendingDeletes = null;
  const allDeleted = results.every(Boolean);
  setSyncText(allDeleted ? `${scores.length} score${scores.length === 1 ? "" : "s"} deleted everywhere` : `${scores.length} score${scores.length === 1 ? "" : "s"} deleted locally`, false);
}

function banContextScore() {
  const score = state.contextScore;
  if (!score) return;
  const normalized = score.name.toLowerCase();
  if (!state.bannedNames.includes(normalized)) state.bannedNames.push(normalized);
  localStorage.setItem(BANNED_NAMES_KEY, JSON.stringify(state.bannedNames));
  closeScoreContextMenu();
  setSyncText(`${score.name} banned on this device`, false);
}

async function deleteScore(score) {
  state.scores[score.mode || state.mode] = (state.scores[score.mode || state.mode] || []).filter((item) => scoreKey(item) !== scoreKey(score));
  saveLocal();
  renderScores();
  const cloudDeleted = await deleteCloudScore(score);
  setSyncText(cloudDeleted ? "Score removed everywhere" : "Score removed locally", false);
  state.pendingDelete = null;
  state.pendingDeletes = null;
  setPanel(confirmPanel, false);
}

function openEditScore(score) {
  state.editingScore = score;
  editName.value = score.name;
  editPoints.value = String(score.points);
  editUnit.value = String(score.unit);
  editHint.textContent = "Change the name, points, or unit, then save.";
  editHint.classList.remove("error");
  setPanel(editPanel, true);
  editName.focus();
}

async function saveEditedScore() {
  const score = state.editingScore;
  if (!score) return;
  const name = cleanRunnerName(editName.value);
  const points = Number.parseInt(editPoints.value, 10);
  if (!validRunnerName(name) || !Number.isInteger(points) || points < 0 || points > 999999) {
    editHint.textContent = "Use letters/emojis only and a whole-number score from 0 to 999,999.";
    editHint.classList.add("error");
    return;
  }
  score.name = name;
  score.points = points;
  score.unit = editUnit.value;
  saveLocal();
  renderScores();
  const cloudUpdated = await updateCloudScore(score);
  editHint.textContent = cloudUpdated ? "Score updated everywhere." : "Score updated locally.";
  editHint.classList.toggle("error", !cloudUpdated);
  setSyncText(cloudUpdated ? "Score updated everywhere" : "Score updated locally", false);
  window.setTimeout(() => setPanel(editPanel, false), 500);
}

function applyTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light-mode", state.theme === "light");
  document.documentElement.style.colorScheme = state.theme;
  localStorage.setItem(THEME_KEY, state.theme);
  darkThemeButton.classList.toggle("selected", state.theme === "dark");
  lightThemeButton.classList.toggle("selected", state.theme === "light");
  darkThemeButton.setAttribute("aria-pressed", String(state.theme === "dark"));
  lightThemeButton.setAttribute("aria-pressed", String(state.theme === "light"));
}

function saveDefaultName() {
  const cleaned = cleanRunnerName(defaultNameInput.value);
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
darkThemeButton.addEventListener("click", () => applyTheme("dark"));
lightThemeButton.addEventListener("click", () => applyTheme("light"));
defaultNameInput.addEventListener("input", saveDefaultName);
skipDeleteConfirm.addEventListener("change", () => {
  state.skipDeleteConfirm = skipDeleteConfirm.checked;
  localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, String(state.skipDeleteConfirm));
});
$("versionButton").addEventListener("click", () => {
  state.versionClicks += 1;
  window.clearTimeout(state.versionClickTimer);
  state.versionClickTimer = window.setTimeout(() => { state.versionClicks = 0; }, 15000);
  if (state.versionClicks >= 5) { state.versionClicks = 0; openAdminUnlock(); }
});
$("closeAdminButton").addEventListener("click", () => setPanel(adminPanel, false));
$("enableDevModeButton").addEventListener("click", enableDevMode);
$("turnOffDevModeButton").addEventListener("click", turnOffDevMode);
adminPassword.addEventListener("input", () => { adminHint.textContent = "Password is hidden while you type."; adminHint.classList.remove("error"); });
$("cancelConfirmButton").addEventListener("click", () => { state.pendingDelete = null; state.pendingDeletes = null; setPanel(confirmPanel, false); });
$("acceptConfirmButton").addEventListener("click", () => {
  if (confirmNever.checked && state.devMode) { state.skipDeleteConfirm = true; localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, "true"); }
  if (state.pendingDeletes?.length) deleteSelectedScores(state.pendingDeletes);
  else if (state.pendingDelete) deleteScore(state.pendingDelete);
});
$("closeEditButton").addEventListener("click", () => setPanel(editPanel, false));
$("cancelEditButton").addEventListener("click", () => setPanel(editPanel, false));
$("saveEditButton").addEventListener("click", saveEditedScore);
editName.addEventListener("input", () => { editName.value = cleanRunnerName(editName.value); });
editPoints.addEventListener("input", () => { editPoints.value = editPoints.value.replace(/\D/g, "").slice(0, 6); });
contextEditButton.addEventListener("click", () => { const score = state.contextScore; closeScoreContextMenu(); if (score) openEditScore(score); });
contextDeleteButton.addEventListener("click", () => requestDeleteScores(selectedScores()));
contextBanButton.addEventListener("click", banContextScore);

timerModal.addEventListener("click", (event) => { if (event.target === timerModal) closeTimer(); });
settingsPanel.addEventListener("click", (event) => { if (event.target === settingsPanel) setSettingsOpen(false); });
adminPanel.addEventListener("click", (event) => { if (event.target === adminPanel) setPanel(adminPanel, false); });
confirmPanel.addEventListener("click", (event) => { if (event.target === confirmPanel) setPanel(confirmPanel, false); });
editPanel.addEventListener("click", (event) => { if (event.target === editPanel) setPanel(editPanel, false); });
document.addEventListener("click", (event) => { if (!scoreContextMenu.contains(event.target)) closeScoreContextMenu(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!settingsPanel.classList.contains("hidden")) setSettingsOpen(false);
    else if (!timerModal.classList.contains("hidden")) closeTimer();
    else if (!adminPanel.classList.contains("hidden")) setPanel(adminPanel, false);
    else if (!confirmPanel.classList.contains("hidden")) setPanel(confirmPanel, false);
    else if (!editPanel.classList.contains("hidden")) setPanel(editPanel, false);
    closeScoreContextMenu();
  }
});

runnerName.addEventListener("input", () => {
  runnerName.value = cleanRunnerName(runnerName.value);
  nameHint.textContent = "Letters and emojis only — no spaces or special characters.";
  nameHint.classList.remove("error");
});
runnerName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    startTimer();
  }
});
runPoints.addEventListener("input", () => {
  runPoints.value = runPoints.value.replace(/\D/g, "").slice(0, 6);
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
skipDeleteConfirm.checked = state.skipDeleteConfirm;
editUnit.value = "1";
applyTheme(state.theme);
pullCloudScores();
