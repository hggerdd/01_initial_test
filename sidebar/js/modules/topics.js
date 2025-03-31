import { escapeHTML } from './utils.js';

export class TopicManager {
  constructor(elements, hasFirefoxAPI) {
    this.elements = elements;
    this.hasFirefoxAPI = hasFirefoxAPI;
    this.callbacks = {
      onTopicSelect: null,
      onTopicEdit: null,
      onTopicDelete: null
    };
  }

  // Add method to set callbacks
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async saveTopicsData(topicsData, currentTopicIndex) {
    if (this.hasFirefoxAPI) {
      await browser.storage.local.set({ topicsData, currentTopicIndex });
    } else {
      localStorage.setItem("topicsData", JSON.stringify(topicsData));
      localStorage.setItem("currentTopicIndex", String(currentTopicIndex));
    }
  }

  renderTopics(topicsData, currentTopicIndex) {
    if (!this.elements.topicsList) return;
    
    this.elements.topicsList.innerHTML = this.generateTopicsHTML(topicsData, currentTopicIndex);
    if (this.callbacks.onTopicSelect) {  // Only attach events if callbacks are set
      this.attachEventListeners(topicsData);
    }
  }

  generateTopicsHTML(topicsData, currentTopicIndex) {
    if (topicsData.length === 0) {
      return "<li class='empty-list'>No topics yet. Add your first topic!</li>";
    }

    return topicsData.slice(0, 100).map((topicData, index) => {
      const tabCount = this.calculateTabCount(topicData);
      // Build a comma-separated list of the first 8 characters of each tab's title (or URL)
      const extra = topicData.tabs && topicData.tabs.length > 0
        ? topicData.tabs.map(tab => {
            let text = tab.title ? tab.title : tab.url;
            return escapeHTML(text.substring(0, 8));
          }).join(', ')
        : "";
      const isSelected = index === currentTopicIndex;
      
      return `
        <li class="topic-item ${isSelected ? 'selected' : ''}" data-id="${index}">
          <span class="topic-text">
            ${escapeHTML(topicData.name)} 
            <span class="tab-count-badge">(${tabCount})</span>
          </span>
          <small class="topic-extra">${extra}</small>
          <div class="topic-actions">
            <button class="edit-btn" title="Edit Topic">
              <i class="fas fa-edit"></i>
            </button>
            <button class="delete-btn" title="Delete Topic">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </li>
      `;
    }).join('');
  }

  calculateTabCount(topicData) {
    return topicData.tabs ? 
      topicData.tabs.filter(tab => tab && tab.url && 
        !this.isSystemTab(tab.url)
      ).length : 0;
  }

  isSystemTab(url) {
    return !url || 
           url.startsWith("about:") || 
           url.startsWith("chrome:") || 
           url.startsWith("moz-extension:") ||
           url === "about:blank";
  }

  attachEventListeners(topicsData) {
    if (!this.elements.topicsList) return;
    if (!this.callbacks.onTopicSelect) return;  // Guard against missing callbacks

    const topicItems = this.elements.topicsList.querySelectorAll('.topic-item');
    
    topicItems.forEach((item, index) => {
      // Click on topic to select
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.edit-btn') && !e.target.closest('.delete-btn')) {
          this.callbacks.onTopicSelect?.(index);
        }
      });

      // Edit button - Fixed event handling
      const editBtn = item.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const form = this.elements.editTopicForm;
          const input = this.elements.editTopicInput;
          const idInput = this.elements.editTopicId;
          
          if (form && input && idInput) {
            form.style.display = 'block';
            input.value = topicsData[index].name;
            idInput.value = index;
            input.focus();
          }
        });
      }

      // Delete button
      const deleteBtn = item.querySelector('.delete-btn');
      if (deleteBtn && this.callbacks.onTopicDelete) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.callbacks.onTopicDelete(index);
        });
      }
    });
  }

  async addNewTopic(name) {
    if (!name) return false;
    // New topic always starts with a single "google.de" tab.
    const newTopic = {
      name: name.trim(),
      tabs: [{
        url: "https://www.google.de",
        title: "Google",
        favIconUrl: ""
      }],
      categories: []
    };
    return newTopic;
  }

  setupTopicFormListeners(elements, onTopicAdd) {
    if (elements.addTopicBtn) {
      elements.addTopicBtn.addEventListener('click', () => {
        elements.newTopicForm.style.display = 'block';
        elements.newTopicInput.focus();
      });
    }

    if (elements.saveNewTopicBtn) {
      elements.saveNewTopicBtn.addEventListener('click', async () => {
        const name = elements.newTopicInput.value.trim();
        if (name) {
          const topic = await this.addNewTopic(name);
          if (topic) {
            onTopicAdd(topic);
            elements.newTopicForm.style.display = 'none';
            elements.newTopicInput.value = '';
          }
        }
      });
    }

    if (elements.cancelNewTopicBtn) {
      elements.cancelNewTopicBtn.addEventListener('click', () => {
        elements.newTopicForm.style.display = 'none';
        elements.newTopicInput.value = '';
      });
    }

    // Handle enter key in new topic input
    if (elements.newTopicInput) {
      elements.newTopicInput.addEventListener('keyup', async (e) => {
        if (e.key === 'Enter') {
          const name = elements.newTopicInput.value.trim();
          if (name) {
            const topic = await this.addNewTopic(name);
            if (topic) {
              onTopicAdd(topic);
              elements.newTopicForm.style.display = 'none';
              elements.newTopicInput.value = '';
            }
          }
        }
      });
    }

    // Update edit topic form handlers
    const saveEditBtn = document.getElementById("save-edit-topic-btn");
    const cancelEditBtn = document.getElementById("cancel-edit-topic-btn");
    const editForm = elements.editTopicForm;
    const editInput = elements.editTopicInput;
    const editId = elements.editTopicId;

    if (saveEditBtn && editInput && editId) {
      saveEditBtn.addEventListener('click', () => {
        const name = editInput.value.trim();
        const index = parseInt(editId.value);
        if (name && !isNaN(index) && this.callbacks.onTopicEdit) {
          this.callbacks.onTopicEdit(index, name);
          editForm.style.display = 'none';
          editInput.value = '';
        }
      });

      // Add keyboard support
      editInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          const name = editInput.value.trim();
          const index = parseInt(editId.value);
          if (name && !isNaN(index) && this.callbacks.onTopicEdit) {
            this.callbacks.onTopicEdit(index, name);
            editForm.style.display = 'none';
            editInput.value = '';
          }
        }
      });
    }

    if (cancelEditBtn && editForm) {
      cancelEditBtn.addEventListener('click', () => {
        editForm.style.display = 'none';
        if (editInput) editInput.value = '';
      });
    }
  }

  // ... other topic management methods ...
}
