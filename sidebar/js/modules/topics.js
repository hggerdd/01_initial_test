import { escapeHTML } from './utils.js';

export class TopicManager {
  constructor(elements, hasFirefoxAPI) {
    this.elements = elements;
    this.hasFirefoxAPI = hasFirefoxAPI;
  }

  renderTopics(topicsData, currentTopicIndex) {
    if (!this.elements.topicsList) return;
    
    this.elements.topicsList.innerHTML = this.generateTopicsHTML(topicsData, currentTopicIndex);
    this.attachTopicEventListeners(topicsData);
  }

  generateTopicsHTML(topicsData, currentTopicIndex) {
    if (topicsData.length === 0) {
      return "<li class='empty-list'>No topics yet. Add your first topic!</li>";
    }

    return topicsData.slice(0, 100).map((topicData, index) => {
      const tabCount = this.calculateTabCount(topicData);
      const isSelected = index === currentTopicIndex;
      
      return `
        <li class="topic-item ${isSelected ? 'selected' : ''}" data-id="${index}">
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

  // ... other topic management methods ...
}
