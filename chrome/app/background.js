chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://')) return;

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.fpvOverlayInjected
  });

  if (results && results[0] && results[0].result) {
    // Already injected, just toggle the modal/overlay
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { document.dispatchEvent(new CustomEvent('FPV_OVERLAY_TOGGLE')); }
    });
  } else {
    // Inject CSS and JS
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  }
});
