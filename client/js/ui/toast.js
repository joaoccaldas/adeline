// Lightweight toast notifications.
const host = document.getElementById('toast-host');

export function showToast(text, kind = 'info', duration = 2200) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 260);
  }, duration);
}
