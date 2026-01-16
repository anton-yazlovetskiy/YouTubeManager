const GROUP_TITLE = "▶ Active";
const GROUP_COLOR = "green";

// Безопасная обертка
async function safeRun(name, fn, tabId = null) {
    try {
        await fn();
    } catch (e) {
        console.error(`Error in ${name}:`, e);
        if (tabId) {
            chrome.tabs.sendMessage(tabId, {
                action: "showErrorToast",
                text: `Background Error (${name}): ${e.message}`
            }).catch(() => {});
        }
    }
}

chrome.runtime.onMessage.addListener((message, sender) => {
    safeRun("MessageListener", async () => {
        if (message.action === "close_completed_tab" && sender.tab) {
            await chrome.tabs.remove(sender.tab.id);
        }
        if (message.action === "openVideo") {
            // Явно создаем неактивной
            chrome.tabs.create({ url: message.url, active: false }, (tab) => {
                ensureInGroup(tab.id);
            });
        }
    }, sender.tab?.id);
});

async function syncPlayback(activeTabId) {
    safeRun("syncPlayback", async () => {
        const activeTab = await chrome.tabs.get(activeTabId);
        // Критическая проверка: если мы запустили эту функцию, но вкладка не активна (напр. при фоновой загрузке) - выходим.
        if (!activeTab || !activeTab.active || !activeTab.url?.includes("youtube.com/watch")) return;
        
        const groupId = activeTab.groupId;
        if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return;

        const tabsInGroup = await chrome.tabs.query({ groupId: groupId });
        
        // 1. Перемещаем активную в конец
        const maxIndex = Math.max(...tabsInGroup.map(t => t.index));
        if (activeTab.index !== maxIndex) {
            await chrome.tabs.move(activeTabId, { index: maxIndex });
        }

        // 2. Play/Pause логика
        for (const t of tabsInGroup) {
            if (t.id === activeTabId) {
                chrome.tabs.sendMessage(t.id, { action: "syncPlayAndSpeed" }).catch(() => {});
            } else {
                chrome.tabs.sendMessage(t.id, { action: "pauseVideo" }).catch(() => {});
            }
        }
    }, activeTabId);
}

async function ensureInGroup(tabId) {
    safeRun("ensureInGroup", async () => {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) return;
        
        const groups = await chrome.tabGroups.query({ title: GROUP_TITLE, windowId: tab.windowId });
        let targetGroupId = groups.length > 0 ? groups[0].id : null;
        
        await chrome.tabs.group({ tabIds: tabId, groupId: targetGroupId || undefined });
        
        if (!targetGroupId) {
            const updatedTab = await chrome.tabs.get(tabId);
            if (updatedTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                 await chrome.tabGroups.update(updatedTab.groupId, { title: GROUP_TITLE, color: GROUP_COLOR });
            }
        }
    }, tabId);
}

// ЛОГИКА ГРУПП (Anti-Collapse & Smart Focus)
chrome.tabGroups.onUpdated.addListener((group, change) => {
    safeRun("GroupUpdate", async () => {
        // Работаем только с нашей группой
        if (group.title !== GROUP_TITLE) return;

        const tabs = await chrome.tabs.query({ groupId: group.id });
        if (tabs.length === 0) return;

        // Ищем вкладку, где реально играет видео
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
        const hasPlayingVideo = playingTabIdx !== -1;

        // СЦЕНАРИЙ 1: Пользователь СВЕРНУЛ группу (collapsed стало true)
        if (change.collapsed === true) {
            if (hasPlayingVideo) {
                // Если видео играет - ОТМЕНЯЕМ сворачивание
                await chrome.tabGroups.update(group.id, { collapsed: false });
                // И фокусируемся на видео
                await chrome.tabs.update(tabs[playingTabIdx].id, { active: true });
            } 
            // Если ничего не играет - разрешаем свернуть (ничего не делаем)
        }

        // СЦЕНАРИЙ 2: Пользователь РАЗВЕРНУЛ группу (collapsed стало false)
        else if (change.collapsed === false) {
            if (hasPlayingVideo) {
                await chrome.tabs.update(tabs[playingTabIdx].id, { active: true });
            } else {
                // Если тишина - открываем последнюю
                await chrome.tabs.update(tabs[tabs.length - 1].id, { active: true });
            }
        }
    });
});

chrome.tabs.onActivated.addListener(info => {
    setTimeout(() => syncPlayback(info.tabId), 200);
});

chrome.tabs.onUpdated.addListener((id, change, tab) => {
    if (change.status === 'complete' && tab.url?.includes("youtube.com/watch")) {
        ensureInGroup(id);
        // Запускаем синхронизацию ТОЛЬКО если вкладка активна. 
        // Это чинит баг с авто-запуском первого видео в фоне.
        if (tab.active) {
            syncPlayback(id);
        }
    }
});