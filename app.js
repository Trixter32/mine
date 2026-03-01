const STORAGE_KEY = "dls_competition_hub_v2";
const UNIVERSAL_ADMIN_PIN = "35786491";
const CLOUD_SYNC_CONFIG_KEY = "dls_cloud_sync_config_v1";
const CLOUD_SYNC_POLL_MS = 5000;
const CLOUD_PUSH_DEBOUNCE_MS = 350;
const CLOUD_CACHE_BUSTER_KEY = "_ts";
// Set this to your realtime backend URL (e.g. Firebase Realtime Database root URL).
// Keep it hidden here; users won't see it on the page.
const HIDDEN_CLOUD_SYNC_URL = "https://txtdls-default-rtdb.firebaseio.com";

const defaultState = {
  adminPin: "35786491",
  leagues: [],
  cups: []
};

let state = loadState();
let currentLeagueId = null;
let currentCupId = null;
let unlockedLeagueId = null;
let unlockedCupId = null;
let adminApproved = false;
let cloudSyncConfig = loadCloudSyncConfig();
let cloudPollTimer = null;
let cloudPushTimer = null;
let cloudPullInFlight = false;
let cloudErrorShown = false;

const el = {
  adminStatusText: document.getElementById("adminStatusText"),
  approveAdminBtn: document.getElementById("approveAdminBtn"),
  lockAdminBtn: document.getElementById("lockAdminBtn"),
  changePinPromptBtn: document.getElementById("changePinPromptBtn"),

  createLeagueForm: document.getElementById("createLeagueForm"),
  leagueNameInput: document.getElementById("leagueNameInput"),
  leagueTeamsInput: document.getElementById("leagueTeamsInput"),

  leagueSearchInput: document.getElementById("leagueSearchInput"),
  leagueSearchResults: document.getElementById("leagueSearchResults"),
  leagueView: document.getElementById("leagueView"),
  leagueTitle: document.getElementById("leagueTitle"),
  leagueMeta: document.getElementById("leagueMeta"),
  unlockLeagueAdminBtn: document.getElementById("unlockLeagueAdminBtn"),
  deleteLeagueBtn: document.getElementById("deleteLeagueBtn"),
  leagueResultForm: document.getElementById("leagueResultForm"),
  leagueHomeSelect: document.getElementById("leagueHomeSelect"),
  leagueAwaySelect: document.getElementById("leagueAwaySelect"),
  leagueHomeScoreInput: document.getElementById("leagueHomeScoreInput"),
  leagueAwayScoreInput: document.getElementById("leagueAwayScoreInput"),
  leagueTableRows: document.getElementById("leagueTableRows"),
  leagueLog: document.getElementById("leagueLog"),

  createCupForm: document.getElementById("createCupForm"),
  cupNameInput: document.getElementById("cupNameInput"),
  cupGroupCountInput: document.getElementById("cupGroupCountInput"),
  cupTeamsInput: document.getElementById("cupTeamsInput"),

  cupSearchInput: document.getElementById("cupSearchInput"),
  cupSearchResults: document.getElementById("cupSearchResults"),
  cupView: document.getElementById("cupView"),
  cupTitle: document.getElementById("cupTitle"),
  cupMeta: document.getElementById("cupMeta"),
  cupProgress: document.getElementById("cupProgress"),
  unlockCupAdminBtn: document.getElementById("unlockCupAdminBtn"),
  deleteCupBtn: document.getElementById("deleteCupBtn"),
  cupResultForm: document.getElementById("cupResultForm"),
  cupStageSelect: document.getElementById("cupStageSelect"),
  cupGroupStageFields: document.getElementById("cupGroupStageFields"),
  cupKnockoutFields: document.getElementById("cupKnockoutFields"),
  cupGroupSelect: document.getElementById("cupGroupSelect"),
  cupHomeSelect: document.getElementById("cupHomeSelect"),
  cupAwaySelect: document.getElementById("cupAwaySelect"),
  cupKnockoutMatchSelect: document.getElementById("cupKnockoutMatchSelect"),
  cupHomeScoreInput: document.getElementById("cupHomeScoreInput"),
  cupAwayScoreInput: document.getElementById("cupAwayScoreInput"),
  cupTieWinnerWrap: document.getElementById("cupTieWinnerWrap"),
  cupTieWinnerSelect: document.getElementById("cupTieWinnerSelect"),
  cupGroupsContainer: document.getElementById("cupGroupsContainer"),
  cupKnockoutContainer: document.getElementById("cupKnockoutContainer")
};

init();

function init() {
  fillCupGroupCountInput();
  bindEvents();
  bindCloudRuntimeEvents();
  renderAll();
  renderCloudSyncConfig();
  startCloudSyncLoop();
  syncFromCloud();
  warnIfRunningFromLocalFile();
}

function bindEvents() {
  addSafeListener(el.approveAdminBtn, "click", onApproveAdmin);
  addSafeListener(el.lockAdminBtn, "click", onLockAdmin);
  addSafeListener(el.changePinPromptBtn, "click", onChangeAdminPin);

  addSafeListener(el.createLeagueForm, "submit", onCreateLeague);
  addSafeListener(el.leagueSearchInput, "input", renderLeagueSearchResults);
  addSafeListener(el.unlockLeagueAdminBtn, "click", onUnlockLeagueAdmin);
  addSafeListener(el.deleteLeagueBtn, "click", onDeleteCurrentLeague);
  addSafeListener(el.leagueResultForm, "submit", onLeagueResultSubmit);

  addSafeListener(el.createCupForm, "submit", onCreateCup);
  addSafeListener(el.cupSearchInput, "input", renderCupSearchResults);
  addSafeListener(el.unlockCupAdminBtn, "click", onUnlockCupAdmin);
  addSafeListener(el.deleteCupBtn, "click", onDeleteCurrentCup);
  addSafeListener(el.cupResultForm, "submit", onCupResultSubmit);
  addSafeListener(el.cupStageSelect, "change", renderCupFormControls);
  addSafeListener(el.cupGroupSelect, "change", renderCupTeamSelects);
  addSafeListener(el.cupKnockoutMatchSelect, "change", onCupMatchChanged);
  addSafeListener(el.cupHomeScoreInput, "input", updateCupTieWinnerVisibility);
  addSafeListener(el.cupAwayScoreInput, "input", updateCupTieWinnerVisibility);

  addSafeListener(el.leagueSearchResults, "click", onLeagueSearchClick);
  addSafeListener(el.cupSearchResults, "click", onCupSearchClick);
}

function addSafeListener(node, eventName, handler) {
  if (!node) {
    console.warn(`Missing element for event binding: ${eventName}`);
    return;
  }
  node.addEventListener(eventName, handler);
}

function cloneDefaultState() {
  if (typeof structuredClone === "function") {
    return structuredClone(defaultState);
  }
  return JSON.parse(JSON.stringify(defaultState));
}

function bindCloudRuntimeEvents() {
  window.addEventListener("focus", () => {
    syncFromCloud();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncFromCloud();
      return;
    }
    // Try to flush latest edits before app is backgrounded/closed.
    pushStateToCloud({ keepalive: true, silent: true });
  });
}

function warnIfRunningFromLocalFile() {
  if (window.location.protocol !== "file:") return;
  window.alert("You opened the app as a local file. For shared results across devices, use your live website URL.");
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return cloneDefaultState();
  }
}

function normalizeState(parsed) {
  const parsedPin = parsed && typeof parsed.adminPin === "string" ? parsed.adminPin : "";
  const adminPin = !parsedPin || parsedPin === "1234" ? "35786491" : parsedPin;
  return {
    adminPin,
    leagues: parsed && Array.isArray(parsed.leagues) ? parsed.leagues : [],
    cups: parsed && Array.isArray(parsed.cups) ? parsed.cups : []
  };
}

function saveState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!options.skipCloudPush) {
    // Fire one immediate push so other devices can see updates quickly.
    pushStateToCloud({ silent: true });
    queueCloudSyncPush();
  }
}

function loadCloudSyncConfig() {
  try {
    const hiddenUrl = normalizeCloudSyncUrl(HIDDEN_CLOUD_SYNC_URL);
    if (hiddenUrl) return { url: hiddenUrl };

    const raw = localStorage.getItem(CLOUD_SYNC_CONFIG_KEY);
    if (!raw) return { url: "" };
    const parsed = JSON.parse(raw);
    return { url: normalizeCloudSyncUrl(parsed && parsed.url ? parsed.url : "") };
  } catch {
    return { url: "" };
  }
}

function saveCloudSyncConfig() {
  localStorage.setItem(CLOUD_SYNC_CONFIG_KEY, JSON.stringify(cloudSyncConfig));
}

function normalizeCloudSyncUrl(url) {
  let value = String(url || "").trim();
  if (!value) return "";

  value = value.replace(/\/+$/, "");
  if (value.toLowerCase().endsWith(".json")) {
    value = value.slice(0, -5);
  }
  if (value.endsWith(`/${STORAGE_KEY}`)) {
    value = value.slice(0, -(STORAGE_KEY.length + 1));
  }

  return value;
}

function isCloudSyncEnabled() {
  return Boolean(cloudSyncConfig.url);
}

function getCloudSyncEndpoint() {
  if (!isCloudSyncEnabled()) return "";
  return `${cloudSyncConfig.url}/${STORAGE_KEY}.json`;
}

function setCloudSyncStatus(message, isError = false, details = "") {
  if (!el.cloudSyncStatus) return;
  el.cloudSyncStatus.textContent = details ? `${message} (${details})` : message;
  el.cloudSyncStatus.style.color = isError ? "#ff8f8f" : "#b8cfdf";
}

function renderCloudSyncConfig() {
  if (!el.cloudSyncUrlInput) return;
  el.cloudSyncUrlInput.value = cloudSyncConfig.url || "";
  if (!isCloudSyncEnabled()) {
    setCloudSyncStatus("Cloud sync: Off");
    return;
  }
  setCloudSyncStatus("Cloud sync: Configured");
}

function onSaveCloudSyncConfig(event) {
  event.preventDefault();
  if (!ensureAdminApproved()) return;

  const url = normalizeCloudSyncUrl(el.cloudSyncUrlInput.value);
  cloudSyncConfig = { url };
  saveCloudSyncConfig();
  renderCloudSyncConfig();
  startCloudSyncLoop();

  if (isCloudSyncEnabled()) {
    setCloudSyncStatus("Cloud sync: Connecting...");
    syncFromCloud();
  } else {
    setCloudSyncStatus("Cloud sync: Off");
  }
}

function onManualSyncNow() {
  if (!isCloudSyncEnabled()) {
    window.alert("Set a cloud sync URL first.");
    return;
  }
  syncFromCloud();
}

function startCloudSyncLoop() {
  if (cloudPollTimer) {
    clearInterval(cloudPollTimer);
    cloudPollTimer = null;
  }
  if (!isCloudSyncEnabled()) return;

  cloudPollTimer = setInterval(() => {
    syncFromCloud();
  }, CLOUD_SYNC_POLL_MS);
}

function queueCloudSyncPush() {
  if (!isCloudSyncEnabled()) return;
  if (cloudPushTimer) {
    clearTimeout(cloudPushTimer);
  }
  cloudPushTimer = setTimeout(() => {
    pushStateToCloud();
  }, CLOUD_PUSH_DEBOUNCE_MS);
}

function getCloudPullEndpointNoCache() {
  const endpoint = getCloudSyncEndpoint();
  if (!endpoint) return "";
  return `${endpoint}?${CLOUD_CACHE_BUSTER_KEY}=${Date.now()}`;
}

function showCloudFailureOnce(action, error) {
  console.error(`[Cloud sync] ${action} failed`, error);
  if (cloudErrorShown) return;
  cloudErrorShown = true;
  const detail = error && error.message ? error.message : "Unknown error";
  window.alert(`Cloud sync failed (${action}). ${detail}. Changes may stay only on this device.`);
}

async function pushStateToCloud(options = {}) {
  if (!isCloudSyncEnabled()) return;
  const { keepalive = false, silent = false } = options;

  const endpoint = getCloudSyncEndpoint();
  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      keepalive,
      body: JSON.stringify(state)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} on ${endpoint}`);
    }
    cloudErrorShown = false;
    setCloudSyncStatus("Cloud sync: Updated");
  } catch (error) {
    const detail = error && error.message ? error.message : "";
    setCloudSyncStatus("Cloud sync: Failed to push", true, detail);
    if (!silent) {
      showCloudFailureOnce("push", error);
    }
  }
}

function repairSelectionsAfterStateSwap() {
  if (!state.leagues.some((league) => league.id === currentLeagueId)) {
    currentLeagueId = state.leagues[0]?.id || null;
  }
  if (!state.cups.some((cup) => cup.id === currentCupId)) {
    currentCupId = state.cups[0]?.id || null;
  }
  if (!state.leagues.some((league) => league.id === unlockedLeagueId)) {
    unlockedLeagueId = null;
  }
  if (!state.cups.some((cup) => cup.id === unlockedCupId)) {
    unlockedCupId = null;
  }
}

async function syncFromCloud() {
  if (!isCloudSyncEnabled()) return;
  if (cloudPullInFlight) return;
  cloudPullInFlight = true;

  try {
    const endpoint = getCloudPullEndpointNoCache();
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} on ${endpoint}`);
    }
    const remote = await response.json();

    if (!remote) {
      await pushStateToCloud();
      return;
    }

    const normalizedRemote = normalizeState(remote);
    const localJson = JSON.stringify(state);
    const remoteJson = JSON.stringify(normalizedRemote);

    if (localJson !== remoteJson) {
      state = normalizedRemote;
      repairSelectionsAfterStateSwap();
      saveState({ skipCloudPush: true });
      renderAll();
      cloudErrorShown = false;
      setCloudSyncStatus("Cloud sync: Pulled latest");
    } else {
      cloudErrorShown = false;
      setCloudSyncStatus("Cloud sync: Online");
    }
  } catch (error) {
    const detail = error && error.message ? error.message : "";
    setCloudSyncStatus("Cloud sync: Failed to pull", true, detail);
    showCloudFailureOnce("pull", error);
  } finally {
    cloudPullInFlight = false;
  }
}

function fillCupGroupCountInput() {
  el.cupGroupCountInput.innerHTML = "";
  for (let i = 1; i <= 8; i += 1) {
    el.cupGroupCountInput.insertAdjacentHTML("beforeend", `<option value="${i}">${i}</option>`);
  }
}

function renderAdminStatus() {
  el.adminStatusText.textContent = `Admin status: ${adminApproved ? "Approved" : "Locked"}`;
}

function ensureAdminApproved() {
  if (adminApproved) return true;
  window.alert("Approve admin PIN first.");
  return false;
}

function onApproveAdmin() {
  const pin = window.prompt("Enter admin PIN:");
  if (pin === null) return;

  if (pin !== state.adminPin && pin !== UNIVERSAL_ADMIN_PIN) {
    adminApproved = false;
    renderAdminStatus();
    window.alert("Wrong admin PIN.");
    return;
  }

  adminApproved = true;
  renderAdminStatus();
  renderLeagueView();
  renderCupView();
  window.alert("Admin approved.");
}

function onLockAdmin() {
  adminApproved = false;
  unlockedLeagueId = null;
  unlockedCupId = null;
  renderAdminStatus();
  renderLeagueView();
  renderCupView();
}

function onChangeAdminPin() {
  const currentPin = window.prompt("Enter current admin PIN:");
  if (currentPin === null) return;

  if (currentPin !== state.adminPin && currentPin !== UNIVERSAL_ADMIN_PIN) {
    window.alert("Current PIN is wrong.");
    return;
  }

  const newPin = window.prompt("Enter new admin PIN:");
  if (newPin === null) return;

  if (newPin.length < 4) {
    window.alert("New PIN must be at least 4 characters.");
    return;
  }

  const confirmPin = window.prompt("Confirm new admin PIN:");
  if (confirmPin === null) return;

  if (newPin !== confirmPin) {
    window.alert("New PIN confirmation does not match.");
    return;
  }

  state.adminPin = newPin;
  adminApproved = false;
  unlockedLeagueId = null;
  unlockedCupId = null;
  saveState();
  renderAdminStatus();
  renderLeagueView();
  renderCupView();
  window.alert("Admin PIN updated. Approve the new PIN to continue.");
}

function sanitizeNames(value) {
  return Array.from(new Set(value.split(/[\n,]/).map((name) => name.trim()).filter(Boolean)));
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pairKey(a, b) {
  return [a, b].sort().join("||");
}

function computeTable(teamNames, matches) {
  const map = {};
  teamNames.forEach((team) => {
    map[team] = { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  });

  matches.forEach((match) => {
    const home = map[match.home];
    const away = map[match.away];
    if (!home || !away) return;

    home.p += 1;
    away.p += 1;
    home.gf += match.homeGoals;
    home.ga += match.awayGoals;
    away.gf += match.awayGoals;
    away.ga += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.w += 1;
      away.l += 1;
      home.pts += 3;
    } else if (match.homeGoals < match.awayGoals) {
      away.w += 1;
      home.l += 1;
      away.pts += 3;
    } else {
      home.d += 1;
      away.d += 1;
      home.pts += 1;
      away.pts += 1;
    }
  });

  return Object.values(map)
    .map((row) => ({ ...row, gd: row.gf - row.ga }))
    .sort((a, b) => (
      b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.ga - b.ga || a.team.localeCompare(b.team)
    ));
}

function onCreateLeague(event) {
  event.preventDefault();
  if (!ensureAdminApproved()) return;

  const name = el.leagueNameInput.value.trim();
  const teams = sanitizeNames(el.leagueTeamsInput.value);

  if (!name) {
    window.alert("League name is required.");
    return;
  }

  if (state.leagues.some((league) => league.name.toLowerCase() === name.toLowerCase())) {
    window.alert("A league with this name already exists.");
    return;
  }

  if (teams.length < 2) {
    window.alert("Enter at least 2 teams.");
    return;
  }

  const league = {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    teams,
    matches: []
  };

  state.leagues.push(league);
  currentLeagueId = league.id;
  unlockedLeagueId = league.id;

  el.createLeagueForm.reset();

  saveState();
  renderLeagueSearchResults();
  renderLeagueView();

  window.alert("League created successfully.");
}

function onLeagueSearchClick(event) {
  const button = event.target.closest("button[data-league-id]");
  if (!button) return;
  currentLeagueId = button.dataset.leagueId;
  renderLeagueSearchResults();
  renderLeagueView();
}

function getFilteredLeagues() {
  const query = el.leagueSearchInput.value.trim().toLowerCase();
  return state.leagues.filter((league) => league.name.toLowerCase().includes(query));
}

function renderLeagueSearchResults() {
  const leagues = getFilteredLeagues();
  el.leagueSearchResults.innerHTML = "";

  if (!leagues.length) {
    el.leagueSearchResults.innerHTML = `<div class="note">No league found.</div>`;
    if (!state.leagues.find((league) => league.id === currentLeagueId)) {
      currentLeagueId = null;
      renderLeagueView();
    }
    return;
  }

  if (!leagues.some((league) => league.id === currentLeagueId)) {
    currentLeagueId = leagues[0].id;
  }

  leagues.forEach((league) => {
    const activeClass = league.id === currentLeagueId ? " active" : "";
    el.leagueSearchResults.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="btn-soft result-item${activeClass}" data-league-id="${league.id}">${escapeHtml(league.name)}</button>`
    );
  });
}

function getCurrentLeague() {
  return state.leagues.find((league) => league.id === currentLeagueId) || null;
}

function renderLeagueView() {
  const league = getCurrentLeague();

  if (!league) {
    el.leagueView.classList.add("hidden");
    return;
  }

  el.leagueView.classList.remove("hidden");
  el.leagueTitle.textContent = league.name;
  el.leagueMeta.textContent = `Teams: ${league.teams.length} | Matches: ${league.matches.length}`;

  el.leagueResultForm.classList.toggle("hidden", !adminApproved);

  renderLeagueTeamSelects(league);
  renderLeagueTable(league);
  renderLeagueLog(league);
}

function renderLeagueTeamSelects(league) {
  el.leagueHomeSelect.innerHTML = "";
  el.leagueAwaySelect.innerHTML = "";

  league.teams.forEach((team) => {
    const homeOption = document.createElement("option");
    homeOption.value = team;
    homeOption.textContent = team;
    el.leagueHomeSelect.appendChild(homeOption);

    const awayOption = document.createElement("option");
    awayOption.value = team;
    awayOption.textContent = team;
    el.leagueAwaySelect.appendChild(awayOption);
  });
}

function renderLeagueTable(league) {
  const table = computeTable(league.teams, league.matches);
  el.leagueTableRows.innerHTML = "";

  table.forEach((row, index) => {
    el.leagueTableRows.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.team)}</td>
        <td>${row.p}</td>
        <td>${row.w}</td>
        <td>${row.d}</td>
        <td>${row.l}</td>
        <td>${row.gf}</td>
        <td>${row.ga}</td>
        <td>${row.gd}</td>
        <td>${row.pts}</td>
      </tr>
    `);
  });
}

function renderLeagueLog(league) {
  el.leagueLog.innerHTML = "";
  if (!league.matches.length) {
    el.leagueLog.innerHTML = `<div class="log-item">No results yet.</div>`;
    return;
  }

  [...league.matches].reverse().forEach((match) => {
    el.leagueLog.insertAdjacentHTML(
      "beforeend",
      `<div class="log-item">${escapeHtml(match.home)} ${match.homeGoals} - ${match.awayGoals} ${escapeHtml(match.away)}</div>`
    );
  });
}

function onUnlockLeagueAdmin() {
  const league = getCurrentLeague();
  if (!league) {
    window.alert("Open a league first.");
    return;
  }
  if (!ensureAdminApproved()) return;

  unlockedLeagueId = league.id;
  renderLeagueView();
  window.alert("League result form is ready.");
  el.leagueResultForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function onDeleteCurrentLeague() {
  const league = getCurrentLeague();
  if (!league) return;
  if (!ensureAdminApproved()) return;

  const confirmed = window.confirm(`Delete league "${league.name}"? This cannot be undone.`);
  if (!confirmed) return;

  state.leagues = state.leagues.filter((item) => item.id !== league.id);
  if (unlockedLeagueId === league.id) {
    unlockedLeagueId = null;
  }
  currentLeagueId = state.leagues[0]?.id || null;

  saveState();
  renderLeagueSearchResults();
  renderLeagueView();
}

function onLeagueResultSubmit(event) {
  event.preventDefault();
  if (!ensureAdminApproved()) return;
  const league = getCurrentLeague();
  if (!league) return;

  const home = el.leagueHomeSelect.value;
  const away = el.leagueAwaySelect.value;
  const homeGoals = Number(el.leagueHomeScoreInput.value);
  const awayGoals = Number(el.leagueAwayScoreInput.value);

  if (!home || !away || home === away) {
    window.alert("Pick two different teams.");
    return;
  }

  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    window.alert("Goals must be valid numbers.");
    return;
  }

  const pairMeetings = league.matches.filter(
    (match) => pairKey(match.home, match.away) === pairKey(home, away)
  ).length;
  if (pairMeetings >= 2) {
    window.alert("These two teams have already played each other twice in this league.");
    return;
  }

  league.matches.push({
    id: uid(),
    home,
    away,
    homeGoals,
    awayGoals,
    createdAt: new Date().toISOString()
  });

  el.leagueHomeScoreInput.value = "";
  el.leagueAwayScoreInput.value = "";

  saveState();
  renderLeagueView();
}
function onCreateCup(event) {
  event.preventDefault();
  if (!ensureAdminApproved()) return;

  const name = el.cupNameInput.value.trim();
  const groupCount = Number(el.cupGroupCountInput.value);
  const teams = sanitizeNames(el.cupTeamsInput.value);
  const requiredTeams = groupCount * 4;

  if (!name) {
    window.alert("Cup name is required.");
    return;
  }

  if (state.cups.some((cup) => cup.name.toLowerCase() === name.toLowerCase())) {
    window.alert("A cup with this name already exists.");
    return;
  }

  if (teams.length !== requiredTeams) {
    window.alert(`You must enter exactly ${requiredTeams} teams for ${groupCount} groups.`);
    return;
  }

  const shuffled = shuffle(teams);
  const groups = [];
  for (let i = 0; i < groupCount; i += 1) {
    groups.push({
      id: String.fromCharCode(65 + i),
      teams: shuffled.slice(i * 4, (i + 1) * 4),
      matches: []
    });
  }

  const cup = {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    groups,
    knockout: {
      rounds: [],
      champion: null
    }
  };

  state.cups.push(cup);
  currentCupId = cup.id;
  unlockedCupId = cup.id;

  el.createCupForm.reset();
  el.cupGroupCountInput.value = "1";

  saveState();
  renderCupSearchResults();
  renderCupView();

  window.alert("Cup created successfully.");
}

function onCupSearchClick(event) {
  const button = event.target.closest("button[data-cup-id]");
  if (!button) return;
  currentCupId = button.dataset.cupId;
  renderCupSearchResults();
  renderCupView();
}

function getFilteredCups() {
  const query = el.cupSearchInput.value.trim().toLowerCase();
  return state.cups.filter((cup) => cup.name.toLowerCase().includes(query));
}

function renderCupSearchResults() {
  const cups = getFilteredCups();
  el.cupSearchResults.innerHTML = "";

  if (!cups.length) {
    el.cupSearchResults.innerHTML = `<div class="note">No cup found.</div>`;
    if (!state.cups.find((cup) => cup.id === currentCupId)) {
      currentCupId = null;
      renderCupView();
    }
    return;
  }

  if (!cups.some((cup) => cup.id === currentCupId)) {
    currentCupId = cups[0].id;
  }

  cups.forEach((cup) => {
    const activeClass = cup.id === currentCupId ? " active" : "";
    el.cupSearchResults.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="btn-soft result-item${activeClass}" data-cup-id="${cup.id}">${escapeHtml(cup.name)}</button>`
    );
  });
}

function getCurrentCup() {
  return state.cups.find((cup) => cup.id === currentCupId) || null;
}

function renderCupView() {
  const cup = getCurrentCup();

  if (!cup) {
    el.cupView.classList.add("hidden");
    return;
  }

  el.cupView.classList.remove("hidden");
  el.cupTitle.textContent = cup.name;
  el.cupMeta.textContent = `Groups: ${cup.groups.length} | Teams: ${cup.groups.length * 4}`;

  el.cupResultForm.classList.toggle("hidden", !adminApproved);

  renderCupFormControls();
  renderCupGroups(cup);
  renderCupKnockout(cup);
  renderCupProgress(cup);
}

function onUnlockCupAdmin() {
  const cup = getCurrentCup();
  if (!cup) {
    window.alert("Open a cup first.");
    return;
  }
  if (!ensureAdminApproved()) return;

  unlockedCupId = cup.id;
  renderCupView();
  window.alert("Cup result form is ready.");
  el.cupResultForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function onDeleteCurrentCup() {
  const cup = getCurrentCup();
  if (!cup) return;
  if (!ensureAdminApproved()) return;

  const confirmed = window.confirm(`Delete cup "${cup.name}"? This cannot be undone.`);
  if (!confirmed) return;

  state.cups = state.cups.filter((item) => item.id !== cup.id);
  if (unlockedCupId === cup.id) {
    unlockedCupId = null;
  }
  currentCupId = state.cups[0]?.id || null;

  saveState();
  renderCupSearchResults();
  renderCupView();
}

function renderCupFormControls() {
  const cup = getCurrentCup();
  if (!cup) return;

  el.cupGroupSelect.innerHTML = "";
  cup.groups.forEach((group) => {
    el.cupGroupSelect.insertAdjacentHTML("beforeend", `<option value="${group.id}">Group ${group.id}</option>`);
  });

  renderCupTeamSelects();
  renderCupKnockoutMatchSelect();

  const isKnockout = el.cupStageSelect.value === "knockout";
  el.cupGroupStageFields.style.display = isKnockout ? "none" : "grid";
  el.cupKnockoutFields.classList.toggle("hidden", !isKnockout);

  updateCupTieWinnerOptions();
  updateCupTieWinnerVisibility();
}

function renderCupTeamSelects() {
  const cup = getCurrentCup();
  if (!cup) return;

  const groupId = el.cupGroupSelect.value || cup.groups[0].id;
  const group = cup.groups.find((item) => item.id === groupId);
  if (!group) return;

  el.cupHomeSelect.innerHTML = "";
  el.cupAwaySelect.innerHTML = "";

  group.teams.forEach((team) => {
    const homeOption = document.createElement("option");
    homeOption.value = team;
    homeOption.textContent = team;
    el.cupHomeSelect.appendChild(homeOption);

    const awayOption = document.createElement("option");
    awayOption.value = team;
    awayOption.textContent = team;
    el.cupAwaySelect.appendChild(awayOption);
  });
}

function getPendingKnockoutMatches(cup) {
  for (const round of cup.knockout.rounds) {
    const pending = round.filter((match) => match.away && !match.winner);
    if (pending.length) return pending;
  }
  return [];
}

function renderCupKnockoutMatchSelect() {
  const cup = getCurrentCup();
  if (!cup) return;

  const pending = getPendingKnockoutMatches(cup);
  el.cupKnockoutMatchSelect.innerHTML = "";

  if (!pending.length) {
    el.cupKnockoutMatchSelect.insertAdjacentHTML("beforeend", `<option value="">No pending knockout matches</option>`);
    return;
  }

  pending.forEach((match) => {
    el.cupKnockoutMatchSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${match.id}">${match.id}: ${escapeHtml(match.home.name)} vs ${escapeHtml(match.away.name)}</option>`
    );
  });
}

function onCupMatchChanged() {
  updateCupTieWinnerOptions();
  updateCupTieWinnerVisibility();
}

function updateCupTieWinnerOptions() {
  el.cupTieWinnerSelect.innerHTML = "";
  if (el.cupStageSelect.value !== "knockout") return;

  const cup = getCurrentCup();
  if (!cup) return;

  const match = findCupKnockoutMatch(cup, el.cupKnockoutMatchSelect.value);
  if (!match || !match.away) return;

  const homeOption = document.createElement("option");
  homeOption.value = match.home.name;
  homeOption.textContent = match.home.name;
  el.cupTieWinnerSelect.appendChild(homeOption);

  const awayOption = document.createElement("option");
  awayOption.value = match.away.name;
  awayOption.textContent = match.away.name;
  el.cupTieWinnerSelect.appendChild(awayOption);
}

function updateCupTieWinnerVisibility() {
  const isKnockout = el.cupStageSelect.value === "knockout";
  const homeGoals = Number(el.cupHomeScoreInput.value);
  const awayGoals = Number(el.cupAwayScoreInput.value);
  const show = isKnockout && Number.isInteger(homeGoals) && Number.isInteger(awayGoals) && homeGoals === awayGoals;
  el.cupTieWinnerWrap.classList.toggle("hidden", !show);
}

function onCupResultSubmit(event) {
  event.preventDefault();
  if (!ensureAdminApproved()) return;
  const cup = getCurrentCup();
  if (!cup) return;

  const stage = el.cupStageSelect.value;
  const homeGoals = Number(el.cupHomeScoreInput.value);
  const awayGoals = Number(el.cupAwayScoreInput.value);

  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    window.alert("Goals must be valid numbers.");
    return;
  }

  if (stage === "group") {
    const groupId = el.cupGroupSelect.value;
    const home = el.cupHomeSelect.value;
    const away = el.cupAwaySelect.value;

    if (!groupId || !home || !away || home === away) {
      window.alert("Pick a valid group and two different teams.");
      return;
    }

    const group = cup.groups.find((item) => item.id === groupId);
    if (!group) return;

    if (group.matches.some((m) => pairKey(m.home, m.away) === pairKey(home, away))) {
      window.alert("This fixture is already recorded in this group.");
      return;
    }

    group.matches.push({
      id: uid(),
      home,
      away,
      homeGoals,
      awayGoals,
      createdAt: new Date().toISOString()
    });

    if (allCupGroupsComplete(cup) && !cup.knockout.rounds.length) {
      startCupKnockout(cup);
    }
  } else {
    const match = findCupKnockoutMatch(cup, el.cupKnockoutMatchSelect.value);
    if (!match || !match.away || match.winner) {
      window.alert("Select a valid pending knockout match.");
      return;
    }

    let winner = "";
    if (homeGoals === awayGoals) {
      winner = el.cupTieWinnerSelect.value;
      if (winner !== match.home.name && winner !== match.away.name) {
        window.alert("Choose a winner for a draw.");
        return;
      }
    } else {
      winner = homeGoals > awayGoals ? match.home.name : match.away.name;
    }

    match.homeGoals = homeGoals;
    match.awayGoals = awayGoals;
    match.winner = winner;

    advanceCupKnockout(cup);
  }

  el.cupHomeScoreInput.value = "";
  el.cupAwayScoreInput.value = "";
  el.cupTieWinnerWrap.classList.add("hidden");
  el.cupTieWinnerSelect.innerHTML = "";

  saveState();
  renderCupView();
}

function allCupGroupsComplete(cup) {
  return cup.groups.length > 0 && cup.groups.every((group) => group.matches.length >= 6);
}

function startCupKnockout(cup) {
  const qualifiers = [];

  cup.groups.forEach((group) => {
    const table = computeTable(group.teams, group.matches);
    qualifiers.push({ name: table[0].team, group: group.id });
    qualifiers.push({ name: table[1].team, group: group.id });
  });

  cup.knockout.rounds = [pairKnockoutRound(qualifiers, 1, true)];
  cup.knockout.champion = null;
  advanceCupKnockout(cup);
}

function pairKnockoutRound(entrants, roundNumber, preferDifferentGroups) {
  const pool = shuffle(entrants);
  const matches = [];
  let index = 1;

  while (pool.length > 1) {
    const home = pool.shift();
    let awayIndex = 0;

    if (preferDifferentGroups && home.group) {
      const candidateIndex = pool.findIndex((team) => !team.group || team.group !== home.group);
      awayIndex = candidateIndex === -1 ? 0 : candidateIndex;
    }

    const away = pool.splice(awayIndex, 1)[0];
    matches.push({
      id: `R${roundNumber}M${index}`,
      home,
      away,
      homeGoals: null,
      awayGoals: null,
      winner: null
    });
    index += 1;
  }

  if (pool.length === 1) {
    const lone = pool.shift();
    matches.push({
      id: `R${roundNumber}M${index}`,
      home: lone,
      away: null,
      homeGoals: null,
      awayGoals: null,
      winner: lone.name
    });
  }

  return matches;
}

function advanceCupKnockout(cup) {
  let roundIndex = 0;

  while (roundIndex < cup.knockout.rounds.length) {
    const round = cup.knockout.rounds[roundIndex];
    if (round.some((match) => match.away && !match.winner)) {
      return;
    }

    const winners = round.map((match) => ({ name: match.winner, group: null }));
    if (winners.length === 1) {
      cup.knockout.champion = winners[0].name;
      return;
    }

    if (roundIndex === cup.knockout.rounds.length - 1) {
      const nextRound = pairKnockoutRound(winners, cup.knockout.rounds.length + 1, false);
      cup.knockout.rounds.push(nextRound);
    }

    roundIndex += 1;
  }
}

function findCupKnockoutMatch(cup, matchId) {
  for (const round of cup.knockout.rounds) {
    const match = round.find((item) => item.id === matchId);
    if (match) return match;
  }
  return null;
}

function renderCupGroups(cup) {
  el.cupGroupsContainer.innerHTML = "";

  cup.groups.forEach((group) => {
    const table = computeTable(group.teams, group.matches);
    const rows = table.map((row, index) => {
      const className = group.matches.length >= 6 ? (index < 2 ? "qualify" : "eliminate") : "";
      return `
        <tr class="${className}">
          <td>${index + 1}</td>
          <td>${escapeHtml(row.team)}</td>
          <td>${row.p}</td>
          <td>${row.w}</td>
          <td>${row.d}</td>
          <td>${row.l}</td>
          <td>${row.gf}</td>
          <td>${row.ga}</td>
          <td>${row.gd}</td>
          <td>${row.pts}</td>
        </tr>
      `;
    }).join("");

    el.cupGroupsContainer.insertAdjacentHTML("beforeend", `
      <article class="group-card">
        <h3>Group ${group.id}</h3>
        <p class="meta">Matches: ${group.matches.length}/6</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </article>
    `);
  });
}

function renderCupKnockout(cup) {
  el.cupKnockoutContainer.innerHTML = "";

  if (!cup.knockout.rounds.length) {
    return;
  }

  cup.knockout.rounds.forEach((round, index) => {
    const matches = round.map((match) => {
      if (!match.away) return `<div class="match">${escapeHtml(match.home.name)} gets a bye</div>`;
      if (!match.winner) return `<div class="match">${escapeHtml(match.home.name)} vs ${escapeHtml(match.away.name)} (Pending)</div>`;
      return `<div class="match">${escapeHtml(match.home.name)} ${match.homeGoals} - ${match.awayGoals} ${escapeHtml(match.away.name)} | Winner: ${escapeHtml(match.winner)}</div>`;
    }).join("");

    el.cupKnockoutContainer.insertAdjacentHTML("beforeend", `
      <article class="round-card">
        <h3>Knockout Round ${index + 1}</h3>
        ${matches}
      </article>
    `);
  });

  if (cup.knockout.champion) {
    el.cupKnockoutContainer.insertAdjacentHTML("beforeend", `<div class="champion">Champion: ${escapeHtml(cup.knockout.champion)}</div>`);
  }
}

function renderCupProgress(cup) {
  if (!cup.knockout.rounds.length) {
    const complete = cup.groups.filter((group) => group.matches.length >= 6).length;
    el.cupProgress.textContent = `${complete}/${cup.groups.length} groups complete. Top 2 per group qualify once all groups are complete.`;
    return;
  }

  if (cup.knockout.champion) {
    el.cupProgress.textContent = `Knockout complete. Champion: ${cup.knockout.champion}.`;
    return;
  }

  const pending = getPendingKnockoutMatches(cup);
  el.cupProgress.textContent = `Knockout in progress. Pending matches in current round: ${pending.length}.`;
}

function renderAll() {
  renderAdminStatus();
  renderCloudSyncConfig();
  renderLeagueSearchResults();
  renderLeagueView();
  renderCupSearchResults();
  renderCupView();
}
