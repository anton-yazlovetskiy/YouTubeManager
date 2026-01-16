// --- 1. UI & TOASTS ---
function showToast(text, isError = false) {
    const oldToast = document.getElementById('yt-manager-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'yt-manager-toast';
    toast.textContent = text;
    
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: isError ? '#ff4444' : '#ffffff',
        color: isError ? '#ffffff' : '#000000',
        padding: '12px 24px',
        borderRadius: '25px',
        fontFamily: 'Roboto, Arial, sans-serif',
        fontSize: '16px',
        fontWeight: '500',
        zIndex: '2147483647',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        opacity: '0',
        transition: 'opacity 0.3s ease-in-out',
        pointerEvents: 'none'
    });

    (document.body || document.documentElement).appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = '1');

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
    }, 3000);
}

function safeExecute(contextName, fn) {
    try {
        fn();
    } catch (e) {
        if (!e.message.includes("parameter 1 is not of type 'Node'")) {
           showToast(`Error ${contextName}: ${e.message}`, true);
        }
    }
}

// --- 2. SPEED CONTROL & KEYBOARD INTERCEPT ---

let userInteractedRecently = false;
let enforcementActive = false;

// Слушаем события, чтобы отличать пользователя от авто-сброса
['mousedown', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, () => {
        userInteractedRecently = true;
        setTimeout(() => userInteractedRecently = false, 500); 
    }, true);
});

// ПЕРЕХВАТ КЛАВИШ (Shift + < / >) для ручного управления скоростью
window.addEventListener('keydown', (e) => {
    // Коды клавиш: 190 -> '.' (>), 188 -> ',' (<)
    // Shift + . = Увеличить скорость
    // Shift + , = Уменьшить скорость
    if (e.shiftKey && (e.keyCode === 190 || e.keyCode === 188)) {
        const video = document.querySelector('video');
        if (!video) return;

        e.preventDefault();
        e.stopImmediatePropagation(); // Блокируем стандартную обработку YouTube

        const delta = (e.keyCode === 190) ? 0.25 : -0.25;
        let currentRate = video.playbackRate;
        
        // Округляем до 0.25, чтобы избежать 1.1500001
        let newRate = Math.round((currentRate + delta) * 4) / 4;
        newRate = Math.max(0.25, Math.min(newRate, 3.0)); // YouTube обычно держит до 2x, но мы можем и шире, если плеер позволяет

        // Применяем и сохраняем
        userInteractedRecently = true; // Ставим флаг, что это мы
        video.playbackRate = newRate;
        sessionStorage.setItem('yt-manager-speed-override', newRate);
        showToast(`Скорость: ${newRate.toFixed(2)}x`);
    }
}, true); // Capture phase! Важно, чтобы перехватить до YouTube

async function getTargetSpeed() {
    return new Promise(resolve => {
        const sessionSpeed = sessionStorage.getItem('yt-manager-speed-override');
        if (sessionSpeed) {
            resolve(parseFloat(sessionSpeed));
            return;
        }
        chrome.storage.local.get(['preferredSpeed'], (r) => {
            resolve(parseFloat(r.preferredSpeed || 1.5));
        });
    });
}

async function enforceSpeed() {
    const video = document.querySelector('video');
    if (!video) return;

    const target = await getTargetSpeed();
    
    // Если скорость "уплыла" и это не действие пользователя
    if (Math.abs(video.playbackRate - target) > 0.05) {
        if (!userInteractedRecently) {
            enforcementActive = true;
            video.playbackRate = target;
            setTimeout(() => enforcementActive = false, 100);
        }
    }
}

// --- 3. AUTO-LIKE LOGIC ---

let watchedSeconds = 0;
let likeAttempted = false;

function handleAutoLike(video) {
    if (video.paused || likeAttempted) return;
    
    // Добавляем время (функция вызывается раз в секунду или по update)
    // Но лучше считать по timeupdate, тут мы используем простую эвристику внутри loop
}

function processAutoLike() {
    const video = document.querySelector('video');
    if (!video || video.paused) return;

    // Увеличиваем счетчик только если видео играет
    // (Этот метод вызывается из setInterval раз в секунду, погрешность приемлема)
    watchedSeconds++;

    if (watchedSeconds >= 60 && !likeAttempted) {
        likeAttempted = true; // Пробуем один раз
        tryLikeVideo();
    }
}

function tryLikeVideo() {
    // Селекторы кнопки лайка (YouTube часто меняет классы)
    // Обычно это кнопка внутри #segmented-like-button
    // Ищем кнопку, у которой есть aria-label "I like this" или похожее
    
    const likeBtn = document.querySelector(
        '#segmented-like-button button, ytd-toggle-button-renderer[is-icon-button] button#button'
    );

    if (likeBtn) {
        const isActive = likeBtn.getAttribute('aria-pressed') === 'true';
        if (!isActive) {
            likeBtn.click();
            showToast("👍 Auto-Like (1 мин просмотра)");
        }
    }
}

// Сброс счетчика при смене видео
function resetAutoLike() {
    watchedSeconds = 0;
    likeAttempted = false;
}

// --- 4. CORE LOGIC ---

function attachVideoListeners() {
    const video = document.querySelector('video');
    if (!video) return;

    // Проверка смены URL (для сброса лайка)
    if (video.dataset.currentSrc !== window.location.href) {
        video.dataset.currentSrc = window.location.href;
        resetAutoLike();
    }

    if (video.dataset.ytManagerAttached) return;
    video.dataset.ytManagerAttached = "true";

    video.addEventListener('ended', () => {
        chrome.runtime.sendMessage({ action: "close_completed_tab" });
    });

    video.addEventListener('ratechange', () => {
        if (enforcementActive) return;

        const newRate = video.playbackRate;
        if (userInteractedRecently) {
            sessionStorage.setItem('yt-manager-speed-override', newRate);
            showToast(`Скорость: ${newRate.toFixed(2)}x`);
        }
    });
}

// --- 5. NEON STYLE & CLICKS ---

const styleId = 'yt-pro-neon-style';
const styleEl = document.createElement('style');
styleEl.id = styleId;
styleEl.textContent = `
    .yt-pro-opened-video {
        outline: 4px solid #00f3ff !important;
        outline-offset: -4px !important;
        box-shadow: inset 0 0 15px #00f3ff, 0 0 10px #00f3ff !important;
        border-radius: 12px !important;
        z-index: 5 !important;
    }
`;
(document.head || document.documentElement).appendChild(styleEl);

function applyNeon() {
    safeExecute('applyNeon', () => {
        if (!chrome.runtime?.id) return;
        chrome.storage.local.get(['openedVideos'], (res) => {
            const opened = Array.isArray(res.openedVideos) ? res.openedVideos : [];
            const getContainer = (el) => el.closest('ytd-rich-grid-media, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer') || el;
            
            document.querySelectorAll('a[href*="watch?v="]').forEach(link => {
                const id = new URL(link.href, window.location.origin).searchParams.get('v');
                if (id && opened.includes(id)) {
                    getContainer(link).classList.add('yt-pro-opened-video');
                }
            });
        });
    });
}

document.addEventListener('click', (e) => {
    safeExecute('clickInterceptor', () => {
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
    });
}, true);

// --- 6. MESSAGING ---

chrome.runtime.onMessage.addListener((msg) => {
    safeExecute('messageHandler', () => {
        if (msg.action === "forceUpdateSpeed") {
            sessionStorage.removeItem('yt-manager-speed-override');
            const video = document.querySelector('video');
            if (video) {
                video.playbackRate = msg.newSpeed;
                showToast(`Скорость: ${msg.newSpeed.toFixed(2)}x`);
            }
        }
        if (msg.action === "syncPlayAndSpeed") {
            const video = document.querySelector('video');
            if (video) {
                enforceSpeed(); 
                if (video.paused) {
                    video.play().catch(() => {});
                }
            }
        }
        if (msg.action === "pauseVideo") {
            const video = document.querySelector('video');
            if (video && !video.paused) video.pause();
        }
        if (msg.action === "showErrorToast") {
            showToast(msg.text, true);
        }
    });
});

// --- 7. MAIN LOOP ---

const observerTarget = document.documentElement; 
const observer = new MutationObserver(() => {
    if (window.neonTimeout) clearTimeout(window.neonTimeout);
    window.neonTimeout = setTimeout(applyNeon, 500);
});
observer.observe(observerTarget, { childList: true, subtree: true });

setInterval(() => {
    safeExecute('mainLoop', () => {
        attachVideoListeners();
        enforceSpeed();
        processAutoLike(); // Проверка лайков каждую секунду
    });
}, 1000);

applyNeon();