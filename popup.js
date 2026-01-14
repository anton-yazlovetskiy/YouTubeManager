const speedValue = document.getElementById('speedValue');

chrome.storage.local.get(['preferredSpeed'], (res) => {
    speedValue.textContent = parseFloat(res.preferredSpeed || 1.5).toFixed(2) + 'x';
});

function update(delta) {
    chrome.storage.local.get(['preferredSpeed'], (res) => {
        let current = parseFloat(res.preferredSpeed || 1.5);
        current = Math.max(0.25, Math.min(4, current + delta));
        speedValue.textContent = current.toFixed(2) + 'x';
        chrome.storage.local.set({ preferredSpeed: current.toString() });
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "forceUpdateSpeed", newSpeed: current });
        });
    });
}
document.getElementById('minus').onclick = () => update(-0.25);
document.getElementById('plus').onclick = () => update(0.25);