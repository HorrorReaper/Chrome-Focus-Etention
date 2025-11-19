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
  lists: { Default: [] },
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

function updateUI() {
  // Whitelist
  document.getElementById("activeListName").textContent = state.activeList;
  const domainList = document.getElementById("domainList");
  domainList.innerHTML = "";
  (state.lists[state.activeList] || []).forEach((domain) => {
    const li = document.createElement("li");
    li.textContent = domain;
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


