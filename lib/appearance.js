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