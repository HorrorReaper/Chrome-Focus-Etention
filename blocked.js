// blocked.js - Enhanced with timer display and todo list

const motivationalQuotes = [
  "Focus is the gateway to thinking, perceiving, remembering, learning, and reasoning.",
  "The successful warrior is the average person, with laser-like focus.",
  "Concentrate all your thoughts upon the work at hand. The sun's rays do not burn until brought to a focus.",
  "Your ability to discipline yourself to set clear goals, and then work toward them every day, will do more to guarantee your success than any other single factor.",
  "The key to success is to focus our conscious mind on things we desire, not things we fear.",
  "Starve your distractions, feed your focus.",
  "Where focus goes, energy flows.",
  "One way to boost our willpower and focus is to manage our distractions instead of letting them manage us."
];

let blockedDomain = null;
let blockedFullUrl = null;
let currentAnswer = null;
let mathChallengeEnabled = false;

chrome.storage.sync.get(["enableMathChallenge"], (data) => {
  mathChallengeEnabled = !!data.enableMathChallenge;
  initChallengeUI();
});

// Keep in sync if the user changes the setting while this page is open
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enableMathChallenge) {
    mathChallengeEnabled = !!changes.enableMathChallenge.newValue;
    initChallengeUI();
  }
});

// Get the blocked URL
const urlParams = new URLSearchParams(window.location.search);
const blockedUrl = urlParams.get('url');
if (blockedUrl) {
  try {
    const url = new URL(blockedUrl);
    document.getElementById('blocked-url').textContent = url.hostname;
  } catch (e) {
    document.getElementById('blocked-url').textContent = 'Blocked site';
  }
}

// Display random motivational quote
const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
document.getElementById('motivation-quote').textContent = randomQuote;

// Load and display timer + todos
let timerInterval;
let timerStartTime = null;
let timerDuration = null;

function loadState() {
  chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
    if (!state) return;
    
    updateTimer(state);
    updateTodos(state);
  });
}

function updateTimer(state) {
  const timerDisplay = document.getElementById('timer-display');
  const timerLabel = document.getElementById('timer-label');
  const progressFill = document.getElementById('progress-fill');
  
  if (!state.enabled || !state.timerEnd) {
    timerDisplay.textContent = 'Timer Off';
    timerLabel.textContent = 'No active timer';
    progressFill.style.width = '0%';
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    return;
  }
  
  // Calculate timer info on first load
  if (!timerStartTime) {
    const now = Date.now();
    const remaining = state.timerEnd - now;
    
    // Estimate start time based on Pomodoro settings
    if (state.pomodoroMode) {
      const expectedDuration = state.currentCycle === 0 
        ? state.pomodoroWork * 60000 
        : (state.pomodoroCount % 4 === 0 ? state.pomodoroLongBreak : state.pomodoroBreak) * 60000;
      timerStartTime = state.timerEnd - expectedDuration;
      timerDuration = expectedDuration;
    } else {
      // For regular timer, we don't know the start time, so just use remaining time
      timerStartTime = now;
      timerDuration = remaining;
    }
  }
  
  // Clear existing interval
  if (timerInterval) clearInterval(timerInterval);
  
  // Update timer display
  updateTimerDisplay(state);
  timerInterval = setInterval(() => updateTimerDisplay(state), 100);
  
  // Update label
  if (state.pomodoroMode) {
    if (state.currentCycle === 0) {
      timerLabel.textContent = `Work Session ${state.pomodoroCount + 1}`;
    } else {
      const isLongBreak = state.pomodoroCount % 4 === 0;
      timerLabel.textContent = isLongBreak ? 'Long Break Time' : 'Short Break Time';
    }
  } else {
    timerLabel.textContent = 'Focus Session Active';
  }
}

function updateTimerDisplay(state) {
  const timerDisplay = document.getElementById('timer-display');
  const progressFill = document.getElementById('progress-fill');
  
  const now = Date.now();
  const remaining = Math.max(0, state.timerEnd - now);
  
  if (remaining === 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    setTimeout(loadState, 500);
    return;
  }
  
  // Display time
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Update progress bar
  if (timerDuration > 0) {
    const elapsed = now - timerStartTime;
    const progress = Math.min(100, (elapsed / timerDuration) * 100);
    progressFill.style.width = `${progress}%`;
  }
}

function updateTodos(state) {
  const todoList = document.getElementById('todo-list');
  const todos = state.todos?.[state.activeList] || [];
  
  if (todos.length === 0) {
    todoList.innerHTML = '<div class="empty-todos">No tasks yet. Add some from your new tab!</div>';
    return;
  }
  
  todoList.innerHTML = todos.map((todo, i) => `
    <div class="todo-item ${todo.done ? 'done' : ''}">
      <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''} data-index="${i}" />
      <span class="todo-text">${escapeHtml(todo.text)}</span>
    </div>
  `).join('');
  
  // Attach checkbox listeners
  todoList.querySelectorAll('.todo-checkbox').forEach(cb => {
    cb.onchange = () => {
      const idx = parseInt(cb.dataset.index);
      chrome.runtime.sendMessage({ type: 'updateTodo', action: 'toggle', index: idx }, () => {
        loadState();
      });
    };
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add to whitelist button
document.getElementById('add-whitelist').onclick = () => {
  if (!blockedUrl) return;
  
  try {
    const url = new URL(blockedUrl);
    const domain = url.hostname;
    
    chrome.storage.sync.get(['lists', 'activeList'], (data) => {
      const lists = data.lists || {};
      const activeList = data.activeList || 'Default';
      
      if (!lists[activeList]) {
        lists[activeList] = [];
      }
      
      if (!lists[activeList].includes(domain)) {
        lists[activeList].push(domain);
        chrome.storage.sync.set({ lists }, () => {
          alert(`${domain} has been added to your whitelist!`);
          window.location.href = blockedUrl;
        });
      } else {
        alert(`${domain} is already whitelisted!`);
      }
    });
  } catch (e) {
    alert('Could not add this URL to whitelist');
  }
};

// Initial load
loadState();

// Listen for state updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'stateUpdate') {
    timerStartTime = null; // Reset timer calculation
    timerDuration = null;
    loadState();
  }
});
(function initBlockedDomain() {
  const params = new URLSearchParams(window.location.search);
  const urlStr = params.get("url");
  if (!urlStr) return;
  blockedFullUrl = urlStr;

  try {
    const u = new URL(urlStr);
    blockedDomain = u.hostname.replace(/^www\./, "").toLowerCase();
    const el = document.getElementById("blocked-url");
    if (el) el.textContent = blockedDomain;
  } catch (e) {
    blockedDomain = null;
  }
})();

function initChallengeUI() {
  const container = document.getElementById("challengeContainer");
  if (!container) return;

  if (!mathChallengeEnabled) {
    // hide if disabled in settings
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  generateChallenge();
  // focus input for convenience
  const input = document.getElementById('challengeAnswer');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function generateChallenge() {
  // Keep numbers modest so it's fast to compute during a block
  const a = Math.floor(Math.random() * 12) + 1;
  const b = Math.floor(Math.random() * 12) + 1;
  currentAnswer = a + b;
  const qEl = document.getElementById("challengeQuestion");
  if (qEl) qEl.textContent = `What is ${a} + ${b}?`;
}

// Unlock button handler
const unlockBtn = document.getElementById("unlockButton");
if (unlockBtn) {
  unlockBtn.onclick = () => {
    if (!blockedDomain || !blockedFullUrl) {
      alert("Could not detect the blocked site.");
      return;
    }

    const minutesInput = document.getElementById("unlockMinutes");
    const minutes = Math.max(
      1,
      Math.min(240, parseInt(minutesInput.value, 10) || 0)
    );

    // If challenge is enabled globally, enforce it
    if (mathChallengeEnabled) {
      const answerInput = document.getElementById("challengeAnswer");
      if (!answerInput) {
        alert('Challenge input missing — cannot verify.');
        return;
      }
      const raw = (answerInput.value || '').toString().trim();
      const userAns = raw === '' ? NaN : Number(raw);
      if (!Number.isFinite(userAns) || userAns !== currentAnswer) {
        alert("Wrong answer. Try again!");
        generateChallenge();
        answerInput.value = "";
        answerInput.focus();
        return;
      }
    }

    // First try to ask the background service worker to perform the unlock
    // (it will update storage, create alarms and update rules before responding).
    let responded = false;
    const finish = (success) => {
      if (responded) return;
      responded = true;
      if (success) window.location.href = blockedFullUrl;
      else alert('Could not unlock the site. Please try again.');
    };

    // Fallback path (direct storage write) used when messaging fails or times out
    const doFallback = () => {
      const expireTs = Date.now() + minutes * 60000;
      chrome.storage.sync.get(["temporaryUnlocks"], (data) => {
        const tmp = data.temporaryUnlocks || {};
        tmp[blockedDomain] = expireTs;
        chrome.storage.sync.set({ temporaryUnlocks: tmp }, () => {
          // give the background a moment to pick up the change
          setTimeout(() => { window.location.href = blockedFullUrl; }, 300);
        });
      });
    };

    const timeout = setTimeout(() => {
      if (responded) return;
      doFallback();
    }, 2000);

    try {
      chrome.runtime.sendMessage({ type: 'unlockSite', domain: blockedDomain, minutes }, (resp) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          // messaging failed -> fallback
          doFallback();
          return;
        }
        finish(true);
      });
    } catch (e) {
      clearTimeout(timeout);
      doFallback();
    }
  };
}