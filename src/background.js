// Background service worker for Epub Reader
chrome.runtime.onInstalled.addListener(() => {
  console.log('Epub Reader installed');
});

// Handle EPUB file associations if configured
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openReader') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/reader.html') });
  }
});
