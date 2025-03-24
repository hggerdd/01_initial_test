// Ein Topic auswählen und Tabs anzeigen
function selectTopic(index) {
  if (index === currentTopicIndex) return; // Bereits ausgewählt
  
  if (index >= 0 && index < topicsData.length) {
    console.log(`Wechsle von Topic ${currentTopicIndex} zu Topic ${index}`);
    
    // Bevor wir das Topic wechseln, speichere den aktiv angezeigten Tab
    if (currentTopicIndex !== -1 && hasFirefoxAPI) {
      try {
        // Finde den aktiven Tab
        browser.tabs.query({ active: true, currentWindow: true })
          .then(activeTabs => {
            if (activeTabs.length > 0) {
              const activeTab = activeTabs[0];
              
              // Suche den Index dieses Tabs in den gespeicherten Tabs des aktuellen Topics
              if (topicsData[currentTopicIndex] && topicsData[currentTopicIndex].tabs) {
                const tabUrls = topicsData[currentTopicIndex].tabs.map(tab => tab.url);
                const activeTabIndex = tabUrls.indexOf(activeTab.url);
                
                if (activeTabIndex !== -1) {
                  // Speichere den aktiven Tab-Index
                  console.log(`Speichere aktiven Tab-Index ${activeTabIndex} für Topic ${currentTopicIndex}`);
                  topicsData[currentTopicIndex].activeTabIndex = activeTabIndex;
                }
              }
            }
          })
          .catch(err => {
            console.error("Fehler beim Ermitteln des aktiven Tabs:", err);
          });
      } catch (error) {
        console.error("Fehler beim Speichern des aktiven Tabs:", error);
      }
    }
    
    const prevIndex = currentTopicIndex;
    currentTopicIndex = index;
    
    // Speichere die aktuellen Tabs für das vorherige Topic
    if (prevIndex !== -1 && prevIndex < topicsData.length) {
      try {
        saveTabsForCurrentTopic(prevIndex);
      } catch (error) {
        console.error("Fehler beim Speichern der Tabs:", error);
      }
    }
    
    // Aktualisiere die UI
    renderTopics();
    updateCurrentTopicInfo();
    
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
}  // Hilfsfunktion zum Bereinigen der Lazy-Tabs-Zuordnung
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
}// Warten bis das DOM vollständig geladen ist
// Globales Objekt für die Erweiterung - bleibt während der gesamten Laufzeit erhalten
if (typeof window.extensionState === 'undefined') {
window.extensionState = {
  lazyTabsMapping: {},  // Speichert die Zuordnung von Tab-IDs zu URLs für Lazy Loading
  tabListenerAdded: false  // Verhindert das mehrfache Hinzufügen des Tab-Listeners
};
}

// Speichert den aktiven Tab für ein Topic - MUSS VOR ALLEN AUFRUFEN DEFINIERT WERDEN
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

document.addEventListener("DOMContentLoaded", function() {
  
// Globale Variablen
let topicsData = [];
let currentTopicIndex = -1;
const hasFirefoxAPI = typeof browser !== 'undefined' && browser.storage;

// Elemente erst innerhalb der Funktion abrufen, um sicherzustellen, dass das DOM geladen ist
const elements = {
  addTopicBtn: document.getElementById("add-topic-btn"),
  newTopicForm: document.getElementById("new-topic-form"),
  newTopicInput: document.getElementById("new-topic-input"),
  saveNewTopicBtn: document.getElementById("save-new-topic-btn"),
  cancelNewTopicBtn: document.getElementById("cancel-new-topic-btn"),
  topicsList: document.getElementById("topics-list"),
  activeTopic: document.getElementById("active-topic"),
  tabCount: document.getElementById("tab-count"),
  editTopicForm: document.getElementById("edit-topic-form"),
  editTopicInput: document.getElementById("edit-topic-input"),
  saveEditTopicBtn: document.getElementById("save-edit-topic-btn"),
  cancelEditTopicBtn: document.getElementById("cancel-edit-topic-btn"),
  editTopicId: document.getElementById("edit-topic-id"),
  currentTopicInfo: document.getElementById("current-topic-info")
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

// HTML-Escape-Funktion um XSS zu verhindern
function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Storage-Funktionen
// Strukturierte Daten laden (mit Tabs pro Topic)
function loadTopicsData() {
  if (hasFirefoxAPI) {
    browser.storage.local.get(["topicsData", "currentTopicIndex"]).then((result) => {
      topicsData = result.topicsData || [];
      currentTopicIndex = result.currentTopicIndex || -1;
      
      if (topicsData.length > 0 && currentTopicIndex === -1) {
        currentTopicIndex = 0;
      }
      
      // Asynchronen Funktionen nacheinander ausführen
      renderTopics();
      updateCurrentTopicInfo();
      
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
        currentTopicIndex = 0;
      }
      
      renderTopics();
      updateCurrentTopicInfo();
    } catch (e) {
      console.error("Fehler beim Laden der Topics-Daten:", e);
      topicsData = [];
      currentTopicIndex = -1;
      renderTopics();
    }
  }
}

// Strukturierte Daten speichern
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
    
    li.innerHTML = `
      <span class="topic-text">${escapeHTML(topicData.name)}</span>
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

// Aktualisiert die Topic-Info-Anzeige
function updateCurrentTopicInfo() {
  if (!elements.activeTopic || !elements.tabCount) {
    console.warn("Topic-Info-Elemente nicht gefunden");
    return;
  }
  
  if (currentTopicIndex !== -1 && topicsData[currentTopicIndex]) {
    const topic = topicsData[currentTopicIndex];
    const tabCount = topic.tabs ? topic.tabs.filter(tab => tab && tab.url && tab.url !== "about:blank").length : 0;
    safeTextContent(elements.activeTopic, `Active: ${topic.name}`);
    safeTextContent(elements.tabCount, `Open tabs: ${tabCount}`);
  } else {
    safeTextContent(elements.activeTopic, "No topic selected");
    safeTextContent(elements.tabCount, "Open tabs: 0");
  }
}

// Ein Topic auswählen und Tabs anzeigen
function selectTopic(index) {
  if (index === currentTopicIndex) return; // Bereits ausgewählt
  
  if (index >= 0 && index < topicsData.length) {
    console.log(`Wechsle von Topic ${currentTopicIndex} zu Topic ${index}`);
    
    const prevIndex = currentTopicIndex;
    currentTopicIndex = index;
    
    // Speichere die aktuellen Tabs für das vorherige Topic
    if (prevIndex !== -1 && prevIndex < topicsData.length) {
      try {
        saveTabsForCurrentTopic(prevIndex);
      } catch (error) {
        console.error("Fehler beim Speichern der Tabs:", error);
      }
    }
    
    // Aktualisiere die UI
    renderTopics();
    updateCurrentTopicInfo();
    
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
        // UI aktualisieren, um die richtige Tab-Anzahl anzuzeigen
        updateCurrentTopicInfo();
      }
    }).catch(err => {
      console.error("Fehler beim Abfragen der Tabs:", err);
    });
  } catch (error) {
    console.error("Unbehandelter Fehler in saveTabsForCurrentTopic:", error);
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
    
    // Zuerst: Alle aktuellen (nicht-System) Tabs abrufen
    browser.tabs.query({}).then((existingTabs) => {
      // Filtere Firefox-System-Tabs und Erweiterungs-Tabs heraus
      const regularTabs = existingTabs.filter(tab => {
        const url = tab.url || "";
        return !(url.startsWith("moz-extension:") || 
                url === "about:addons");
      });
      
      // IDs der zu schließenden regulären Tabs
      const tabIdsToClose = regularTabs.map(tab => tab.id);
      
      // Fall 1: Topic ohne Tabs oder leeres Topic - einen neuen leeren Tab öffnen
      if (hasNoTabs) {
        console.log("Topic hat keine Tabs - erstelle einen neuen Tab");
        
        // Erstelle einen neuen leeren Tab
        browser.tabs.create({ url: "about:newtab" })
          .then(newTab => {
            console.log("Neuer Tab erstellt, ID:", newTab.id);
            
            // NACH erfolgreicher Erstellung des neuen Tabs, schließe alte Tabs
            if (tabIdsToClose.length > 0) {
              setTimeout(() => {
                console.log(`Schließe ${tabIdsToClose.length} alte Tabs`);
                browser.tabs.remove(tabIdsToClose).catch(err => {
                  console.error("Fehler beim Schließen der Tabs:", err);
                });
              }, 300);
            }
          })
          .catch(err => {
            console.error("Fehler beim Erstellen des neuen Tabs:", err);
          });
          
      } else {
      
      // Fall 2: Topic mit gespeicherten Tabs
      
      // Hole die gültigen gespeicherten Tabs des aktuellen Topics
      const savedTabs = currentTopic.tabs.filter(tabData => {
        return tabData && tabData.url && 
               !tabData.url.startsWith("about:") && 
               !tabData.url.startsWith("chrome:") &&
               !tabData.url.startsWith("moz-extension:") &&
               tabData.url !== "about:blank";
      });
      
      // Wenn keine gültigen gespeicherten Tabs vorhanden sind, behandle wie Fall 1
      if (savedTabs.length === 0) {
        console.log("Keine gültigen gespeicherten Tabs - schließe alle Tabs und erstelle einen neuen");
        
        // Wenn es Tabs zu schließen gibt, schließe sie zuerst
        if (tabIdsToClose.length > 0) {
          return browser.tabs.remove(tabIdsToClose)
            .then(() => {
              console.log("Alle vorhandenen Tabs geschlossen, erstelle jetzt einen neuen Tab");
              cleanupLazyTabsMapping(); // Bereinige Mappings
              
              // Nach dem Schließen aller Tabs einen neuen erstellen
              return browser.tabs.create({})  // Ohne URL wird automatisch die neue Tab-Seite geöffnet
                .then(newTab => {
                  console.log("Neuer Tab für Topic ohne gültige Tabs erstellt, ID:", newTab.id);
                })
                .catch(err => {
                  console.error("Fehler beim Erstellen des neuen Tabs:", err);
                });
            })
            .catch(err => {
              console.error("Fehler beim Schließen aller Tabs:", err);
              
              // Im Fehlerfall trotzdem einen neuen Tab erstellen
              return browser.tabs.create({})  // Ohne URL wird automatisch die neue Tab-Seite geöffnet
                .catch(createErr => {
                  console.error("Kritischer Fehler beim Erstellen des Ersatz-Tabs:", createErr);
                });
            });
        } else {
          // Keine Tabs zu schließen, direkt einen neuen erstellen
          return browser.tabs.create({})  // Ohne URL wird automatisch die neue Tab-Seite geöffnet
            .then(newTab => {
              console.log("Neuer Tab für Topic ohne gültige Tabs erstellt, ID:", newTab.id);
            })
            .catch(err => {
              console.error("Fehler beim Erstellen des neuen Tabs:", err);
            });
        }
      } else {
          // Fall 3: Topic mit gültigen gespeicherten Tabs
          console.log(`Erstelle ${savedTabs.length} gespeicherte Tabs`);
          
          // Erstelle alle gespeicherten Tabs
          const createTabPromises = savedTabs.map(tabData => 
            browser.tabs.create({ url: tabData.url })
              .catch(err => {
                console.error(`Fehler beim Erstellen eines Tabs:`, err);
                return null;
              })
          );
          
          // Warte, bis alle Tabs erstellt wurden
          Promise.all(createTabPromises)
            .then(newTabs => {
              // Filtere erfolgreiche Tab-Erstellungen
              const successfulTabs = newTabs.filter(tab => tab !== null);
              console.log(`${successfulTabs.length} von ${savedTabs.length} Tabs erfolgreich erstellt`);
              
              // Sicherheitscheck: Wenn keine Tabs erstellt wurden, einen neuen erstellen
              if (successfulTabs.length === 0) {
                console.log("Keine Tabs konnten erstellt werden, erstelle Ersatz-Tab");
                return browser.tabs.create({ url: "about:newtab" });
              }
              
              return Promise.resolve();
            })
            .then(() => {
              // Jetzt die alten Tabs schließen mit Verzögerung
              if (tabIdsToClose.length > 0) {
                setTimeout(() => {
                  console.log(`Schließe ${tabIdsToClose.length} alte Tabs`);
                  browser.tabs.remove(tabIdsToClose).catch(err => {
                    console.error("Fehler beim Schließen der alten Tabs:", err);
                  });
                }, 300);
              }
            })
            .catch(err => {
              console.error("Fehler beim Tab-Wechsel:", err);
              
              // Im Fehlerfall: Stelle sicher, dass mindestens ein Tab geöffnet bleibt
              browser.tabs.query({}).then(tabs => {
                if (tabs.length === 0 || (tabs.length === 1 && tabs[0].url === "about:blank")) {
                  browser.tabs.create({ url: "about:newtab" });
                }
              });
            });
        }
      }
    }).catch(err => {
      console.error("Fehler beim Abfragen der Tabs:", err);
    });
  } catch (error) {
    console.error("Unbehandelter Fehler in openTabsForCurrentTopic:", error);
  }
}

// Topic-Management-Funktionen
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
    updateCurrentTopicInfo();
    
    safeStyle(elements.editTopicForm, "display", "none");
    safeValue(elements.editTopicInput, "");
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
    updateCurrentTopicInfo();
    
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
// Add Topic Button Klick-Handler
if (elements.addTopicBtn) {
  elements.addTopicBtn.addEventListener("click", () => {
    safeStyle(elements.newTopicForm, "display", "block");
    safeStyle(elements.editTopicForm, "display", "none");
    if (elements.newTopicInput) {
      elements.newTopicInput.focus();
    }
  });
}

// Cancel Add Topic Button Klick-Handler
if (elements.cancelNewTopicBtn) {
  elements.cancelNewTopicBtn.addEventListener("click", () => {
    safeStyle(elements.newTopicForm, "display", "none");
    safeValue(elements.newTopicInput, "");
  });
}

// Save New Topic Button Klick-Handler
if (elements.saveNewTopicBtn) {
  elements.saveNewTopicBtn.addEventListener("click", () => {
    addNewTopic();
  });
}

// Cancel Edit Topic Button Klick-Handler
if (elements.cancelEditTopicBtn) {
  elements.cancelEditTopicBtn.addEventListener("click", () => {
    safeStyle(elements.editTopicForm, "display", "none");
    safeValue(elements.editTopicInput, "");
  });
}

// Save Edit Topic Button Klick-Handler
if (elements.saveEditTopicBtn) {
  elements.saveEditTopicBtn.addEventListener("click", () => {
    saveEditedTopic();
  });
}

// Enter-Taste zum Speichern im New Topic Form
if (elements.newTopicInput) {
  elements.newTopicInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      addNewTopic();
    }
  });
}

// Enter-Taste zum Speichern im Edit Topic Form
if (elements.editTopicInput) {
  elements.editTopicInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      saveEditedTopic();
    }
  });
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
            browser.tabs.create({ url: "about:newtab" })
              .catch(err => {
                console.error("Fehler beim Erstellen des Ersatz-Tabs:", err);
              });
          }
          
          // Tab-Status speichern
          setTimeout(() => {
            try {
              saveTabsForCurrentTopic(currentTopicIndex);
            } catch (error) {
              console.error("Fehler beim Speichern der Tabs:", error);
            }
          }, 500);
        }).catch(err => {
          console.error("Fehler beim Abfragen der Tabs:", err);
          
          // Im Fehlerfall trotzdem einen Tab erstellen
          browser.tabs.create({ url: "about:newtab" })
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
          } catch (error) {
            console.error("Fehler beim Speichern der Tabs:", error);
          }
        }, 500);
      }
    });
  } catch (error) {
    console.error("Fehler beim Einrichten der Tab-Listener:", error);
  }
}

// Initialisierung
// Initialer Load der Topics
loadTopicsData();

      // Tab-Listener einrichten
    browser.tabs.onActivated.addListener((activeInfo) => {
      if (currentTopicIndex !== -1) {
        // Speichere den aktiven Tab, wenn die Tab-Aktivierung wechselt
        saveActiveTab(currentTopicIndex);
      }
    });
try {
  setupTabListeners();
} catch (error) {
  console.error("Fehler beim Einrichten der Tab-Listener:", error);
}
});