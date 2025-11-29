import { backgroundImages } from "./constants.js";

export function setRandomBackground() {
  if (!backgroundImages.length) return;
  const choice =
    backgroundImages[Math.floor(Math.random() * backgroundImages.length)];
  document.body.style.backgroundImage = `url('${choice}')`;
}

export function applyBackgroundFromSettings() {
  chrome.storage.sync.get(["useYoutubeBg", "youtubeBgUrl"], (data) => {
    const useYT = data.useYoutubeBg || false;
    const url = data.youtubeBgUrl || "";
    const ytContainer = document.getElementById("ytBackground");

    if (useYT) {
      const id = extractYoutubeId(url);
      if (!id) {
        setRandomBackground();
        ytContainer.classList.add("hidden");
        ytContainer.innerHTML = "";
        return;
      }

      // Show container
      ytContainer.classList.remove("hidden");
      // Remove static background
      document.body.style.backgroundImage = "none";

      // Create iframe directly
      // mute=1 is essential for autoplay
      // playlist=id and loop=1 are required for looping
      const embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${window.location.origin}`;

      ytContainer.innerHTML = `
        <iframe 
          id="yt-player-iframe"
          src="${embedUrl}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen
          style="width: 100vw; height: 100vh; pointer-events: none; border: none;"
        ></iframe>
      `;

    } else {
      // Disable YT
      ytContainer.classList.add("hidden");
      ytContainer.innerHTML = "";
      setRandomBackground();
    }

    // Update UI inputs
    const urlInput = document.getElementById("youtubeBgUrl");
    const toggle = document.getElementById("useYoutubeBg");
    if (urlInput) urlInput.value = url;
    if (toggle) toggle.checked = useYT;
  });
}

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