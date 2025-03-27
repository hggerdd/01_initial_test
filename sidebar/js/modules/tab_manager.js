/**
 * TabManager - Handles Firefox tab management by topic with strict assignments
 */
export class TabManager {
  constructor(hasFirefoxAPI = true) {
    this.hasFirefoxAPI = hasFirefoxAPI;
    this.tabToTopicMap = new Map(); // Once assigned, never changes until tab closes
    this.currentTopicIndex = -1;
    this.hasTabHideAPI = this.checkTabHideAPI();
    this.DEBUG = true;
    this.onTabsChanged = null; // Callback for tab changes
  }

  log(...args) {
    if (this.DEBUG) console.log("[TabManager]", ...args);
  }

  // API checks
  checkTabHideAPI() {
    try {
      return typeof browser !== 'undefined' && 
             browser.tabs && 
             typeof browser.tabs.hide === 'function' &&
             typeof browser.tabs.show === 'function';
    } catch (e) {
      return false;
    }
  }

  isRegularTab(url) {
    return url && 
           !url.startsWith("about:") && 
           !url.startsWith("chrome:") && 
           !url.startsWith("moz-extension:") &&
           url !== "about:blank";
  }

  // INITIALIZATION
  async initialize(topicsData) {
    if (!this.hasFirefoxAPI) return;
    
    try {
      if (!this.hasTabHideAPI) {
        this.log("[ERROR] Tab Hide API not available");
        return;
      }
      
      // Get all tabs
      const allTabs = await browser.tabs.query({});
      const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
      this.log(`[init] Found ${regularTabs.length} regular tabs`);
      
      // Set initial topic if needed
      if (this.currentTopicIndex === -1 && topicsData?.length > 0) {
        this.currentTopicIndex = 0;
        this.log(`[init] Setting initial topic: ${this.currentTopicIndex}`);
      }
      
      // Assign tabs to topics - ONLY for tabs not yet assigned
      await this.assignInitialTabs(regularTabs, topicsData);
      
      // Enforce visibility based on current topic
      await this.enforceTabVisibility();
      
      // Setup event listeners
      this.setupTabListeners(topicsData);
      
      // Update UI
      await this.updateTabsOverview(topicsData);
      
      this.log(`[init] Initialization complete, current topic: ${this.currentTopicIndex}`);
    } catch (e) {
      this.log(`[ERROR] Initialization failed: ${e.message}`);
    }
  }
  
  async assignInitialTabs(regularTabs, topicsData) {
    this.log(`[init] Assigning initial tabs to topics`);
    const assignedTabs = new Set();
    
    // First, try to match tabs to topics based on saved URLs
    if (topicsData?.length > 0) {
      for (let topicIndex = 0; topicIndex < topicsData.length; topicIndex++) {
        const topic = topicsData[topicIndex];
        if (!topic.tabs || !topic.tabs.length) continue;
        
        topic.tabs.forEach(savedTab => {
          const matchingTab = regularTabs.find(tab => 
            tab.url === savedTab.url && 
            !assignedTabs.has(tab.id) && 
            !this.tabToTopicMap.has(tab.id)
          );
          
          if (matchingTab) {
            this.tabToTopicMap.set(matchingTab.id, topicIndex);
            assignedTabs.add(matchingTab.id);
            this.log(`[init] Matched tab ${matchingTab.id} to topic ${topicIndex}`);
          }
        });
      }
    }
    
    // Then, assign remaining tabs to current topic
    regularTabs.forEach(tab => {
      if (!assignedTabs.has(tab.id) && !this.tabToTopicMap.has(tab.id)) {
        this.tabToTopicMap.set(tab.id, this.currentTopicIndex);
        this.log(`[init] Assigned new tab ${tab.id} to current topic ${this.currentTopicIndex}`);
      }
    });
    
    // Print summary of tab assignments
    this.logTabAssignments(topicsData);
  }
  
  async enforceTabVisibility() {
    if (this.currentTopicIndex < 0) return;
    
    try {
      const allTabs = await browser.tabs.query({});
      const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
      
      const tabsToShow = [];
      const tabsToHide = [];
      
      // Categorize tabs
      regularTabs.forEach(tab => {
        const tabTopic = this.tabToTopicMap.get(tab.id);
        
        if (tabTopic === this.currentTopicIndex) {
          if (tab.hidden) {
            tabsToShow.push(tab.id);
          }
        } else {
          if (!tab.hidden) {
            tabsToHide.push(tab.id);
          }
        }
      });
      
      // First hide tabs that should be hidden
      if (tabsToHide.length > 0) {
        this.log(`[enforce] Hiding ${tabsToHide.length} tabs not in current topic`);
        await browser.tabs.hide(tabsToHide);
      }
      
      // Then show tabs that should be visible
      if (tabsToShow.length > 0) {
        this.log(`[enforce] Showing ${tabsToShow.length} tabs for current topic`);
        await browser.tabs.show(tabsToShow);
      }
      
      // Verify the results
      await this.verifyTabVisibility();
      
    } catch (e) {
      this.log(`[ERROR] enforceTabVisibility failed: ${e.message}`);
    }
  }
  
  // TOPIC SWITCHING
  async switchToTopic(topicIndex, topicsData) {
    if (!this.hasFirefoxAPI || !this.hasTabHideAPI) return false;
    
    try {
      // Validate inputs
      if (!topicsData || topicIndex < 0 || topicIndex >= topicsData.length) {
        this.log(`[ERROR] Invalid topic index: ${topicIndex}`);
        return false;
      }
      
      // Skip if already on this topic
      if (topicIndex === this.currentTopicIndex) {
        this.log(`[switch] Already on topic ${topicIndex}, skipping`);
        return true;
      }
      
      const oldTopicIndex = this.currentTopicIndex;
      this.log(`[switch] Switching from topic ${oldTopicIndex} to ${topicIndex}`);
      
      // Update current topic
      this.currentTopicIndex = topicIndex;
      
      // Get all tabs
      const allTabs = await browser.tabs.query({});
      const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
      
      // Determine which tabs to hide/show
      const tabsToHide = [];
      const tabsToShow = [];
      
      for (const tab of regularTabs) {
        const tabTopic = this.tabToTopicMap.get(tab.id);
        
        // If tab belongs to new topic and is hidden, show it
        if (tabTopic === topicIndex && tab.hidden) {
          tabsToShow.push(tab.id);
        } 
        // If tab doesn't belong to new topic and is visible, hide it
        else if (tabTopic !== topicIndex && !tab.hidden) {
          tabsToHide.push(tab.id);
        }
      }
      
      // First hide tabs that should be hidden
      if (tabsToHide.length > 0) {
        this.log(`[switch] Hiding ${tabsToHide.length} tabs not in new topic`);
        await browser.tabs.hide(tabsToHide);
      }
      
      // Then show tabs for current topic
      const currentTopicTabs = regularTabs.filter(tab => 
        this.tabToTopicMap.get(tab.id) === topicIndex
      );
      
      if (tabsToShow.length > 0) {
        this.log(`[switch] Showing ${tabsToShow.length} tabs for new topic`);
        await browser.tabs.show(tabsToShow);
        
        // Activate a tab if we have any
        const targetTopic = topicsData[topicIndex];
        const activeIndex = targetTopic.activeTabIndex || 0;
        
        if (currentTopicTabs.length > 0) {
          const tabToActivate = currentTopicTabs[Math.min(activeIndex, currentTopicTabs.length - 1)].id;
          await browser.tabs.update(tabToActivate, { active: true });
          this.log(`[switch] Activated tab ${tabToActivate}`);
        }
      } else if (currentTopicTabs.length === 0) {
        // Create default tab if topic has no tabs
        await this.createDefaultTab(topicIndex);
      }
      
      // Verify final state
      await this.verifyTabVisibility();
      
      // Update UI
      await this.updateTabsOverview(topicsData);
      
      return true;
    } catch (e) {
      this.log(`[ERROR] switchToTopic failed: ${e.message}`);
      return false;
    }
  }
  
  // TAB OPERATIONS
  async saveCurrentTabs(topicIndex, topicsData) {
    if (!this.hasFirefoxAPI || topicIndex < 0 || !topicsData?.[topicIndex]) return false;
    
    try {
      // Find all tabs belonging to this topic
      const allTabs = await browser.tabs.query({});
      const topicTabs = allTabs.filter(tab => 
        this.isRegularTab(tab.url) && 
        this.tabToTopicMap.get(tab.id) === topicIndex
      );
      
      this.log(`[save] Saving ${topicTabs.length} tabs for topic ${topicIndex}`);
      
      // Update the topic data
      topicsData[topicIndex].tabs = topicTabs.map(tab => ({
        url: tab.url,
        title: tab.title || "Untitled",
        favIconUrl: tab.favIconUrl || ""
      }));
      
      // Save active tab index if any tab is active
      const activeTabIndex = topicTabs.findIndex(tab => tab.active);
      if (activeTabIndex !== -1) {
        topicsData[topicIndex].activeTabIndex = activeTabIndex;
      }
      
      return true;
    } catch (e) {
      this.log(`[ERROR] saveCurrentTabs failed: ${e.message}`);
      return false;
    }
  }
  
  async createDefaultTab(topicIndex) {
    try {
      this.log(`[default] Creating default tab for topic ${topicIndex}`);
      const newTab = await browser.tabs.create({
        url: 'https://www.google.de',
        active: true
      });
      
      // Assign to topic and keep visible
      this.tabToTopicMap.set(newTab.id, topicIndex);
      this.log(`[default] Assigned new tab ${newTab.id} to topic ${topicIndex}`);
      
      return newTab.id;
    } catch (e) {
      this.log(`[ERROR] createDefaultTab failed: ${e.message}`);
      return null;
    }
  }
  
  async closeTabsForTopic(topicIndex) {
    try {
      // Find all tabs for this topic
      const tabIdsToClose = [];
      
      for (const [tabId, mappedTopic] of this.tabToTopicMap.entries()) {
        if (mappedTopic === topicIndex) {
          tabIdsToClose.push(tabId);
        }
      }
      
      if (tabIdsToClose.length > 0) {
        this.log(`[close] Closing ${tabIdsToClose.length} tabs for topic ${topicIndex}`);
        await browser.tabs.remove(tabIdsToClose);
        
        // Tab removal listener will handle cleanup of tabToTopicMap
      }
      
      return true;
    } catch (e) {
      this.log(`[ERROR] closeTabsForTopic failed: ${e.message}`);
      return false;
    }
  }
  
  // EVENT HANDLING
  setupTabListeners(topicsData) {
    if (!this.hasFirefoxAPI) return;
    
    // Tab created
    browser.tabs.onCreated.addListener(async (tab) => {
      if (!this.isRegularTab(tab.url)) return;
      
      // Only assign tab to a topic if it's not already assigned
      if (!this.tabToTopicMap.has(tab.id)) {
        this.log(`[event] New tab created: ${tab.id} (${tab.url})`);
        
        // Assign to current topic
        this.tabToTopicMap.set(tab.id, this.currentTopicIndex);
        this.log(`[event] Assigned new tab ${tab.id} to current topic ${this.currentTopicIndex}`);
        
        // Add to topic data
        if (topicsData?.[this.currentTopicIndex]?.tabs) {
          topicsData[this.currentTopicIndex].tabs.push({
            url: tab.url || "",
            title: tab.title || "Untitled",
            favIconUrl: tab.favIconUrl || ""
          });
        }
        
        // Enforce visibility
        await this.enforceTabVisibility();
        
        // Notify about tab change
        if (this.onTabsChanged) {
          this.onTabsChanged(this.currentTopicIndex);
        }
      }
    });
    
    // Tab removed
    browser.tabs.onRemoved.addListener(async (tabId) => {
      // Check if this tab was mapped
      if (this.tabToTopicMap.has(tabId)) {
        const topicIndex = this.tabToTopicMap.get(tabId);
        this.log(`[event] Tab ${tabId} removed from topic ${topicIndex}`);
        
        // Remove from mapping
        this.tabToTopicMap.delete(tabId);
        
        // Notify about tab change if it was in current topic
        if (topicIndex === this.currentTopicIndex && this.onTabsChanged) {
          this.onTabsChanged(this.currentTopicIndex);
        }
      }
    });
    
    // Tab updated
    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.url && this.isRegularTab(changeInfo.url)) {
        this.log(`[event] Tab URL updated: ${tabId} -> ${changeInfo.url}`);
        
        // If tab doesn't have an assigned topic yet, assign it
        if (!this.tabToTopicMap.has(tabId)) {
          this.tabToTopicMap.set(tabId, this.currentTopicIndex);
          this.log(`[event] Assigned updated tab ${tabId} to current topic ${this.currentTopicIndex}`);
          
          // Enforce visibility based on assignment
          const tabTopic = this.currentTopicIndex;
          if (tabTopic !== this.currentTopicIndex) {
            // Hide tab if it's not in the current topic
            await browser.tabs.hide([tabId]);
            this.log(`[event] Hid updated tab ${tabId} (belongs to topic ${tabTopic})`);
          }

          // Notify about tab change
          if (this.onTabsChanged) {
            this.onTabsChanged(this.currentTopicIndex);
          }
        }
      }
    });
  }
  
  // UTILITIES
  async verifyTabVisibility() {
    try {
      const allTabs = await browser.tabs.query({});
      const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
      
      const visibleTabs = regularTabs.filter(tab => !tab.hidden);
      const hiddenTabs = regularTabs.filter(tab => tab.hidden);
      
      this.log(`[verify] State: ${visibleTabs.length} visible, ${hiddenTabs.length} hidden`);
      
      // Check for incorrect visibility
      const wrongVisibleTabs = visibleTabs.filter(tab => 
        this.tabToTopicMap.get(tab.id) !== this.currentTopicIndex
      );
      
      const wrongHiddenTabs = hiddenTabs.filter(tab => 
        this.tabToTopicMap.get(tab.id) === this.currentTopicIndex
      );
      
      // Log visible tabs
      visibleTabs.forEach(tab => {
        const topic = this.tabToTopicMap.get(tab.id) || 'none';
        const isCorrect = topic === this.currentTopicIndex;
        this.log(`[verify] Visible: Tab ${tab.id} in topic ${topic} (${isCorrect ? 'CORRECT' : 'WRONG'})`);
      });
      
      // Report errors
      if (wrongVisibleTabs.length > 0) {
        this.log(`[verify] ERROR: ${wrongVisibleTabs.length} tabs visible but in wrong topic!`);
        
        // Try to fix the issue
        const tabIdsToHide = wrongVisibleTabs.map(tab => tab.id);
        await browser.tabs.hide(tabIdsToHide);
        this.log(`[verify] Attempted to hide ${tabIdsToHide.length} incorrectly visible tabs`);
      }
      
      if (wrongHiddenTabs.length > 0) {
        this.log(`[verify] ERROR: ${wrongHiddenTabs.length} tabs hidden but should be visible!`);
        
        // Try to fix the issue
        const tabIdsToShow = wrongHiddenTabs.map(tab => tab.id);
        await browser.tabs.show(tabIdsToShow);
        this.log(`[verify] Attempted to show ${tabIdsToShow.length} incorrectly hidden tabs`);
      }
      
      return {
        correct: wrongVisibleTabs.length === 0 && wrongHiddenTabs.length === 0,
        wrongVisibleTabs,
        wrongHiddenTabs
      };
    } catch (e) {
      this.log(`[ERROR] verifyTabVisibility failed: ${e.message}`);
      return { correct: false };
    }
  }
  
  async updateTabsOverview(topicsData) {
    if (!this.hasFirefoxAPI) return;
    await this.validateTabAssignments();
  }

  async getTabsByType() {
    const allTabs = await browser.tabs.query({});
    const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
    return { allTabs, regularTabs };
  }
  
  logTabAssignments(topicsData) {
    // Group tabs by topic
    const tabsByTopic = new Map();
    
    for (const [tabId, topicIndex] of this.tabToTopicMap.entries()) {
      if (!tabsByTopic.has(topicIndex)) {
        tabsByTopic.set(topicIndex, []);
      }
      tabsByTopic.get(topicIndex).push(tabId);
    }
    
    // Log summary
    this.log(`[tabs] Current tab assignments by topic:`);
    for (const [topicIndex, tabIds] of tabsByTopic.entries()) {
      const topicName = topicsData?.[topicIndex]?.name || 'Unknown';
      this.log(`[tabs] Topic ${topicIndex} (${topicName}): ${tabIds.length} tabs - IDs: ${tabIds.join(', ')}`);
    }
  }
  
  /**
   * Validates all tab-to-topic assignments to ensure consistency
   * This method is required by the sidebar.js integration
   */
  async validateTabAssignments() {
    if (!this.hasFirefoxAPI) return true;
    
    try {
      this.log(`[validate] Validating tab assignments...`);
      
      // Get all current tabs
      const allTabs = await browser.tabs.query({});
      const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
      
      // Track changes
      let changes = 0;
      
      // Ensure all regular tabs have a topic assignment
      for (const tab of regularTabs) {
        if (!this.tabToTopicMap.has(tab.id)) {
          this.log(`[validate] Assigning untracked tab ${tab.id} to current topic ${this.currentTopicIndex}`);
          this.tabToTopicMap.set(tab.id, this.currentTopicIndex);
          changes++;
        }
      }
      
      // Clean up stale tab references
      const validTabIds = new Set(regularTabs.map(tab => tab.id));
      for (const [tabId] of this.tabToTopicMap.entries()) {
        if (!validTabIds.has(tabId)) {
          this.log(`[validate] Removing stale tab ${tabId} from mapping`);
          this.tabToTopicMap.delete(tabId);
          changes++;
        }
      }
      
      if (changes > 0) {
        this.log(`[validate] Made ${changes} changes to tab assignments`);
      } else {
        this.log(`[validate] Tab assignments are valid, no changes needed`);
      }
      
      return true;
    } catch (e) {
      this.log(`[ERROR] validateTabAssignments failed: ${e.message}`);
      return false;
    }
  }
}