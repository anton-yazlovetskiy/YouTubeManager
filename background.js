const GROUP_TITLE = "▶ Active";
const GROUP_COLOR = "green";

chrome.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === "close_completed_tab" && sender.tab) {
        chrome.tabs.remove(sender.tab.id);
    }
    if (message.action === "openVideo") {
        chrome.tabs.create({ url: message.url, active: false }, (tab) => {
            ensureInGroup(tab.id);
        });
    }
});

async function syncPlayback(activeTabId) {
    try {
        const activeTab = await chrome.tabs.get(activeTabId);
        if (!activeTab || !activeTab.url?.includes("youtube.com/watch")) return;
        
        const groupId = activeTab.groupId;
        if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return;

        const tabsInGroup = await chrome.tabs.query({ groupId: groupId });
        
        // 1. Формируем очередь: перемещаем активную вкладку в самый конец группы
        const maxIndex = Math.max(...tabsInGroup.map(t => t.index));
        if (activeTab.index !== maxIndex) {
            await chrome.tabs.move(activeTabId, { index: maxIndex });
        }

        // 2. Управляем видео во всех вкладках группы
        for (const t of tabsInGroup) {
            if (t.id === activeTabId) {
                // Запускаем видео в активной вкладке через инъекцию скрипта
                chrome.scripting.executeScript({
                    target: { tabId: t.id },
                    func: () => {
                        const playVideo = () => {
                            const v = document.querySelector('video');
                            if (v) {
                                // Пытаемся воспроизвести. Если заблокировано — ждем клика
                                v.play().catch(() => {
                                    console.log("Autoplay blocked. Waiting for interaction.");
                                });
                                
                                if (!window.ytEndListenerAdded) {
                                    v.addEventListener('ended', () => chrome.runtime.sendMessage({ action: "close_completed_tab" }));
                                    window.ytEndListenerAdded = true;
                                }
                            }
                        };
                        // Небольшая задержка помогает, если вкладка только что стала активной
                        if (document.readyState === 'complete') playVideo();
                        else window.addEventListener('load', playVideo);
                        playVideo(); // Пробуем сразу
                    }
                }).catch(() => {});
            } else {
                // Ставим на паузу все остальные вкладки
                chrome.scripting.executeScript({
                    target: { tabId: t.id },
                    func: () => {
                        const v = document.querySelector('video');
                        if (v && !v.paused) v.pause();
                    }
                }).catch(() => {});
            }
        }
    } catch (e) {}
}

async function ensureInGroup(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) return;
        const groups = await chrome.tabGroups.query({ title: GROUP_TITLE, windowId: tab.windowId });
        let targetGroupId = groups.length > 0 ? groups[0].id : null;
        
        await chrome.tabs.group({ tabIds: tabId, groupId: targetGroupId || undefined });
        
        if (!targetGroupId) {
            const newGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
            await chrome.tabGroups.update(newGroups[newGroups.length - 1].id, { title: GROUP_TITLE, color: GROUP_COLOR });
        }
    } catch (e) {}
}

// Умный фокус при развертывании группы
chrome.tabGroups.onUpdated.addListener(async (group) => {
    if (group.title === GROUP_TITLE && !group.collapsed) {
        const tabs = await chrome.tabs.query({ groupId: group.id });
        if (tabs.length === 0) return;

        // Проверяем, есть ли играющее видео
        const results = await Promise.all(tabs.map(t => 
            chrome.scripting.executeScript({
                target: { tabId: t.id },
                func: () => { 
                    const v = document.querySelector('video');
                    return v && !v.paused && v.readyState >= 2; 
                }
            }).catch(() => [{ result: false }])
        ));

        const playingTabIdx = results.findIndex(r => r && r[0]?.result === true);

        if (playingTabIdx !== -1) {
            const playingTab = tabs[playingTabIdx];
            chrome.tabs.update(playingTab.id, { active: true });
        } else {
            // Если ничего не играет, прыгаем на последнюю
            chrome.tabs.update(tabs[tabs.length - 1].id, { active: true });
        }
    }
});

// Слушатель переключения вкладок
chrome.tabs.onActivated.addListener(info => {
    // Небольшая задержка перед синхронизацией, чтобы Chrome успел "осознать" активацию вкладки
    setTimeout(() => syncPlayback(info.tabId), 100);
});

chrome.tabs.onUpdated.addListener((id, change, tab) => {
    if (change.status === 'complete' && tab.url?.includes("youtube.com/watch")) {
        ensureInGroup(id);
        if (tab.active) syncPlayback(id);
    }
});