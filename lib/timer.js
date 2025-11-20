export function updateTimerDisplay(state) {
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

export function onButtonClick(state, updateState) {
  const btn = document.getElementById("startButton");
  console.debug('[timer] onButtonClick invoked, btn=', !!btn, 'state.enabled=', !!(state && state.enabled));
  if (btn) btn.disabled = true;
  if (state && state.enabled) {
        // running -> PAUSE
        console.debug('[timer] sending pauseTimer');
        chrome.runtime.sendMessage({ type: "pauseTimer" }, (resp) => {
          console.debug('[timer] pauseTimer response', resp, chrome.runtime.lastError);
          if (chrome.runtime.lastError) console.error('pauseTimer error', chrome.runtime.lastError);
          updateState();
          // storage may update slightly later; follow up once
          setTimeout(updateState, 300);
          if (btn) btn.disabled = false;
        });
      } else if (state.paused && state.pausedRemaining > 0) {
        // paused -> RESUME
        console.debug('[timer] sending resumeTimer');
        chrome.runtime.sendMessage({ type: "resumeTimer" }, (resp) => {
          console.debug('[timer] resumeTimer response', resp, chrome.runtime.lastError);
          if (chrome.runtime.lastError) console.error('resumeTimer error', chrome.runtime.lastError);
          updateState();
          setTimeout(updateState, 300);
          if (btn) btn.disabled = false;
        });
      } else {
        // idle -> START
        const minutes = state.pomodoroMode
          ? state.pomodoroWork
          : parseInt(document.getElementById("timerInput").value) || 0;
        console.debug('[timer] sending startTimer minutes=', minutes);
        chrome.runtime.sendMessage({ type: "startTimer", minutes }, (resp) => {
          console.debug('[timer] startTimer response', resp, chrome.runtime.lastError);
          if (chrome.runtime.lastError) console.error('startTimer error', chrome.runtime.lastError);
          updateState();
          setTimeout(updateState, 300);
          if (btn) btn.disabled = false;
        });
      }
}
