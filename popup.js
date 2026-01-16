const speedValue = document.getElementById('speedValue');

function updateDisplay() {
    chrome.storage.local.get(['preferredSpeed'], (res) => {
        let val = parseFloat(res.preferredSpeed || 1.5);
        val = Math.max(1, Math.min(2, val));
        speedValue.textContent = val.toFixed(2) + 'x';
    });
}

updateDisplay();

function update(delta) {
    chrome.storage.local.get(['preferredSpeed'], (res) => {
        let current = parseFloat(res.preferredSpeed || 1.5);
        current = Math.max(1, Math.min(2, current + delta));
        
        speedValue.textContent = current.toFixed(2) + 'x';
        chrome.storage.local.set({ preferredSpeed: current.toString() });
        
        // Отправляем сообщение во все вкладки
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "forceUpdateSpeed", newSpeed: current });
            }
        });
    });
}

document.getElementById('minus').onclick = () => update(-0.25);
document.getElementById('plus').onclick = () => update(0.25);