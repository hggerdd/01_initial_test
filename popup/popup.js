// Einfaches Script für die Popup-Funktionalität
document.addEventListener("DOMContentLoaded", function() {
  // Button zum Öffnen der Sidebar
  const openSidebarButton = document.getElementById("open-sidebar");
  if (openSidebarButton) {
    openSidebarButton.addEventListener("click", function() {
      browser.sidebarAction.open();
    });
  }
});