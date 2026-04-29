function getRootDomain(hostname) {
  const parts = hostname.split('.');
  // Handle cases like co.uk, com.cn, etc.
  if (parts.length > 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  const pageUrl = getRootDomain(new URL(tab.url).hostname);
  const data = await chrome.storage.local.get({ hiddenPages: [] });
  const hiddenPages = data.hiddenPages;
  const index = hiddenPages.indexOf(pageUrl);

  if (index > -1) {
    // Was hidden → restore
    hiddenPages.splice(index, 1);
    chrome.tabs.sendMessage(tab.id, { action: 'showMinimap' }).catch((err) => {
      console.log('Could not send message to tab', tab.id, err);
    });
  } else {
    // Was visible → hide permanently
    hiddenPages.push(pageUrl);
    chrome.tabs.sendMessage(tab.id, { action: 'hideMinimap' }).catch((err) => {
      console.log('Could not send message to tab', tab.id, err);
    });
  }

  await chrome.storage.local.set({ hiddenPages });
});
