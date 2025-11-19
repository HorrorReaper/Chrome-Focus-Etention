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

const quotes = [
  { text: "Everything you've ever wanted is sitting on the other side of fear.", author: "George Addair" },
  { text: "The question isn't who is going to let me; it's who is going to stop me.", author: "Ayn Rand" },
  { text: "I didn't get there by wishing for it or hoping for it, but by working for it.", author: "Estée Lauder" },
  { text: "When we strive to become better than we are, everything around us becomes better too.", author: "Paulo Coelho" },
  { text: "Just one small positive thought in the morning can change your whole day.", author: "Dalai Lama" },
  { text: "You have to believe in yourself when no one else does.", author: "Serena Williams" },
  { text: "When you have a dream, you've got to grab it and never let go.", author: "Carol Burnett" },
  { text: "When something is important enough, you do it even if the odds are not in your favor.", author: "Elon Musk" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Life is about making an impact, not making an income.", author: "Kevin Kruse" },
  { text: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill" },
  { text: "You see, in life, lots of people know what to do, but few actually do what they know. Knowing is not enough! You must take action.", author: "Tony Robbins" },
  { text: "Nothing will work unless you do.", author: "Maya Angelou" },
  { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Success is not final, failure is not fatal: It is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Keep your face always toward the sunshine—and shadows will fall behind you.", author: "Walt Whitman" },
];
const backgroundImages = [
  "images/background/1.jpg",
  "images/background/2.jpg",
  "images/background/3.jpg",
  // add as many as you have
];
function setRandomBackground() {
  if (!backgroundImages.length) return;
  const choice =
    backgroundImages[Math.floor(Math.random() * backgroundImages.length)];
  document.body.style.backgroundImage = `url('${choice}')`;
}
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
  updateTodoList();

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
  updateTimerDisplay();
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

function updateTimerDisplay() {
  const displayEl = document.getElementById("timerDisplay");
  const cycleEl = document.getElementById("cycleInfo");
  if (!displayEl || !cycleEl) return;

  let remainingMs = 0;

  if (state.enabled && state.timerEnd) {
    remainingMs = Math.max(0, state.timerEnd - Date.now());
  } else if (state.paused && typeof state.pausedRemaining === "number") {
    remainingMs = Math.max(0, state.pausedRemaining);
  }

  let display = "00:00";
  if (remainingMs > 0) {
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    display = `${minutes}:${seconds}`;
  }

  let cycleText = "";
  if (state.pomodoroMode) {
    cycleText =
      state.currentCycle === 0
        ? `Work ${state.pomodoroCount + 1}/4`
        : `Break (${state.pomodoroCount % 4 === 0 ? "Long" : "Short"})`;
  }

  displayEl.textContent = display;
  cycleEl.textContent = cycleText;
}

function updateClock() {
  const now = new Date();
  document.getElementById("currentTime").textContent = now.toLocaleTimeString(
    "de-DE",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }
  );
  document.getElementById("currentDate").textContent = now.toLocaleDateString(
    "de-DE",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
  document.getElementById("headerClock").textContent = now.toLocaleTimeString(
    "de-DE",
    { hour: "2-digit", minute: "2-digit", hour12: false }
  );
}

function updateTodoList() {
  const todoList = document.getElementById("todoList");
  todoList.innerHTML = "";
  (state.todos[state.activeList] || []).forEach((todo, index) => {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.onchange = () => {
      chrome.runtime.sendMessage(
        { type: "updateTodo", action: "toggle", index },
        () => updateState()
      );
    };

    const textSpan = document.createElement("span");
    textSpan.className = "todo-text";
    textSpan.textContent = todo.text;
    if (todo.done) textSpan.classList.add("done");

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.textContent = "×";
    deleteBtn.onclick = () => {
      chrome.runtime.sendMessage(
        { type: "updateTodo", action: "delete", index },
        () => updateState()
      );
    };

    li.append(checkbox, textSpan, deleteBtn);
    todoList.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", () => {
    setRandomBackground();
    applyBackgroundFromSettings();  // replaces setRandomBackground()
  updateState();

  interval = setInterval(() => {
    
    updateTimerDisplay();
    updateClock();
  }, 1000);

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "stateUpdate") {
      updateState();
    }
  });

  // Start / Pause / Resume button
  document.getElementById("startButton").onclick = () => {
    const btn = document.getElementById("startButton");
    btn.disabled = true;
    if (state.enabled) {
      // running -> PAUSE
      chrome.runtime.sendMessage({ type: "pauseTimer" }, (resp) => {
        if (chrome.runtime.lastError) console.error('pauseTimer error', chrome.runtime.lastError);
        updateState();
        // storage may update slightly later; follow up once
        setTimeout(updateState, 300);
        btn.disabled = false;
      });
    } else if (state.paused && state.pausedRemaining > 0) {
      // paused -> RESUME
      chrome.runtime.sendMessage({ type: "resumeTimer" }, (resp) => {
        if (chrome.runtime.lastError) console.error('resumeTimer error', chrome.runtime.lastError);
        updateState();
        setTimeout(updateState, 300);
        btn.disabled = false;
      });
    } else {
      // idle -> START
      const minutes = state.pomodoroMode
        ? state.pomodoroWork
        : parseInt(document.getElementById("timerInput").value) || 0;
      chrome.runtime.sendMessage({ type: "startTimer", minutes }, (resp) => {
        if (chrome.runtime.lastError) console.error('startTimer error', chrome.runtime.lastError);
        updateState();
        setTimeout(updateState, 300);
        btn.disabled = false;
      });
    }
  };

  // Add todo
  document.getElementById("addTodoButton").onclick = () => {
    const input = document.getElementById("newTodoInput");
    const text = input.value.trim();
    if (!text) return;
    chrome.runtime.sendMessage(
      { type: "updateTodo", action: "add", value: text },
      () => {
        input.value = "";
        updateState();
      }
    );
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
  const newActiveList = document.getElementById("listSelect").value;
  const pomodoroMode = document.getElementById("pomodoroToggle").checked;
  const pomodoroWork = parseInt(document.getElementById("pomodoroWork").value) || 25;
  const pomodoroBreak = parseInt(document.getElementById("pomodoroBreak").value) || 5;
  const pomodoroLongBreak = parseInt(document.getElementById("pomodoroLongBreak").value) || 15;

  const enableMathChallenge = document.getElementById("enableMathChallenge").checked;
  // also pick up optional YouTube background settings if present in the DOM
  const ytToggleEl = document.getElementById('useYoutubeBg');
  const ytUrlEl = document.getElementById('youtubeBgUrl');
  const useYoutubeBg = ytToggleEl ? !!ytToggleEl.checked : undefined;
  const youtubeBgUrl = ytUrlEl ? (ytUrlEl.value || '').trim() : undefined;

  // Save Pomodoro and list and optional settings
  chrome.runtime.sendMessage(
    {
      type: "setPomodoro",
      mode: pomodoroMode,
      work: pomodoroWork,
      break: pomodoroBreak,
      longBreak: pomodoroLongBreak,
    },
    () => {
      const storageObj = {
        activeList: newActiveList,
        enableMathChallenge,
      };
      if (useYoutubeBg !== undefined) storageObj.useYoutubeBg = useYoutubeBg;
      if (youtubeBgUrl !== undefined) storageObj.youtubeBgUrl = youtubeBgUrl;

      chrome.storage.sync.set(storageObj, () => {
        // apply background immediately if youtube settings changed
        try {
          applyBackgroundFromSettings();
        } catch (e) {}
        updateState();
      });
    }
  );
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
function extractYoutubeId(url) {
  try {
    if (!url) return null;
    // if just ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
    if (u.searchParams.has("v")) {
      return u.searchParams.get("v");
    }
    return null;
  } catch (e) {
    return null;
  }
}

function applyBackgroundFromSettings() {
  chrome.storage.sync.get(["useYoutubeBg", "youtubeBgUrl"], (data) => {
    const useYT = data.useYoutubeBg || false;
    const url = data.youtubeBgUrl || "";
    const ytContainer = document.getElementById("ytBackground");
    // We'll use the YouTube IFrame API to detect embed errors (e.g. owner disabled embedding)
    if (useYT) {
      const id = extractYoutubeId(url);
      if (!id) {
        setRandomBackground();
        ytContainer.classList.add("hidden");
        ytContainer.innerHTML = "";
        return;
      }

      // ensure container child for the player
      ytContainer.classList.remove("hidden");
      ytContainer.innerHTML = '<div id="yt-player"></div>';
      // remove body background image so video shows through
      document.body.style.backgroundImage = "none";

      loadYouTubeAPI().then(() => {
        // destroy existing player if present
        if (window._ytPlayerInstance) {
          try { window._ytPlayerInstance.destroy(); } catch (e) {}
          window._ytPlayerInstance = null;
        }
        // create player
        try {
          window._ytPlayerInstance = new YT.Player('yt-player', {
            height: '100%',
            width: '100%',
            videoId: id,
            playerVars: {
              autoplay: 1,
              mute: 1,
              loop: 1,
              playlist: id,
              controls: 0,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
            },
            events: {
              onReady: (e) => { try { e.target.playVideo(); } catch (err) {} },
              onError: (e) => {
                // error codes 101 and 150 indicate embedding is disabled by owner
                console.error('YouTube player error', e.data);
                // inform user and fallback
                alert('Fehler bei der Konfiguration des Videoplayers: Dieses Video erlaubt das Einbetten nicht oder es gab einen Fehler. Bitte wähle ein anderes Video.');
                try { window._ytPlayerInstance.destroy(); } catch (err) {}
                window._ytPlayerInstance = null;
                ytContainer.classList.add('hidden');
                ytContainer.innerHTML = '';
                setRandomBackground();
              }
            }
          });
        } catch (err) {
          console.error('Failed to create YT.Player', err);
          ytContainer.classList.add('hidden');
          ytContainer.innerHTML = '';
          setRandomBackground();
        }
      }).catch((err) => {
        console.error('YouTube API load failed', err);
        ytContainer.classList.add('hidden');
        ytContainer.innerHTML = '';
        setRandomBackground();
      });
    } else {
      // disable yt background
      try { if (window._ytPlayerInstance) { window._ytPlayerInstance.destroy(); window._ytPlayerInstance = null; } } catch (e) {}
      ytContainer.classList.add("hidden");
      ytContainer.innerHTML = "";
      setRandomBackground();
    }

    // Also reflect values in settings UI if present
    const urlInput = document.getElementById("youtubeBgUrl");
    const toggle = document.getElementById("useYoutubeBg");
    if (urlInput) urlInput.value = url;
    if (toggle) toggle.checked = useYT;
  });
}

// Load the YouTube IFrame API and return a Promise that resolves when ready
function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve();
    // if a previous load is in progress, wait for it
    if (window._ytApiLoadPromise) return window._ytApiLoadPromise.then(resolve).catch(reject);

    window._ytApiLoadPromise = new Promise((res, rej) => {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onload = () => { /* API script loaded, will call onYouTubeIframeAPIReady */ };
      tag.onerror = (e) => { rej(e); };
      document.head.appendChild(tag);

      window.onYouTubeIframeAPIReady = function() {
        res();
      };
      // safety timeout
      setTimeout(() => {
        if (!(window.YT && window.YT.Player)) {
          rej(new Error('YT API did not initialize in time'));
        }
      }, 8000);
    });

    window._ytApiLoadPromise.then(resolve).catch(reject);
  });
}

