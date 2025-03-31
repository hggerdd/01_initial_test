import { escapeHTML } from './utils.js';

export class CategoryManager {
  constructor(hasFirefoxAPI) {
    this.hasFirefoxAPI = hasFirefoxAPI;
    this.callbacks = {
      onCategorySelect: null,
      onCategoryEdit: null,
      onCategoryDelete: null
    };
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  renderCategories(topicsData, currentTopicIndex) {
    const categoriesList = document.getElementById("bookmark-categories");
    if (!categoriesList) return;

    const currentTopic = topicsData[currentTopicIndex];
    if (!currentTopic || !currentTopic.categories) {
      categoriesList.innerHTML = "<li class='empty-list'>No categories yet.</li>";
      return;
    }

    categoriesList.innerHTML = this.generateCategoriesHTML(currentTopic.categories);
    this.attachEventListeners(currentTopic.categories);
  }

  generateCategoriesHTML(categories) {
    if (categories.length === 0) {
      return "<li class='empty-list'>No categories yet.</li>";
    }

    return categories.map((category, index) => `
      <li class="category-item" data-id="${index}">
        <span class="category-text">${escapeHTML(category.name)}</span>
        <div class="category-actions">
          <button class="edit-btn" title="Edit Category"><i class="fas fa-edit"></i></button>
          <button class="delete-btn" title="Delete Category"><i class="fas fa-trash"></i></button>
        </div>
      </li>
    `).join('');
  }

  attachEventListeners(categories) {
    const categoriesList = document.getElementById("bookmark-categories");
    if (!categoriesList) return;

    const items = categoriesList.querySelectorAll('.category-item');
    items.forEach((item, index) => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.edit-btn') && !e.target.closest('.delete-btn')) {
          this.callbacks.onCategorySelect?.(index);
        }
      });

      const editBtn = item.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.callbacks.onCategoryEdit?.(index, categories[index].name);
        });
      }

      const deleteBtn = item.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.callbacks.onCategoryDelete?.(index);
        });
      }
    });
  }

  setupCategoryFormListeners(elements, onCategoryAdd, onCategoryEdit) {
    const addBtn = document.getElementById("add-category-btn");
    const form = document.getElementById("add-category-form");
    const input = document.getElementById("new-category-input");
    const saveBtn = document.getElementById("save-category-btn");
    const cancelBtn = document.getElementById("cancel-category-btn");

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        form.style.display = 'block';
        input.focus();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const name = input.value.trim();
        if (name) {
          onCategoryAdd(name);
          form.style.display = 'none';
          input.value = '';
        }
      });
    }

    if (input) {
      input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          const name = input.value.trim();
          if (name) {
            onCategoryAdd(name);
            form.style.display = 'none';
            input.value = '';
          }
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        form.style.display = 'none';
        input.value = '';
      });
    }

    // Add edit category form handlers
    const editForm = document.getElementById("edit-category-form");
    const editInput = document.getElementById("edit-category-input");
    const editId = document.getElementById("edit-category-id");
    const saveEditBtn = document.getElementById("save-edit-category-btn");
    const cancelEditBtn = document.getElementById("cancel-edit-category-btn");

    if (saveEditBtn && editInput && editId) {
      saveEditBtn.addEventListener('click', () => {
        const name = editInput.value.trim();
        const index = parseInt(editId.value);
        if (name && !isNaN(index)) {
          onCategoryEdit(index, name);
          editForm.style.display = 'none';
          editInput.value = '';
        }
      });
    }

    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        editForm.style.display = 'none';
        editInput.value = '';
      });
    }

    if (editInput) {
      editInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          const name = editInput.value.trim();
          const index = parseInt(editId.value);
          if (name && !isNaN(index)) {
            onCategoryEdit(index, name);
            editForm.style.display = 'none';
            editInput.value = '';
          }
        }
      });
    }
  }
}
