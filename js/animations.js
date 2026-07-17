// F-BANK / Forklandia
// JS-анимации, которые требуют динамического создания элементов
// (CSS keyframes лежат в css/animations.css и css/aurora.css)

import { CONFIG } from './config.js';
import { formatAmount } from './utils.js';
import { sleep } from './utils.js';

/**
 * Проигрывает анимацию "всплытия" числа (например, при изменении баланса)
 */
export function playNumberPop(element) {
  if (!element) return;
  element.classList.remove('anim-number-pop');
  // Форсируем reflow, чтобы анимацию можно было перезапустить
  void element.offsetWidth;
  element.classList.add('anim-number-pop');
}

/**
 * Анимация "тряски" — например, при неверном пароле
 */
export function playShake(element) {
  if (!element) return;
  element.classList.remove('anim-shake');
  void element.offsetWidth;
  element.classList.add('anim-shake');
}

/**
 * Кратковременный эффект нажатия на кнопку (замена :active transform)
 */
export function playBtnPress(element) {
  if (!element) return;
  element.classList.remove('anim-btn-press');
  void element.offsetWidth;
  element.classList.add('anim-btn-press');
}

/**
 * Пульсация карты при заморозке/разморозке
 */
export function playFrozenPulse(cardElement) {
  if (!cardElement) return;
  cardElement.classList.add('anim-frozen-pulse');
}

export function removeFrozenPulse(cardElement) {
  if (!cardElement) return;
  cardElement.classList.remove('anim-frozen-pulse');
}

/**
 * Дождь из монет (используется при активации промокода)
 */
export function playCoinRain(container, count = CONFIG.COIN_RAIN_COUNT) {
  if (!container) return;

  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div');
    coin.className = 'coin';
    coin.textContent = '🪙';
    coin.style.left = `${Math.random() * 100}%`;
    coin.style.animationDelay = `${Math.random() * 0.6}s`;
    coin.style.animationDuration = `${1.2 + Math.random() * 0.8}s`;
    container.appendChild(coin);

    // Удаляем монету после завершения анимации
    coin.addEventListener('animationend', () => coin.remove());
  }
}

/**
 * Полноэкранная анимация успешного перевода
 */
export async function showFullscreenTransferAnimation({ amount, recipient }) {
  const overlay = document.createElement('div');
  overlay.className = 'fullscreen-anim fullscreen-anim--transfer';
  overlay.innerHTML = `
    <div class="fullscreen-anim__content anim-pop-in">
      <div class="fullscreen-anim__icon">✅</div>
      <div class="fullscreen-anim__amount">${formatAmount(amount)}</div>
      <div class="fullscreen-anim__label">Отправлено: ${recipient}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('fullscreen-anim--visible'));

  await sleep(1800);

  overlay.classList.remove('fullscreen-anim--visible');
  await sleep(300);
  overlay.remove();
}

/**
 * Полноэкранная анимация активации промокода: монеты + крупная сумма + кнопка закрытия
 */
export function showFullscreenPromoAnimation({ amount }, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'fullscreen-anim fullscreen-anim--promo';
  overlay.innerHTML = `
    <div class="coin-rain-layer"></div>
    <div class="fullscreen-anim__content anim-pop-in">
      <div class="fullscreen-anim__amount">+${formatAmount(amount)}</div>
      <div class="fullscreen-anim__label">Промокод активирован!</div>
      <button class="btn btn--neon-close" type="button">Закрыть</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const coinLayer = overlay.querySelector('.coin-rain-layer');
  playCoinRain(coinLayer, CONFIG.COIN_RAIN_COUNT);

  requestAnimationFrame(() => overlay.classList.add('fullscreen-anim--visible'));

  const closeBtn = overlay.querySelector('.btn--neon-close');
  const close = async () => {
    overlay.classList.remove('fullscreen-anim--visible');
    await sleep(300);
    overlay.remove();
    if (typeof onClose === 'function') onClose();
  };

  closeBtn.addEventListener('click', close);

  // Автозакрытие через 4 секунды, если пользователь не закрыл сам
  setTimeout(() => {
    if (document.body.contains(overlay)) close();
  }, 4000);
}
