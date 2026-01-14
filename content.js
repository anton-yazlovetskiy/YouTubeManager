const styleId = 'yt-pro-neon-style';
if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .yt-pro-opened-video {
            outline: 4px solid #00f3ff !important;
            outline-offset: -4px !important;
            box-shadow: inset 0 0 15px #00f3ff, 0 0 10px #00f3ff !important;
            border-radius: 12px !important;
            z-index: 5 !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

const getContainer = (el) => el.closest('ytd-rich-grid-media, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer') || el;

function applyNeon() {
    if (!chrome.runtime?.id) return;
    chrome.storage.local.get(['openedVideos'], (res) => {
        const opened = Array.isArray(res.openedVideos) ? res.openedVideos : [];
        document.querySelectorAll('a[href*="watch?v="]').forEach(link => {
            const id = new URL(link.href, window.location.origin).searchParams.get('v');
            if (id && opened.includes(id)) {
                getContainer(link).classList.add('yt-pro-opened-video');
            }
        });
    });
}

function setInitialSpeed() {
    const video = document.querySelector('video');
    if (video && !video.dataset.speedInitialized) {
        chrome.storage.local.get(['preferredSpeed'], (r) => {
            if (r.preferredSpeed) {
                video.playbackRate = parseFloat(r.preferredSpeed);
                video.dataset.speedInitialized = "true";
            }
        });
    }
}

document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="watch?v="]');
    if (link && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (link.closest('ytd-playlist-panel-video-renderer')) return; 
        e.preventDefault();
        e.stopImmediatePropagation();
        const videoId = new URL(link.href, window.location.origin).searchParams.get('v');
        chrome.storage.local.get(['openedVideos'], (res) => {
            let list = Array.isArray(res.openedVideos) ? res.openedVideos : [];
            if (videoId && !list.includes(videoId)) {
                list.push(videoId);
                chrome.storage.local.set({ openedVideos: list.slice(-1000) });
            }
        });
        chrome.runtime.sendMessage({ action: "openVideo", url: link.href });
    }
}, true);

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "forceUpdateSpeed") {
        const video = document.querySelector('video');
        if (video) video.playbackRate = msg.newSpeed;
    }
});

setInterval(() => {
    applyNeon();
    setInitialSpeed();
}, 1000);