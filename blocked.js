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
let currentAnswer = null; // for math
let mathChallengeEnabled = false; // legacy global default
let currentChallengeType = 'none';
let currentChallengeEntry = null; // store list entry for intensity etc
let typingQuote = null;
let delayInterval = null;
let delayRemaining = 0;

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
  console.log('[blocked] requesting state from background');
  let didRespond = false;
  const timer = setTimeout(() => {
    if (didRespond) return;
    console.warn('[blocked] getState timed out — falling back to storage');
    // fallback to reading storage directly
    chrome.storage.sync.get([
      'enabled','timerEnd','todos','activeList','pomodoroMode','pomodoroWork','pomodoroBreak','pomodoroLongBreak','currentCycle','pomodoroCount','paused','pausedRemaining'
    ], (data) => {
      if (chrome.runtime.lastError) {
        console.error('[blocked] storage.get error:', chrome.runtime.lastError);
        return;
      }
      const fallbackState = {
        enabled: data.enabled,
        timerEnd: data.timerEnd,
        todos: data.todos,
        activeList: data.activeList,
        pomodoroMode: data.pomodoroMode,
        pomodoroWork: data.pomodoroWork,
        pomodoroBreak: data.pomodoroBreak,
        pomodoroLongBreak: data.pomodoroLongBreak,
        currentCycle: data.currentCycle,
        pomodoroCount: data.pomodoroCount,
        paused: data.paused,
        pausedRemaining: data.pausedRemaining,
      };
      console.log('[blocked] fallback state from storage', fallbackState);
      updateTimer(fallbackState);
      updateTodos(fallbackState);
    });
  }, 800);

  chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
    didRespond = true;
    clearTimeout(timer);
    if (chrome.runtime.lastError) {
      console.warn('[blocked] getState error — will try storage fallback', chrome.runtime.lastError);
      // try storage fallback immediately
      chrome.storage.sync.get([
        'enabled','timerEnd','todos','activeList','pomodoroMode','pomodoroWork','pomodoroBreak','pomodoroLongBreak','currentCycle','pomodoroCount','paused','pausedRemaining'
      ], (data) => {
        if (chrome.runtime.lastError) {
          console.error('[blocked] storage.get error:', chrome.runtime.lastError);
          return;
        }
        const fallbackState = {
          enabled: data.enabled,
          timerEnd: data.timerEnd,
          todos: data.todos,
          activeList: data.activeList,
          pomodoroMode: data.pomodoroMode,
          pomodoroWork: data.pomodoroWork,
          pomodoroBreak: data.pomodoroBreak,
          pomodoroLongBreak: data.pomodoroLongBreak,
          currentCycle: data.currentCycle,
          pomodoroCount: data.pomodoroCount,
          paused: data.paused,
          pausedRemaining: data.pausedRemaining,
        };
        console.log('[blocked] fallback state from storage', fallbackState);
        updateTimer(fallbackState);
        updateTodos(fallbackState);
      });
      return;
    }
    if (!state) {
      console.warn('[blocked] getState returned empty state — trying storage fallback');
      chrome.storage.sync.get(['enabled','timerEnd','todos','activeList'], (data) => {
        const fallbackState = {
          enabled: data.enabled,
          timerEnd: data.timerEnd,
          todos: data.todos,
          activeList: data.activeList,
        };
        updateTimer(fallbackState);
        updateTodos(fallbackState);
      });
      return;
    }
    console.log('[blocked] received state', state);
    updateTimer(state);
    updateTodos(state);
  });
}

function updateTimer(state) {
  const timerDisplay = document.getElementById('timer-display') || document.getElementById('timer_display');
  const timerLabel = document.getElementById('timer-label') || document.getElementById('timer_label');
  const progressFill = document.getElementById('progress-fill') || document.getElementById('progress_fill');

  if (!timerDisplay || !timerLabel) {
    console.warn('[blocked] timer elements missing in DOM — aborting updateTimer');
    return;
  }
  
  if (!state.enabled || !state.timerEnd) {
    timerDisplay.textContent = 'Timer Off';
    timerLabel.textContent = 'No active timer';
    if (progressFill) try { progressFill.style.width = '0%'; } catch (e) { console.warn('[blocked] progressFill style error', e); }
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
  if (!timerInterval) timerInterval = setInterval(() => updateTimerDisplay(state), 100);
  
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
  const timerDisplay = document.getElementById('timer-display') || document.getElementById('timer_display');
  const progressFill = document.getElementById('progress-fill') || document.getElementById('progress_fill');

  if (!timerDisplay) {
    console.warn('[blocked] updateTimerDisplay: timer-display element not found, aborting.');
    return;
  }
  
  const now = Date.now();
  const remaining = Math.max(0, state.timerEnd - now);
  
  if (remaining === 0) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    setTimeout(loadState, 500);
    return;
  }
  
  // Display time
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Update progress bar
  if (timerDuration > 0 && progressFill) {
    try {
      const elapsed = now - timerStartTime;
      const progress = Math.min(100, (elapsed / timerDuration) * 100);
      progressFill.style.width = `${progress}%`;
    } catch (e) {
      console.warn('[blocked] error updating progressFill', e);
    }
  }
}

function updateTodos(state) {
  const todoList = document.getElementById('todo-list');
  const todos = state.todos?.[state.activeList] || [];

  if (todos.length === 0) {
    // render an empty hint depending on list type
    if (todoList.tagName === 'UL') {
      todoList.innerHTML = '<li class="empty-todos">No tasks yet. Add some from your new tab!</li>';
    } else {
      todoList.innerHTML = '<div class="empty-todos">No tasks yet. Add some from your new tab!</div>';
    }
    return;
  }

  // Render as list items if container is UL, otherwise use divs
  if (todoList.tagName === 'UL') {
    todoList.innerHTML = todos.map((todo, i) => `
      <li class="todo-item ${todo.done ? 'done' : ''}">
        <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''} data-index="${i}" />
        <span class="todo-text">${escapeHtml(todo.text)}</span>
      </li>
    `).join('');
  } else {
    todoList.innerHTML = todos.map((todo, i) => `
      <div class="todo-item ${todo.done ? 'done' : ''}">
        <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''} data-index="${i}" />
        <span class="todo-text">${escapeHtml(todo.text)}</span>
      </div>
    `).join('');
  }

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
    // normalize domain (strip www)
    const domain = url.hostname.replace(/^www\./, '').toLowerCase();

    chrome.storage.sync.get(['lists', 'activeList'], (data) => {
      const lists = data.lists || {};
      const activeList = data.activeList || 'Default';

      if (!lists[activeList]) lists[activeList] = [];

      // Check for presence whether entries are strings or objects
      const already = lists[activeList].some((e) => (typeof e === 'string' ? e : e.url) === domain);
      if (!already) {
        // add in new object format, include challengeType for the new data model
        lists[activeList].push({ url: domain, requireChallenge: false, challengeType: 'none' });
        chrome.storage.sync.set({ lists }, () => {
          alert(`${domain} has been added to your whitelist!`);
          // Wait briefly to give background a chance to update dynamic rules
          setTimeout(() => { window.location.href = blockedUrl; }, 800);
        });
      } else {
        alert(`${domain} is already whitelisted!`);
      }
    });
  } catch (e) {
    alert('Could not add this URL to whitelist');
  }
};

// Add to favorites button on blocked page
const addFavBtn = document.getElementById('add-favorite');
if (addFavBtn) {
  addFavBtn.onclick = () => {
    if (!blockedFullUrl) return;
    try {
      const parsed = new URL(blockedFullUrl);
      const normalized = parsed.href;
      const hostname = parsed.hostname.replace(/^www\./, '');

      chrome.storage.sync.get(['favorites','activeList'], (data) => {
        const favorites = data.favorites || {};
        const activeList = data.activeList || 'Default';
        if (!favorites[activeList]) favorites[activeList] = [];

        const exists = favorites[activeList].some(f => (f && (f.url || '').replace(/\/\/$/, '') === normalized || (f.url || '').includes(hostname)));
        if (!exists) {
          favorites[activeList].push({ url: normalized, title: hostname, icon: '⭐' });
          chrome.storage.sync.set({ favorites }, () => {
            alert(`${hostname} added to favorites.`);
          });
        } else {
          alert(`${hostname} is already in favorites.`);
        }
      });
    } catch (e) {
      alert('Could not add to favorites');
    }
  };
}

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
  // After determining blocked domain, render proper challenge UI
  initChallengeUI();
})();

function normalizeHost(val) {
  try {
    if (!val) return null;
    const maybe = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(val) ? val : `https://${val}`;
    const u = new URL(maybe);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) {
    return String(val).replace(/^www\./, '').toLowerCase();
  }
}

function initChallengeUI() {
  const container = document.getElementById("challengeContainer");
  if (!container) return;

  // Reset any previous state
  clearDelayInterval();
  container.style.display = '';

  // Determine challenge type for this blocked domain by reading storage lists
  chrome.storage.sync.get(['lists','activeList','enableMathChallenge'], (data) => {
    const lists = data.lists || {};
    const activeList = data.activeList || 'Default';
    mathChallengeEnabled = !!data.enableMathChallenge;

    let entry = null;
    const arr = Array.isArray(lists[activeList]) ? lists[activeList] : [];
    const host = blockedDomain;
    if (host) {
      for (const e of arr) {
        const candidate = typeof e === 'string' ? e : (e.url || e.domain || '');
        if (!candidate) continue;
        if (normalizeHost(candidate) === host) {
          entry = e;
          break;
        }
      }
    }

    currentChallengeEntry = entry;
    currentChallengeType = entry && entry.challengeType ? entry.challengeType : (entry && (entry.requireChallenge || entry.challengeRequired) ? 'math' : (mathChallengeEnabled ? 'math' : 'none'));

    renderChallengeUI(currentChallengeType, entry);
  });
}

function clearDelayInterval() {
  if (delayInterval) {
    clearInterval(delayInterval);
    delayInterval = null;
  }
  delayRemaining = 0;
}

function renderChallengeUI(type, entry) {
  const container = document.getElementById('challengeContainer');
  const unlockBtn = document.getElementById('unlockButton');
  if (!container) return;

  // sanitize: ensure visible
  container.style.display = '';

  // Build UI per type
  container.innerHTML = '';

  if (type === 'none') {
    // No challenge; hide container
    container.style.display = 'none';
    if (unlockBtn) unlockBtn.disabled = false;
    return;
  }

  if (type === 'math') {
    // reuse previous layout
    const textDiv = document.createElement('div');
    textDiv.className = 'challenge-text';
    const label = document.createElement('div');
    label.className = 'challenge-label';
    label.textContent = 'Quick check';
    const q = document.createElement('div');
    q.id = 'challengeQuestion';
    q.className = 'challenge-question';
    textDiv.append(label, q);

    const input = document.createElement('input');
    input.type = 'number';
    input.id = 'challengeAnswer';
    input.className = 'number-input';
    input.placeholder = 'Answer';

    container.appendChild(textDiv);
    container.appendChild(input);
    generateChallenge();
    input.value = '';
    input.focus();
    if (unlockBtn) unlockBtn.disabled = false;
    return;
  }

  if (type === 'reason') {
    const textDiv = document.createElement('div');
    textDiv.className = 'challenge-text';
    const label = document.createElement('div');
    label.className = 'challenge-label';
    label.textContent = 'Why do you really need this site right now?';
    const hint = document.createElement('div');
    hint.className = 'challenge-question';
    const intensity = (entry && (entry.challengeIntensity || entry.intensity)) || 'medium';
    const thresholds = { easy: 60, medium: 100, hard: 160 };
    const thresh = thresholds[intensity] || 100;
    hint.textContent = `Please write at least ${thresh} characters to continue.`;
    const ta = document.createElement('textarea');
    ta.id = 'reasonText';
    ta.rows = 4;
    ta.style.width = '100%';
    ta.placeholder = 'Reflect on why you need this site...';

    textDiv.append(label, hint);
    container.appendChild(textDiv);
    container.appendChild(ta);
    if (unlockBtn) unlockBtn.disabled = false;
    return;
  }

  if (type === 'delay') {
    const textDiv = document.createElement('div');
    textDiv.className = 'challenge-text';
    const label = document.createElement('div');
    label.className = 'challenge-label';
    label.textContent = 'Delay before unlocking';
    const hint = document.createElement('div');
    hint.className = 'challenge-question';
    const intensity = (entry && (entry.challengeIntensity || entry.intensity)) || 'medium';
    const secondsMap = { easy: 10, medium: 20, hard: 40 };
    delayRemaining = secondsMap[intensity] || 20;
    hint.textContent = `You'll be able to unlock in ${delayRemaining} seconds; if it's not urgent, go back to your tasks.`;

    const timerLabel = document.createElement('div');
    timerLabel.id = 'delayTimerLabel';
    timerLabel.className = 'challenge-question';
    timerLabel.textContent = `${delayRemaining}s`;

    textDiv.append(label, hint);
    container.appendChild(textDiv);
    container.appendChild(timerLabel);

    if (unlockBtn) {
      unlockBtn.disabled = true;
      // start countdown
      clearDelayInterval();
      delayInterval = setInterval(() => {
        delayRemaining -= 1;
        if (delayRemaining <= 0) {
          clearDelayInterval();
          if (unlockBtn) unlockBtn.disabled = false;
          const t = document.getElementById('delayTimerLabel');
          if (t) t.textContent = 'Ready';
          return;
        }
        const t = document.getElementById('delayTimerLabel');
        if (t) t.textContent = `${delayRemaining}s`;
      }, 1000);
    }
    return;
  }

  if (type === 'typing') {
    // pick a short quote
    typingQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
    const textDiv = document.createElement('div');
    textDiv.className = 'challenge-text';
    const label = document.createElement('div');
    label.className = 'challenge-label';
    label.textContent = 'Type the quote below to unlock';
    const q = document.createElement('div');
    q.id = 'typingQuote';
    q.className = 'challenge-question';
    q.textContent = `"${typingQuote}"`;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'typingInput';
    input.placeholder = 'Type the quote exactly';
    input.style.width = '100%';

    textDiv.append(label, q);
    container.appendChild(textDiv);
    container.appendChild(input);
    if (document.getElementById('typingInput')) document.getElementById('typingInput').focus();
    if (unlockBtn) unlockBtn.disabled = false;
    return;
  }

  // default: hide
  container.style.display = 'none';
  if (unlockBtn) unlockBtn.disabled = false;
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

    // Validate challenge depending on the current challenge type
    const type = currentChallengeType || 'none';
    if (type === 'math') {
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
    } else if (type === 'reason') {
      const ta = document.getElementById('reasonText');
      if (!ta) {
        alert('Reason input missing — cannot verify.');
        return;
      }
      const txt = (ta.value || '').toString().trim();
      const intensity = (currentChallengeEntry && (currentChallengeEntry.challengeIntensity || currentChallengeEntry.intensity)) || 'medium';
      const thresholds = { easy: 60, medium: 100, hard: 160 };
      const thresh = thresholds[intensity] || 100;
      if (txt.length < thresh) {
        alert(`Please write at least ${thresh} characters. You wrote ${txt.length}.`);
        ta.focus();
        return;
      }
    } else if (type === 'delay') {
      // ensure countdown finished
      if (delayRemaining > 0) {
        alert(`Please wait ${delayRemaining} more second(s) before unlocking.`);
        return;
      }
    } else if (type === 'typing') {
      const input = document.getElementById('typingInput');
      if (!input) {
        alert('Typing input missing — cannot verify.');
        return;
      }
      const v = (input.value || '').toString().trim();
      if (!typingQuote) {
        alert('Quote missing — cannot verify.');
        return;
      }
      // Compare case-insensitive and normalize whitespace
      const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm(v) !== norm(typingQuote)) {
        alert('Typed text does not match the quote. Try again.');
        input.focus();
        return;
      }
    }

    // First try to ask the background service worker to perform the unlock
    // (it will update storage, create alarms and update rules before responding).
    let responded = false;
    const finish = (success) => {
      if (responded) return;
      responded = true;
      if (success){
        window.location.href = blockedFullUrl;
      } 
      else alert('Could not unlock the site. Please try again.');
    };

    // Fallback path (direct storage write) used when messaging fails or times out
    const doFallback = () => {
      const expireTs = Date.now() + minutes * 60000;
      chrome.storage.sync.get(["temporaryUnlocks"], (data) => {
        const tmp = data.temporaryUnlocks || {};
        tmp[blockedDomain] = expireTs;
        chrome.storage.sync.set({ temporaryUnlocks: tmp }, () => {
          // Poll storage until background picks up the change (or timeout)
          const start = Date.now();
          const maxWait = 5000; // ms
          const interval = 200;
          const check = () => {
            chrome.storage.sync.get(["temporaryUnlocks"], (d2) => {
              const nowTmp = (d2.temporaryUnlocks || {})[blockedDomain];
              if (nowTmp && nowTmp >= expireTs) {
                window.location.href = blockedFullUrl;
                return;
              }
              if (Date.now() - start >= maxWait) {
                // give one last try and navigate anyway
                window.location.href = blockedFullUrl;
                return;
              }
              setTimeout(check, interval);
            });
          };
          setTimeout(check, 150);
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