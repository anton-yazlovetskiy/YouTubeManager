const GROUP_TITLE = "▶ Active";
const GROUP_COLOR = "green";

chrome.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === "close_completed_tab" && sender.tab) {
        const tabId = sender.tab.id;
        const groupId = sender.tab.groupId;
        if (groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
            const tabsInGroup = await chrome.tabs.query({ groupId: groupId });
            const currentIndex = tabsInGroup.findIndex(t => t.id === tabId);
            const nextTab = tabsInGroup[currentIndex + 1] || tabsInGroup[currentIndex - 1];
            if (nextTab) {
                await chrome.tabs.update(nextTab.id, { active: true });
                await new Promise(r => setTimeout(r, 400)); 
            }
        }
        chrome.tabs.remove(tabId);
    }
    if (message.action === "openVideo") {
        chrome.tabs.create({ url: message.url, active: false }, (tab) => {
            ensureInGroup(tab.id);
        });
    }
});

async function syncPlayback(activeTabId) {
    try {
        const tab = await chrome.tabs.get(activeTabId);
        if (!tab || !tab.url?.includes("youtube.com/watch")) return;
        const groupId = tab.groupId;
        if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return;

        const tabsInGroup = await chrome.tabs.query({ groupId: groupId });
        const lastIndex = tabsInGroup[tabsInGroup.length - 1].index;
        
        if (tab.index !== lastIndex) {
            await chrome.tabs.move(activeTabId, { index: lastIndex });
        }

        for (const t of tabsInGroup) {
            if (t.id === activeTabId) {
                chrome.scripting.executeScript({
                    target: { tabId: t.id },
                    func: () => {
                        const v = document.querySelector('video');
                        if (v) {
                            if (!window.ytEndListenerAdded) {
                                v.addEventListener('ended', () => chrome.runtime.sendMessage({ action: "close_completed_tab" }));
                                window.ytEndListenerAdded = true;
                            }
                            v.play().catch(() => {});
                        }
                    }
                }).catch(() => {});
            } else {
                chrome.scripting.executeScript({
                    target: { tabId: t.id },
                    func: () => { document.querySelector('video')?.pause(); }
                }).catch(() => {});
            }
        }
    } catch (e) {}
}

async function ensureInGroup(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url?.includes("youtube.com/watch")) return;
        const groups = await chrome.tabGroups.query({ title: GROUP_TITLE, windowId: tab.windowId });
        let targetGroupId = groups.length > 0 ? groups[0].id : null;
        await chrome.tabs.group({ tabIds: tabId, groupId: targetGroupId || undefined });
        if (!targetGroupId) {
            const newGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
            await chrome.tabGroups.update(newGroups[newGroups.length - 1].id, { title: GROUP_TITLE, color: GROUP_COLOR });
        }
    } catch (e) {}
}

chrome.tabGroups.onUpdated.addListener(async (group) => {
    if (group.title === GROUP_TITLE && !group.collapsed) {
        const tabs = await chrome.tabs.query({ groupId: group.id });
        if (tabs.length > 0) chrome.tabs.update(tabs[tabs.length - 1].id, { active: true });
    }
});

chrome.tabs.onActivated.addListener(info => syncPlayback(info.tabId));
chrome.tabs.onUpdated.addListener((id, change, tab) => {
    if (change.status === 'complete' && tab.url?.includes("youtube.com/watch")) {
        ensureInGroup(id);
        if (tab.active) syncPlayback(id);
    }
});