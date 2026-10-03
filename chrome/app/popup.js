async function ensureInjected(tabId) {
  const res = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.fpvOverlayInjected
  });
  
  if (!res || !res[0] || !res[0].result) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    // Small delay to let init() run
    await new Promise(r => setTimeout(r, 50));
  }
}

document.getElementById('btn-toggle').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.url.startsWith('chrome://')) return;
  await ensureInjected(tab.id);
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.dispatchEvent(new CustomEvent('FPV_OVERLAY_TOGGLE'))
  });
  window.close();
});

document.getElementById('btn-settings').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.url.startsWith('chrome://')) return;
  await ensureInjected(tab.id);
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.dispatchEvent(new CustomEvent('FPV_OPEN_SETTINGS'))
  });
  window.close();
});
