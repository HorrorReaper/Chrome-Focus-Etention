import { quotes, backgroundImages } from "./lib/constants.js";
import { setRandomBackground } from "./lib/appearance.js";
import { onButtonClick, updateTimerDisplay } from "./lib/timer.js";
import { updateClock } from "./lib/clock.js";
import { addToDo, updateTodoList } from "./lib/todo.js";
import { applyBackgroundFromSettings } from "./lib/appearance.js";
import { saveSettings } from "./lib/settings.js";
import { renderFavList, renderFavorites, addFavorite } from "./lib/favorites.js";
console.log('[newtab] module loaded');
window.addEventListener('error', (e) => {
  try { console.error('[newtab] window.error', e && (e.error || e.message || e)); } catch (_) { }
});
window.addEventListener('unhandledrejection', (e) => {
  try { console.error('[newtab] unhandledrejection', e && (e.reason || e)); } catch (_) { }
});
let interval;
let state = {
  enabled: false,
  timerEnd: null,
  activeList: "Default",
  lists: {
    Default: [
      { url: "youtube.com", requireChallenge: false }
    ]
  },
  favorites: {
    Default: [
      { url: "https://github.com", title: "GitHub", icon: "🔧" },
      { url: "https://stackoverflow.com", title: "Stack Overflow", icon: "📚" }
    ]
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
    console.log('[newtab] updateState - received favorites:', response.favorites);
    console.log('[newtab] updateState - current state favorites before merge:', state.favorites);
    state = { ...state, ...response };
    console.log('[newtab] updateState - state favorites after merge:', state.favorites);
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
    const requireFlag = entry && (entry.requireChallenge || entry.requireChallenge === true || entry.challengeRequired || (entry.challengeType && entry.challengeType !== 'none')) || false;
    const li = document.createElement('li');
    li.className = 'whitelist-item';

    // Replace legacy checkbox with a challenge-type select (None/Math/Reason/Delay/Typing)

    const span = document.createElement('span');
    span.textContent = url;
    span.className = 'whitelist-url';

    // show star if this domain is also in favorites for the active list
    try {
      const favs = (state.favorites && state.favorites[state.activeList]) || [];
      const domainHost = normalizeDomain(url) || url;
      const isFav = favs.some(f => {
        try {
          const fu = new URL((f && f.url) || '');
          const fh = fu.hostname.replace(/^www\./, '').toLowerCase();
          return fh === domainHost;
        } catch (e) {
          return ((f && (f.url || f.domain)) || '').replace(/^www\./, '').toLowerCase() === domainHost;
        }
      });
      if (isFav) {
        const star = document.createElement('span');
        star.className = 'fav-indicator';
        star.textContent = ' ⭐';
        star.title = 'Also in favorites';
        span.appendChild(star);
      }
    } catch (e) { }

    // Challenge type selector
    const typeSel = document.createElement('select');
    const curType = entry && entry.challengeType ? entry.challengeType : (entry && (entry.requireChallenge || entry.challengeRequired) ? 'math' : 'none');
    ['none', 'math', 'reason', 'delay', 'typing'].forEach((t) => {
      const o = document.createElement('option');
      o.value = t;
      // show capitalized labels
      o.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      if (t === curType) o.selected = true;
      typeSel.appendChild(o);
    });
    typeSel.dataset.index = idx;
    typeSel.onchange = (e) => {
      const i = Number(e.target.dataset.index);
      const listName = document.getElementById('listSelect').value || state.activeList;
      const newLists = { ...state.lists };
      const arr = (newLists[listName] || []).slice();
      arr[i] = arr[i] || {};
      const val = e.target.value;
      arr[i].challengeType = val;
      // keep backward-compatible boolean for other code
      arr[i].requireChallenge = val !== 'none';
      newLists[listName] = arr;
      chrome.storage.sync.set({ lists: newLists }, () => updateState());
    };

    // Challenge intensity selector
    const intensitySel = document.createElement('select');
    ['easy', 'medium', 'hard'].forEach((lvl) => {
      const o = document.createElement('option');
      o.value = lvl;
      o.textContent = lvl;
      const curIntensity = entry && (entry.challengeIntensity || entry.intensity) ? (entry.challengeIntensity || entry.intensity) : 'medium';
      if (lvl === curIntensity) o.selected = true;
      intensitySel.appendChild(o);
    });
    intensitySel.dataset.index = idx;
    intensitySel.onchange = (e) => {
      const i = Number(e.target.dataset.index);
      const listName = document.getElementById('listSelect').value || state.activeList;
      const newLists = { ...state.lists };
      const arr = (newLists[listName] || []).slice();
      arr[i] = arr[i] || {};
      arr[i].challengeIntensity = e.target.value;
      newLists[listName] = arr;
      chrome.storage.sync.set({ lists: newLists }, () => updateState());
    };

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

    // Hide intensity if no challenge
    if (curType === 'none') intensitySel.style.display = 'none';
    typeSel.addEventListener('change', (e) => {
      intensitySel.style.display = e.target.value === 'none' ? 'none' : '';
    });

    li.append(span, typeSel, intensitySel, del);
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
    const urlSpan = document.createElement('span');
    urlSpan.textContent = url;
    urlSpan.className = 'domain-url';

    // show a subtle icon indicating challenge type (if any)
    const type = (typeof domain === 'string') ? 'none' : (domain.challengeType || (domain.requireChallenge ? 'math' : 'none'));
    const icons = { none: '', math: '🧮', reason: '💡', delay: '⏳', typing: '⌨️' };
    const icon = icons[type] || '';
    if (icon) {
      const ind = document.createElement('span');
      ind.className = 'challenge-indicator';
      ind.textContent = icon;
      ind.style.marginLeft = '8px';
      ind.title = type.charAt(0).toUpperCase() + type.slice(1) + ' challenge';
      li.append(urlSpan, ind);
    } else {
      li.append(urlSpan);
    }
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

  renderFavorites(state);
  renderFavList(state);
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
  // Attach handler to any Add Favorite button(s) robustly
  // Attach handler to Add Favorite buttons
  const addFavHandler = (urlId, titleId, iconId) => {
    const urlInput = document.getElementById(urlId);
    const titleInput = document.getElementById(titleId);
    const iconInput = document.getElementById(iconId);

    if (!urlInput) {
      console.warn('Add Favorite: inputs not found in DOM');
      return;
    }

    let url = (urlInput.value || '').trim();
    const title = (titleInput && titleInput.value || '').trim();
    const icon = (iconInput && iconInput.value || '').trim();

    if (!url) {
      alert("Please enter a URL.");
      return;
    }

    // Accept plain hostnames by adding https:// if missing, then validate
    let candidate = url;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) candidate = 'https://' + candidate;
    try {
      const parsed = new URL(candidate);
      // use the normalized candidate URL
      url = parsed.href;
    } catch (err) {
      alert("Please enter a valid URL (e.g. example.com or https://example.com)");
      return;
    }

    try {
      addFavorite(state, url, title || new URL(url).hostname, icon || "🔖");
      if (urlInput) urlInput.value = "";
      if (titleInput) titleInput.value = "";
      if (iconInput) iconInput.value = "";
    } catch (err) {
      console.error('Error adding favorite', err);
      alert('Failed to add favorite. See console for details.');
    }
  };

  const btn1 = document.getElementById('addFavButton');
  if (btn1) {
    btn1.onclick = () => addFavHandler('newFavUrl', 'newFavTitle', 'newFavIcon');
  }

  const btn2 = document.getElementById('settingsAddFavButton');
  if (btn2) {
    btn2.onclick = () => addFavHandler('settingsNewFavUrl', 'settingsNewFavTitle', 'settingsNewFavIcon');
  }

  const input1 = document.getElementById("newFavUrl");
  if (input1) {
    input1.onkeypress = (e) => {
      if (e.key === "Enter") {
        if (btn1) btn1.click();
      }
    };
  }

  const input2 = document.getElementById("settingsNewFavUrl");
  if (input2) {
    input2.onkeypress = (e) => {
      if (e.key === "Enter") {
        if (btn2) btn2.click();
      }
    };
  }

  // Star current site button (focus page)
  const starBtn = document.getElementById('starCurrentSite');
  if (starBtn) {
    starBtn.onclick = () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].url) return;
        let tabUrl = tabs[0].url;
        if (tabUrl.startsWith(chrome.runtime.getURL(''))) {
          const params = new URLSearchParams(new URL(tabUrl).search);
          const original = params.get('url');
          if (original) tabUrl = original;
        }
        try {
          const parsed = new URL(tabUrl);
          const normalized = parsed.href;
          const hostname = parsed.hostname.replace(/^www\./, '');
          addFavorite(state, normalized, hostname, '⭐');
        } catch (e) {
          console.warn('Could not parse current tab URL for favorite', e);
          alert('Cannot add this site to favorites.');
        }
      });
    };
  }





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
    const input = document.getElementById('newListName');
    const name = input ? input.value.trim() : '';
    if (!name) {
      alert('Please enter a list name.');
      if (input) input.focus();
      return;
    }
    if (state.lists && state.lists[name]) {
      alert('A list with this name already exists.');
      return;
    }

    // Prepare new objects for storage to avoid mutating in-memory state directly
    const newLists = { ...(state.lists || {}), [name]: [] };
    const newTodos = { ...(state.todos || {}), [name]: [] };
    const newFavorites = { ...(state.favorites || {}), [name]: [] };

    chrome.storage.sync.set(
      {
        lists: newLists,
        todos: newTodos,
        favorites: newFavorites,
        activeList: name,
      },
      () => {
        if (input) input.value = '';
        updateState();
      }
    );
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
    // Prefer the selected list in the UI; fall back to state.activeList
    const select = document.getElementById('listSelect');
    const selectedName = select ? select.value : null;
    const name = selectedName || state.activeList || 'Default';

    if (name === 'Default') {
      alert('Cannot delete the Default list.');
      return;
    }

    if (!confirm(`Delete list "${name}"? This will remove its URLs, todos and favorites.`)) return;

    // Build new copies instead of mutating `state` in-place
    const newLists = { ...(state.lists || {}) };
    const newTodos = { ...(state.todos || {}) };
    const newFavorites = { ...(state.favorites || {}) };

    delete newLists[name];
    delete newTodos[name];
    delete newFavorites[name];

    // Pick a fallback active list
    const remaining = Object.keys(newLists);
    const nextActive = remaining.length ? remaining[0] : 'Default';
    if (!newLists[nextActive]) newLists[nextActive] = [];

    chrome.storage.sync.set(
      {
        lists: newLists,
        todos: newTodos,
        favorites: newFavorites,
        activeList: nextActive,
      },
      () => updateState()
    );
  };

  // Add URL to list
  document.getElementById('addListUrlButton').onclick = () => {
    const raw = document.getElementById('newListUrl').value.trim();
    if (!raw) return;
    const host = normalizeDomain(raw);
    if (!host) return alert('Invalid URL or domain');
    const listName = document.getElementById('listSelect').value || state.activeList;
    const newLists = { ...state.lists };
    const entry = { url: host, requireChallenge: false, challengeType: 'none' };
    newLists[listName] = (newLists[listName] || []).concat([entry]);
    chrome.storage.sync.set({ lists: newLists }, () => { document.getElementById('newListUrl').value = ''; updateState(); });
  };

  // Tab switching
  const tabs = {
    clock: document.getElementById("clockDisplay"),
    focus: document.querySelector(".timer-container"),
    settings: document.getElementById("settingsPanel"),
    notes: document.getElementById("notesPanel"),
  };
  const buttons = {
    clock: document.getElementById("clockTab"),
    focus: document.getElementById("focusTab"),
    settings: document.getElementById("settingsTab"),
    notes: document.getElementById("notesTab"),
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
  if (buttons.notes) buttons.notes.onclick = () => switchTab("notes");

  // Notes persistence
  const notesArea = document.getElementById("notesTextarea");
  if (notesArea) {
    chrome.storage.sync.get(["userNotes"], (data) => {
      notesArea.value = data.userNotes || "";
    });
    notesArea.addEventListener("input", () => {
      chrome.storage.sync.set({ userNotes: notesArea.value });
    });
  }

  switchTab("clock"); // default view

  // ===== CLOCK SUBTABS =====
  const subtabs = {
    todos: document.getElementById("todosContent"),
    favorites: document.getElementById("favoritesContent"),
    calendar: document.getElementById("calendarContent"),
  };
  const subtabButtons = {
    todos: document.getElementById("todosSubtab"),
    favorites: document.getElementById("favoritesSubtab"),
    calendar: document.getElementById("calendarSubtab"),
  };

  function switchSubtab(subtabName) {
    // Hide all subtab content
    Object.values(subtabs).forEach((el) => {
      if (el) el.classList.add("hidden");
    });
    // Show selected subtab
    if (subtabs[subtabName]) {
      subtabs[subtabName].classList.remove("hidden");
    }
    // Update button states
    Object.values(subtabButtons).forEach((btn) => {
      if (btn) btn.classList.remove("active");
    });
    if (subtabButtons[subtabName]) {
      subtabButtons[subtabName].classList.add("active");
    }
    // If calendar, render it
    if (subtabName === "calendar") {
      loadGoogleCalendar();
    }
  }

  // Attach subtab button handlers
  if (subtabButtons.todos) subtabButtons.todos.onclick = () => switchSubtab("todos");
  if (subtabButtons.favorites) subtabButtons.favorites.onclick = () => switchSubtab("favorites");
  if (subtabButtons.calendar) subtabButtons.calendar.onclick = () => switchSubtab("calendar");


  // ===== GOOGLE CALENDAR IFRAME =====
  function loadGoogleCalendar() {
    const iframe = document.getElementById("googleCalendarIframe");
    const placeholder = document.getElementById("calendarPlaceholder");

    if (!iframe || !placeholder) return;

    chrome.storage.sync.get(["googleCalendarUrl"], (data) => {
      const url = data.googleCalendarUrl;

      if (url && url.trim()) {
        iframe.src = url.trim();
        iframe.classList.remove("hidden");
        placeholder.classList.add("hidden");
      } else {
        iframe.classList.add("hidden");
        placeholder.classList.remove("hidden");
      }
    });
  }

  // Load Google Calendar URL into settings input on page load
  const calendarUrlInput = document.getElementById("googleCalendarUrl");
  if (calendarUrlInput) {
    chrome.storage.sync.get(["googleCalendarUrl"], (data) => {
      calendarUrlInput.value = data.googleCalendarUrl || "";
    });

    // Auto-save Google Calendar URL when input changes
    calendarUrlInput.addEventListener("blur", () => {
      const url = calendarUrlInput.value.trim();
      chrome.storage.sync.set({ googleCalendarUrl: url }, () => {
        console.log("Google Calendar URL saved:", url);
        const calendarContent = document.getElementById("calendarContent");
        if (calendarContent && !calendarContent.classList.contains("hidden")) {
          loadGoogleCalendar();
        }
      });
    });

    calendarUrlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        calendarUrlInput.blur();
      }
    });
  }


  // Initialize with todos subtab
  switchSubtab("todos");

});


