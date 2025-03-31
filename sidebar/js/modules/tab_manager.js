/**
 * TabManager - Verwalte Tabs nach Topics in einer Firefox-Erweiterung.
 *
 * Diese Klasse ermöglicht es, Tabs anhand von Themen zu gruppieren:
 * - Beim Wechsel eines Topics werden aktuell sichtbare Tabs in einen versteckten Bereich (Gruppe)
 *   verschoben.
 * - Tabs, die zum neuen Topic gehören, werden wieder sichtbar gemacht.
 *
 * Abhängigkeiten:
 * - Firefox WebExtensions API (MDN: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
 * - Optional: Tab Groups API (browser.tabs.group / ungroup) und Tab Hide/Show API
 *
 * Hinweis: Die Tab Hide/Show API ist experimentell und erfordert ggf. spezielle Berechtigungen.
 */
export class TabManager {
    constructor(hasFirefoxAPI = true) {
      this.hasFirefoxAPI = hasFirefoxAPI;
      this.hiddenGroupId = null;
      // Map, die Tab-IDs auf den zugehörigen Topic-Index abbildet.
      this.tabToTopicMap = new Map();
      this.currentTopicIndex = -1;
  
      // Prüfe, ob die nötigen APIs verfügbar sind.
      this.hasTabGroupsAPI = this.checkTabGroupsAPI();
      this.hasTabHideAPI = this.checkTabHideAPI();
  
      this.log("Tab Groups API available:", this.hasTabGroupsAPI);
      this.log("Tab Hide API available:", this.hasTabHideAPI);
  
      if (!this.hasTabGroupsAPI && !this.hasTabHideAPI) {
        this.log("[WARNING] Weder Tab Groups noch Tab Hide APIs sind verfügbar!");
      }
    }
  
    /**
     * Prüft, ob die Tab Groups API verfügbar ist.
     */
    checkTabGroupsAPI() {
      try {
        return typeof browser !== 'undefined' &&
               browser.tabs &&
               typeof browser.tabs.group === 'function' &&
               typeof browser.tabs.ungroup === 'function';
      } catch (e) {
        return false;
      }
    }
  
    /**
     * Prüft, ob die Tab Hide/Show API verfügbar ist.
     */
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
  
    /**
     * Überprüft, ob eine URL zu einem regulären Tab gehört.
     */
    isRegularTab(url) {
      return url &&
             !url.startsWith("about:") &&
             !url.startsWith("chrome:") &&
             !url.startsWith("moz-extension:") &&
             url !== "about:blank";
    }
  
    /**
     * Initialisiert den TabManager:
     * - Erstellt ggf. eine versteckte Tab-Gruppe.
     * - Liest alle regulären Tabs aus und mappt sie initial auf Topic 0.
     * - Stellt sicher, dass alle Tabs sichtbar sind.
     * - Setzt die Tab-Listener.
     *
     * @param {Array} topicsData - Array mit Topic-Daten.
     */
    async initialize(topicsData) {
      if (!this.hasFirefoxAPI) return;
  
      // Versuche, eine versteckte Gruppe zu erstellen.
      if (this.hasTabGroupsAPI) {
        try {
          const groupId = await browser.tabs.group({ tabIds: [] });
          if (groupId) {
            this.hiddenGroupId = groupId;
            try {
              await browser.tabGroups.update(this.hiddenGroupId, {
                title: "Hidden Tabs",
                collapsed: true
              });
              this.log(`[init] Erstellte versteckte Gruppe mit ID: ${this.hiddenGroupId}`);
            } catch (e) {
              this.log(`[init] Erstellte Gruppe ${this.hiddenGroupId}, konnte aber den Titel nicht setzen.`);
            }
          }
        } catch (e) {
          this.log(`[ERROR] Fehler beim Erstellen der Tab-Gruppe: ${e.message}`);
          this.hasTabGroupsAPI = false;
        }
      } else {
        this.log("[init] Tab Groups API nicht verfügbar – Fallback-Methoden werden genutzt.");
      }
  
      // Alle Tabs abrufen und initial Topic 0 zuordnen.
      const allTabs = await browser.tabs.query({});
      const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
      this.log(`[init] Gefundene reguläre Tabs: ${regularTabs.length}`);
  
      regularTabs.forEach(tab => {
        this.tabToTopicMap.set(tab.id, 0);
        this.log(`[init] Tab ${tab.id} (${tab.url}) wurde Topic 0 zugeordnet`);
      });
  
      // Alle Tabs sichtbar machen.
      if (regularTabs.length > 0) {
        const tabIds = regularTabs.map(tab => tab.id);
        if (this.hasTabGroupsAPI) {
          try {
            await browser.tabs.ungroup(tabIds);
            this.log(`[init] Alle ${tabIds.length} Tabs wurden entgruppiert.`);
          } catch (e) {
            this.log(`[ERROR] Fehler beim Entgruppieren: ${e.message}`);
          }
        } else if (this.hasTabHideAPI) {
          try {
            await browser.tabs.show(tabIds);
            this.log(`[init] Alle ${tabIds.length} Tabs wurden mittels Hide/Show API sichtbar gemacht.`);
          } catch (e) {
            this.log(`[ERROR] Fehler beim Anzeigen der Tabs: ${e.message}`);
          }
        }
      }
  
      // Setze das initial aktive Topic auf 0.
      this.currentTopicIndex = 0;
      this.setupTabListeners(topicsData);
    }
  
    /**
     * Wechselt zu einem neuen Topic:
     * - Speichert zunächst die aktuellen Tabs.
     * - Bestimmt, welche Tabs angezeigt bzw. versteckt werden sollen.
     * - Nutzt Tab Groups oder Hide/Show API, um die Sichtbarkeit zu steuern.
     * - Aktiviert abschließend einen Tab des neuen Topics.
     *
     * @param {number} topicIndex - Der Index des neuen Topics.
     * @param {Array} topicsData - Array mit Topic-Daten (einschließlich URLs und evtl. activeTabIndex).
     */
    async switchToTopic(topicIndex, topicsData) {
      if (!this.hasFirefoxAPI) return;
  
      try {
        if (!topicsData || topicIndex < 0 || topicIndex >= topicsData.length) {
          this.log(`[ERROR] Ungültiger Topic-Index: ${topicIndex}`);
          return;
        }
  
        const oldTopicIndex = this.currentTopicIndex;
        const newTopicIndex = topicIndex;
  
        if (oldTopicIndex === newTopicIndex && oldTopicIndex !== -1) {
          this.log(`[switch] Bereits in Topic ${newTopicIndex}. Kein Wechsel erforderlich.`);
          return;
        }
  
        this.log(`[switch] Wechsle von Topic ${oldTopicIndex} zu Topic ${newTopicIndex}`);
  
        // Speichere zuerst die aktuell sichtbaren Tabs des alten Topics.
        await this.saveCurrentTabs(oldTopicIndex, topicsData);
  
        // Alle Tabs abfragen.
        const allTabs = await browser.tabs.query({});
        const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
  
        // Ziel-URLs aus dem neuen Topic extrahieren.
        const targetTopic = topicsData[newTopicIndex];
        const targetUrls = targetTopic.tabs ? targetTopic.tabs.map(t => t.url) : [];
        this.log(`[switch] Das neue Topic hat ${targetUrls.length} URLs: ${targetUrls.join(", ")}`);
  
        const tabsToShow = [];
        const tabsToHide = [];
  
        // Bestimme, welche Tabs angezeigt bzw. versteckt werden sollen.
        for (const tab of regularTabs) {
          if (targetUrls.includes(tab.url)) {
            tabsToShow.push(tab);
            this.tabToTopicMap.set(tab.id, newTopicIndex);
            this.log(`[switch] Tab ${tab.id} (${tab.url}) wird angezeigt.`);
          } else {
            tabsToHide.push(tab);
            if (!this.tabToTopicMap.has(tab.id) && oldTopicIndex >= 0) {
              this.tabToTopicMap.set(tab.id, oldTopicIndex);
            }
            this.log(`[switch] Tab ${tab.id} (${tab.url}) wird versteckt.`);
          }
        }
  
        // Fehlende Tabs im neuen Topic erstellen.
        const missingUrls = targetUrls.filter(url => !regularTabs.some(tab => tab.url === url));
        if (missingUrls.length > 0) {
          this.log(`[switch] Es fehlen ${missingUrls.length} Tabs im neuen Topic.`);
          for (const url of missingUrls) {
            try {
              const newTab = await browser.tabs.create({ url, active: false });
              this.log(`[switch] Neuer Tab ${newTab.id} für URL ${url} erstellt.`);
              this.tabToTopicMap.set(newTab.id, newTopicIndex);
              tabsToShow.push(newTab);
            } catch (e) {
              this.log(`[ERROR] Fehler beim Erstellen eines Tabs für ${url}: ${e.message}`);
            }
          }
        }
  
        // Zuerst Tabs verstecken.
        const tabIdsToHide = tabsToHide.map(tab => tab.id);
        if (tabIdsToHide.length > 0) {
          this.log(`[switch] Verstecke Tabs: ${tabIdsToHide.join(", ")}`);
          if (this.hasTabGroupsAPI && this.hiddenGroupId) {
            try {
              await browser.tabs.group({ tabIds: tabIdsToHide, groupId: this.hiddenGroupId });
              this.log(`[switch] Tabs in Gruppe ${this.hiddenGroupId} gruppiert.`);
              try {
                await browser.tabGroups.update(this.hiddenGroupId, { collapsed: true });
                this.log(`[switch] Versteckte Gruppe wurde eingeklappt.`);
              } catch (e) {
                this.log(`[switch] Konnte Gruppe nicht einklappen: ${e.message}`);
              }
            } catch (e) {
              this.log(`[ERROR] Fehler beim Gruppieren der Tabs: ${e.message}`);
              if (this.hasTabHideAPI) {
                try {
                  await browser.tabs.hide(tabIdsToHide);
                  this.log(`[switch] Fallback: Tabs wurden mittels Hide API versteckt.`);
                } catch (hideErr) {
                  this.log(`[ERROR] Hide API Fehler: ${hideErr.message}`);
                }
              }
            }
          } else if (this.hasTabHideAPI) {
            try {
              await browser.tabs.hide(tabIdsToHide);
              this.log(`[switch] Tabs wurden mittels Hide API versteckt.`);
            } catch (e) {
              this.log(`[ERROR] Fehler beim Verstecken der Tabs: ${e.message}`);
            }
          } else {
            this.log(`[WARNING] Keine Methode zum Verstecken der Tabs verfügbar.`);
          }
        }
  
        // Dann Tabs anzeigen.
        const tabIdsToShow = tabsToShow.map(tab => tab.id);
        if (tabIdsToShow.length > 0) {
          this.log(`[switch] Zeige Tabs: ${tabIdsToShow.join(", ")}`);
          if (this.hasTabGroupsAPI) {
            try {
              await browser.tabs.ungroup(tabIdsToShow);
              this.log(`[switch] Tabs wurden entgruppiert und sind sichtbar.`);
            } catch (e) {
              this.log(`[ERROR] Fehler beim Entgruppieren: ${e.message}`);
              if (this.hasTabHideAPI) {
                try {
                  await browser.tabs.show(tabIdsToShow);
                  this.log(`[switch] Fallback: Tabs wurden mittels Show API sichtbar gemacht.`);
                } catch (showErr) {
                  this.log(`[ERROR] Show API Fehler: ${showErr.message}`);
                }
              }
            }
          } else if (this.hasTabHideAPI) {
            try {
              await browser.tabs.show(tabIdsToShow);
              this.log(`[switch] Tabs wurden mittels Show API sichtbar gemacht.`);
            } catch (e) {
              this.log(`[ERROR] Fehler beim Anzeigen der Tabs: ${e.message}`);
            }
          } else {
            this.log(`[WARNING] Keine Methode zum Anzeigen der Tabs verfügbar.`);
          }
        } else {
          this.log(`[switch] Es gibt keine Tabs, die angezeigt werden sollen für Topic ${newTopicIndex}.`);
        }
  
        // Aktualisiere den aktuellen Topic-Index.
        this.currentTopicIndex = newTopicIndex;
  
        // Aktiviere einen Tab aus den angezeigten Tabs.
        if (tabsToShow.length > 0) {
          const activeIndex = targetTopic.activeTabIndex || 0;
          const tabToActivate = tabsToShow[Math.min(activeIndex, tabsToShow.length - 1)];
          try {
            await browser.tabs.update(tabToActivate.id, { active: true });
            this.log(`[switch] Tab ${tabToActivate.id} wurde aktiviert.`);
          } catch (e) {
            this.log(`[ERROR] Fehler beim Aktivieren des Tabs: ${e.message}`);
          }
        }
  
        // Verifiziere abschließend den Tab-Zustand.
        await this.verifyTabVisibility();
        // Aktualisiere die Anzeige der Tab-Zahlen in der Sidebar.
        this.updateTopicTabCounts(topicsData);
  
      } catch (error) {
        this.log(`[ERROR] switchToTopic: ${error.message}`);
        console.error(error);
      }
    }
  
    /**
     * Verifiziert den Zustand der Tabs und loggt die finalen sichtbaren/unsichtbaren Tabs.
     *
     * @returns {Object} Ein Objekt mit den Arrays: visibleTabs, hiddenTabs, regularTabs.
     */
    async verifyTabVisibility() {
      if (!this.hasFirefoxAPI) return {};
  
      try {
        const allTabs = await browser.tabs.query({});
        const regularTabs = allTabs.filter(tab => this.isRegularTab(tab.url));
  
        const visibleTabs = regularTabs.filter(tab =>
          !tab.hidden && (!tab.groupId || tab.groupId !== this.hiddenGroupId)
        );
  
        const hiddenTabs = regularTabs.filter(tab =>
          tab.hidden || (tab.groupId && tab.groupId === this.hiddenGroupId)
        );
  
        this.log(`[verify] FINAL STATE: ${visibleTabs.length} visible, ${hiddenTabs.length} hidden`);
  
        this.log(`[verify] Visible tabs:`);
        visibleTabs.forEach(tab => {
          const topic = this.tabToTopicMap.get(tab.id) || 'none';
          const groupStatus = tab.groupId ? `in group ${tab.groupId}` : 'ungrouped';
          this.log(`[verify]   Tab ${tab.id}: ${tab.url} (topic: ${topic}, ${groupStatus})`);
        });
  
        this.log(`[verify] Hidden tabs:`);
        hiddenTabs.forEach(tab => {
          const topic = this.tabToTopicMap.get(tab.id) || 'none';
          const groupStatus = tab.groupId ? `in group ${tab.groupId}` : 'ungrouped';
          const hiddenStatus = tab.hidden ? 'hidden' : 'visible';
          this.log(`[verify]   Tab ${tab.id}: ${tab.url} (topic: ${topic}, ${groupStatus}, ${hiddenStatus})`);
        });
  
        return { visibleTabs, hiddenTabs, regularTabs };
      } catch (error) {
        this.log(`[ERROR] verifyTabVisibility: ${error.message}`);
        return {};
      }
    }
  
    /**
     * Speichert die aktuell sichtbaren Tabs für ein gegebenes Topic.
     *
     * @param {number} topicIndex - Der Index des Topics.
     * @param {Array} topicsData - Array mit Topic-Daten.
     */
    async saveCurrentTabs(topicIndex, topicsData) {
      if (!this.hasFirefoxAPI || topicIndex < 0 || !topicsData) return;
  
      try {
        const allTabs = await browser.tabs.query({});
        const visibleTabs = allTabs.filter(tab =>
          this.isRegularTab(tab.url) &&
          !tab.hidden &&
          (!tab.groupId || tab.groupId !== this.hiddenGroupId)
        );
  
        this.log(`[save] Speichere ${visibleTabs.length} Tabs in Topic ${topicIndex}.`);
  
        if (topicsData[topicIndex]) {
          topicsData[topicIndex].tabs = visibleTabs.map(tab => ({
            url: tab.url,
            title: tab.title || "Untitled",
            favIconUrl: tab.favIconUrl || ""
          }));
  
          visibleTabs.forEach(tab => {
            this.tabToTopicMap.set(tab.id, topicIndex);
          });
  
          const activeTabIndex = visibleTabs.findIndex(tab => tab.active);
          if (activeTabIndex !== -1) {
            topicsData[topicIndex].activeTabIndex = activeTabIndex;
          }
        }
      } catch (error) {
        this.log(`[ERROR] saveCurrentTabs: ${error.message}`);
      }
    }
  
    /**
     * Überwacht Tab-Events (Erstellen, Entfernen, Aktualisieren) und synchronisiert
     * das interne Mapping sowie die Topic-Daten.
     *
     * @param {Array} topicsData - Array mit Topic-Daten.
     */
    setupTabListeners(topicsData) {
      if (!this.hasFirefoxAPI) return;
  
      browser.tabs.onCreated.addListener(tab => {
        this.log(`[event] Neuer Tab erstellt: ${tab.id} (${tab.url})`);
        if (this.isRegularTab(tab.url)) {
          this.tabToTopicMap.set(tab.id, this.currentTopicIndex);
          if (topicsData && topicsData[this.currentTopicIndex]) {
            topicsData[this.currentTopicIndex].tabs = topicsData[this.currentTopicIndex].tabs || [];
            topicsData[this.currentTopicIndex].tabs.push({
              url: tab.url,
              title: tab.title || "Untitled",
              favIconUrl: tab.favIconUrl || ""
            });
          }
        }
      });
  
      browser.tabs.onRemoved.addListener(tabId => {
        this.log(`[event] Tab entfernt: ${tabId}`);
        const tabTopic = this.tabToTopicMap.get(tabId);
        this.tabToTopicMap.delete(tabId);
        if (topicsData && tabTopic !== undefined && topicsData[tabTopic]) {
          this.syncTopicWithBrowser(tabTopic, topicsData);
        }
      });
  
      browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url && this.isRegularTab(changeInfo.url)) {
          this.log(`[event] Tab ${tabId} URL geändert zu: ${changeInfo.url}`);
          this.tabToTopicMap.set(tabId, this.currentTopicIndex);
          if (topicsData && topicsData[this.currentTopicIndex]) {
            this.syncTopicWithBrowser(this.currentTopicIndex, topicsData);
          }
        }
      });
  
      if (this.hasTabGroupsAPI && browser.tabGroups) {
        try {
          browser.tabGroups.onCreated?.addListener(group => {
            this.log(`[event] Tab-Gruppe erstellt: ${group.id} (${group.title})`);
          });
          browser.tabGroups.onRemoved?.addListener(groupId => {
            this.log(`[event] Tab-Gruppe entfernt: ${groupId}`);
            if (groupId === this.hiddenGroupId) {
              this.recreateHiddenGroup();
            }
          });
        } catch (e) {
          this.log(`[WARNING] Fehler beim Einrichten der Tab-Gruppen-Listener: ${e.message}`);
        }
      }
      this.log("[init] Tab-Listener wurden eingerichtet.");
    }
  
    /**
     * Falls die versteckte Gruppe entfernt wurde, wird sie neu erstellt.
     */
    async recreateHiddenGroup() {
      if (!this.hasTabGroupsAPI) return;
      try {
        const groupId = await browser.tabs.group({ tabIds: [] });
        if (groupId) {
          this.hiddenGroupId = groupId;
          this.log(`[event] Versteckte Gruppe neu erstellt: ${this.hiddenGroupId}`);
          try {
            await browser.tabGroups.update(this.hiddenGroupId, {
              title: "Hidden Tabs",
              collapsed: true
            });
          } catch (e) {
            // Ignoriere Fehler, falls update nicht möglich ist.
          }
        }
      } catch (e) {
        this.log(`[ERROR] recreateHiddenGroup: ${e.message}`);
      }
    }
  
    /**
     * Synchronisiert die Tabs eines bestimmten Topics mit dem aktuellen Zustand des Browsers.
     *
     * @param {number} topicIndex - Der Index des Topics.
     * @param {Array} topicsData - Array mit Topic-Daten.
     */
    async syncTopicWithBrowser(topicIndex, topicsData) {
      if (!this.hasFirefoxAPI || !topicsData || topicIndex < 0) return;
      try {
        const topicTabIds = [];
        for (const [tabId, mappedTopic] of this.tabToTopicMap.entries()) {
          if (mappedTopic === topicIndex) {
            topicTabIds.push(tabId);
          }
        }
        const allTabs = await browser.tabs.query({});
        const topicTabs = [];
        for (const tabId of topicTabIds) {
          const tab = allTabs.find(t => t.id === tabId);
          if (tab && this.isRegularTab(tab.url)) {
            topicTabs.push({
              url: tab.url,
              title: tab.title || "Untitled",
              favIconUrl: tab.favIconUrl || ""
            });
          }
        }
        this.log(`[sync] Topic ${topicIndex} enthält jetzt ${topicTabs.length} Tabs.`);
        topicsData[topicIndex].tabs = topicTabs;
      } catch (error) {
        this.log(`[ERROR] syncTopicWithBrowser: ${error.message}`);
      }
    }
  
    /**
     * Aktualisiert die Anzeige der Tab-Zahlen in der Sidebar.
     *
     * @param {Array} topicsData - Array mit Topic-Daten.
     */
    updateTopicTabCounts(topicsData) {
      if (!topicsData) return;
      try {
        const counts = new Map();
        const tabsPerTopic = new Map();
  
        for (const [tabId, topicIndex] of this.tabToTopicMap.entries()) {
          if (topicIndex >= 0) {
            counts.set(topicIndex, (counts.get(topicIndex) || 0) + 1);
            if (!tabsPerTopic.has(topicIndex)) {
              tabsPerTopic.set(topicIndex, []);
            }
            tabsPerTopic.get(topicIndex).push(tabId);
          }
        }
  
        const topics = document.querySelectorAll('.topic-item');
        topics.forEach((topicElem, index) => {
          const badge = topicElem.querySelector('.tab-count-badge');
          if (badge) {
            badge.textContent = `(${counts.get(index) || 0})`;
          }
        });
  
        browser.tabs.query({}).then(allTabs => {
          this.log(`[counts] Tab-Zähler pro Topic:`);
          for (let i = 0; i < topicsData.length; i++) {
            const count = counts.get(i) || 0;
            const tabIds = tabsPerTopic.get(i) || [];
            this.log(`[counts] Topic ${i} (${topicsData[i].name}): ${count} Tabs - IDs: ${tabIds.join(", ")}`);
          }
        }).catch(e => {
          this.log(`[ERROR] updateTopicTabCounts: ${e.message}`);
        });
      } catch (error) {
        this.log(`[ERROR] updateTopicTabCounts: ${error.message}`);
      }
    }
  
    /**
     * Schließt alle Tabs, die zu einem bestimmten Topic gehören.
     *
     * @param {number} topicIndex - Der Index des Topics.
     */
    async closeTabsForTopic(topicIndex) {
      if (!this.hasFirefoxAPI) return;
      try {
        const tabsToClose = [];
        for (const [tabId, topic] of this.tabToTopicMap.entries()) {
          if (topic === topicIndex) {
            tabsToClose.push(tabId);
          }
        }
        this.log(`[close] Schließe ${tabsToClose.length} Tabs für Topic ${topicIndex}.`);
        if (tabsToClose.length > 0) {
          await browser.tabs.remove(tabsToClose);
        }
      } catch (error) {
        this.log(`[ERROR] closeTabsForTopic: ${error.message}`);
      }
    }
  
    /**
     * Hilfsmethode zum Loggen.
     */
    log(...args) {
      console.log("[TabManager]", ...args);
    }
  }
  