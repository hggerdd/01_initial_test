// Listen for messages from sidebar or modal
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'addTopicResponse') {
    // Broadcast the response to all extension pages
    browser.runtime.sendMessage({
      type: 'modalResponse',
      success: message.success,
      topicName: message.topicName
    }).catch(error => {
      console.error('Error broadcasting modal response:', error);
    });
  }
});