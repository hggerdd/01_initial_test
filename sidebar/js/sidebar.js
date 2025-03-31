import { TopicManager } from './modules/topics.js';
import { CategoryManager } from './modules/categories.js';
import { BookmarkManager } from './modules/bookmarks.js';
import { TabManager } from './modules/tab_manager.js';
import { DataManager } from './modules/data_manager.js';

const hasFirefoxAPI = typeof browser !== 'undefined' && browser.storage;
let topicsData = [];
let currentTopicIndex = -1;
let tabManager, topicManager, categoryManager, bookmarkManager, dataManager;

document.addEventListener("DOMContentLoaded", async function() {
  try {
    // Verify Firefox API availability
    const hasFirefoxAPI = typeof browser !== 'undefined' && 
                         browser.storage !== undefined &&
                         browser.tabs !== undefined;
    
    // Initialize managers in correct order
    tabManager = new TabManager(hasFirefoxAPI);
    await tabManager.initialize(topicsData);
    
    // Set up tab change handler
    tabManager.onTabsChanged = (changedTopicIndex) => {
      if (changedTopicIndex === currentTopicIndex) {
        // Re-render topics to update tab count
        topicManager.renderTopics(topicsData, currentTopicIndex);
      }
    };

    // Add the reorder handler at the same level as other handlers
    async function handleTopicReorder(fromIndex, toIndex) {
      try {
        // Update TabManager's mapping
        for (const [tabId, topicIndex] of tabManager.tabToTopicMap.entries()) {
          if (topicIndex === fromIndex) {
            tabManager.tabToTopicMap.set(tabId, toIndex);
          } else if (
            topicIndex > fromIndex && 
            topicIndex <= toIndex
          ) {
            tabManager.tabToTopicMap.set(tabId, topicIndex - 1);
          } else if (
            topicIndex < fromIndex && 
            topicIndex >= toIndex
          ) {
            tabManager.tabToTopicMap.set(tabId, topicIndex + 1);
          }
        }

        // Re-validate tab assignments
        await tabManager.validateTabAssignments();
        
        // Re-verify tab visibility
        await tabManager.verifyTabVisibility();

        return true;
      } catch (error) {
        console.error('[Sidebar] Error in handleTopicReorder:', error);
        return false;
      }
    }

    // Initialize managers with topics list element
    const elements = {
      addTopicBtn: document.getElementById("add-topic-btn"),
      newTopicForm: document.getElementById("new-topic-form"),
      newTopicInput: document.getElementById("new-topic-input"),
      saveNewTopicBtn: document.getElementById("save-new-topic-btn"),
      cancelNewTopicBtn: document.getElementById("cancel-new-topic-btn"),
      topicsList: document.getElementById("topics-list"),
      editTopicForm: document.getElementById("edit-topic-form"),
      editTopicInput: document.getElementById("edit-topic-input"),
      editTopicId: document.getElementById("edit-topic-id"),
      saveEditTopicBtn: document.getElementById("save-edit-topic-btn"),
      cancelEditTopicBtn: document.getElementById("cancel-edit-topic-btn"),
      saveDataBtn: document.getElementById("save-data-btn"),
      loadDataBtn: document.getElementById("load-data-btn")
    };

    topicManager = new TopicManager(elements, hasFirefoxAPI);
    categoryManager = new CategoryManager(hasFirefoxAPI);
    bookmarkManager = new BookmarkManager(hasFirefoxAPI);
    dataManager = new DataManager(hasFirefoxAPI);

    // Set up callbacks BEFORE initialization
    topicManager.setCallbacks({
      onTopicSelect: selectTopic,
      onTopicEdit: (index, newName) => saveEditedTopic(index, newName),
      onTopicDelete: deleteTopic,
      onTopicReorder: handleTopicReorder
    });

    categoryManager.setCallbacks({
      onCategorySelect: selectCategory,
      onCategoryEdit: startEditCategory,
      onCategoryDelete: deleteCategory
    });

    bookmarkManager.setCallbacks({
      onBookmarkEdit: startEditBookmark,
      onBookmarkDelete: deleteBookmark
    });

    dataManager.setCallbacks({
      onDataImported: async (data) => {
        // Save current tabs before switching
        if (currentTopicIndex !== -1) {
          await tabManager.saveCurrentTabs(currentTopicIndex, topicsData);
        }

        topicsData = data.topicsData;
        currentTopicIndex = data.currentTopicIndex;

        // Save to storage
        await topicManager.saveTopicsData(topicsData, currentTopicIndex);

        // Update UI
        topicManager.renderTopics(topicsData, currentTopicIndex);
        if (currentTopicIndex !== -1) {
          categoryManager.renderCategories(topicsData, currentTopicIndex);
          if (hasFirefoxAPI) {
            await tabManager.switchToTopic(currentTopicIndex, topicsData);
          }
        }
      },
      onError: (message) => alert(message)
    });

    // Setup data management event listeners
    dataManager.setupEventListeners(elements, topicsData, currentTopicIndex);

    setupEventListeners();
    loadData();

    async function selectTopic(index) {
      if (index === currentTopicIndex) return;
      
      if (index >= 0 && index < topicsData.length) {
        // Clear previous bookmarks display
        document.getElementById("bookmark-links-section").style.display = "none";
        document.getElementById("bookmark-links").innerHTML = "";
        document.getElementById("selected-category-name").textContent = "";
        
        if (currentTopicIndex !== -1) {
          await tabManager.saveCurrentTabs(currentTopicIndex, topicsData);
        }
        
        currentTopicIndex = index;
        categoryManager.renderCategories(topicsData, currentTopicIndex);
        topicManager.renderTopics(topicsData, currentTopicIndex);
        
        if (hasFirefoxAPI) {
          await tabManager.switchToTopic(currentTopicIndex, topicsData);
        }
        
        await topicManager.saveTopicsData(topicsData, currentTopicIndex);
      }
    }

    function loadData() {
      if (hasFirefoxAPI) {
        browser.storage.local.get(["topicsData", "currentTopicIndex"])
          .then(async (result) => {
            await initializeData(result);
          })
          .catch(handleError);
      } else {
        try {
          const data = {
            topicsData: JSON.parse(localStorage.getItem("topicsData") || "[]"),
            currentTopicIndex: parseInt(localStorage.getItem("currentTopicIndex") || "-1")
          };
          initializeData(data);
        } catch (e) {
          handleError(e);
        }
      }
    }

    function initializeData(result) {
      // Use retrieved topicsData and currentTopicIndex or default to empty values.
      topicsData = result.topicsData || [];
      currentTopicIndex = result.currentTopicIndex || -1;
      
      // If no topics exist, create a default topic "standard" and attach all current tabs to it.
      if (topicsData.length === 0) {
        // Create default topic with empty tabs and categories.
        topicsData = [{
          name: "standard",
          tabs: [],
          categories: []
        }];
        currentTopicIndex = 0;
        // If Firefox API is available, query current tabs and attach them.
        if (hasFirefoxAPI) {
          browser.tabs.query({}).then(async allTabs => {
            const regularTabs = allTabs.filter(tab =>
              tab.url &&
              !tab.url.startsWith("about:") &&
              !tab.url.startsWith("chrome:") &&
              !tab.url.startsWith("moz-extension:") &&
              tab.url !== "about:blank"
            );
            // Map current regular tabs to the default topic.
            topicsData[0].tabs = regularTabs.map(tab => ({
              url: tab.url,
              title: tab.title || "Untitled",
              favIconUrl: tab.favIconUrl || ""
            }));
            await topicManager.saveTopicsData(topicsData, currentTopicIndex);
            // Re-render topics and re-attach event listeners.
            topicManager.renderTopics(topicsData, currentTopicIndex);
            topicManager.attachEventListeners(topicsData);
            // Switch to default topic
            await tabManager.switchToTopic(currentTopicIndex, topicsData);
          });
        } else {
          topicsData[0].tabs = [];
        }
      } else {
        if (topicsData.length > 0 && currentTopicIndex === -1) {
          currentTopicIndex = 0;
        }
      }

      // Always render topics, even if topics already exist
      topicManager.renderTopics(topicsData, currentTopicIndex);
      topicManager.attachEventListeners(topicsData);

      if (currentTopicIndex !== -1) {
        categoryManager.renderCategories(topicsData, currentTopicIndex);
        if (hasFirefoxAPI) {
          tabManager.switchToTopic(currentTopicIndex, topicsData);
        }
      }
    }

    // Add these functions to handle topic actions
    function startEditTopic(index, name) {
      const editForm = elements.editTopicForm;
      const editInput = elements.editTopicInput;
      const editId = elements.editTopicId;
      
      if (editForm && editInput && editId) {
        editForm.style.display = 'block';
        editInput.value = name;
        editId.value = index;
        editInput.focus();
      }
    }

    async function saveEditedTopic(index, newName) {
      if (index >= 0 && index < topicsData.length) {
        topicsData[index].name = newName;
        await topicManager.saveTopicsData(topicsData, currentTopicIndex);
        topicManager.renderTopics(topicsData, currentTopicIndex);
        elements.editTopicForm.style.display = 'none';
        elements.editTopicInput.value = '';
      }
    }

    function deleteTopic(index) {
      if (topicsData.length <= 1) {
        alert("Can't delete the last topic");
        return;
      }

      if (confirm("Delete this topic and its tabs?")) {
        // Close all tabs associated with this topic before deletion.
        if (hasFirefoxAPI) {
          tabManager.closeTabsForTopic(index);
        }
        topicsData.splice(index, 1);
        if (currentTopicIndex >= index) {
          currentTopicIndex = Math.max(0, currentTopicIndex - 1);
        }
        topicManager.saveTopicsData(topicsData, currentTopicIndex);
        initializeData({ topicsData, currentTopicIndex });
      }
    }

    function handleError(error) {
      console.error("Error:", error);
      topicsData = [];
      currentTopicIndex = -1;
      topicManager.renderTopics(topicsData, currentTopicIndex);
    }

    // Setup minimal event listeners, move specific handlers to their respective managers
    function setupEventListeners() {
      tabManager.setupTabListeners(topicsData, () => {
        topicManager.renderTopics(topicsData, currentTopicIndex);
        topicManager.saveTopicsData(topicsData, currentTopicIndex);
      });

      // ... other event listeners ...
    }

    // Update new topic addition callback to switch to the new topic only once:
    topicManager.setupTopicFormListeners(elements, async (topic) => {
      await handleAddTopic(topic);
    });

    categoryManager.setupCategoryFormListeners(elements, (name) => {
      if (!topicsData[currentTopicIndex].categories) {
        topicsData[currentTopicIndex].categories = [];
      }
      topicsData[currentTopicIndex].categories.push({
        name: name,
        bookmarks: []
      });
      topicManager.saveTopicsData(topicsData, currentTopicIndex);
      categoryManager.renderCategories(topicsData, currentTopicIndex);
    });

    // Add bookmark form listeners
    bookmarkManager.setupBookmarkFormListeners(elements, (bookmark) => {
      const selectedCategoryName = document.getElementById("selected-category-name").textContent;
      const categoryIndex = topicsData[currentTopicIndex].categories.findIndex(
        cat => cat.name === selectedCategoryName
      );
      
      if (categoryIndex !== -1) {
        if (!topicsData[currentTopicIndex].categories[categoryIndex].bookmarks) {
          topicsData[currentTopicIndex].categories[categoryIndex].bookmarks = [];
        }
        topicsData[currentTopicIndex].categories[categoryIndex].bookmarks.push(bookmark);
        topicManager.saveTopicsData(topicsData, currentTopicIndex);
        bookmarkManager.renderBookmarks(topicsData[currentTopicIndex].categories[categoryIndex]);
      }
    });

    // Add category management functions
    function selectCategory(index) {
      const category = topicsData[currentTopicIndex]?.categories[index];
      if (category) {
        bookmarkManager.renderBookmarks(category);
        document.getElementById("selected-category-name").textContent = category.name;
        document.getElementById("bookmark-links-section").style.display = "block";
      }
    }

    function startEditCategory(index, name) {
      const form = document.getElementById("edit-category-form");
      const input = document.getElementById("edit-category-input");
      const idInput = document.getElementById("edit-category-id");
      
      if (form && input && idInput) {
        form.style.display = 'block';
        input.value = name;
        idInput.value = index;
        input.focus();
      }
    }

    function deleteCategory(index) {
      if (confirm("Delete this category and its bookmarks?")) {
        topicsData[currentTopicIndex].categories.splice(index, 1);
        topicManager.saveTopicsData(topicsData, currentTopicIndex);
        categoryManager.renderCategories(topicsData, currentTopicIndex);
        document.getElementById("bookmark-links-section").style.display = 'none';
      }
    }

    // Add bookmark management functions
    function startEditBookmark(index, bookmark) {
      const form = document.getElementById("edit-link-form");
      const titleInput = document.getElementById("edit-link-title-input");
      const urlInput = document.getElementById("edit-link-url-input");
      const idInput = document.getElementById("edit-link-id");
      
      if (form && titleInput && urlInput && idInput) {
        form.style.display = 'block';
        titleInput.value = bookmark.title;
        urlInput.value = bookmark.url;
        idInput.value = index;
        titleInput.focus();
      }
    }

    function deleteBookmark(index) {
      const selectedCategoryName = document.getElementById("selected-category-name").textContent;
      const categoryIndex = topicsData[currentTopicIndex].categories.findIndex(
        cat => cat.name === selectedCategoryName
      );
      
      if (categoryIndex !== -1 && confirm("Delete this bookmark?")) {
        topicsData[currentTopicIndex].categories[categoryIndex].bookmarks.splice(index, 1);
        topicManager.saveTopicsData(topicsData, currentTopicIndex);
        bookmarkManager.renderBookmarks(topicsData[currentTopicIndex].categories[categoryIndex]);
      }
    }

    // Update missing edit handlers
    document.getElementById("save-edit-topic-btn").addEventListener("click", () => {
      const editInput = elements.editTopicInput;
      const editId = elements.editTopicId;
      if (editInput && editId) {
        const index = parseInt(editId.value);
        const newName = editInput.value.trim();
        if (!isNaN(index) && newName) {
          saveEditedTopic(index, newName);
          elements.editTopicForm.style.display = 'none';
        }
      }
    });

    document.getElementById("save-edit-link-btn").addEventListener("click", () => {
      const titleInput = document.getElementById("edit-link-title-input");
      const urlInput = document.getElementById("edit-link-url-input");
      const idInput = document.getElementById("edit-link-id");
      
      if (titleInput && urlInput && idInput) {
        const index = parseInt(idInput.value);
        const newBookmark = {
          title: titleInput.value.trim(),
          url: urlInput.value.trim()
        };
        
        if (!isNaN(index) && newBookmark.title && newBookmark.url) {
          const selectedCategoryName = document.getElementById("selected-category-name").textContent;
          const categoryIndex = topicsData[currentTopicIndex].categories.findIndex(
            cat => cat.name === selectedCategoryName
          );
          
          if (categoryIndex !== -1) {
            topicsData[currentTopicIndex].categories[categoryIndex].bookmarks[index] = newBookmark;
            topicManager.saveTopicsData(topicsData, currentTopicIndex);
            bookmarkManager.renderBookmarks(topicsData[currentTopicIndex].categories[categoryIndex]);
            document.getElementById("edit-link-form").style.display = 'none';
          }
        }
      }
    });

    document.getElementById("save-edit-category-btn").addEventListener("click", () => {
      const input = document.getElementById("edit-category-input");
      const idInput = document.getElementById("edit-category-id");
      
      if (input && idInput) {
        const index = parseInt(idInput.value);
        const newName = input.value.trim();
        if (!isNaN(index) && newName) {
          topicsData[currentTopicIndex].categories[index].name = newName;
          topicManager.saveTopicsData(topicsData, currentTopicIndex);
          categoryManager.renderCategories(topicsData, currentTopicIndex);
          document.getElementById("edit-category-form").style.display = 'none';
        }
      }
    });

    // Add cancel handlers for edit forms
    const cancelButtons = {
      "cancel-edit-link-btn": "edit-link-form",
      "cancel-edit-topic-btn": "edit-topic-form",
      "cancel-edit-category-btn": "edit-category-form"
    };

    Object.entries(cancelButtons).forEach(([btnId, formId]) => {
      document.getElementById(btnId)?.addEventListener("click", () => {
        const form = document.getElementById(formId);
        if (form) {
          form.style.display = 'none';
          const inputs = form.querySelectorAll('input[type="text"]');
          inputs.forEach(input => input.value = '');
        }
      });
    });

    /**
     * Handle adding a new topic with proper tab management
     */
    async function handleAddTopic(topic) {
      try {
        const currentIndex = topicsData.length;
        topicsData.push(topic);

        // Switch to new topic
        await selectTopic(currentIndex);
        
        // Save the state after successful creation
        await topicManager.saveTopicsData(topicsData, currentIndex);
        await renderUI();

        return true;
      } catch (error) {
        console.error('Failed to create new topic:', error);
        // If creation failed, roll back
        topicsData.pop();
        return false;
      }
    }

    async function renderUI() {
      // Re-render topics and categories
      topicManager.renderTopics(topicsData, currentTopicIndex);
      categoryManager.renderCategories(topicsData, currentTopicIndex);
    }
  } catch (error) {
    console.error('Initialization error:', error);
  }
});
