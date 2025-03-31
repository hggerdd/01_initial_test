import { escapeHTML } from './utils.js';

export class TopicManager {
  constructor(elements, hasFirefoxAPI) {
    this.elements = elements;
    this.hasFirefoxAPI = hasFirefoxAPI;
    this.callbacks = {
      onTopicSelect: null,
      onTopicEdit: null,
      onTopicDelete: null,
      onTopicReorder: null
    };
    this.dragState = {
      draggedIndex: -1,
      dropTarget: null
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
      const isSelected = index === currentTopicIndex;
      
      return `
        <li class="topic-item ${isSelected ? 'selected' : ''}" 
            data-id="${index}" 
            draggable="true">
          <span class="topic-text">
            ${escapeHTML(topicData.name)} 
            <span class="tab-count-badge">(${tabCount})</span>
          </span>
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
    if (!this.callbacks.onTopicSelect) return;

    const topicItems = this.elements.topicsList.querySelectorAll('.topic-item');
    
    topicItems.forEach((item, index) => {
      // Click on topic to select
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.edit-btn') && !e.target.closest('.delete-btn')) {
          this.callbacks.onTopicSelect?.(index);
        }
      });

      // Drag and drop events
      item.addEventListener('dragstart', (e) => this.handleDragStart(e, index));
      item.addEventListener('dragover', (e) => this.handleDragOver(e));
      item.addEventListener('dragenter', (e) => this.handleDragEnter(e));
      item.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      item.addEventListener('drop', (e) => this.handleDrop(e, index, topicsData));
      item.addEventListener('dragend', () => this.handleDragEnd());

      // Edit button
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

  handleDragStart(e, index) {
    this.dragState.draggedIndex = index;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  handleDragEnter(e) {
    e.preventDefault();
    const item = e.currentTarget;
    if (!item.classList.contains('drag-over')) {
      item.classList.add('drag-over');
    }
  }

  handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  async handleDrop(e, dropIndex, topicsData) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const draggedIndex = this.dragState.draggedIndex;
    if (draggedIndex === -1 || draggedIndex === dropIndex) return;

    // Reorder the topics array
    const [draggedTopic] = topicsData.splice(draggedIndex, 1);
    topicsData.splice(dropIndex, 0, draggedTopic);

    // Update indices in the tab manager
    if (this.callbacks.onTopicReorder) {
      await this.callbacks.onTopicReorder(draggedIndex, dropIndex);
    }

    // Adjust currentTopicIndex if needed
    if (this.currentTopicIndex === draggedIndex) {
      this.currentTopicIndex = dropIndex;
    } else if (
      this.currentTopicIndex > draggedIndex && 
      this.currentTopicIndex <= dropIndex
    ) {
      this.currentTopicIndex--;
    } else if (
      this.currentTopicIndex < draggedIndex && 
      this.currentTopicIndex >= dropIndex
    ) {
      this.currentTopicIndex++;
    }

    // Save and re-render
    await this.saveTopicsData(topicsData, this.currentTopicIndex);
    this.renderTopics(topicsData, this.currentTopicIndex);
  }

  handleDragEnd() {
    this.dragState.draggedIndex = -1;
    const items = this.elements.topicsList.querySelectorAll('.topic-item');
    items.forEach(item => {
      item.classList.remove('dragging', 'drag-over');
    });
  }

  async addNewTopic(name) {
    if (!name) return false;
    
    // Create new topic with no initial tabs
    // We'll create the Google tab only after properly switching to this topic
    const newTopic = {
      name: name.trim(),
      tabs: [], // Start with empty tabs array
      categories: []
    };
    
    return newTopic;
  }

  async handleNewTopicCreation(topicData, currentIndex, tabManager) {
    if (!this.hasFirefoxAPI || !tabManager) return false;

    try {
      // First ensure all current tabs are properly mapped to their current topic
      await tabManager.validateTabAssignments();

      // Add new topic to array - this will be at index length
      const newTopicIndex = currentIndex + 1;

      // Create a new tab for the topic AFTER switching
      const switchSuccess = await tabManager.switchToTopic(newTopicIndex, topicData);
      
      if (switchSuccess) {
        // Now create the new Google tab
        const newTab = await browser.tabs.create({
          url: "https://www.google.de",
          active: true
        });

        // Explicitly assign new tab to new topic using TabManager's method
        tabManager.tabToTopicMap.set(newTab.id, newTopicIndex);
        
        // Update tabs array for new topic
        topicData[newTopicIndex].tabs = [{
          url: "https://www.google.de",
          title: "Google",
          favIconUrl: ""
        }];

        // Hide any other visible tabs that might have appeared
        const allTabs = await browser.tabs.query({});
        const tabsToHide = allTabs.filter(tab => 
          tab.id !== newTab.id && 
          tabManager.isRegularTab(tab.url)
        );

        if (tabsToHide.length > 0) {
          // Use tab hide API directly since we're in an atomic operation
          await browser.tabs.hide(tabsToHide.map(t => t.id));
        }

        // Final validation
        await tabManager.verifyTabVisibility();
      }

      return switchSuccess;
    } catch (error) {
      console.error('[TopicManager] Error in handleNewTopicCreation:', error);
      return false;
    }
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
}
