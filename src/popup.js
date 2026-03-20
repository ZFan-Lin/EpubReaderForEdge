// Popup script
document.getElementById('openReader').addEventListener('click', () => {
  // Open the reader in a new tab
  const readerUrl = chrome.runtime.getURL('src/reader.html');
  chrome.tabs.create({ url: readerUrl });
});
