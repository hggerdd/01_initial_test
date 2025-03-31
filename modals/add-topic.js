document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('topic-input');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  // Function to send response back
  async function respond(success, topicName = '') {
    try {
      await browser.runtime.sendMessage({
        type: 'addTopicResponse',
        success,
        topicName
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
});