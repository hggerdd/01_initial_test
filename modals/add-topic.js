document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('topic-input');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const addStandardCategoriesCheckbox = document.getElementById('add-standard-categories');
  const categorySetSelect = document.getElementById('category-set-select');

  // Standard category sets
  const categorySets = {
    standard: {
      categorie_set_name: "standard",
      list_of_categories: ["Files", "Notes", "Links"]
    }
  };

  // Listen for error responses
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'modalError') {
      console.error('Error creating topic:', message.error);
      alert('Failed to create topic: ' + message.error);
    }
  });

  // Toggle category set select visibility
  addStandardCategoriesCheckbox.addEventListener('change', (e) => {
    categorySetSelect.style.display = e.target.checked ? 'block' : 'none';
  });

  // Function to send response back
  async function respond(success, topicName = '', categorySet = null) {
    try {
      if (!success && !topicName) {
        // Just close the modal for cancel
        window.close();
        return;
      }

      // Disable save button to prevent double-clicks
      if (saveBtn) {
        saveBtn.disabled = true;
      }

      await browser.runtime.sendMessage({
        type: 'addTopicResponse',
        success,
        topicName,
        categorySet
      });

      // Close only after successful send
      window.close();
    } catch (err) {
      console.error('Error sending response:', err);
      alert('Failed to create topic. Please try again.');
      // Re-enable save button on error
      if (saveBtn) {
        saveBtn.disabled = false;
      }
    }
  }

  // Save button handler
  saveBtn.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) {
      alert('Please enter a topic name');
      return;
    }
    const selectedCategorySet = addStandardCategoriesCheckbox.checked ? 
      categorySets[categorySetSelect.value] : null;
    respond(true, name, selectedCategorySet);
  });

  // Cancel button handler
  cancelBtn.addEventListener('click', () => {
    respond(false);
  });

  // Handle Enter key
  input.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      const name = input.value.trim();
      if (!name) {
        alert('Please enter a topic name');
        return;
      }
      const selectedCategorySet = addStandardCategoriesCheckbox.checked ? 
        categorySets[categorySetSelect.value] : null;
      respond(true, name, selectedCategorySet);
    } else if (e.key === 'Escape') {
      respond(false);
    }
  });

  // Focus input on load
  input.focus();
});