chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'play-sound') {
        const audio = new Audio(msg.target);
        audio.play().catch(e => console.error('Audio play error:', e));
    }
});
