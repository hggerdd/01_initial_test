import { escapeHTML } from './utils.js';

export class BookmarkManager {
  constructor(hasFirefoxAPI) {
    this.hasFirefoxAPI = hasFirefoxAPI;
    this.callbacks = {
      onBookmarkEdit: null,
      onBookmarkDelete: null
    };
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  renderBookmarks(category) {
    const linksList = document.getElementById("bookmark-links");
    if (!linksList) return;

    if (!category.bookmarks || category.bookmarks.length === 0) {
      linksList.innerHTML = "<li class='empty-list'>No bookmarks yet.</li>";
      return;
    }

    linksList.innerHTML = category.bookmarks.map((bookmark, index) => `
      <li class="link-item" data-id="${index}">
        <span class="link-text">${escapeHTML(bookmark.title)}</span>
        <span class="link-url">${escapeHTML(bookmark.url)}</span>
        <div class="link-actions">
          <button class="edit-btn" title="Edit Bookmark"><i class="fas fa-edit"></i></button>
          <button class="delete-btn" title="Delete Bookmark"><i class="fas fa-trash"></i></button>
        </div>
      </li>
    `).join('');

    this.attachEventListeners(linksList, category.bookmarks);
  }

  attachEventListeners(linksList, bookmarks) {
    const items = linksList.querySelectorAll('.link-item');
    items.forEach((item, index) => {
      // Open bookmark on click
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.edit-btn') && !e.target.closest('.delete-btn')) {
          this.openBookmark(bookmarks[index].url);
        }
      });

      // Edit button
      const editBtn = item.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.callbacks.onBookmarkEdit?.(index, bookmarks[index]);
        });
      }

      // Delete button
      const deleteBtn = item.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.callbacks.onBookmarkDelete?.(index);
        });
      }
    });
  }

  setupBookmarkFormListeners(elements, onBookmarkAdd) {
    const addBtn = document.getElementById("add-link-btn");
    const form = document.getElementById("add-link-form");
    const titleInput = document.getElementById("new-link-title-input");
    const urlInput = document.getElementById("new-link-url-input");
    const saveBtn = document.getElementById("save-link-btn");
    const cancelBtn = document.getElementById("cancel-link-btn");
    const useCurrentBtn = document.getElementById("use-current-url-btn");

    if (addBtn && form) {
      addBtn.addEventListener('click', () => {
        form.style.display = 'block';
        titleInput.focus();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleBookmarkSave(titleInput, urlInput, form, onBookmarkAdd));
    }

    if (titleInput && urlInput) {
      titleInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') urlInput.focus();
      });
      
      urlInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          this.handleBookmarkSave(titleInput, urlInput, form, onBookmarkAdd);
        }
      });
    }

    if (useCurrentBtn && this.hasFirefoxAPI) {
      useCurrentBtn.addEventListener('click', async () => {
        try {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          if (tabs[0]) {
            titleInput.value = tabs[0].title || '';
            urlInput.value = tabs[0].url || '';
          }
        } catch (error) {
          console.error('Error getting current tab:', error);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        form.style.display = 'none';
        titleInput.value = '';
        urlInput.value = '';
      });
    }

    // Add edit form handling
    const editForm = document.getElementById("edit-link-form");
    const editTitleInput = document.getElementById("edit-link-title-input");
    const editUrlInput = document.getElementById("edit-link-url-input");

    if (editTitleInput && editUrlInput) {
      editTitleInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') editUrlInput.focus();
      });

      editUrlInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && editForm) {
          const title = editTitleInput.value.trim();
          const url = editUrlInput.value.trim();
          const index = parseInt(document.getElementById("edit-link-id").value);
          
          if (title && url && !isNaN(index)) {
            this.callbacks.onBookmarkEdit?.(index, { title, url });
            editForm.style.display = 'none';
            editTitleInput.value = '';
            editUrlInput.value = '';
          }
        }
      });
    }
  }

  handleBookmarkSave(titleInput, urlInput, form, onBookmarkAdd) {
    const title = titleInput.value.trim();
    let url = urlInput.value.trim();

    if (!title || !url) {
      alert('Please fill in both title and URL.');
      return;
    }

    // Add https:// if no protocol is specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    onBookmarkAdd({ title, url });
    form.style.display = 'none';
    titleInput.value = '';
    urlInput.value = '';
  }

  openBookmark(url) {
    if (!url) return;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    if (this.hasFirefoxAPI) {
      browser.tabs.create({ url }).catch(err => console.error('Error opening bookmark:', err));
    } else {
      window.open(url, '_blank');
    }
  }
}
