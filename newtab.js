import { quotes, backgroundImages } from "./lib/constants.js";
import { setRandomBackground } from "./lib/appearance.js";
import { onButtonClick, updateTimerDisplay } from "./lib/timer.js";
import { updateClock } from "./lib/clock.js";
import { addToDo, updateTodoList } from "./lib/todo.js";
import { applyBackgroundFromSettings } from "./lib/appearance.js";
import { saveSettings } from "./lib/settings.js";
let interval;
let state = {
  enabled: false,
  timerEnd: null,
  activeList: "Default",
  lists: {
  Default: []
},

  todos: { Default: [] },
  pomodoroMode: false,
  pomodoroWork: 25,
  pomodoroBreak: 5,
  pomodoroLongBreak: 15,
  currentCycle: 0,
  pomodoroCount: 0,
  paused: false,
  pausedRemaining: null, // ms
};

function updateState() {
  chrome.runtime.sendMessage({ type: "getState" }, (response) => {
    if (!response) {
      console.warn("getState returned no response", chrome.runtime.lastError);
      return;
    }
    state = { ...state, ...response };
    updateUI();
  });
}

// Helper: normalize input to a hostname (try to accept full URLs or plain domains)
function normalizeDomain(input) {
  try {
    // If input already looks like a domain without scheme, try adding https
    if (!/^[a-zA-Z]+:\/\//.test(input)) {
      input = 'https://' + input;
    }
    const u = new URL(input);
    return u.hostname;
  } catch (e) {
    return null;
  }
}

// Render the domain list editor in settings
function renderListEditor() {
  const container = document.getElementById('settingsDomainList');
  if (!container) return;
  container.innerHTML = '';
  const entries = (state.lists && state.lists[state.activeList]) || [];
  entries.forEach((entry, idx) => {
    const url = (entry && (entry.url || entry.domain)) || String(entry || '');
    const requireFlag = entry && (entry.requireChallenge || entry.requireChallenge === true || entry.challengeRequired || false);
    const li = document.createElement('li');
    li.className = 'whitelist-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!requireFlag;
    cb.dataset.index = idx;
    cb.onchange = (e) => {
      const i = Number(e.target.dataset.index);
      const listName = document.getElementById('listSelect').value || state.activeList;
      const newLists = { ...state.lists };
      const arr = (newLists[listName] || []).slice();
      arr[i] = arr[i] || {};
      arr[i].requireChallenge = !!e.target.checked;
      newLists[listName] = arr;
      chrome.storage.sync.set({ lists: newLists }, () => updateState());
    };

    const span = document.createElement('span');
    span.textContent = url;
    span.className = 'whitelist-url';

    const del = document.createElement('button');
    del.textContent = 'Remove';
    del.className = 'btn-delete';
    del.dataset.index = idx;
    del.onclick = (e) => {
      const i = Number(e.target.dataset.index);
      const listName = document.getElementById('listSelect').value || state.activeList;
      const newLists = { ...state.lists };
      const arr = (newLists[listName] || []).slice();
      arr.splice(i, 1);
      newLists[listName] = arr;
      chrome.storage.sync.set({ lists: newLists }, () => updateState());
    };

    li.append(cb, span, del);
    container.appendChild(li);
  });
}

function updateUI() {
  // Whitelist
  document.getElementById("activeListName").textContent = state.activeList;
  const domainList = document.getElementById("domainList");
  domainList.innerHTML = "";
  (state.lists[state.activeList] || []).forEach((domain) => {
    const li = document.createElement("li");
    const url = typeof domain === 'string' ? domain : (domain.url || domain.domain || '');
    li.textContent = url;
    domainList.appendChild(li);
  });

  // Todo header
  document.getElementById("todoListName").textContent = state.activeList;
  updateTodoList(state, updateState);

  // Settings: lists
  const listSelect = document.getElementById("listSelect");
  listSelect.innerHTML = "";
  Object.keys(state.lists).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === state.activeList) option.selected = true;
    listSelect.appendChild(option);
  });

  // Render the list editor (URLs + checkboxes)
  renderListEditor();

  // Settings: Pomodoro
  document.getElementById("pomodoroToggle").checked = state.pomodoroMode;
  document
    .getElementById("pomodoroOptions")
    .classList.toggle("hidden", !state.pomodoroMode);
  document.getElementById("pomodoroWork").value = state.pomodoroWork;
  document.getElementById("pomodoroBreak").value = state.pomodoroBreak;
  document.getElementById("pomodoroLongBreak").value = state.pomodoroLongBreak;
  // In updateUI(), after you handle pomodoro fields
chrome.storage.sync.get(["enableMathChallenge"], (data) => {
  const challengeToggle = document.getElementById("enableMathChallenge");
  if (!challengeToggle) return;
  challengeToggle.checked = !!data.enableMathChallenge;
});


  // Timer input default (for non‑Pomodoro)
  if (!state.pomodoroMode) {
    const timerInput = document.getElementById("timerInput");
    if (timerInput && !timerInput.value) {
      timerInput.value = 25;
    }
  }

  // Timer display + button text
  updateTimerDisplay(state);
  const btn = document.getElementById("startButton");
  if (btn) {
    if (state.enabled) btn.textContent = "Pause";
    else if (state.paused && state.pausedRemaining > 0) btn.textContent = "Resume";
    else btn.textContent = "Start";
  }

  // Quote
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  document.getElementById("quoteText").textContent = `"${randomQuote.text}"`;
  document.getElementById("quoteAuthor").textContent = randomQuote.author
    ? `— ${randomQuote.author}`
    : "";
    
}






document.addEventListener("DOMContentLoaded", () => {
  setRandomBackground();
  applyBackgroundFromSettings();  // replaces setRandomBackground()
  updateState();

  interval = setInterval(() => {
    
    updateTimerDisplay(state);
    updateClock(state, updateState);
  }, 1000);

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "stateUpdate") {
      updateState();
    }
  });

  // Start / Pause / Resume button
  document.getElementById("startButton").onclick = () => {
    onButtonClick(state, updateState);
  };

  // Add todo
  document.getElementById("addTodoButton").onclick = () => {
    addToDo(updateState);
  };

  document.getElementById("newTodoInput").onkeypress = (e) => {
    if (e.key === "Enter") {
      document.getElementById("addTodoButton").click();
    }
  };

  // Pomodoro toggle
  document.getElementById("pomodoroToggle").onchange = (e) => {
    document
      .getElementById("pomodoroOptions")
      .classList.toggle("hidden", !e.target.checked);
  };

  // Save settings
  document.getElementById("saveSettings").onclick = () => {
    saveSettings(updateState, applyBackgroundFromSettings);
  };


  // Change list from settings
  document.getElementById("listSelect").onchange = (e) => {
    chrome.storage.sync.set({ activeList: e.target.value }, () => {
      updateState();
    });
  };

  // Configure button toggles the list editor panel
  const cfgBtn = document.getElementById('configureListButton');
  if (cfgBtn) {
    cfgBtn.onclick = () => {
      const panel = document.getElementById('listEditorPanel');
      if (!panel) return;
      const isHidden = panel.classList.toggle('hidden');
      if (!isHidden) {
        // panel opened: focus name input
        const nameInput = document.getElementById('newListName');
        if (nameInput) nameInput.focus();
      }
    };
  }

  // List management controls
  document.getElementById('createList').onclick = () => {
    const name = document.getElementById('newListName').value.trim();
    if (!name) return alert('Please enter a list name');
    if (state.lists[name]) return alert('List already exists');
    const newLists = { ...state.lists, [name]: [] };
    chrome.storage.sync.set({ lists: newLists, activeList: name }, () => updateState());
  };

  document.getElementById('renameList').onclick = () => {
    const oldName = document.getElementById('listSelect').value;
    const newName = document.getElementById('newListName').value.trim();
    if (!newName) return alert('Please enter a new name');
    if (state.lists[newName]) return alert('A list with that name already exists');
    const newLists = { ...state.lists };
    newLists[newName] = newLists[oldName] || [];
    delete newLists[oldName];
    const newTodos = { ...(state.todos || {}) };
    if (newTodos[oldName]) {
      newTodos[newName] = newTodos[oldName];
      delete newTodos[oldName];
    }
    chrome.storage.sync.set({ lists: newLists, todos: newTodos, activeList: newName }, () => updateState());
  };

  document.getElementById('deleteList').onclick = () => {
    const name = document.getElementById('listSelect').value;
    if (!confirm(`Delete list "${name}"? This will remove its URLs and todos.`)) return;
    const newLists = { ...state.lists };
    delete newLists[name];
    const newTodos = { ...(state.todos || {}) };
    delete newTodos[name];
    // pick a fallback active list
    const remaining = Object.keys(newLists);
    const nextActive = remaining.length ? remaining[0] : 'Default';
    if (!newLists[nextActive]) newLists[nextActive] = [];
    chrome.storage.sync.set({ lists: newLists, todos: newTodos, activeList: nextActive }, () => updateState());
  };

  // Add URL to list
  document.getElementById('addListUrlButton').onclick = () => {
    const raw = document.getElementById('newListUrl').value.trim();
    if (!raw) return;
    const host = normalizeDomain(raw);
    if (!host) return alert('Invalid URL or domain');
    const listName = document.getElementById('listSelect').value || state.activeList;
    const newLists = { ...state.lists };
    const entry = { url: host, requireChallenge: false };
    newLists[listName] = (newLists[listName] || []).concat([entry]);
    chrome.storage.sync.set({ lists: newLists }, () => { document.getElementById('newListUrl').value = ''; updateState(); });
  };

  // Tab switching
  const tabs = {
    clock: document.getElementById("clockDisplay"),
    focus: document.querySelector(".timer-container"),
    settings: document.getElementById("settingsPanel"),
  };
  const buttons = {
    clock: document.getElementById("clockTab"),
    focus: document.getElementById("focusTab"),
    settings: document.getElementById("settingsTab"),
  };

  function switchTab(tabName) {
    Object.values(tabs).forEach((el) => el.classList.add("hidden"));
    tabs[tabName].classList.remove("hidden");
    Object.values(buttons).forEach((btn) => btn.classList.remove("active"));
    buttons[tabName].classList.add("active");
    document
      .getElementById("whitelistDisplay")
      .classList.toggle("hidden", tabName !== "focus");
  }
    // inside DOMContentLoaded, after other settings listeners:

  const ytUrlInput = document.getElementById("youtubeBgUrl");
  const ytToggle = document.getElementById("useYoutubeBg");

  if (ytUrlInput && ytToggle) {
    // load initial values once UI exists
    chrome.storage.sync.get(["useYoutubeBg", "youtubeBgUrl"], (data) => {
      ytUrlInput.value = data.youtubeBgUrl || "";
      ytToggle.checked = data.useYoutubeBg || false;
    });
  }


  buttons.clock.onclick = () => switchTab("clock");
  buttons.focus.onclick = () => switchTab("focus");
  buttons.settings.onclick = () => switchTab("settings");

  switchTab("clock"); // default view
});


