const STORAGE_KEY = "sadlier-leaderboard-v4";
const THEME_KEY = "sadlier-leaderboard-theme";
const DEFAULT_NAME_KEY = "sadlier-leaderboard-default-name";
const SKIP_DELETE_CONFIRM_KEY = "sadlier-leaderboard-skip-delete-confirm";
const BANNED_NAMES_KEY = "sadlier-leaderboard-banned-names";
const BANNED_DEVICES_KEY = "sadlier-leaderboard-banned-devices";
const DEVICE_TOKEN_KEY = "sadlier-leaderboard-device-token";
const ACTIVE_RUN_KEY = "sadlier-leaderboard-active-run";
const RUN_TIMEOUT_MS = 15 * 60 * 1000;
const SYNC_CHANNEL = "sadlier-leaderboard-sync";
const CLEAR_SCORES_PASSCODE = "0527";
const HIGH_ADMIN_PASSCODE = "Password1$";
const OWNER_PASSCODE = "Password1$A";
const BAN_DURATION_MS = 24 * 60 * 60 * 1000;
const SUPABASE_URL = "https://aqogklmsnyoeiifpjrbw.supabase.co";
const SUPABASE_KEY = "sb_publishable_RHQZ0Hie-jkjHVyrIDrOBQ_35g-dcNR";
const CLOUD_TABLE = `${SUPABASE_URL}/rest/v1/leaderboard_runs`;
const CLEAR_RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/wipe_leaderboard`;
const BAN_RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/ban_device`;
const UNBAN_RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/unban_device`;
const DEVICE_BAN_RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/get_device_ban`;
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
  bannedDevices: loadBannedDevices(),
  devMode: false,
  adminRank: "",
  deviceToken: getDeviceToken(),
  pendingDelete: null,
  pendingDeletes: null,
  pendingWipe: false,
  contextScore: null,
  selectedScoreKeys: new Set(),
  editingScore: null,
  versionClicks: 0,
  versionClickTimer: null,
  banCountdownTimer: null,
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
const clearScoresSetting = $("clearScoresSetting");
const clearDatabaseButton = $("clearDatabaseButton");
const adminPanel = $("adminPanel");
const adminPassword = $("adminPassword");
const adminHint = $("adminHint");
const unlockFields = $("unlockFields");
const devControls = $("devControls");
const confirmPanel = $("confirmPanel");
const confirmCopy = $("confirmCopy");
const confirmNever = $("confirmNever");
const confirmNeverRow = $("confirmNeverRow");
const acceptConfirmButton = $("acceptConfirmButton");
const editPanel = $("editPanel");
const editName = $("editName");
const editPoints = $("editPoints");
const editUnit = $("editUnit");
const editHint = $("editHint");
const scoreContextMenu = $("scoreContextMenu");
const contextEditButton = $("contextEditButton");
const contextDeleteButton = $("contextDeleteButton");
const contextBanButton = $("contextBanButton");
const contextUnbanButton = $("contextUnbanButton");
const banPanel = $("banPanel");
const banDurationInput = $("banDuration");
const banCopy = $("banCopy");
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
const adminRank = $("adminRank");
const banCountdown = $("banCountdown");

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

function loadBannedDevices() {
  try { return JSON.parse(localStorage.getItem(BANNED_DEVICES_KEY)) || {}; } catch (_) { return {}; }
}

function hasPermission(permission) {
  return state.devMode && (state.adminRank === "Owner" || (state.adminRank === "High Admin" && permission !== "edit") || (state.adminRank === "Basic Admin" && permission === "delete"));
}

function activeDeviceBan() {
  const expiresAt = Number(state.bannedDevices[state.deviceToken] || 0);
  if (!expiresAt) return 0;
  if (expiresAt <= Date.now()) {
    delete state.bannedDevices[state.deviceToken];
    localStorage.setItem(BANNED_DEVICES_KEY, JSON.stringify(state.bannedDevices));
    return 0;
  }
  return expiresAt;
}

function formatCountdown(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function updateBanCountdown() {
  const expiresAt = activeDeviceBan();
  banCountdown.textContent = expiresAt ? `Banned · ${formatCountdown(expiresAt - Date.now())}` : "";
}

function updateAdminRank() {
  adminRank.textContent = state.devMode && state.adminRank ? `· ${state.adminRank}` : "";
  updateBanCountdown();
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
      cloudScores[row.mode].push({ id: row.id, mode: row.mode, name: row.name, points: row.points, unit: String(row.unit), time: row.time_ms, date: row.date, deviceToken: row.device_token || "" });
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
    const payload = { mode, name: score.name, points: score.points, unit: Number(score.unit), time_ms: score.time, date: score.date, device_token: score.deviceToken };
    let response = await cloudRequest({
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      response = await cloudRequest({ method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...payload, device_token: undefined }) });
    }
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

async function deleteCloudScoresByNames(names) {
  const uniqueNames = [...new Set(names.map((name) => String(name).trim()).filter(Boolean))];
  if (!uniqueNames.length) return true;
  try {
    const response = await cloudRequest({ url: CLEAR_RPC_URL, method: "POST", body: JSON.stringify({ users: uniqueNames }) });
    const result = await response.json().catch(() => ({}));
    return response.ok && result.success === true;
  } catch (_) { return false; }
}

async function syncRemoteDeviceBan() {
  try {
    const response = await cloudRequest({ url: DEVICE_BAN_RPC_URL, method: "POST", body: JSON.stringify({ p_device_token: state.deviceToken }) });
    if (!response.ok) return;
    const expiresAt = await response.json();
    if (expiresAt) {
      state.bannedDevices[state.deviceToken] = new Date(expiresAt).getTime();
      localStorage.setItem(BANNED_DEVICES_KEY, JSON.stringify(state.bannedDevices));
      updateBanCountdown();
    }
  } catch (_) { /* local device ban remains available if the RPC is offline */ }
}

async function banDeviceRemotely(deviceToken, durationMinutes) {
  try {
    const response = await cloudRequest({ url: BAN_RPC_URL, method: "POST", body: JSON.stringify({ p_device_token: deviceToken, p_duration_minutes: durationMinutes }) });
    return response.ok;
  } catch (_) { return false; }
}

async function getRemoteDeviceBan(deviceToken) {
  try {
    const response = await cloudRequest({ url: DEVICE_BAN_RPC_URL, method: "POST", body: JSON.stringify({ p_device_token: deviceToken }) });
    if (!response.ok) return 0;
    const value = await response.json();
    return value ? new Date(value).getTime() : 0;
  } catch (_) { return 0; }
}

async function unbanDeviceRemotely(deviceToken) {
  try {
    const response = await cloudRequest({ url: UNBAN_RPC_URL, method: "POST", body: JSON.stringify({ p_device_token: deviceToken }) });
    return response.ok;
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
      }
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
  if (activeDeviceBan() && !state.devMode) {
    nameHint.textContent = `This device is banned for ${formatCountdown(activeDeviceBan() - Date.now())}.`;
    nameHint.classList.add("error");
    updateBanCountdown();
    return;
  }
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
    deviceToken: state.deviceToken,
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
  clearScoresSetting.classList.toggle("hidden", !hasPermission("clear"));
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
  const ranks = {
    [CLEAR_SCORES_PASSCODE]: "Basic Admin",
    [HIGH_ADMIN_PASSCODE]: "High Admin",
    [OWNER_PASSCODE]: "Owner",
  };
  const rank = ranks[adminPassword.value];
  if (!rank) {
    adminHint.textContent = "Incorrect password.";
    adminHint.classList.add("error");
    adminPassword.focus();
    return;
  }
  state.devMode = true;
  state.adminRank = rank;
  setPanel(adminPanel, false);
  setSettingsOpen(false);
  updateAdminRank();
  setSyncText(`${rank} enabled for this tab`, false);
}

function turnOffDevMode() {
  state.devMode = false;
  state.adminRank = "";
  state.skipDeleteConfirm = false;
  localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, "false");
  closeScoreContextMenu();
  updateAdminRank();
  setPanel(adminPanel, false);
  setSettingsOpen(false);
  setSyncText("Dev Mode off", false);
}

function requestDeleteScore(score) {
  requestDeleteScores([score]);
}

function requestDeleteScores(scores) {
  if (!scores.length) return closeScoreContextMenu();
  if (!hasPermission("delete") || (scores.length > 1 && state.adminRank !== "Owner")) return closeScoreContextMenu();
  closeScoreContextMenu();
  if (state.devMode && state.skipDeleteConfirm) return deleteSelectedScores(scores);
  state.pendingDeletes = scores;
  confirmNever.checked = false;
  confirmPanel.querySelector("#confirmTitle").textContent = scores.length === 1 ? "Delete this score?" : "Delete selected scores?";
  confirmNeverRow.classList.remove("hidden");
  acceptConfirmButton.textContent = "Delete";
  confirmCopy.textContent = scores.length === 1
    ? `Remove ${scores[0].name} with ${Number(scores[0].points) || 0} points?`
    : `Remove ${scores.length} selected scores?`;
  setPanel(confirmPanel, true);
}

function requestWipeDatabase() {
  if (!hasPermission("clear")) return;
  closeScoreContextMenu();
  state.pendingWipe = true;
  state.pendingDeletes = null;
  state.pendingDelete = null;
  confirmPanel.querySelector("#confirmTitle").textContent = "Clear all scores?";
  confirmCopy.textContent = "This permanently removes every leaderboard score from the database.";
  confirmNever.checked = false;
  confirmNeverRow.classList.add("hidden");
  acceptConfirmButton.textContent = "Clear all";
  setPanel(confirmPanel, true);
}

async function wipeDatabase() {
  if (!state.pendingWipe || !state.devMode) return;
  acceptConfirmButton.disabled = true;
  try {
    const response = await cloudRequest({ url: CLEAR_RPC_URL, method: "POST", body: JSON.stringify({ users: ["{{CLEAR}}"] }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || `HTTP ${response.status}`);
    state.scores = {};
    saveLocal();
    renderScores();
    state.pendingWipe = false;
    setPanel(confirmPanel, false);
    setSettingsOpen(false);
    setSyncText("All scores cleared", false);
  } catch (error) {
    confirmCopy.textContent = `Clear failed: ${error.message}`;
    confirmCopy.classList.add("error");
  } finally {
    acceptConfirmButton.disabled = false;
  }
}

function openScoreContextMenu(score, x, y) {
  if (!state.devMode) return;
  if (!state.selectedScoreKeys.has(scoreKey(score))) state.selectedScoreKeys = new Set([scoreKey(score)]);
  state.contextScore = score;
  contextEditButton.classList.toggle("hidden", !hasPermission("edit"));
  contextDeleteButton.classList.toggle("hidden", !hasPermission("delete"));
  contextBanButton.classList.toggle("hidden", !hasPermission("ban"));
  contextUnbanButton.classList.toggle("hidden", !hasPermission("ban"));
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
  const cloudDeleted = await deleteCloudScoresByNames(scores.map((score) => score.name));
  state.selectedScoreKeys.clear();
  state.pendingDeletes = null;
  setSyncText(cloudDeleted ? `${scores.length} score${scores.length === 1 ? "" : "s"} deleted everywhere` : `${scores.length} score${scores.length === 1 ? "" : "s"} deleted locally`, false);
}

function banContextScore() {
  if (!hasPermission("ban")) return closeScoreContextMenu();
  const score = state.contextScore;
  if (!score) return;
  const targets = state.adminRank === "Owner" ? selectedScores() : [score];
  banPanel.dataset.targetKeys = JSON.stringify(targets.map(scoreKey));
  banCopy.textContent = `Choose how long to block ${targets.length} device${targets.length === 1 ? "" : "s"}.`;
  banDurationInput.value = "24";
  closeScoreContextMenu();
  setPanel(banPanel, true);
  banDurationInput.focus();
}

async function confirmBan() {
  const hours = Number.parseInt(banDurationInput.value, 10);
  if (!Number.isInteger(hours) || hours < 1 || hours > 8760) {
    banCopy.textContent = "Enter a duration from 1 to 8,760 hours.";
    return;
  }
  const targetKeys = JSON.parse(banPanel.dataset.targetKeys || "[]");
  const targets = Object.values(state.scores).flat().filter((score) => targetKeys.includes(scoreKey(score)));
  const durationMs = hours * 60 * 60 * 1000;
  const now = Date.now();
  const remoteExpiries = await Promise.all(targets.map((target) => getRemoteDeviceBan(target.deviceToken || state.deviceToken)));
  const expiries = targets.map((target, index) => {
    const token = target.deviceToken || state.deviceToken;
    const localExpiry = Number(state.bannedDevices[token] || 0);
    const existingExpiry = Math.max(localExpiry, remoteExpiries[index] || 0);
    const expiry = existingExpiry > now ? existingExpiry : now + durationMs;
    state.bannedDevices[token] = expiry;
    return { token, expiry, alreadyBanned: existingExpiry > now };
  });
  localStorage.setItem(BANNED_DEVICES_KEY, JSON.stringify(state.bannedDevices));
  const remoteResults = await Promise.all(expiries.map((entry) => entry.alreadyBanned || banDeviceRemotely(entry.token, hours * 60)));
  const names = [...new Set(targets.map((target) => target.name))];
  Object.keys(state.scores).forEach((mode) => { state.scores[mode] = (state.scores[mode] || []).filter((score) => !names.includes(score.name)); });
  saveLocal();
  renderScores();
  const scoresRemoved = await deleteCloudScoresByNames(names);
  updateBanCountdown();
  setPanel(banPanel, false);
  const keptExisting = expiries.some((entry) => entry.alreadyBanned);
  setSyncText(remoteResults.every(Boolean) && scoresRemoved
    ? `${targets.length} device${targets.length === 1 ? "" : "s"} banned; scores removed${keptExisting ? " (existing timer kept)" : ` for ${hours} hour${hours === 1 ? "" : "s"}`}`
    : "Ban saved locally; run the device-ban SQL migrations to sync it", false);
}

async function unbanContextScore() {
  if (!hasPermission("ban")) return closeScoreContextMenu();
  const score = state.contextScore;
  if (!score) return;
  const targets = state.adminRank === "Owner" ? selectedScores() : [score];
  const remoteResults = await Promise.all(targets.map((target) => unbanDeviceRemotely(target.deviceToken || state.deviceToken)));
  targets.forEach((target) => { delete state.bannedDevices[target.deviceToken || state.deviceToken]; });
  localStorage.setItem(BANNED_DEVICES_KEY, JSON.stringify(state.bannedDevices));
  updateBanCountdown();
  closeScoreContextMenu();
  setSyncText(remoteResults.every(Boolean) ? `${targets.length} device${targets.length === 1 ? "" : "s"} unbanned` : "Device unbanned locally; run the SQL ban migration to sync it", false);
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
clearDatabaseButton.addEventListener("click", requestWipeDatabase);
adminPassword.addEventListener("input", () => { adminHint.textContent = "Password is hidden while you type."; adminHint.classList.remove("error"); });
$("cancelConfirmButton").addEventListener("click", () => { state.pendingDelete = null; state.pendingDeletes = null; state.pendingWipe = false; confirmNeverRow.classList.remove("hidden"); acceptConfirmButton.textContent = "Delete"; setPanel(confirmPanel, false); });
$("acceptConfirmButton").addEventListener("click", () => {
  if (state.pendingWipe) { wipeDatabase(); return; }
  if (confirmNever.checked && state.devMode) { state.skipDeleteConfirm = true; localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, "true"); }
  if (state.pendingDeletes?.length) deleteSelectedScores(state.pendingDeletes);
  else if (state.pendingDelete) deleteScore(state.pendingDelete);
});
$("closeEditButton").addEventListener("click", () => setPanel(editPanel, false));
$("cancelEditButton").addEventListener("click", () => setPanel(editPanel, false));
$("saveEditButton").addEventListener("click", saveEditedScore);
editName.addEventListener("input", () => { editName.value = cleanRunnerName(editName.value); });
editPoints.addEventListener("input", () => { editPoints.value = editPoints.value.replace(/\D/g, "").slice(0, 6); });
contextEditButton.addEventListener("click", () => { const score = state.contextScore; closeScoreContextMenu(); if (score && hasPermission("edit")) openEditScore(score); });
contextDeleteButton.addEventListener("click", () => requestDeleteScores(selectedScores()));
contextBanButton.addEventListener("click", banContextScore);
contextUnbanButton.addEventListener("click", unbanContextScore);
$("closeBanButton").addEventListener("click", () => setPanel(banPanel, false));
$("cancelBanButton").addEventListener("click", () => setPanel(banPanel, false));
$("confirmBanButton").addEventListener("click", confirmBan);

timerModal.addEventListener("click", (event) => { if (event.target === timerModal) closeTimer(); });
settingsPanel.addEventListener("click", (event) => { if (event.target === settingsPanel) setSettingsOpen(false); });
adminPanel.addEventListener("click", (event) => { if (event.target === adminPanel) setPanel(adminPanel, false); });
confirmPanel.addEventListener("click", (event) => { if (event.target === confirmPanel) setPanel(confirmPanel, false); });
editPanel.addEventListener("click", (event) => { if (event.target === editPanel) setPanel(editPanel, false); });
banPanel.addEventListener("click", (event) => { if (event.target === banPanel) setPanel(banPanel, false); });
document.addEventListener("click", (event) => { if (!scoreContextMenu.contains(event.target)) closeScoreContextMenu(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!settingsPanel.classList.contains("hidden")) setSettingsOpen(false);
    else if (!timerModal.classList.contains("hidden")) closeTimer();
    else if (!adminPanel.classList.contains("hidden")) setPanel(adminPanel, false);
    else if (!confirmPanel.classList.contains("hidden")) setPanel(confirmPanel, false);
    else if (!editPanel.classList.contains("hidden")) setPanel(editPanel, false);
    else if (!banPanel.classList.contains("hidden")) setPanel(banPanel, false);
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
updateAdminRank();
state.banCountdownTimer = window.setInterval(updateBanCountdown, 1000);
syncRemoteDeviceBan();
pullCloudScores();
