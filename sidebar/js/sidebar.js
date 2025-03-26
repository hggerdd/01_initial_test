import { TopicManager } from './modules/topics.js';
import { CategoryManager } from './modules/categories.js';
import { BookmarkManager } from './modules/bookmarks.js';
import { TabManager } from './modules/tab_manager.js';

const hasFirefoxAPI = typeof browser !== 'undefined' && browser.storage;
let topicsData = [];
let currentTopicIndex = -1;

document.addEventListener("DOMContentLoaded", function() {
  // Initialize managers
  const elements = {
    addTopicBtn: document.getElementById("add-topic-btn"),
    // ... other elements
  };

  const topicManager = new TopicManager(elements, hasFirefoxAPI);
  const categoryManager = new CategoryManager(hasFirefoxAPI);
  const bookmarkManager = new BookmarkManager(hasFirefoxAPI);
  const tabManager = new TabManager(hasFirefoxAPI);

  // Setup event listeners
  setupEventListeners();
  
  // Initialize data
  loadData();

  function setupEventListeners() {
    // ... setup event listeners using the managers
  }

  function loadData() {
    if (hasFirefoxAPI) {
      browser.storage.local.get(["topicsData", "currentTopicIndex"])
        .then(initializeData)
        .catch(handleError);
    } else {
      // ... local storage fallback
    }
  }
});
