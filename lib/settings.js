export function saveSettings(updateState, applyBackgroundFromSettings) {
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
}