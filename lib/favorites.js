// Render favorites display on new tab
export function renderFavorites(state) {
  const favListNameEl = document.getElementById("favListName");
  const favoriteLinksEl = document.getElementById("favoriteLinks");

  if (!favListNameEl || !favoriteLinksEl) return;

  favListNameEl.textContent = state.activeList;
  favoriteLinksEl.innerHTML = "";

  const favorites = state.favorites[state.activeList] || [];

  if (favorites.length === 0) {
    const empty = document.createElement("div");
    empty.style.gridColumn = "1 / -1";
    empty.style.textAlign = "center";
    empty.style.opacity = "0.5";
    empty.style.fontSize = "12px";
    empty.style.padding = "20px";
    empty.textContent = "No favorites yet. Add some in Settings!";
    favoriteLinksEl.appendChild(empty);
    return;
  }

  favorites.forEach((fav) => {
    const link = document.createElement("a");
    link.className = "fav-link";
    link.href = fav.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const icon = document.createElement("div");
    icon.className = "fav-icon";
    icon.textContent = fav.icon || "🔖";

    const title = document.createElement("div");
    title.className = "fav-title";
    title.textContent = fav.title || "Untitled";

    link.append(icon, title);
    favoriteLinksEl.appendChild(link);
  });
}

// Render favorites list in settings (and Focus tab management)
export function renderFavList(state) {
  const targets = [
    document.getElementById("favList"),
    document.getElementById("settingsFavList")
  ];

  const currentFavListNameEl = document.getElementById("currentFavListName");
  if (currentFavListNameEl) {
    currentFavListNameEl.textContent = state.activeList;
  }

  const favorites = state.favorites[state.activeList] || [];

  targets.forEach(favListEl => {
    if (!favListEl) return;

    favListEl.innerHTML = "";

    if (favorites.length === 0) {
      const li = document.createElement("li");
      li.style.opacity = "0.6";
      li.style.textAlign = "center";
      li.style.padding = "12px";
      li.textContent = "No favorites in this list yet.";
      favListEl.appendChild(li);
      return;
    }

    favorites.forEach((fav, index) => {
      const li = document.createElement("li");
      li.className = "fav-item";

      const icon = document.createElement("div");
      icon.className = "fav-item-icon";
      icon.textContent = fav.icon || "🔖";

      const content = document.createElement("div");
      content.className = "fav-item-content";

      const title = document.createElement("div");
      title.className = "fav-item-title";
      title.textContent = fav.title || "Untitled";

      const url = document.createElement("div");
      url.className = "fav-item-url";
      url.textContent = fav.url;

      content.append(title, url);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "fav-item-delete";
      deleteBtn.textContent = "×";
      deleteBtn.onclick = () => removeFavorite(state, index);

      li.append(icon, content, deleteBtn);
      favListEl.appendChild(li);
    });
  });
}

export function addFavorite(state, url, title, icon) {
  if (!state.favorites[state.activeList]) {
    state.favorites[state.activeList] = [];
  }
  console.debug('Adding favorite:', { url, title, icon });
  state.favorites[state.activeList].push({
    url: url.trim(),
    title: title.trim() || url.trim(),
    icon: icon.trim() || "🔖",
  });
  console.debug('Favorite added. Current favorites:', state.favorites[state.activeList]);

  chrome.storage.sync.set({ favorites: state.favorites }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to save favorite:', chrome.runtime.lastError);
      alert('Failed to save favorite: ' + chrome.runtime.lastError.message);
      return;
    }
    console.debug('Favorites saved to storage successfully');
    renderFavorites(state);
    renderFavList(state);
  });
}

export function removeFavorite(state, index) {
  const favorites = state.favorites[state.activeList] || [];
  favorites.splice(index, 1);
  state.favorites[state.activeList] = favorites;

  chrome.storage.sync.set({ favorites: state.favorites }, () => {
    renderFavorites(state);
    renderFavList(state);
  });
}
