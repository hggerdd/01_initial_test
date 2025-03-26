export class TabManager {
  constructor(hasFirefoxAPI) {
    this.hasFirefoxAPI = hasFirefoxAPI;
    this.lazyTabsMapping = {};
  }

  async saveActiveTab(topicIndex, topicsData) {
    if (!this.hasFirefoxAPI) return;
    
    try {
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0) {
        const activeTab = activeTabs[0];
        if (topicsData[topicIndex]?.tabs) {
          const tabUrls = topicsData[topicIndex].tabs.map(tab => tab.url);
          const activeTabIndex = tabUrls.indexOf(activeTab.url);
          if (activeTabIndex !== -1) {
            topicsData[topicIndex].activeTabIndex = activeTabIndex;
            return true;
          }
        }
      }
    } catch (error) {
      console.error("Error saving active tab:", error);
    }
    return false;
  }

  setupTabListeners(topicsData, currentTopicIndex, onTabsChanged) {
    if (!this.hasFirefoxAPI) return;

    // Beim Erstellen eines neuen Tabs
    browser.tabs.onCreated.addListener(() => {
      if (currentTopicIndex !== -1) {
        this.handleTabChange(currentTopicIndex, topicsData, onTabsChanged);
      }
    });

    // Beim Schließen eines Tabs
    browser.tabs.onRemoved.addListener((tabId) => {
      this.handleTabRemoved(tabId, currentTopicIndex, topicsData, onTabsChanged);
    });

    // Beim Aktualisieren eines Tabs
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url && currentTopicIndex !== -1) {
        this.handleTabChange(currentTopicIndex, topicsData, onTabsChanged);
      }
    });
  }

  // ... other tab management methods ...
}
