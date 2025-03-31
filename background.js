// Listen for messages from sidebar or modal
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'addTopicResponse') {
    // Forward the complete message structure
    browser.runtime.sendMessage({
      type: 'modalResponse',
      success: message.success,
      topicName: message.topicName,
      categorySet: message.categorySet
    }).catch(error => {
      console.error('Error broadcasting modal response:', error);
      // Send error back to modal
      browser.runtime.sendMessage({
        type: 'modalError',
        error: error.message
      });
    });
  }
});