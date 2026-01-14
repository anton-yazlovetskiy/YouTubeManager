const speedValue = document.getElementById('speedValue');

chrome.storage.local.get(['preferredSpeed'], (res) => {
    // Начальное значение теперь тоже зажато в новые рамки
    let val = parseFloat(res.preferredSpeed || 1.5);
    val = Math.max(1, Math.min(2, val));
    speedValue.textContent = val.toFixed(2) + 'x';
});

function update(delta) {
    chrome.storage.local.get(['preferredSpeed'], (res) => {
        let current = parseFloat(res.preferredSpeed || 1.5);
        // Новый диапазон: от 1 до 2
        current = Math.max(1, Math.min(2, current + delta));
        
        speedValue.textContent = current.toFixed(2) + 'x';
        chrome.storage.local.set({ preferredSpeed: current.toString() });
        
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "forceUpdateSpeed", newSpeed: current });
            }
        });
    });
}

document.getElementById('minus').onclick = () => update(-0.25);
document.getElementById('plus').onclick = () => update(0.25);