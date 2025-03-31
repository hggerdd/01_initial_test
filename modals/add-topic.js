document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('topic-input');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const addStandardCategoriesCheckbox = document.getElementById('add-standard-categories');
  const categorySetSelect = document.getElementById('category-set-select');
  const manageSetBtn = document.getElementById('manage-sets-btn');

  let categorySets = {};

  // Load category sets from storage
  async function loadCategorySets() {
    try {
      const result = await browser.storage.local.get('categorySets');
      categorySets = result.categorySets || {
        standard: {
          name: "Standard Set",
          categories: ["Files", "Notes", "Links"]
        }
      };
      updateCategorySetSelect();
    } catch (err) {
      console.error('Error loading category sets:', err);
    }
  }

  // Update category set dropdown
  function updateCategorySetSelect() {
    categorySetSelect.innerHTML = Object.entries(categorySets)
      .map(([id, set]) => `<option value="${id}">${set.name} (${set.categories.join(', ')})</option>`)
      .join('');
  }

  // Toggle category set select visibility
  addStandardCategoriesCheckbox.addEventListener('change', (e) => {
    categorySetSelect.style.display = e.target.checked ? 'block' : 'none';
  });

  // Open category sets management modal
  manageSetBtn.addEventListener('click', async () => {
    const modalUrl = browser.runtime.getURL('modals/category-sets-modal.html');
    const modal = await browser.windows.create({
      url: modalUrl,
      type: 'popup',
      width: 500,
      height: 600,
      allowScriptsToClose: true,
      left: screen.width / 2 - 250,
      top: screen.height / 2 - 300
    });
  });

  // Listen for category set updates
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'categorySetUpdate') {
      categorySets = message.categorySets;
      updateCategorySetSelect();
    }
  });

  // Function to send response back
  async function respond(success, topicName = '', categorySet = null) {
    try {
      if (!success) {
        window.close();
        return;
      }

      // Get selected category set if checkbox is checked
      if (addStandardCategoriesCheckbox.checked) {
        const selectedSetId = categorySetSelect.value;
        if (selectedSetId && categorySets[selectedSetId]) {
          categorySet = {
            list_of_categories: [...categorySets[selectedSetId].categories]
          };
        }
      }

      await browser.runtime.sendMessage({
        type: 'modalResponse',
        success: true,
        topicName,
        categorySet
      });
      window.close();
    } catch (err) {
      console.error('Error sending response:', err);
      alert('Failed to create topic. Please try again.');
    }
  }

  // Save button handler
  saveBtn.addEventListener('click', () => {
    const name = input.value.trim();
    if (name) {
      respond(true, name);
    }
  });

  // Cancel button handler
  cancelBtn.addEventListener('click', () => {
    respond(false);
  });

  // Handle Enter key
  input.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      const name = input.value.trim();
      if (name) {
        respond(true, name);
      }
    } else if (e.key === 'Escape') {
      respond(false);
    }
  });

  // Focus input on load
  input.focus();
  
  // Load category sets on startup
  await loadCategorySets();
});