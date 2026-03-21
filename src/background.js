// Background service worker for Citron Reader
chrome.runtime.onInstalled.addListener(() => {
  console.log('Citron Reader installed');
});

// Handle EPUB file associations if configured
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openReader') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/reader.html') });
  }
});
