let pomodoroWork = 25;
let pomodoroBreak = 5;
let pomodoroLongBreak = 15;
let currentCycle = 0;   // 0 = work, 1 = break
let pomodoroCount = 0;  // completed work cycles
let temporaryUnlocks = {}; // { domain: expireTimestampMs }


// NEW: pause state
let paused = false;
let pausedRemaining = null; // ms

chrome.storage.sync.get(
  [
    "lists",
    "enableMathChallenge",
    "todos",
    "activeList",
    "enabled",
    "timerEnd",
    "pomodoroMode",
    "pomodoroWork",
    "pomodoroBreak",
    "pomodoroLongBreak",
    "currentCycle",
    "pomodoroCount",
    "paused",
    "pausedRemaining",
    "temporaryUnlocks",
    "favorites"
  ],
  (data) => {
    lists = data.lists || { Default: [] };
    // Normalize lists entries: older format may be array of strings.
    try {
      Object.keys(lists).forEach((k) => {
        if (!Array.isArray(lists[k])) {
          lists[k] = [];
          return;
        }
        // legacy array of strings -> convert
        if (lists[k].length && typeof lists[k][0] === 'string') {
          lists[k] = lists[k].map((d) => ({ url: d, requireChallenge: false, challengeType: 'none' }));
        } else {
          // normalize object entries: prefer explicit challengeType, else map requireChallenge/challengeRequired to 'math'
          lists[k] = lists[k].map((d) => {
            if (!d) return null;
            if (typeof d === 'string') return { url: d, requireChallenge: false, challengeType: 'none' };
            const url = d.url || d.domain || '';
            const req = !!(d.requireChallenge || d.challengeRequired);
            const challengeType = d.challengeType || (req ? 'math' : (enableMathChallenge ? 'math' : 'none'));
            const challengeIntensity = d.challengeIntensity || d.intensity || undefined;
            const out = { url, requireChallenge: req, challengeType };
            if (challengeIntensity) out.challengeIntensity = challengeIntensity;
            return out;
          }).filter(Boolean);
        }
      });
      // persist normalized lists so rest of code sees canonical format
      chrome.storage.sync.set({ lists });
    } catch (e) {
      console.warn('Failed to normalize lists', e);
    }
    todos = data.todos || { Default: [] };
    enableMathChallenge = !!data.enableMathChallenge;
    activeList = data.activeList || "Default";
    enabled = data.enabled !== false;
    timerEnd = data.timerEnd;
    pomodoroMode = data.pomodoroMode || false;
    pomodoroWork = data.pomodoroWork || 25;
    pomodoroBreak = data.pomodoroBreak || 5;
    pomodoroLongBreak = data.pomodoroLongBreak || 15;
    currentCycle = data.currentCycle || 0;
    pomodoroCount = data.pomodoroCount || 0;
    paused = data.paused || false;
    pausedRemaining = typeof data.pausedRemaining === "number" ? data.pausedRemaining : null;
    temporaryUnlocks = data.temporaryUnlocks || {};

    // Initialize favorites with defaults if not in storage
    if (!data.favorites) {
      favorites = {
        Default: [
          { url: "https://github.com", title: "GitHub", icon: "🔧" },
          { url: "https://stackoverflow.com", title: "Stack Overflow", icon: "📚" }
        ]
      };
      // Save defaults to storage
      chrome.storage.sync.set({ favorites });
    } else {
      favorites = data.favorites;
    }

    updateBlockRule();
    if (enabled && timerEnd && timerEnd > Date.now()) {
      setAlarm((timerEnd - Date.now()) / 60000);
    }
  }
);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.todos) todos = changes.todos.newValue || { Default: [] };
  if (changes.lists) lists = changes.lists.newValue || { Default: [] };
  if (changes.favorites) {
    console.log('[background] Favorites changed in storage:', changes.favorites.newValue);
    favorites = changes.favorites.newValue || { Default: [] };
  }
  if (changes.enableMathChallenge) enableMathChallenge = !!changes.enableMathChallenge.newValue;
  // normalize on change as well
  try {
    Object.keys(lists).forEach((k) => {
      if (!Array.isArray(lists[k])) {
        lists[k] = [];
        return;
      }
      if (lists[k].length && typeof lists[k][0] === 'string') {
        lists[k] = lists[k].map((d) => ({ url: d, requireChallenge: false, challengeType: 'none' }));
      } else {
        lists[k] = lists[k].map((d) => {
          if (!d) return null;
          if (typeof d === 'string') return { url: d, requireChallenge: false, challengeType: 'none' };
          const url = d.url || d.domain || '';
          const req = !!(d.requireChallenge || d.challengeRequired);
          const challengeType = d.challengeType || (req ? 'math' : (enableMathChallenge ? 'math' : 'none'));
          const challengeIntensity = d.challengeIntensity || d.intensity || undefined;
          const out = { url, requireChallenge: req, challengeType };
          if (challengeIntensity) out.challengeIntensity = challengeIntensity;
          return out;
        }).filter(Boolean);
      }
    });
  } catch (e) { }
  if (changes.activeList) activeList = changes.activeList.newValue || "Default";
  if (changes.enabled) enabled = changes.enabled.newValue;
  if (changes.timerEnd) timerEnd = changes.timerEnd.newValue;
  if (changes.pomodoroMode) pomodoroMode = changes.pomodoroMode.newValue;
  if (changes.pomodoroWork) pomodoroWork = changes.pomodoroWork.newValue;
  if (changes.pomodoroBreak) pomodoroBreak = changes.pomodoroBreak.newValue;
  if (changes.pomodoroLongBreak) pomodoroLongBreak = changes.pomodoroLongBreak.newValue;
  if (changes.currentCycle) currentCycle = changes.currentCycle.newValue;
  if (changes.pomodoroCount) pomodoroCount = changes.pomodoroCount.newValue;
  if (changes.paused) paused = changes.paused.newValue;
  if (changes.pausedRemaining) pausedRemaining = changes.pausedRemaining.newValue;
  // If temporaryUnlocks changed in storage, update local copy and create alarms for new entries
  if (changes.temporaryUnlocks) {
    const newVal = changes.temporaryUnlocks.newValue || {};
    const oldVal = changes.temporaryUnlocks.oldValue || {};
    // create alarms for any newly added unlocks
    Object.entries(newVal).forEach(([domain, ts]) => {
      if ((!oldVal || !oldVal[domain]) && ts && ts > Date.now()) {
        try {
          chrome.alarms.create("unlock:" + domain, { when: ts });
        } catch (e) {
          console.error('Failed to create unlock alarm for', domain, e);
        }
      }
    });
    temporaryUnlocks = newVal;
  }

  updateBlockRule();
  chrome.runtime.sendMessage({ type: "stateUpdate" }).catch(() => { });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  // handle unlock alarms (name: unlock:DOMAIN)
  if (alarm.name && alarm.name.startsWith("unlock:")) {
    const domain = alarm.name.substring("unlock:".length);
    if (temporaryUnlocks[domain]) {
      delete temporaryUnlocks[domain];
      chrome.storage.sync.set({ temporaryUnlocks }, () => {
        updateBlockRule();
        chrome.runtime.sendMessage({ type: "stateUpdate" }).catch(() => { });
      });
    }
    return;
  }

  if (alarm.name !== "timerExpire") return;

  // when alarm fires, timer is done, so clear pause flags too
  paused = false;
  pausedRemaining = null;
  if (pomodoroMode) {
    if (currentCycle === 0) {
      // end of work session
      pomodoroCount++;
      currentCycle = 1;
      const breakMin =
        pomodoroCount % 4 === 0 ? pomodoroLongBreak : pomodoroBreak;
      startTimer(breakMin, false); // no blocking during break
    } else {
      // end of break
      currentCycle = 0;
      startTimer(pomodoroWork, true); // blocking during work
    }
    chrome.storage.sync.set({ currentCycle, pomodoroCount, paused, pausedRemaining });
  } else {
    enabled = false;
    timerEnd = null;
    chrome.storage.sync.set({
      enabled: false,
      timerEnd: null,
      paused: false,
      pausedRemaining: null,
    });
  }
  chrome.runtime.sendMessage({ type: "stateUpdate" }).catch(() => { });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || !message.type) {
      sendResponse({ success: false, error: 'invalid_message' });
      return true;
    }

    if (message.type === "getState") {
      console.log('[background] getState - sending favorites:', favorites);
      sendResponse({
        enabled,
        timerEnd,
        activeList,
        lists,
        todos,
        pomodoroMode,
        pomodoroWork,
        pomodoroBreak,
        pomodoroLongBreak,
        currentCycle,
        pomodoroCount,
        paused,
        pausedRemaining,
        temporaryUnlocks,
        favorites,
      });
      return true;
    }

    if (message.type === "startTimer") {
      paused = false;
      pausedRemaining = null;
      chrome.storage.sync.set({ paused, pausedRemaining });

      const minutes = message.minutes;
      const isPomodoroStart = pomodoroMode && !enabled;
      if (isPomodoroStart) {
        pomodoroCount = 0;
        currentCycle = 0;
        chrome.storage.sync.set({ pomodoroCount, currentCycle });
      }
      startTimer(minutes, true);
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "pauseTimer") {
      console.debug('[background] pauseTimer requested');
      pauseTimer();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "resumeTimer") {
      console.debug('[background] resumeTimer requested');
      resumeTimer();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "stopTimer") {
      stopTimer();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "unlockSite") {
      const { domain, minutes } = message;
      if (!domain || !minutes || minutes <= 0) {
        sendResponse({ success: false });
        return true;
      }

      const expireTs = Date.now() + minutes * 60000;
      temporaryUnlocks[domain] = expireTs;

      chrome.storage.sync.set({ temporaryUnlocks }, async () => {
        try {
          chrome.alarms.create("unlock:" + domain, { when: expireTs });
        } catch (e) {
          console.error('Failed to create unlock alarm for', domain, e);
        }

        try {
          await updateBlockRule();
          chrome.runtime.sendMessage({ type: "stateUpdate" }).catch(() => { });
          sendResponse({ success: true });
        } catch (err) {
          console.error('Error applying block rules during unlock:', err);
          sendResponse({ success: false });
        }
      });
      return true; // keep sendResponse alive
    }

    if (message.type === "setPomodoro") {
      pomodoroMode = message.mode;
      pomodoroWork = message.work || pomodoroWork;
      pomodoroBreak = message.break || pomodoroBreak;
      pomodoroLongBreak = message.longBreak || pomodoroLongBreak;
      chrome.storage.sync.set({
        pomodoroMode,
        pomodoroWork,
        pomodoroBreak,
        pomodoroLongBreak,
      });
      sendResponse({ success: true });
      return true;
    }

    // Unknown message
    sendResponse({ success: false, error: 'unknown_message' });
    return true;
  } catch (err) {
    console.error('Error in onMessage handler', err);
    try { sendResponse({ success: false, error: 'exception' }); } catch (e) { }
    return true;
  }
});

function startTimer(minutes, enableBlocking) {
  enabled = enableBlocking;
  paused = false;
  pausedRemaining = null;

  const endTime =
    minutes > 0 ? Date.now() + minutes * 60000 : null;

  timerEnd = endTime;

  chrome.storage.sync.set({
    enabled,
    timerEnd: endTime,
    paused,
    pausedRemaining,
  });

  if (minutes > 0) setAlarm(minutes);
  else chrome.alarms.clear("timerExpire");

  updateBlockRule();
}

function pauseTimer() {
  if (!enabled || !timerEnd) return;

  const remaining = Math.max(0, timerEnd - Date.now());
  enabled = false;
  paused = true;
  pausedRemaining = remaining;
  timerEnd = null;

  chrome.alarms.clear("timerExpire");
  chrome.storage.sync.set({
    enabled,
    timerEnd,
    paused,
    pausedRemaining,
  });

  updateBlockRule(); // remove blocking while paused
}

function resumeTimer() {
  if (!paused || !pausedRemaining || pausedRemaining <= 0) return;

  enabled = true;
  paused = false;
  const minutes = pausedRemaining / 60000;
  const endTime = Date.now() + pausedRemaining;
  timerEnd = endTime;
  pausedRemaining = null;

  chrome.storage.sync.set({
    enabled,
    timerEnd,
    paused,
    pausedRemaining,
  });

  setAlarm(minutes);
  updateBlockRule();
}

function stopTimer() {
  enabled = false;
  currentCycle = 0;
  pomodoroCount = 0;
  timerEnd = null;
  paused = false;
  pausedRemaining = null;

  chrome.storage.sync.set({
    enabled,
    timerEnd,
    currentCycle,
    pomodoroCount,
    paused,
    pausedRemaining,
  });
  chrome.alarms.clear("timerExpire");
  updateBlockRule();
}

async function updateBlockRule() {
  const ruleId = 1;
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = oldRules.map((rule) => rule.id);

  const now = Date.now();

  // permanent whitelist
  const baseListEntries = lists[activeList] || [];
  // normalize entries to hostnames (lowercase, strip leading www.)
  const normalizeHost = (val) => {
    try {
      if (!val) return null;
      // if it looks like a full URL, parse it; otherwise prepend scheme
      const maybe = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(val) ? val : `https://${val}`;
      const u = new URL(maybe);
      return u.hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
      // fallback: try simple cleanup
      return String(val).replace(/^www\./, '').toLowerCase();
    }
  };

  const baseWhitelist = baseListEntries
    .map((entry) => (typeof entry === 'string' ? entry : entry.url))
    .map((v) => normalizeHost(v))
    .filter(Boolean);

  // temporary domains that are still valid
  const tempDomains = Object.entries(temporaryUnlocks)
    .filter(([_, ts]) => ts > now)
    .map(([domain]) => normalizeHost(domain) || domain)
    .filter(Boolean);

  // also clean up expired from memory
  const stillValid = {};
  Object.entries(temporaryUnlocks).forEach(([d, ts]) => {
    if (ts > now) stillValid[d] = ts;
  });
  temporaryUnlocks = stillValid;
  chrome.storage.sync.set({ temporaryUnlocks });

  const actualWhitelist = [...new Set([...baseWhitelist, ...tempDomains])];

  const newRules = [];

  if (enabled) {
    newRules.push({
      id: ruleId,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          regexSubstitution: `${chrome.runtime.getURL(
            "blocked.html"
          )}?url=\\1`,
        },
      },
      condition: {
        regexFilter: "^(https?://.*)$",
        resourceTypes: ["main_frame"],
        excludedRequestDomains: actualWhitelist,
      },
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: newRules,
  });
}


function setAlarm(minutes) {
  if (minutes > 0) {
    chrome.alarms.clear("timerExpire");
    chrome.alarms.create("timerExpire", { delayInMinutes: minutes });
    const endTime = Date.now() + minutes * 60000;
    chrome.storage.sync.set({ timerEnd: endTime });
  }
}
