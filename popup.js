document.addEventListener('DOMContentLoaded', () => {
  const siteInput = document.getElementById('siteInput');
  const addButton = document.getElementById('addButton');
  const addCurrent = document.getElementById('addCurrent');
  const whitelistList = document.getElementById('whitelistList');
  const enableToggle = document.getElementById('enableToggle');
  const timerInput = document.getElementById('timerInput');
  const activeListSelect = document.getElementById('activeListSelect');
  const newListName = document.getElementById('newListName');
  const createList = document.getElementById('createList');
  const renameList = document.getElementById('renameList');
  const deleteList = document.getElementById('deleteList');

  let lists = { "Default": [] };
  let activeList = "Default";

  // Load initial data
  function loadData() {
    chrome.storage.sync.get(['lists', 'activeList', 'enabled', 'timerEnd'], (data) => {
      lists = data.lists || { "Default": [] };
      // Normalize lists entries to canonical format: { url, requireChallenge, challengeType }
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
              const challengeType = d.challengeType || (req ? 'math' : 'none');
              const challengeIntensity = d.challengeIntensity || d.intensity || undefined;
              const out = { url, requireChallenge: req, challengeType };
              if (challengeIntensity) out.challengeIntensity = challengeIntensity;
              return out;
            }).filter(Boolean);
          }
        });
        // Persist normalization back to storage so other parts see canonical format
        chrome.storage.sync.set({ lists });
      } catch (e) {
        console.warn('Failed to normalize lists in popup:', e);
      }
      activeList = data.activeList || "Default";
      enableToggle.checked = data.enabled !== false;

      // Populate list selector
      activeListSelect.innerHTML = '';
      Object.keys(lists).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === activeList) option.selected = true;
        activeListSelect.appendChild(option);
      });

      loadWhitelist();
    });
  }

  // Toggle enable (and set timer)
  enableToggle.onchange = () => {
    const minutes = parseInt(timerInput.value) || 0;
    chrome.storage.sync.set({ enabled: enableToggle.checked });
    if (enableToggle.checked && minutes > 0) {
      const endTime = Date.now() + minutes * 60000;
      chrome.storage.sync.set({ timerEnd: endTime });
      // Alarm set in background
    } else {
      chrome.storage.sync.set({ timerEnd: null });
      chrome.alarms.clear('timerExpire');
    }
  };

  // Change active list
  activeListSelect.onchange = () => {
    activeList = activeListSelect.value;
    chrome.storage.sync.set({ activeList });
    loadWhitelist();
  };

  // Create new list
  createList.onclick = () => {
    const name = newListName.value.trim();
    if (name && !lists[name]) {
      lists[name] = [];
      chrome.storage.sync.set({ lists });
      newListName.value = '';
      loadData();
    }
  };

  // Rename list
  renameList.onclick = () => {
    const newName = newListName.value.trim();
    if (newName && newName !== activeList && !lists[newName]) {
      lists[newName] = lists[activeList];
      delete lists[activeList];
      activeList = newName;
      chrome.storage.sync.set({ lists, activeList });
      newListName.value = '';
      loadData();
    }
  };

  // Delete list
  deleteList.onclick = () => {
    if (Object.keys(lists).length > 1 && confirm(`Delete "${activeList}"?`)) {
      delete lists[activeList];
      activeList = Object.keys(lists)[0];
      chrome.storage.sync.set({ lists, activeList });
      loadData();
    }
  };

  // Load and display current whitelist
  function loadWhitelist() {
    const whitelist = lists[activeList] || [];
    whitelistList.innerHTML = '';
    whitelist.forEach((entry, idx) => {
      const url = (entry && (entry.url || entry.domain)) || '';
      const requireChallenge = !!(entry && entry.requireChallenge);
      const challengeType = (entry && entry.challengeType) || (requireChallenge ? 'math' : 'none');
      const challengeIntensity = (entry && entry.challengeIntensity) || 'medium';

      const li = document.createElement('li');

      const text = document.createElement('span');
      text.textContent = url;
      text.className = 'whitelist-url';
      li.appendChild(text);

      // Challenge type selector
      const typeSel = document.createElement('select');
      ['none', 'math', 'reason', 'delay', 'typing'].forEach((t) => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        if (t === challengeType) o.selected = true;
        typeSel.appendChild(o);
      });
      typeSel.dataset.index = idx;
      typeSel.onchange = (e) => {
        const i = Number(e.target.dataset.index);
        const val = e.target.value;
        const arr = lists[activeList] || [];
        arr[i] = arr[i] || {};
        arr[i].challengeType = val;
        arr[i].requireChallenge = val !== 'none';
        lists[activeList] = arr;
        chrome.storage.sync.set({ lists }, () => loadWhitelist());
      };
      typeSel.className = 'sel-challenge-type';
      li.appendChild(typeSel);

      // Challenge intensity selector (only relevant when challengeType != 'none')
      const intensitySel = document.createElement('select');
      ['easy', 'medium', 'hard'].forEach((lvl) => {
        const o = document.createElement('option');
        o.value = lvl;
        o.textContent = lvl;
        if (lvl === challengeIntensity) o.selected = true;
        intensitySel.appendChild(o);
      });
      intensitySel.dataset.index = idx;
      intensitySel.onchange = (e) => {
        const i = Number(e.target.dataset.index);
        const val = e.target.value;
        const arr = lists[activeList] || [];
        arr[i] = arr[i] || {};
        arr[i].challengeIntensity = val;
        lists[activeList] = arr;
        chrome.storage.sync.set({ lists });
      };
      intensitySel.className = 'sel-challenge-intensity';
      intensitySel.style.marginLeft = '6px';
      if (challengeType === 'none') intensitySel.style.display = 'none';
      li.appendChild(intensitySel);

      // Ensure intensity visibility toggles when type changes
      typeSel.addEventListener('change', (e) => {
        intensitySel.style.display = e.target.value === 'none' ? 'none' : '';
      });

      const remove = document.createElement('span');
      remove.textContent = ' [Remove]';
      remove.className = 'remove';
      remove.onclick = () => removeSite(url);
      li.appendChild(remove);

      whitelistList.appendChild(li);
    });
  }

  // Add manually
  addButton.onclick = () => {
    let site = siteInput.value.trim().toLowerCase();
    if (site) {
      site = site.replace(/^www\./, '');
      addToWhitelist(site);
      siteInput.value = '';
    }
  };

  // Add current site's domain
  addCurrent.onclick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let tabUrl = tabs[0].url;
      if (tabUrl.startsWith(chrome.runtime.getURL(''))) {
        const params = new URLSearchParams(new URL(tabUrl).search);
        const original = params.get('url');
        if (original) tabUrl = original;
      }
      try {
        const url = new URL(tabUrl);
        let domain = url.hostname.toLowerCase();
        domain = domain.replace(/^www\./, '');
        addToWhitelist(domain);
      } catch (e) {
        alert('Cannot add this site (invalid URL).');
      }
    });
  };

  // Helper to add domain if not already in current list
  function addToWhitelist(domain) {
    let whitelist = lists[activeList] || [];
    if (!whitelist.some(e => (e && e.url) === domain)) {
      whitelist.push({ url: domain, requireChallenge: false, challengeType: 'none' });
      lists[activeList] = whitelist;
      chrome.storage.sync.set({ lists });
      loadWhitelist();
    }
  }

  // Remove site
  function removeSite(site) {
    let whitelist = lists[activeList] || [];
    // site may be a url string; remove matching entries by url
    whitelist = whitelist.filter(s => !s || s.url !== site);
    lists[activeList] = whitelist;
    chrome.storage.sync.set({ lists });
    loadWhitelist();
  }

  loadData();
});