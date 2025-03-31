import { escapeHTML } from './utils.js';

export class TopicManager {
  constructor(elements, hasFirefoxAPI) {
    this.elements = elements;
    this.hasFirefoxAPI = hasFirefoxAPI;
    this.onTopicAdd = null;
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

    // Set up message listener for modal responses
    if (this.hasFirefoxAPI) {
      browser.runtime.onMessage.addListener((message) => {
        if (message.type === 'modalResponse') {
          this.handleModalResponse(message);
        }
      });
    }
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

  async addNewTopic(name, categorySet = null) {
    if (!name) return false;
    
    // Create new topic with no initial tabs
    const newTopic = {
      name: name.trim(),
      tabs: [], // Start with empty tabs array
      categories: []
    };

    // Add standard categories if a category set was selected
    if (categorySet && categorySet.list_of_categories) {
      newTopic.categories = categorySet.list_of_categories.map(name => ({
        name,
        bookmarks: []
      }));
    }
    
    return newTopic;
  }

  setupTopicFormListeners(elements, onTopicAdd) {
    this.onTopicAdd = onTopicAdd;

    if (elements.addTopicBtn) {
      elements.addTopicBtn.addEventListener('click', () => {
        this.openAddTopicModal();
      });
    }
  }

  openAddTopicModal() {
    if (this.hasFirefoxAPI) {
      const modalUrl = browser.runtime.getURL('modals/add-topic.html');
      // Get screen dimensions
      browser.windows.create({
        url: modalUrl,
        type: 'popup',
        width: 400,  // Increased from default
        height: 300,  // Increased height to fit all content
        allowScriptsToClose: true,
        left: screen.width / 2 - 200,  // Center horizontally (width/2)
        top: screen.height / 2 - 150   // Center vertically (height/2)
      }).catch(err => {
        console.error('Error opening modal:', err);
        alert('Failed to open add topic dialog');
      });
    }
  }

  async handleModalResponse(message) {
    try {
      if (message.success && message.topicName) {
        const topic = await this.addNewTopic(message.topicName, message.categorySet);
        if (topic && this.onTopicAdd) {
          await this.onTopicAdd(topic);
        }
      }
    } catch (error) {
      console.error('Error handling modal response:', error);
    }
  }
}
