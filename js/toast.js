// F-BANK / Forklandia
// Toast-уведомления: сверху по центру, не блокируют UI

import { CONFIG } from './config.js';

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

/**
 * Показывает toast-уведомление
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'info') {
  const root = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  root.appendChild(toast);

  // Форсируем reflow, чтобы анимация появления сработала
  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  const hideTimer = setTimeout(() => {
    hideToast(toast);
  }, CONFIG.TOAST_DURATION_MS);

  toast.addEventListener('click', () => {
    clearTimeout(hideTimer);
    hideToast(toast);
  });
}

function hideToast(toast) {
  toast.classList.remove('toast--visible');
  toast.classList.add('toast--hiding');
  setTimeout(() => {
    toast.remove();
  }, 300);
}

export function showSuccess(message) {
  showToast(message, 'success');
}

export function showError(message) {
  showToast(message, 'error');
}
