document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.panel');
  const enableToggle = document.getElementById('enableToggle');
  const statusText = document.getElementById('statusText');

  // Whitelist Elements
  const activeListSelect = document.getElementById('activeListSelect');
  const manageListsBtn = document.getElementById('manageListsBtn');
  const listManagement = document.getElementById('listManagement');
  const newListName = document.getElementById('newListName');
  const createList = document.getElementById('createList');
  const renameList = document.getElementById('renameList');
  const deleteList = document.getElementById('deleteList');
  const addCurrentSite = document.getElementById('addCurrentSite');
  const siteInput = document.getElementById('siteInput');
  const addSiteBtn = document.getElementById('addSiteBtn');
  const whitelistList = document.getElementById('whitelistList');

  // Favorites Elements
  const favListName = document.getElementById('favListName');
  const addCurrentFav = document.getElementById('addCurrentFav');
  const favUrlInput = document.getElementById('favUrlInput');
  const favTitleInput = document.getElementById('favTitleInput');
  const favIconInput = document.getElementById('favIconInput');
  const addFavBtn = document.getElementById('addFavBtn');
  const favoritesList = document.getElementById('favoritesList');

  // State
  let state = {
    lists: { "Default": [] },
    favorites: { "Default": [] },
    activeList: "Default",
    enabled: false
  };

  // --- Initialization ---

  function init() {
    loadData();
    setupTabs();
    setupEventListeners();
  }

  function loadData() {
    chrome.storage.sync.get(['lists', 'favorites', 'activeList', 'enabled'], (data) => {
      state.lists = data.lists || { "Default": [] };
      state.favorites = data.favorites || { "Default": [] };
      state.activeList = data.activeList || "Default";
      state.enabled = data.enabled || false;

      // Ensure favorites structure exists
      if (!state.favorites[state.activeList]) {
        state.favorites[state.activeList] = [];
      }

      updateUI();
    });
  }

  function updateUI() {
    // Status
    enableToggle.checked = state.enabled;
    statusText.textContent = state.enabled ? "Enabled" : "Disabled";
    statusText.style.color = state.enabled ? "#4CAF50" : "var(--muted)";

    // List Select
    activeListSelect.innerHTML = '';
    Object.keys(state.lists).forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === state.activeList) option.selected = true;
      activeListSelect.appendChild(option);
    });

    // Labels
    favListName.textContent = state.activeList;

    // Lists
    renderWhitelist();
    renderFavorites();
  }

  // --- Tabs ---

  function setupTabs() {
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const panelId = tab.dataset.tab + 'Panel';
        document.getElementById(panelId).classList.add('active');
      });
    });
  }

  // --- Event Listeners ---

  function setupEventListeners() {
    // Toggle Enable
    enableToggle.addEventListener('change', () => {
      state.enabled = enableToggle.checked;
      chrome.storage.sync.set({ enabled: state.enabled });
      updateUI();
    });

    // List Selection
    activeListSelect.addEventListener('change', () => {
      state.activeList = activeListSelect.value;
      chrome.storage.sync.set({ activeList: state.activeList });
      updateUI();
    });

    // Manage Lists Toggle
    manageListsBtn.addEventListener('click', () => {
      const isHidden = listManagement.style.display === 'none';
      listManagement.style.display = isHidden ? 'flex' : 'none';
    });

    // Create List
    createList.addEventListener('click', () => {
      const name = newListName.value.trim();
      if (name && !state.lists[name]) {
        state.lists[name] = [];
        state.favorites[name] = []; // Create corresponding favorites list
        chrome.storage.sync.set({ lists: state.lists, favorites: state.favorites });
        newListName.value = '';
        loadData();
      }
    });

    // Rename List
    renameList.addEventListener('click', () => {
      const newName = newListName.value.trim();
      if (newName && newName !== state.activeList && !state.lists[newName]) {
        // Move whitelist
        state.lists[newName] = state.lists[state.activeList];
        delete state.lists[state.activeList];

        // Move favorites
        state.favorites[newName] = state.favorites[state.activeList] || [];
        delete state.favorites[state.activeList];

        state.activeList = newName;
        chrome.storage.sync.set({
          lists: state.lists,
          favorites: state.favorites,
          activeList: state.activeList
        });
        newListName.value = '';
        loadData();
      }
    });

    // Delete List
    deleteList.addEventListener('click', () => {
      if (state.activeList === 'Default') {
        alert('Cannot delete Default list.');
        return;
      }
      if (confirm(`Delete "${state.activeList}"?`)) {
        delete state.lists[state.activeList];
        delete state.favorites[state.activeList];
        state.activeList = Object.keys(state.lists)[0] || 'Default';
        chrome.storage.sync.set({
          lists: state.lists,
          favorites: state.favorites,
          activeList: state.activeList
        });
        loadData();
      }
    });

    // --- Whitelist Actions ---

    addSiteBtn.addEventListener('click', () => {
      const url = siteInput.value.trim();
      if (url) {
        addToWhitelist(url);
        siteInput.value = '';
      }
    });

    addCurrentSite.addEventListener('click', () => {
      getCurrentTabUrl((url) => {
        if (url) addToWhitelist(url);
      });
    });

    // --- Favorites Actions ---

    addFavBtn.addEventListener('click', () => {
      const url = favUrlInput.value.trim();
      const title = favTitleInput.value.trim();
      const icon = favIconInput.value.trim();
      if (url) {
        addFavorite(url, title, icon);
        favUrlInput.value = '';
        favTitleInput.value = '';
        favIconInput.value = '';
      }
    });

    addCurrentFav.addEventListener('click', () => {
      getCurrentTabUrl((url, title, favIconUrl) => {
        if (url) {
          // Try to guess an icon or use default
          const icon = "⭐";
          addFavorite(url, title, icon);
        }
      });
    });
  }

  // --- Logic Helpers ---

  function getCurrentTabUrl(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      const tab = tabs[0];
      let url = tab.url;

      // Handle blocked pages redirection
      if (url.startsWith(chrome.runtime.getURL(''))) {
        const params = new URLSearchParams(new URL(url).search);
        const original = params.get('url');
        if (original) url = original;
      }

      try {
        const u = new URL(url);
        // For whitelist we want hostname usually, but let's pass full url or hostname depending on usage
        // Here we pass full URL object info
        callback(u.href, tab.title, tab.favIconUrl);
      } catch (e) {
        alert('Invalid URL');
      }
    });
  }

  function addToWhitelist(rawUrl) {
    // Normalize
    let domain = rawUrl;
    try {
      // If it doesn't have protocol, add https to parse
      if (!/^https?:\/\//i.test(domain)) {
        domain = 'https://' + domain;
      }
      const u = new URL(domain);
      domain = u.hostname.replace(/^www\./, '');
    } catch (e) {
      // fallback
      domain = rawUrl.replace(/^www\./, '');
    }

    const list = state.lists[state.activeList] || [];
    // Check duplicate
    if (list.some(item => (item.url || item.domain || item) === domain)) {
      return; // Already exists
    }

    list.push({ url: domain, requireChallenge: false, challengeType: 'none' });
    state.lists[state.activeList] = list;
    chrome.storage.sync.set({ lists: state.lists }, renderWhitelist);
  }

  function removeFromWhitelist(index) {
    const list = state.lists[state.activeList] || [];
    list.splice(index, 1);
    state.lists[state.activeList] = list;
    chrome.storage.sync.set({ lists: state.lists }, renderWhitelist);
  }

  function addFavorite(url, title, icon) {
    // Normalize URL
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const list = state.favorites[state.activeList] || [];
    list.push({
      url: url,
      title: title || new URL(url).hostname,
      icon: icon || "🔖"
    });
    state.favorites[state.activeList] = list;
    chrome.storage.sync.set({ favorites: state.favorites }, renderFavorites);
  }

  function removeFavorite(index) {
    const list = state.favorites[state.activeList] || [];
    list.splice(index, 1);
    state.favorites[state.activeList] = list;
    chrome.storage.sync.set({ favorites: state.favorites }, renderFavorites);
  }

  // --- Rendering ---

  function renderWhitelist() {
    whitelistList.innerHTML = '';
    const list = state.lists[state.activeList] || [];

    if (list.length === 0) {
      whitelistList.innerHTML = '<div class="empty-state">No allowed sites in this list.</div>';
      return;
    }

    list.forEach((item, index) => {
      const url = item.url || item.domain || item; // handle legacy strings

      const li = document.createElement('li');
      li.innerHTML = `
        <div class="list-content">
          <div class="list-title">${url}</div>
        </div>
        <button class="btn-icon btn-delete" title="Remove">X</button>
      `;

      li.querySelector('.btn-delete').addEventListener('click', () => removeFromWhitelist(index));
      whitelistList.appendChild(li);
    });
  }

  function renderFavorites() {
    favoritesList.innerHTML = '';
    const list = state.favorites[state.activeList] || [];

    if (list.length === 0) {
      favoritesList.innerHTML = '<div class="empty-state">No favorites in this list.</div>';
      return;
    }

    list.forEach((fav, index) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div style="font-size: 20px;">${fav.icon || '🔖'}</div>
        <div class="list-content">
          <div class="list-title">${fav.title}</div>
          <div class="list-subtitle">${fav.url}</div>
        </div>
        <button class="btn-icon btn-delete" title="Remove">X</button>
      `;

      li.querySelector('.btn-delete').addEventListener('click', () => removeFavorite(index));
      favoritesList.appendChild(li);
    });
  }

  // Start
  init();
});