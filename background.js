// Airtime background service worker.
// Injects the floating widget into the active tab when the toolbar icon is clicked.

function flashBadge(text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: color || "#e5484d" });
    chrome.action.setBadgeText({ text: text });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
  } catch (_) { /* ignore */ }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) {
    flashBadge("!");
    return;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (err) {
    // Most failures here mean Chrome blocks scripting on this page
    // (chrome:// pages, the New Tab page, the Web Store, PDF viewer, etc.).
    console.error("Airtime: failed to inject widget", err);
    flashBadge("n/a");
  }
});
