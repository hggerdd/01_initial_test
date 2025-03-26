// Globale Variablen definieren
const hasFirefoxAPI = typeof browser !== 'undefined' && browser.storage;
let topicsData = []; // [{ name: "Topic 1", categories: [{ name: "Category 1", bookmarks: [{ title: "Google", url: "https://google.com" }] }] }]
let currentTopicIndex = -1;

// HTML-Escape-Funktion um XSS zu verhindern
function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;") // Fixed typo here
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Globale Funktionen
// Speichert den aktiven Tab für ein Topic
function saveActiveTab(topicIndex) {
  if (!hasFirefoxAPI) return;
  
  try {
    // Finde den aktiven Tab
    browser.tabs.query({ active: true, currentWindow: true })
      .then(activeTabs => {
        if (activeTabs.length > 0) {
          const activeTab = activeTabs[0];
          
          // Suche den Index dieses Tabs in den gespeicherten Tabs des Topics
          if (topicsData[topicIndex] && topicsData[topicIndex].tabs) {
            const tabUrls = topicsData[topicIndex].tabs.map(tab => tab.url);
            const activeTabIndex = tabUrls.indexOf(activeTab.url);
            
            if (activeTabIndex !== -1) {
              // Speichere den aktiven Tab-Index
              console.log(`Speichere aktiven Tab-Index ${activeTabIndex} für Topic ${topicIndex}`);
              topicsData[topicIndex].activeTabIndex = activeTabIndex;
              saveTopicsData();
            }
          }
        }
      })
      .catch(err => {
        console.error("Fehler beim Ermitteln des aktiven Tabs:", err);
      });
  } catch (error) {
    console.error("Unbehandelter Fehler in saveActiveTab:", error);
  }
}

// Funktion zum Speichern der Topics-Daten
function saveTopicsData() {
  if (hasFirefoxAPI) {
    browser.storage.local.set({ 
      topicsData: topicsData,
      currentTopicIndex: currentTopicIndex
    }).catch(err => {
      console.error("Fehler beim Speichern:", err);
    });
  } else {
    try {
      localStorage.setItem("topicsData", JSON.stringify(topicsData));
      localStorage.setItem("currentTopicIndex", String(currentTopicIndex));
    } catch (e) {
      console.error("Fehler beim Speichern der Topics-Daten:", e);
    }
  }
}

// Globales Objekt für die Erweiterung - bleibt während der gesamten Laufzeit erhalten
if (typeof window.extensionState === 'undefined') {
  window.extensionState = {
    lazyTabsMapping: {},  // Speichert die Zuordnung von Tab-IDs zu URLs für Lazy Loading
    tabListenerAdded: false  // Verhindert das mehrfache Hinzufügen des Tab-Listeners
  };
}

document.addEventListener("DOMContentLoaded", function() {
  // DOM-Elemente
  const elements = {
    addTopicBtn: document.getElementById("add-topic-btn"),
    newTopicForm: document.getElementById("new-topic-form"),
    newTopicInput: document.getElementById("new-topic-input"),
    saveNewTopicBtn: document.getElementById("save-new-topic-btn"),
    cancelNewTopicBtn: document.getElementById("cancel-new-topic-btn"),
    topicsList: document.getElementById("topics-list"),
    editTopicForm: document.getElementById("edit-topic-form"),
    editTopicInput: document.getElementById("edit-topic-input"),
    saveEditTopicBtn: document.getElementById("save-edit-topic-btn"),
    cancelEditTopicBtn: document.getElementById("cancel-edit-topic-btn"),
    editTopicId: document.getElementById("edit-topic-id")
    // Remove activeTopic, tabCount, and currentTopicInfo
  };

  // Überprüfe, ob wichtige Elemente gefunden wurden
  const requiredElements = ["topicsList", "addTopicBtn"];
  for (const elementName of requiredElements) {
    if (!elements[elementName]) {
      console.error(`Wichtiges Element '${elementName}' wurde nicht gefunden!`);
      // An diesem Punkt können wir nicht fortfahren
      return;
    }
  }

  // Helper-Funktionen
  function safeTextContent(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  function safeStyle(element, property, value) {
    if (element && element.style) {
      element.style[property] = value;
    }
  }

  function safeValue(element, value) {
    if (element) {
      element.value = value;
    }
  }

  // Storage-Funktionen
  // Strukturierte Daten laden (mit Tabs pro Topic)
  function loadTopicsData() {
    if (hasFirefoxAPI) {
      // Firefox WebExtension API
      browser.storage.local.get(["topicsData", "currentTopicIndex"]).then((result) => {
        topicsData = result.topicsData || [];
        currentTopicIndex = result.currentTopicIndex || -1;
        
        if (topicsData.length > 0 && currentTopicIndex === -1) {
          currentTopicIndex = 0; // Select first topic if none is selected
        }
        
        // Asynchronen Funktionen nacheinander ausführen
        renderTopics();
        
        if (currentTopicIndex !== -1) {
          try {
            openTabsForCurrentTopic();
          } catch (error) {
            console.error("Fehler beim Öffnen der Tabs:", error);
          }
        }
      }).catch(err => {
        console.error("Fehler beim Laden der Daten:", err);
        topicsData = [];
        currentTopicIndex = -1;
        renderTopics();
      });
    } else {
      try {
        const topicsDataStr = localStorage.getItem("topicsData") || "[]";
        topicsData = JSON.parse(topicsDataStr);
        currentTopicIndex = parseInt(localStorage.getItem("currentTopicIndex") || "-1");
        
        if (topicsData.length > 0 && currentTopicIndex === -1) {
          currentTopicIndex = 0; // Select first topic if none is selected
        }
        
        renderTopics();
      } catch (e) {
        console.error("Fehler beim Laden der Topics-Daten:", e);
        topicsData = [];
        currentTopicIndex = -1;
        renderTopics();
      }
    }
  }

  // UI-Funktionen
  // Alle Topics in der Liste anzeigen
  function renderTopics() {
    if (!elements.topicsList) return;
    
    elements.topicsList.innerHTML = "";
    
    if (topicsData.length === 0) {
      elements.topicsList.innerHTML = "<li class='empty-list'>No topics yet. Add your first topic!</li>";
      return;
    }
    
    // Begrenze die Anzahl der gerenderten Topics für Performance
    const maxVisibleTopics = 100;
    topicsData.slice(0, maxVisibleTopics).forEach((topicData, index) => {
      const li = document.createElement("li");
      li.className = "topic-item";
      if (index === currentTopicIndex) {
        li.classList.add("selected");
      }
      li.dataset.id = index;
      
      // Calculate tab count, excluding system tabs
      const tabCount = topicData.tabs ? 
        topicData.tabs.filter(tab => tab && tab.url && 
          !tab.url.startsWith("about:") && 
          !tab.url.startsWith("chrome:") && 
          !tab.url.startsWith("moz-extension:") &&
          tab.url !== "about:blank"
        ).length : 0;
      
      li.innerHTML = `
        <span class="topic-text">${escapeHTML(topicData.name)} <span class="tab-count-badge">(${tabCount})</span></span>
        <div class="topic-actions">
          <button class="edit-btn" title="Edit Topic">
            <i class="fas fa-edit"></i>
          </button>
          <button class="delete-btn" title="Delete Topic">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      
      // Click auf das Topic um es auszuwählen
      li.addEventListener("click", (e) => {
        // Nur wenn nicht auf die Buttons geklickt wurde
        if (!e.target.closest('.edit-btn') && !e.target.closest('.delete-btn')) {
          selectTopic(index);
        }
      });
      
      // Edit-Button-Event-Listener
      const editBtn = li.querySelector(".edit-btn");
      if (editBtn) {
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // Verhindert Topic-Auswahl beim Klick auf Edit
          startEditTopic(index, topicData.name);
        });
      }
      
      // Delete-Button-Event-Listener
      const deleteBtn = li.querySelector(".delete-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // Verhindert Topic-Auswahl beim Klick auf Delete
          deleteTopic(index);
        });
      }
      
      elements.topicsList.appendChild(li);
    });
  }

  // Ein Topic auswählen und Tabs anzeigen
  function selectTopic(index) {
    if (index === currentTopicIndex) return; // Bereits ausgewählt
    
    if (index >= 0 && index < topicsData.length) {
      console.log(`Wechsle von Topic ${currentTopicIndex} zu Topic ${index}`);
      currentTopicIndex = index;

      // Render categories for the selected topic
      renderCategories();

      // Aktualisiere die UI
      renderTopics();
      
      // Öffne die Tabs für das neu ausgewählte Topic
      if (hasFirefoxAPI) {
        try {
          openTabsForCurrentTopic();
        } catch (error) {
          console.error("Fehler beim Öffnen der Tabs:", error);
        }
      }
      
      // Speichere den neuen Status
      saveTopicsData();
    }
  }

  // Hilfsfunktion zum Bereinigen der Lazy-Tabs-Zuordnung
  // Wird aufgerufen, wenn Tabs geschlossen werden
  function cleanupLazyTabsMapping() {
    if (!hasFirefoxAPI) return;
    
    try {
      // Hole alle aktuellen Tabs
      browser.tabs.query({}).then(tabs => {
        const existingTabIds = tabs.map(tab => tab.id);
        
        // Entferne alle Einträge in lazyTabsMapping, deren Tab-IDs nicht mehr existieren
        const keysToRemove = [];
        for (const tabId in window.extensionState.lazyTabsMapping) {
          if (!existingTabIds.includes(parseInt(tabId))) {
            keysToRemove.push(tabId);
          }
        }
        
        keysToRemove.forEach(tabId => {
          delete window.extensionState.lazyTabsMapping[tabId];
        });
        
        if (keysToRemove.length > 0) {
          console.log(`${keysToRemove.length} veraltete Einträge aus lazyTabsMapping entfernt`);
        }
      }).catch(err => {
        console.error("Fehler beim Bereinigen der Lazy-Tabs-Zuordnung:", err);
      });
    } catch (error) {
      console.error("Unbehandelter Fehler in cleanupLazyTabsMapping:", error);
    }
  }

  // Tab-Listener für das aktuelle Topic
  function setupTabListeners() {
    if (!hasFirefoxAPI) return;
    
    try {
      // Beim Erstellen eines neuen Tabs
      browser.tabs.onCreated.addListener((tab) => {
        if (currentTopicIndex !== -1) {
          setTimeout(() => {
            try {
              saveTabsForCurrentTopic(currentTopicIndex);
              renderTopics();  // Add this line to update UI immediately
            } catch (error) {
              console.error("Fehler beim Speichern der Tabs:", error);
            }
          }, 500);
        }
      });
      
      // Beim Schließen eines Tabs
      browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
        // Bereinige die Lazy-Tab-Zuordnung, wenn ein Tab geschlossen wird
        if (window.extensionState.lazyTabsMapping && window.extensionState.lazyTabsMapping[tabId]) {
          delete window.extensionState.lazyTabsMapping[tabId];
        }
        
        if (currentTopicIndex !== -1) {
          // Sofort prüfen, ob dies der letzte Tab war
          browser.tabs.query({}).then(tabs => {
            // Überprüfe alle verbleibenden Tabs
            const remainingTabs = tabs.filter(tab => {
              const url = tab.url || "";
              return !(url.startsWith("moz-extension:") || 
                      url === "about:addons" ||
                      url === "about:blank");
            });
            
            // Wenn keine Tabs mehr vorhanden sind, einen neuen erstellen
            if (remainingTabs.length === 0) {
              console.log("Letzter Tab wurde geschlossen, erstelle sofort einen neuen");
              browser.tabs.create({ url: "https://www.google.de" })
                .catch(err => {
                  console.error("Fehler beim Erstellen des Ersatz-Tabs:", err);
                });
            }
            
            // Tab-Status speichern
            setTimeout(() => {
              try {
                saveTabsForCurrentTopic(currentTopicIndex);
                renderTopics();  // Add this line to update UI immediately
              } catch (error) {
                console.error("Fehler beim Speichern der Tabs:", error);
              }
            }, 500);
          }).catch(err => {
            console.error("Fehler beim Abfragen der Tabs:", err);
            
            // Im Fehlerfall trotzdem einen Tab erstellen
            browser.tabs.create({ url: "https://www.google.de" })
              .catch(createErr => {
                console.error("Fehler beim Erstellen des Sicherheits-Tabs:", createErr);
              });
          });
        }
      });
      
      // Beim Aktualisieren eines Tabs
      browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url && currentTopicIndex !== -1) {
          setTimeout(() => {
            try {
              saveTabsForCurrentTopic(currentTopicIndex);
              renderTopics();  // Add this line to update UI immediately
            } catch (error) {
              console.error("Fehler beim Speichern der Tabs:", error);
            }
          }, 500);
        }
      });
      
      // Tab-Aktivierungs-Listener
      browser.tabs.onActivated.addListener((activeInfo) => {
        if (currentTopicIndex !== -1) {
          // Speichere den aktiven Tab, wenn die Tab-Aktivierung wechselt
          saveActiveTab(currentTopicIndex);
        }
      });
    } catch (error) {
      console.error("Fehler beim Einrichten der Tab-Listener:", error);
    }
  }

  // Öffnet die gespeicherten Tabs für das aktuelle Topic
  function openTabsForCurrentTopic() {
    if (!hasFirefoxAPI) return; // Nur im Firefox möglich
    
    try {
      const currentTopic = topicsData[currentTopicIndex];
      
      // Prüfe, ob das Topic wirklich existiert und ob es Tabs hat
      const hasNoTabs = !currentTopic || !currentTopic.tabs || currentTopic.tabs.length === 0;
      
      console.log(`Öffne Tabs für Topic ${currentTopicIndex}, ${hasNoTabs ? "keine Tabs gespeichert" : currentTopic.tabs.length + " Tabs gespeichert"}`);
      
      // Kritische Edge-Case: Leeres Topic oder Topic ohne gültige Tabs
      if (hasNoTabs) {
        handleEmptyTopic();
        return;
      }
      
      // Normale Verarbeitung für Topics mit Tabs
      // Filtere gültige URLs heraus
      const validUrls = currentTopic.tabs
        .filter(tabData => 
          tabData && 
          tabData.url && 
          !tabData.url.startsWith("about:") && 
          !tabData.url.startsWith("chrome:") &&
          !tabData.url.startsWith("moz-extension:") &&
          tabData.url !== "about:blank"
        )
        .map(tabData => tabData.url);
      
      if (validUrls.length === 0) {
        // Auch bei Topics ohne gültige URLs den Empty-Case verwenden
        handleEmptyTopic();
        return;
      }
      
      // Normale Tab-Erstellung für nicht-leere Topics
      handleTopicWithTabs(validUrls);
      
    } catch (error) {
      console.error("Unbehandelter Fehler in openTabsForCurrentTopic:", error);
    }
  }
  
  // Handler für leere Topics
  function handleEmptyTopic() {
    console.log("Leeres Topic - spezielle Behandlung: Öffne Google");
    
    // Alle Tabs bis auf einen schließen
    browser.tabs.query({})
      .then(tabs => {
        // Filtere System-Tabs heraus
        const regularTabs = tabs.filter(tab => {
          const url = tab.url || "";
          return !(url.startsWith("moz-extension:") || url === "about:addons");
        });
        
        if (regularTabs.length === 0) {
          // Keine regulären Tabs - erstelle einen neuen mit Google
          browser.tabs.create({ url: "https://www.google.de" });
        } else if (regularTabs.length === 1) {
          // Genau ein Tab ist offen - überschreibe ihn mit Google
          browser.tabs.update(regularTabs[0].id, { url: "https://www.google.de" });
        } else {
          // Mehrere Tabs - behalte einen und schließe den Rest
          const keepTabId = regularTabs[0].id;
          const tabsToClose = regularTabs.slice(1).map(tab => tab.id);
          
          // Überschreibe den beibehaltenen Tab
          browser.tabs.update(keepTabId, { url: "https://www.google.de" })
            .then(() => {
              // Schließe die restlichen Tabs
              if (tabsToClose.length > 0) {
                browser.tabs.remove(tabsToClose)
                  .catch(err => console.error("Fehler beim Schließen der Tabs:", err));
              }
            })
            .catch(err => {
              console.error("Fehler beim Überschreiben des Tabs:", err);
              
              // Im Fehlerfall versuche alle Tabs zu schließen und erstelle einen neuen
              const allTabIds = regularTabs.map(tab => tab.id);
              browser.tabs.remove(allTabIds)
                .then(() => browser.tabs.create({ url: "https://www.google.de" }))
                .catch(err => console.error("Kritischer Fehler bei Tab-Behandlung:", err));
            });
        }
      })
      .catch(err => {
        console.error("Fehler beim Abfragen der Tabs:", err);
        
        // Im Fehlerfall einen neuen Tab erstellen
        browser.tabs.create({ url: "https://www.google.de" })
          .catch(err => console.error("Kritischer Fehler:", err));
      });
  }
  
  // Handler für Topics mit gültigen Tabs
  function handleTopicWithTabs(validUrls) {
    console.log(`Topic mit ${validUrls.length} gültigen URLs`);
    
    const currentTopic = topicsData[currentTopicIndex];
    
    // Bestimme den aktiven Tab-Index, Standardwert ist 0
    const activeTabIndex = currentTopic.hasOwnProperty('activeTabIndex') ? 
                         currentTopic.activeTabIndex : 0;
                         
    // Stelle sicher, dass der Index gültig ist
    const validActiveTabIndex = activeTabIndex >= 0 && activeTabIndex < validUrls.length ? 
                               activeTabIndex : 0;
    
    console.log(`Aktiver Tab-Index für Topic ${currentTopicIndex}: ${validActiveTabIndex}`);
    
    // Alle vorhandenen regulären Tabs abrufen
    browser.tabs.query({})
      .then(tabs => {
        // Filtere System-Tabs heraus
        const regularTabs = tabs.filter(tab => {
          const url = tab.url || "";
          return !(url.startsWith("moz-extension:") || url === "about:addons");
        });
        
        // Spezialfall: Keine regulären Tabs offen
        if (regularTabs.length === 0) {
          // Erstelle zuerst den aktiven Tab
          browser.tabs.create({ 
            url: validUrls[validActiveTabIndex],
            active: true
          })
            .then(() => {
              // Erstelle weitere Tabs
              const tabsToCreate = [...validUrls];
              tabsToCreate.splice(validActiveTabIndex, 1); // Entferne den bereits erstellten aktiven Tab
              
              if (tabsToCreate.length > 0) {
                createTabsBatch(tabsToCreate, 0, 3);
              }
            })
            .catch(err => {
              console.error("Fehler beim Erstellen des aktiven Tabs:", err);
              browser.tabs.create({ url: "https://www.google.de" });
            });
          return;
        }
        
        // Normalfall: Mindestens ein regulärer Tab ist offen
        // Nutze den ersten Tab und überschreibe ihn mit dem aktiven Tab
        const firstTabId = regularTabs[0].id;
        const restTabIds = regularTabs.slice(1).map(tab => tab.id);
        
        // Überschreibe den ersten Tab mit dem aktiven Tab
        browser.tabs.update(firstTabId, { 
          url: validUrls[validActiveTabIndex],
          active: true
        })
          .then(() => {
            // Schließe überschüssige Tabs
            if (restTabIds.length > 0) {
              browser.tabs.remove(restTabIds)
                .catch(err => console.error("Fehler beim Schließen überschüssiger Tabs:", err));
            }
            
            // Erstelle weitere Tabs für die restlichen URLs
            const tabsToCreate = [...validUrls];
            tabsToCreate.splice(validActiveTabIndex, 1); // Entferne den bereits erstellten aktiven Tab
            
            if (tabsToCreate.length > 0) {
              createTabsBatch(tabsToCreate, 0, 3);
            }
          })
          .catch(err => {
            console.error("Fehler beim Aktualisieren des ersten Tabs:", err);
            
            // Im Fehlerfall alle Tabs schließen und neue erstellen
            const allTabIds = regularTabs.map(tab => tab.id);
            browser.tabs.remove(allTabIds)
              .then(() => {
                browser.tabs.create({ 
                  url: validUrls[validActiveTabIndex],
                  active: true
                })
                  .then(() => {
                    const tabsToCreate = [...validUrls];
                    tabsToCreate.splice(validActiveTabIndex, 1);
                    
                    if (tabsToCreate.length > 0) {
                      createTabsBatch(tabsToCreate, 0, 3);
                    }
                  });
              })
              .catch(err => console.error("Kritischer Fehler bei Tab-Behandlung:", err));
          });
      })
      .catch(err => {
        console.error("Fehler beim Abfragen der Tabs:", err);
      });
  }
  
  // Erstellt Tabs in Batches
  function createTabsBatch(urls, startIndex, batchSize) {
    if (startIndex >= urls.length) return;
    
    const endIndex = Math.min(startIndex + batchSize, urls.length);
    const currentBatch = urls.slice(startIndex, endIndex);
    
    const batchPromises = currentBatch.map(url => 
      browser.tabs.create({ url, active: false })
        .catch(err => {
          console.error(`Fehler beim Erstellen des Tabs für ${url}:`, err);
          return null;
        })
    );
    
    Promise.all(batchPromises)
      .then(results => {
        const successCount = results.filter(r => r !== null).length;
        console.log(`${successCount} von ${currentBatch.length} Tabs im Batch ${startIndex}-${endIndex-1} erstellt`);
        
        // Rekursiv den nächsten Batch erstellen
        if (endIndex < urls.length) {
          setTimeout(() => {
            createTabsBatch(urls, endIndex, batchSize);
          }, 300);
        }
      })
      .catch(err => {
        console.error("Fehler beim Erstellen des Tab-Batches:", err);
      });
  }

  // Speichert die aktuell geöffneten Tabs für ein Topic
  function saveTabsForCurrentTopic(topicIndex) {
    if (!hasFirefoxAPI) return; // Nur im Firefox möglich
    
    try {
      browser.tabs.query({}).then((tabs) => {
        // Erfassen Sie alle geöffneten Tabs - mit strenger Filterung
        const tabsData = tabs
          .filter(tab => {
            // Filtere alle System-Tabs und Firefox-internen Seiten
            const url = tab.url || "";
            return !(url.startsWith("about:") || 
                    url.startsWith("chrome:") || 
                    url.startsWith("moz-extension:") || 
                    url === "firefox:newtab" ||
                    url === "about:blank" ||
                    url === "");
          })
          .map(tab => ({
            url: tab.url || "about:newtab",
            title: tab.title || "Untitled",
            favIconUrl: tab.favIconUrl || ""
          }));
        
        if (topicsData[topicIndex]) {
          // Speichere nur nicht-leere Tabs
          if (tabsData.length > 0) {
            console.log(`Speichere ${tabsData.length} Tabs für Topic ${topicIndex}`);
            topicsData[topicIndex].tabs = tabsData;
          } else {
            // Explizit leere Tabs-Liste, um zu verhindern, dass alte Tabs weiterbestehen
            console.log(`Setze Tabs für Topic ${topicIndex} auf leere Liste`);
            topicsData[topicIndex].tabs = [];
          }
          saveTopicsData();
          renderTopics(); // Only re-render topics to update tab count
        }
      }).catch(err => {
        console.error("Fehler beim Abfragen der Tabs:", err);
      });
    } catch (error) {
      console.error("Unbehandelter Fehler in saveTabsForCurrentTopic:", error);
    }
  }

  // Funktion zum Hinzufügen eines neuen Topics
  function addNewTopic() {
    if (!elements.newTopicInput) {
      console.error("New topic input not found");
      return;
    }
    
    const topicText = elements.newTopicInput.value.trim();
    
    if (!topicText) return;
    
    // Duplikat-Check durchführen
    const isDuplicate = topicsData.some(topic => 
      topic.name.toLowerCase() === topicText.toLowerCase()
    );
    
    if (isDuplicate) {
      // Warnung anzeigen
      alert("Dieses Topic existiert bereits! Duplikate sind nicht erlaubt.");
      // Input-Feld nicht leeren, damit der Benutzer es bearbeiten kann
    } else {
      // Neues Topic-Objekt erstellen - mit einem Standard-Tab für google.de
      const newTopic = {
        name: topicText,
        tabs: [
          {
            url: "https://www.google.de",
            title: "Google",
            favIconUrl: ""
          }
        ]
      };
      
      // Topic hinzufügen
      topicsData.push(newTopic);
      const newTopicIndex = topicsData.length - 1;
      
      // Initial den aktiven Tab für dieses Topic setzen (Index 0 für den ersten Tab)
      newTopic.activeTabIndex = 0;
      
      // Formular zurücksetzen
      safeStyle(elements.newTopicForm, "display", "none");
      safeValue(elements.newTopicInput, "");
      
      // Speichern und UI aktualisieren
      saveTopicsData();
      renderTopics();
      
      // Sofort zum neuen Topic wechseln
      selectTopic(newTopicIndex);
    }
  }

  // Start Edit Topic
  function startEditTopic(index, topicName) {
    if (!elements.editTopicForm || !elements.editTopicInput || !elements.editTopicId) {
      console.error("Edit form elements not found");
      return;
    }
    
    safeStyle(elements.editTopicForm, "display", "block");
    safeStyle(elements.newTopicForm, "display", "none");
    safeValue(elements.editTopicInput, topicName);
    safeValue(elements.editTopicId, index);
    
    if (elements.editTopicInput) {
      elements.editTopicInput.focus();
    }
  }

  // Funktion zum Speichern eines bearbeiteten Topics
  function saveEditedTopic() {
    if (!elements.editTopicInput || !elements.editTopicId) {
      console.error("Edit form elements not found");
      return;
    }
    
    const topicText = elements.editTopicInput.value.trim();
    const index = parseInt(elements.editTopicId.value);
    
    if (!topicText || isNaN(index) || index < 0 || index >= topicsData.length) {
      return;
    }
    
    // Prüfen, ob es ein Duplikat ist, außer wenn es dasselbe Topic ist
    const isDuplicate = topicsData.some((topic, i) => 
      i !== index && topic.name.toLowerCase() === topicText.toLowerCase()
    );
    
    if (isDuplicate) {
      alert("Ein Topic mit diesem Namen existiert bereits!");
    } else {
      topicsData[index].name = topicText;
      saveTopicsData(); // Zuerst speichern
      renderTopics();
      
    }
  }

  // Delete Topic
  function deleteTopic(index) {
    if (topicsData.length <= 1) {
      alert("Du kannst das letzte Topic nicht löschen.");
      return;
    }
    
    if (confirm("Möchtest du dieses Topic wirklich löschen? Alle zugehörigen Tabs werden geschlossen.")) {
      // Wenn das zu löschende Topic das aktuelle ist, wechseln wir zuerst
      const needTabSwitch = index === currentTopicIndex;
      
      if (needTabSwitch) {
        // Wechseln zum nächsten oder vorherigen Topic
        const newIndex = index === 0 ? 1 : index - 1;
        // Topic-Wechsel vorbereiten, aber noch nicht die Tab-Manipulation ausführen
        currentTopicIndex = newIndex;
      }
      
      // Topic entfernen
      topicsData.splice(index, 1);
      
      // Index anpassen, wenn das gelöschte Topic vor dem aktuellen war
      if (index < currentTopicIndex) {
        currentTopicIndex--;
      }
      
      // Daten speichern
      saveTopicsData();
      
      // UI aktualisieren
      renderTopics();
      
      // Tabs nur wechseln, wenn nötig
      if (needTabSwitch && hasFirefoxAPI) {
        try {
          openTabsForCurrentTopic();
        } catch (error) {
          console.error("Fehler beim Öffnen der Tabs:", error);
        }
      }
    }
  }

  // Event-Listener einrichten
  // Topic handlers
  if (elements.addTopicBtn) {
    elements.addTopicBtn.addEventListener("click", () => {
      safeStyle(elements.newTopicForm, "display", "block");
      safeStyle(elements.editTopicForm, "display", "none");
      if (elements.newTopicInput) {
        elements.newTopicInput.focus();
      }
    });
  }
  
  // Topic save/cancel handlers
  if (elements.saveNewTopicBtn) {
    elements.saveNewTopicBtn.addEventListener("click", addNewTopic);
  }
  if (elements.cancelNewTopicBtn) {
    elements.cancelNewTopicBtn.addEventListener("click", () => {
      safeStyle(elements.newTopicForm, "display", "none");
      safeValue(elements.newTopicInput, "");
    });
  }
  if (elements.newTopicInput) {
    elements.newTopicInput.addEventListener("keyup", (event) => {
      if (event.key === "Enter") {
        addNewTopic();
      }
    });
  }

  // Category handlers
  const addCategoryBtn = document.getElementById("add-category-btn");
  const newCategoryInput = document.getElementById("new-category-input");
  const saveCategoryBtn = document.getElementById("save-category-btn");
  const cancelCategoryBtn = document.getElementById("cancel-category-btn");

  if (addCategoryBtn && newCategoryInput) {
    addCategoryBtn.addEventListener("click", () => {
      const addCategoryForm = document.getElementById("add-category-form");
      if (addCategoryForm) {
        addCategoryForm.style.display = "block";
        newCategoryInput.focus();
      }
    });
  }

  if (newCategoryInput) {
    newCategoryInput.addEventListener("keyup", (event) => {
      if (event.key === "Enter") {
        addCategory();
      }
    });
  }

  if (cancelCategoryBtn) {
    cancelCategoryBtn.addEventListener("click", () => {
      const addCategoryForm = document.getElementById("add-category-form");
      if (addCategoryForm) {
        addCategoryForm.style.display = "none";
        newCategoryInput.value = "";
      }
    });
  }

  if (saveCategoryBtn) {
    saveCategoryBtn.addEventListener("click", addCategory);
  }

  // Bookmark handlers
  const addLinkBtn = document.getElementById("add-link-btn");
  const newLinkTitleInput = document.getElementById("new-link-title-input");
  const newLinkUrlInput = document.getElementById("new-link-url-input");
  const saveLinkBtn = document.getElementById("save-link-btn");
  const cancelLinkBtn = document.getElementById("cancel-link-btn");
  
  if (addLinkBtn) {
    addLinkBtn.addEventListener("click", () => {
      const addLinkForm = document.getElementById("add-link-form");
      if (addLinkForm && newLinkTitleInput) {
        addLinkForm.style.display = "block";
        newLinkTitleInput.focus();
      }
    });
  }

  if (newLinkTitleInput && newLinkUrlInput) {
    newLinkTitleInput.addEventListener("keyup", (event) => {
      if (event.key === "Enter") {
        newLinkUrlInput.focus();
      }
    });
    
    newLinkUrlInput.addEventListener("keyup", (event) => {
      if (event.key === "Enter") {
        const selectedCategoryName = document.getElementById("selected-category-name").textContent.trim();
        if (selectedCategoryName) {
          const categoryIndex = topicsData[currentTopicIndex]?.categories.findIndex(
            (category) => category.name === selectedCategoryName
          );
          if (categoryIndex !== -1) {
            addBookmark(categoryIndex);
          }
        }
      }
    });
  }

  // Use Current Tab Button Klick-Handler
  const useCurrentUrlBtn = document.getElementById("use-current-url-btn");
  if (useCurrentUrlBtn) {
    useCurrentUrlBtn.addEventListener("click", () => {
      if (!hasFirefoxAPI) return;

      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length > 0) {
          const activeTab = tabs[0];
          const titleInput = document.getElementById("new-link-title-input");
          const urlInput = document.getElementById("new-link-url-input");

          if (titleInput && urlInput) {
            titleInput.value = activeTab.title || "Untitled";
            urlInput.value = activeTab.url || "";
          }
        }
      }).catch((err) => {
        console.error("Fehler beim Abrufen des aktuellen Tabs:", err);
      });
    });
  }

  // Use Current Tab for Editing Button Klick-Handler
  const useCurrentUrlEditBtn = document.getElementById("use-current-url-edit-btn");
  if (useCurrentUrlEditBtn) {
    useCurrentUrlEditBtn.addEventListener("click", () => {
      if (!hasFirefoxAPI) return;

      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length > 0) {
          const activeTab = tabs[0];
          const titleInput = document.getElementById("edit-link-title-input");
          const urlInput = document.getElementById("edit-link-url-input");

          if (titleInput && urlInput) {
            titleInput.value = activeTab.title || "Untitled";
            urlInput.value = activeTab.url || "";
          }
        }
      }).catch((err) => {
        console.error("Fehler beim Abrufen des aktuellen Tabs:", err);
      });
    });
  }

  // Save Edited Category Button Klick-Handler
  const saveEditCategoryBtn = document.getElementById("save-edit-category-btn");
  if (saveEditCategoryBtn) {
    saveEditCategoryBtn.addEventListener("click", () => {
      saveEditedCategory();
    });
  }

  // Cancel Edit Category Button Klick-Handler
  const cancelEditCategoryBtn = document.getElementById("cancel-edit-category-btn");
  if (cancelEditCategoryBtn) {
    cancelEditCategoryBtn.addEventListener("click", () => {
      const editCategoryForm = document.getElementById("edit-category-form");
      if (editCategoryForm) {
        editCategoryForm.style.display = "none";
      }
    });
  }

  // Save Edited Bookmark Button Klick-Handler
  const saveEditLinkBtn = document.getElementById("save-edit-link-btn");
  if (saveEditLinkBtn) {
    saveEditLinkBtn.addEventListener("click", () => {
      saveEditedBookmark();
    });
  }

  // Cancel Edit Bookmark Button Klick-Handler
  const cancelEditLinkBtn = document.getElementById("cancel-edit-link-btn");
  if (cancelEditLinkBtn) {
    cancelEditLinkBtn.addEventListener("click", () => {
      const editLinkForm = document.getElementById("edit-link-form");
      if (editLinkForm) {
        editLinkForm.style.display = "none";
      }
    });
  }

  // Initialisierung
  // Initialer Load der Topics
  loadTopicsData();
  
  // Tab-Listener einrichten
  try {
    setupTabListeners();
  } catch (error) {
    console.error("Fehler beim Einrichten der Tab-Listener:", error);
  }

  loadCategoriesData();
});

// Kategorien und Bookmarks für das aktuelle Topic anzeigen
function renderCategories() {
  const categoriesList = document.getElementById("bookmark-categories");
  const linksSection = document.getElementById("bookmark-links-section");
  const linksList = document.getElementById("bookmark-links");
  const selectedCategoryName = document.getElementById("selected-category-name");

  if (!categoriesList || !linksSection || !linksList || !selectedCategoryName) return;

  categoriesList.innerHTML = "";
  linksList.innerHTML = "";
  linksSection.style.display = "none";

  if (currentTopicIndex === -1 || !topicsData[currentTopicIndex] || !topicsData[currentTopicIndex].categories || topicsData[currentTopicIndex].categories.length === 0) {
    categoriesList.innerHTML = "<li class='empty-list'>No categories yet. Add your first category!</li>";
    return;
  }

  topicsData[currentTopicIndex].categories.forEach((category, index) => {
    const li = document.createElement("li");
    li.className = "category-item";
    li.dataset.id = index;
    li.innerHTML = `
      <span class="category-text">${escapeHTML(category.name)}</span>
      <div class="category-actions">
        <button class="edit-btn" title="Edit Category"><i class="fas fa-edit"></i></button>
        <button class="delete-btn" title="Delete Category"><i class="fas fa-trash"></i></button>
      </div>
    `;

    li.addEventListener("click", () => {
      renderBookmarks(index);
    });

    li.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      startEditCategory(index, category.name);
    });

    li.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteCategory(index);
    });

    categoriesList.appendChild(li);
  });
}

// Bookmarks für eine Kategorie anzeigen
function renderBookmarks(categoryIndex) {
  const linksSection = document.getElementById("bookmark-links-section");
  const linksList = document.getElementById("bookmark-links");
  const selectedCategoryName = document.getElementById("selected-category-name");

  if (!linksSection || !linksList || !selectedCategoryName) return;

  const category = topicsData[currentTopicIndex]?.categories[categoryIndex];
  if (!category) return;

  selectedCategoryName.textContent = category.name;
  linksList.innerHTML = "";
  linksSection.style.display = "block";

  if (!category.bookmarks || category.bookmarks.length === 0) {
    linksList.innerHTML = "<li class='empty-list'>No bookmarks yet. Add your first bookmark!</li>";
    return;
  }

  category.bookmarks.forEach((bookmark, index) => {
    const li = document.createElement("li");
    li.className = "link-item";
    li.dataset.id = index;
    li.innerHTML = `
      <span class="link-text">${escapeHTML(bookmark.title)}</span>
      <span class="link-url">${escapeHTML(bookmark.url)}</span>
      <div class="link-actions">
        <button class="edit-btn" title="Edit Bookmark"><i class="fas fa-edit"></i></button>
        <button class="delete-btn" title="Delete Bookmark"><i class="fas fa-trash"></i></button>
      </div>
    `;

    li.addEventListener("click", () => {
      openBookmark(bookmark.url);
    });

    li.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      startEditBookmark(categoryIndex, index, bookmark);
    });

    li.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteBookmark(categoryIndex, index);
    });

    linksList.appendChild(li);
  });
}

// Funktion zum Öffnen eines Bookmarks in einem neuen Tab
function openBookmark(url) {
  if (!url) return;

  // Ensure the URL is absolute
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url; // Default to HTTPS if no protocol is provided
  }

  if (hasFirefoxAPI) {
    browser.tabs.create({ url }).catch((err) => console.error("Error opening bookmark:", err));
  } else {
    window.open(url, "_blank");
  }
}

// Kategorie hinzufügen
function addCategory() {
  const input = document.getElementById("new-category-input");
  if (!input || !input.value.trim()) return;

  const categoryName = input.value.trim();
  if (!topicsData[currentTopicIndex].categories) {
    topicsData[currentTopicIndex].categories = [];
  }

  topicsData[currentTopicIndex].categories.push({ name: categoryName, bookmarks: [] });
  input.value = "";
  document.getElementById("add-category-form").style.display = "none";
  saveTopicsData();
  renderCategories();
}

// Kategorie bearbeiten
function startEditCategory(index, name) {
  const input = document.getElementById("edit-category-input");
  const form = document.getElementById("edit-category-form");
  const hiddenId = document.getElementById("edit-category-id");

  if (!input || !form || !hiddenId) return;

  input.value = name;
  hiddenId.value = index;
  form.style.display = "block";
}

function saveEditedCategory() {
  const input = document.getElementById("edit-category-input");
  const hiddenId = document.getElementById("edit-category-id");

  if (!input || !hiddenId || !input.value.trim()) return;

  const index = parseInt(hiddenId.value, 10);
  if (isNaN(index) || !topicsData[currentTopicIndex].categories || !topicsData[currentTopicIndex].categories[index]) return;

  topicsData[currentTopicIndex].categories[index].name = input.value.trim();
  input.value = "";
  hiddenId.value = "";
  document.getElementById("edit-category-form").style.display = "none";
  saveTopicsData();
  renderCategories();
}

// Kategorie löschen
function deleteCategory(index) {
  if (!topicsData[currentTopicIndex].categories || !topicsData[currentTopicIndex].categories[index]) return;

  topicsData[currentTopicIndex].categories.splice(index, 1);
  saveTopicsData();
  renderCategories();
}

// Bookmark hinzufügen
function addBookmark(categoryIndex) {
  const titleInput = document.getElementById("new-link-title-input");
  const urlInput = document.getElementById("new-link-url-input");

  if (!titleInput || !urlInput || !titleInput.value.trim() || !urlInput.value.trim()) {
    alert("Both title and URL are required to add a bookmark.");
    return;
  }

  const bookmark = { title: titleInput.value.trim(), url: urlInput.value.trim() };
  if (!topicsData[currentTopicIndex].categories[categoryIndex].bookmarks) {
    topicsData[currentTopicIndex].categories[categoryIndex].bookmarks = [];
  }

  topicsData[currentTopicIndex].categories[categoryIndex].bookmarks.push(bookmark);

  titleInput.value = "";
  urlInput.value = "";
  document.getElementById("add-link-form").style.display = "none";
  saveTopicsData();
  renderBookmarks(categoryIndex);
}

// Bookmark bearbeiten
function startEditBookmark(categoryIndex, bookmarkIndex, bookmark) {
  const titleInput = document.getElementById("edit-link-title-input");
  const urlInput = document.getElementById("edit-link-url-input");
  const hiddenId = document.getElementById("edit-link-id");

  if (!titleInput || !urlInput || !hiddenId) return;

  titleInput.value = bookmark.title;
  urlInput.value = bookmark.url;
  hiddenId.value = `${categoryIndex},${bookmarkIndex}`;
  document.getElementById("edit-link-form").style.display = "block";
}

function saveEditedBookmark() {
  const titleInput = document.getElementById("edit-link-title-input");
  const urlInput = document.getElementById("edit-link-url-input");
  const hiddenId = document.getElementById("edit-link-id");

  if (!titleInput || !urlInput || !hiddenId || !titleInput.value.trim() || !urlInput.value.trim()) return;

  const [categoryIndex, bookmarkIndex] = hiddenId.value.split(",").map(Number);
  if (
    isNaN(categoryIndex) ||
    isNaN(bookmarkIndex) ||
    !topicsData[currentTopicIndex].categories ||
    !topicsData[currentTopicIndex].categories[categoryIndex] ||
    !topicsData[currentTopicIndex].categories[categoryIndex].bookmarks[bookmarkIndex]
  ) {
    return;
  }

  topicsData[currentTopicIndex].categories[categoryIndex].bookmarks[bookmarkIndex] = {
    title: titleInput.value.trim(),
    url: urlInput.value.trim(),
  };

  titleInput.value = "";
  urlInput.value = "";
  hiddenId.value = "";
  document.getElementById("edit-link-form").style.display = "none";
  saveTopicsData();
  renderBookmarks(categoryIndex);
}

// Bookmark löschen
function deleteBookmark(categoryIndex, bookmarkIndex) {
  if (
    !topicsData[currentTopicIndex].categories ||
    !topicsData[currentTopicIndex].categories[categoryIndex] ||
    !topicsData[currentTopicIndex].categories[categoryIndex].bookmarks[bookmarkIndex]
  ) {
    return;
  }

  topicsData[currentTopicIndex].categories[categoryIndex].bookmarks.splice(bookmarkIndex, 1);
  saveTopicsData();
  renderBookmarks(categoryIndex);
}

// Daten speichern und laden
function saveCategoriesData() {
  if (hasFirefoxAPI) {
    browser.storage.local.set({ categoriesData }).catch((err) => console.error("Fehler beim Speichern der Kategorien:", err));
  } else {
    try {
      localStorage.setItem("categoriesData", JSON.stringify(categoriesData));
    } catch (e) {
      console.error("Fehler beim Speichern der Kategorien:", e);
    }
  }
}

function loadCategoriesData() {
  if (hasFirefoxAPI) {
    browser.storage.local.get("categoriesData").then((result) => {
      categoriesData = result.categoriesData || {};
      renderCategories();
    });
  } else {
    try {
      const data = localStorage.getItem("categoriesData");
      categoriesData = data ? JSON.parse(data) : {};
      renderCategories();
    } catch (e) {
      console.error("Fehler beim Laden der Kategorien:", e);
      categoriesData = {};
    }
  }
}