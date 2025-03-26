export function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function safeTextContent(element, text) {
  if (element) {
    element.textContent = text;
  }
}

export function safeStyle(element, property, value) {
  if (element && element.style) {
    element.style[property] = value;
  }
}

export function safeValue(element, value) {
  if (element) {
    element.value = value;
  }
}
