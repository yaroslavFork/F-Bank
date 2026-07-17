// F-BANK / Forklandia
// Главный оркестратор приложения: роутинг экранов, состояние, обработчики событий

import { CONFIG } from './config.js';
import { loadSupabaseSDK } from './supabase.js';
import { login, getSession, clearSession, isAdmin, refreshCurrentUser, updateSessionUser } from './auth.js';
import { initRealtime, removeAllChannels } from './realtime.js';
import { showSuccess, showError } from './toast.js';
import { formatAmount, formatDate, formatDateTime, getInitial, qs, qsa, escapeHtml, withTimeout } from './utils.js';
import { playShake, playNumberPop, playBtnPress, playFrozenPulse, showFullscreenTransferAnimation, showFullscreenPromoAnimation } from './animations.js';
import { getAvailableRecipients, performTransfer, getUserTransactions } from './transfers.js';
import { redeemPromoCode } from './promocodes.js';
import { getTasksWithStatusForUser, takeTask, completeTaskForTaker } from './tasks.js';
import * as Admin from './admin.js';

/* ==================== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ==================== */

const State = {
  user: null,
  screen: 'splash', // splash | error | login | card | balance | profile | tasks | admin
  adminTab: 'create', // create | balance | tasks | promocodes | citizens
  allTransactions: [] // кэш для экрана баланса
};

const root = () => document.getElementById('app-root');

/* ==================== ТОЧКА ВХОДА ==================== */

async function bootstrap() {
  renderSplash();

  try {
    await loadSupabaseSDK();
  } catch (e) {
    console.error('[Forklandia] Не удалось загрузить Supabase SDK ни с одного источника:', e);
    renderConnectionError(e.message);
    return;
  }

  await initApp();
}

async function initApp() {
  const session = getSession();

  if (session) {
    try {
      const freshUser = await withTimeout(
        refreshCurrentUser(),
        30000,
        'Сервер не отвечает'
      );
      if (freshUser) {
        State.user = freshUser;
        startRealtimeForUser();
        goToDefaultScreen();
        return;
      }
    } catch (e) {
      // Supabase не ответил / вернул ошибку — показываем экран ошибки
      // с настоящей причиной, а не бесконечный сплэш
      console.error('[Forklandia] Не удалось загрузить сессию при старте:', e);
      renderConnectionError(e.message);
      return;
    }
  }

  renderLogin();
}

function goToDefaultScreen() {
  if (isAdmin(State.user)) {
    State.screen = 'admin';
    renderAdmin();
  } else {
    State.screen = 'card';
    renderCitizenScreen('card');
  }
}

/* ==================== SPLASH ==================== */

function renderSplash() {
  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--2"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="splash">
      <img src="assets/logo.svg" alt="F-BANK" class="splash__logo anim-splash-pulse" />
      <div class="splash__spinner spinner"></div>
      <div class="splash__text">Подключение...</div>
    </div>
  `;
}

function renderConnectionError(detail) {
  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="connection-error">
      <div class="connection-error__icon">📡</div>
      <h2>Нет соединения</h2>
      <p>Не удалось подключиться к серверу F-BANK. Проверьте интернет-соединение и попробуйте снова.</p>
      ${detail ? `<p class="text-muted" style="font-size:12px;margin-top:8px;">Причина: ${escapeHtml(detail)}</p>` : ''}
      <button class="btn btn--primary" id="retry-btn" style="width:auto;padding:14px 28px;">Повторить попытку</button>
    </div>
  `;
  qs('#retry-btn').addEventListener('click', () => {
    playBtnPress(qs('#retry-btn'));
    bootstrap();
  });
}

/* ==================== ЛОГИН ==================== */

function renderLogin() {
  State.screen = 'login';
  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--2"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="login-screen anim-fade-in-up">
      <img src="assets/logo.svg" alt="F-BANK" class="login-screen__logo" />
      <h1 class="text-center">F-BANK</h1>
      <p class="text-center mt-8">Банк Форкляндии · Дамблы (DUM)</p>

      <form id="login-form" class="mt-24">
        <div class="field">
          <label for="login-username">Логин</label>
          <input id="login-username" type="text" autocomplete="username" required />
        </div>
        <div class="field password-field">
          <label for="login-password">Пароль</label>
          <input id="login-password" type="password" autocomplete="current-password" required />
          <span class="password-toggle" id="pw-toggle">👁</span>
        </div>
        <button type="submit" class="btn btn--primary mt-16" id="login-submit">Войти</button>
      </form>
    </div>
  `;

  const pwInput = qs('#login-password');
  const pwToggle = qs('#pw-toggle');
  let pwVisible = false;
  pwToggle.addEventListener('click', () => {
    pwVisible = !pwVisible;
    pwInput.type = pwVisible ? 'text' : 'password';
    pwToggle.textContent = pwVisible ? '🙈' : '👁';
  });

  const form = qs('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#login-submit');
    const username = qs('#login-username').value.trim();
    const password = qs('#login-password').value;

    submitBtn.disabled = true;
    try {
      const user = await withTimeout(login(username, password), 30000, 'Сервер не отвечает, попробуйте ещё раз');
      State.user = user;
      startRealtimeForUser();
      showSuccess(`Добро пожаловать, ${user.username}!`);
      goToDefaultScreen();
    } catch (err) {
      console.error('[Forklandia] Ошибка входа:', err);
      playShake(qs('.login-screen'));
      showError(err.message || 'Неверный логин или пароль');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ==================== REALTIME ==================== */

function startRealtimeForUser() {
  initRealtime({
    onUserChange: (payload) => handleUserRealtimeChange(payload),
    onTransactionChange: () => {
      if (State.screen === 'balance' || State.screen === 'card') {
        refreshCurrentScreenSoft();
      }
    },
    onTaskChange: () => {
      if (State.screen === 'tasks') refreshCurrentScreenSoft();
    },
    onTaskTakerChange: () => {
      if (State.screen === 'tasks' || State.screen === 'admin') refreshCurrentScreenSoft();
    }
  });
}

function handleUserRealtimeChange(payload) {
  const updated = payload.new;
  if (!updated || !State.user) return;

  // Обновление касается текущего пользователя
  if (updated.username === State.user.username) {
    const balanceChanged = Number(updated.balance) !== Number(State.user.balance);
    const frozenChanged = updated.frozen !== State.user.frozen;

    State.user = { ...State.user, ...updated };
    updateSessionUser(updated);

    if (frozenChanged) {
      showToastForFreezeChange(updated.frozen);
    }

    if (State.screen === 'card' || State.screen === 'balance' || State.screen === 'profile') {
      refreshCurrentScreenSoft();
      if (balanceChanged) {
        requestAnimationFrame(() => {
          const el = qs('.balance-display__value') || qs('.js-balance-value');
          if (el) playNumberPop(el);
        });
      }
    }
  }

  // Если админ смотрит список граждан
  if (State.screen === 'admin' && State.adminTab === 'citizens') {
    refreshCurrentScreenSoft();
  }
}

function showToastForFreezeChange(frozen) {
  if (frozen) {
    showError('Ваш аккаунт заморожен администратором');
  } else {
    showSuccess('Ваш аккаунт разморожен');
  }
}

function refreshCurrentScreenSoft() {
  if (['card', 'balance', 'profile', 'tasks'].includes(State.screen)) {
    fillCitizenScreenContent(State.screen, false);
  } else if (State.screen === 'admin') refreshAdminContent(false);
}

/* ==================== ЛОГАУТ ==================== */

function logout() {
  removeAllChannels();
  clearSession();
  State.user = null;
  State.screen = 'login';
  renderLogin();
}

/* ==================== НИЖНЯЯ НАВИГАЦИЯ ==================== */

const NAV_ITEMS = [
  { key: 'card', icon: '💳' },
  { key: 'balance', icon: '🪙' },
  { key: 'profile', icon: '👤' },
  { key: 'tasks', icon: '📋' }
];

function renderBottomNav(active) {
  return `
    <nav class="bottom-nav">
      ${NAV_ITEMS.map(
        (item) => `
        <button class="nav-item ${item.key === active ? 'active' : ''}" data-nav="${item.key}">${item.icon}</button>
      `
      ).join('')}
    </nav>
  `;
}

function bindBottomNav() {
  qsa('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      playBtnPress(btn);
      renderCitizenScreen(btn.dataset.nav);
    });
  });
}

/* ==================== ОРКЕСТРАТОР ЭКРАНОВ ГРАЖДАНИНА ==================== */

async function renderCitizenScreen(screenName) {
  State.screen = screenName;

  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="screen" id="screen-content"></div>
    ${renderBottomNav(screenName)}
  `;
  bindBottomNav();

  await fillCitizenScreenContent(screenName, true);
}

/**
 * Обновляет только содержимое текущего экрана гражданина, не пересобирая
 * фон/навигацию заново. showSpinner=false — используется для realtime-обновлений
 * и после успешных действий, чтобы избежать "мигания" пустым экраном.
 */
async function fillCitizenScreenContent(screenName, showSpinner) {
  const content = qs('#screen-content');
  if (!content) return;

  if (showSpinner) {
    content.innerHTML = `<div class="text-center mt-24 text-muted">Загрузка...</div>`;
  }

  try {
    if (screenName === 'card') await fillCardScreen(content);
    else if (screenName === 'balance') await fillBalanceScreen(content);
    else if (screenName === 'profile') await fillProfileScreen(content);
    else if (screenName === 'tasks') await fillTasksScreen(content);
  } catch (e) {
    content.innerHTML = `<div class="text-center mt-24 text-danger">Ошибка загрузки данных</div>`;
    showError(e.message || 'Ошибка загрузки данных');
  }
}

/* ==================== ЭКРАН КАРТЫ ==================== */

async function fillCardScreen(content) {
  const user = State.user;
  const transactions = await getUserTransactions(user.username, 5);

  content.innerHTML = `
    <h2 class="anim-fade-in-down">Моя карта</h2>
    <div class="section mt-16">
      <div class="bank-card ${user.frozen ? 'bank-card--frozen anim-frozen-pulse' : ''} anim-fade-in-up">
        <div class="card-aurora"></div>
        <div class="bank-card__top">
          <img src="assets/logo.svg" alt="F-BANK" class="bank-card__logo" />
          <span class="online-indicator rt-pulse" title="Онлайн"></span>
        </div>
        <div class="bank-card__number">${escapeHtml(user.card_number || '—')}</div>
        <div class="bank-card__bottom">
          <div>
            <div class="bank-card__holder">${escapeHtml(user.username)}</div>
            <div class="bank-card__country">FORKLANDIA</div>
          </div>
          <div class="text-accent" style="font-weight:800;">DUM</div>
        </div>
      </div>
      ${user.frozen ? `<div class="frozen-banner anim-fade-in-up">Аккаунт заморожен ❄️</div>` : ''}
    </div>

    <div class="section">
      <div class="section-title">Последние операции</div>
      ${
        transactions.length === 0
          ? `<p class="text-muted">Пока нет операций</p>`
          : transactions.map(renderTxRow).join('')
      }
    </div>
  `;
}

function renderTxRow(tx) {
  const positive = Number(tx.amount) >= 0;
  return `
    <div class="list-card glass anim-fade-in-up">
      <div>
        <div class="tx-row__desc">${escapeHtml(tx.description)}</div>
        <div class="tx-row__date">${formatDateTime(tx.date || tx.created_at)}</div>
      </div>
      <div class="tx-row__amount ${positive ? 'tx-row__amount--positive' : 'tx-row__amount--negative'}">
        ${positive ? '+' : ''}${formatAmount(tx.amount)}
      </div>
    </div>
  `;
}

/* ==================== ЭКРАН БАЛАНСА / ПЕРЕВОДОВ ==================== */

async function fillBalanceScreen(content) {
  const user = State.user;
  const [recipients, transactions] = await Promise.all([
    getAvailableRecipients(user.username),
    getUserTransactions(user.username, 100)
  ]);

  content.innerHTML = `
    <h2 class="anim-fade-in-down">Баланс</h2>

    <div class="balance-display anim-fade-in-up">
      <span class="balance-display__value js-balance-value">${formatAmount(user.balance)}</span>
    </div>

    ${
      user.frozen
        ? `<div class="frozen-banner mt-8">Аккаунт заморожен ❄️ — переводы недоступны</div>`
        : `
    <div class="section glass" style="padding:16px;">
      <div class="section-title">Перевод гражданину</div>
      <form id="transfer-form">
        <div class="field">
          <label for="tf-recipient">Получатель</label>
          <select id="tf-recipient" required>
            <option value="" disabled selected>Выберите получателя</option>
            ${recipients.map((r) => `<option value="${escapeHtml(r.username)}">${escapeHtml(r.username)} · ${escapeHtml(r.city || '')}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="tf-amount">Сумма (DUM)</label>
          <input id="tf-amount" type="number" min="1" step="1" required />
        </div>
        <button type="submit" class="btn btn--primary" id="tf-submit">Перевести</button>
      </form>
    </div>
    `
    }

    <div class="section mt-24">
      <div class="section-title">История операций</div>
      ${
        transactions.length === 0
          ? `<p class="text-muted">Пока нет операций</p>`
          : transactions.map(renderTxRow).join('')
      }
    </div>
  `;

  const form = qs('#transfer-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = qs('#tf-submit');
      const recipient = qs('#tf-recipient').value;
      const amount = Number(qs('#tf-amount').value);

      submitBtn.disabled = true;
      try {
        const result = await performTransfer(user.username, recipient, amount);
        State.user = { ...State.user, balance: result.senderNewBalance };
        updateSessionUser({ balance: result.senderNewBalance });
        await showFullscreenTransferAnimation({ amount, recipient });
        showSuccess('Перевод выполнен успешно');
        fillCitizenScreenContent('balance', false);
      } catch (err) {
        showError(err.message || 'Не удалось выполнить перевод');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
}

/* ==================== ЭКРАН ПРОФИЛЯ ==================== */

async function fillProfileScreen(content) {
  const user = State.user;

  content.innerHTML = `
    <div class="profile-header anim-fade-in-up">
      <div class="avatar">${getInitial(user.username)}</div>
      <h2>${escapeHtml(user.username)}</h2>
      <div class="text-muted">${escapeHtml(user.user_id || '—')}</div>
      <div class="badge">ГРАЖДАНИН ФОРКЛЯНДИИ</div>
    </div>

    <div class="section">
      <div class="info-card glass">
        <div class="info-card__label">Номер карты</div>
        <div class="info-card__value">${escapeHtml(user.card_number || '—')}</div>
      </div>
      <div class="info-card glass">
        <div class="info-card__label">Баланс</div>
        <div class="info-card__value text-accent">${formatAmount(user.balance)}</div>
      </div>
      <div class="info-card glass">
        <div class="info-card__label">Дата регистрации</div>
        <div class="info-card__value">${formatDate(user.joined)}</div>
      </div>
      <div class="info-card glass">
        <div class="info-card__label">Город</div>
        <div class="info-card__value">${escapeHtml(user.city || '—')}</div>
      </div>
    </div>

    <div class="section">
      <button class="btn btn--ghost mt-8" id="profile-tasks-btn">📋 Задания</button>
      <button class="btn btn--ghost mt-8" id="profile-promo-btn">🎟 Ввести промокод</button>
      <button class="btn btn--danger mt-8" id="profile-logout-btn">Выйти</button>
    </div>
  `;

  qs('#profile-tasks-btn').addEventListener('click', () => renderCitizenScreen('tasks'));
  qs('#profile-promo-btn').addEventListener('click', () => openPromoSheet());
  qs('#profile-logout-btn').addEventListener('click', () => logout());
}

/* ==================== ЭКРАН ЗАДАНИЙ ==================== */

const STATUS_LABELS = {
  available: '<button class="status-pill status-pill--available" data-take-task>Взяться</button>',
  in_progress: '<span class="status-pill status-pill--progress">⏳ В процессе</span>',
  done: '<span class="status-pill status-pill--done">✅ Выполнено</span>',
  full: '<span class="status-pill status-pill--full">🔒 Мест нет</span>'
};

async function fillTasksScreen(content) {
  const user = State.user;
  const tasks = await getTasksWithStatusForUser(user.username);

  content.innerHTML = `
    <h2 class="anim-fade-in-down">Задания</h2>
    <div class="section mt-16">
      ${
        tasks.length === 0
          ? `<p class="text-muted">Активных заданий пока нет</p>`
          : tasks.map((task) => renderTaskCard(task)).join('')
      }
    </div>
  `;

  qsa('[data-take-task]').forEach((btn, idx) => {
    const availableTasks = tasks.filter((t) => t.status === 'available');
    const task = availableTasks[idx];
    if (!task) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await takeTask(task.id, user.username);
        showSuccess('Вы взялись за задание');
        fillCitizenScreenContent('tasks', false);
      } catch (err) {
        showError(err.message || 'Не удалось взять задание');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderTaskCard(task) {
  const maxLabel = task.max_takers > 0 ? `${task.participantsCount}/${task.max_takers}` : `${task.participantsCount}`;
  return `
    <div class="task-card glass anim-fade-in-up">
      <div class="task-card__title">${escapeHtml(task.title)}</div>
      <div class="task-card__desc">${escapeHtml(task.description || '')}</div>
      <div class="task-card__footer">
        <div>
          <div class="task-card__reward">${formatAmount(task.reward)}</div>
          <div class="task-card__participants">Участников: ${maxLabel}</div>
        </div>
        ${STATUS_LABELS[task.status]}
      </div>
    </div>
  `;
}

/* ==================== ПРОМОКОД (BOTTOM SHEET) ==================== */

function openPromoSheet() {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.id = 'promo-overlay';
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <h3 class="text-center mb-8">Ввести промокод</h3>
      <form id="promo-form" class="mt-16">
        <div class="field">
          <input id="promo-input" type="text" placeholder="ПРОМОКОД" style="text-transform:uppercase;text-align:center;letter-spacing:0.1em;font-weight:700;" required />
        </div>
        <button type="submit" class="btn btn--primary" id="promo-submit">Активировать</button>
        <button type="button" class="btn btn--ghost mt-8" id="promo-cancel">Отмена</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('sheet-overlay--visible'));

  const input = qs('#promo-input', overlay);
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase();
  });

  qs('#promo-cancel', overlay).addEventListener('click', () => closePromoSheet(overlay));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePromoSheet(overlay);
  });

  qs('#promo-form', overlay).addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#promo-submit', overlay);
    submitBtn.disabled = true;
    try {
      const result = await redeemPromoCode(State.user.username, input.value);
      State.user = { ...State.user, balance: result.newBalance };
      updateSessionUser({ balance: result.newBalance });
      closePromoSheet(overlay);
      showFullscreenPromoAnimation({ amount: result.amount }, () => {
        if (State.screen === 'balance' || State.screen === 'card' || State.screen === 'profile') {
          fillCitizenScreenContent(State.screen, false);
        }
      });
    } catch (err) {
      showError(err.message || 'Не удалось активировать промокод');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function closePromoSheet(overlay) {
  overlay.classList.remove('sheet-overlay--visible');
  setTimeout(() => overlay.remove(), 300);
}

/* ==================== АДМИН-ПАНЕЛЬ ==================== */

const ADMIN_TABS = [
  { key: 'create', label: 'Создать гражданина' },
  { key: 'balance', label: 'Баланс' },
  { key: 'tasks', label: 'Задания' },
  { key: 'promocodes', label: 'Промокоды' },
  { key: 'citizens', label: 'Граждане' }
];

async function renderAdmin() {
  State.screen = 'admin';

  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="screen screen--no-nav">
      <div class="flex-between mt-8">
        <h2>Админ-панель</h2>
        <button class="btn btn--danger btn--small" id="admin-logout-btn">Выйти</button>
      </div>
      <div class="admin-tabs mt-16" id="admin-tabs"></div>
      <div id="admin-content"></div>
    </div>
  `;

  qs('#admin-logout-btn').addEventListener('click', () => logout());

  const tabsEl = qs('#admin-tabs');
  tabsEl.innerHTML = ADMIN_TABS.map(
    (t) => `<button class="admin-tab ${t.key === State.adminTab ? 'active' : ''}" data-admin-tab="${t.key}">${t.label}</button>`
  ).join('');

  qsa('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.adminTab === State.adminTab) return;
      playBtnPress(btn);
      State.adminTab = btn.dataset.adminTab;
      renderAdmin();
    });
  });

  await refreshAdminContent(true);
}

/**
 * Обновляет только содержимое активной вкладки, не трогая шапку и вкладки.
 * showSpinner=false — старое содержимое остаётся видимым, пока грузятся новые данные
 * (без белого/пустого "мигания" после каждого действия — заморозить, удалить и т.д.)
 */
async function refreshAdminContent(showSpinner = false) {
  const content = qs('#admin-content');
  if (!content) return;

  if (showSpinner) {
    content.innerHTML = `<div class="text-center mt-24 text-muted">Загрузка...</div>`;
  }

  try {
    if (State.adminTab === 'create') await fillAdminCreate(content);
    else if (State.adminTab === 'balance') await fillAdminBalance(content);
    else if (State.adminTab === 'tasks') await fillAdminTasks(content);
    else if (State.adminTab === 'promocodes') await fillAdminPromocodes(content);
    else if (State.adminTab === 'citizens') await fillAdminCitizens(content);
  } catch (e) {
    content.innerHTML = `<div class="text-center mt-24 text-danger">Ошибка загрузки данных</div>`;
    showError(e.message || 'Ошибка загрузки данных');
  }
}

/* ---------- Создать гражданина ---------- */

async function fillAdminCreate(content) {
  content.innerHTML = `
    <div class="section glass anim-fade-in-up" style="padding:16px;">
      <form id="create-citizen-form">
        <div class="field">
          <label for="cc-username">Логин</label>
          <input id="cc-username" type="text" required />
        </div>
        <div class="field">
          <label for="cc-password">Пароль</label>
          <input id="cc-password" type="text" required />
        </div>
        <div class="field">
          <label for="cc-balance">Начальный баланс (DUM)</label>
          <input id="cc-balance" type="number" min="0" step="1" value="0" />
        </div>
        <div class="field">
          <label for="cc-city">Город</label>
          <input id="cc-city" type="text" />
        </div>
        <button type="submit" class="btn btn--primary" id="cc-submit">Создать гражданина</button>
      </form>
    </div>
  `;

  qs('#create-citizen-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#cc-submit');
    submitBtn.disabled = true;
    try {
      const newUser = await Admin.createCitizen({
        username: qs('#cc-username').value.trim(),
        password: qs('#cc-password').value,
        balance: qs('#cc-balance').value,
        city: qs('#cc-city').value.trim()
      });
      showSuccess(`Гражданин ${newUser.username} создан`);
      qs('#create-citizen-form').reset();
    } catch (err) {
      showError(err.message || 'Не удалось создать гражданина');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Корректировка баланса ---------- */

async function fillAdminBalance(content) {
  const citizens = await Admin.listCitizens();

  content.innerHTML = `
    <div class="section glass anim-fade-in-up" style="padding:16px;">
      <form id="balance-form">
        <div class="field">
          <label for="bal-citizen">Гражданин</label>
          <select id="bal-citizen" required>
            <option value="" disabled selected>Выберите гражданина</option>
            ${citizens.map((c) => `<option value="${escapeHtml(c.username)}">${escapeHtml(c.username)} (${formatAmount(c.balance)})</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="bal-amount">Сумма (+ пополнение / − списание)</label>
          <input id="bal-amount" type="number" step="1" required />
        </div>
        <div class="field">
          <label for="bal-desc">Описание</label>
          <input id="bal-desc" type="text" placeholder="Например: бонус" />
        </div>
        <button type="submit" class="btn btn--primary" id="bal-submit">Применить</button>
      </form>
    </div>
  `;

  qs('#balance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#bal-submit');
    submitBtn.disabled = true;
    try {
      const newBalance = await Admin.adjustBalance(
        qs('#bal-citizen').value,
        qs('#bal-amount').value,
        qs('#bal-desc').value.trim()
      );
      showSuccess(`Новый баланс: ${formatAmount(newBalance)}`);
      qs('#balance-form').reset();
    } catch (err) {
      showError(err.message || 'Не удалось изменить баланс');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Задания ---------- */

async function fillAdminTasks(content) {
  const tasks = await Admin.listTasksWithTakers();

  content.innerHTML = `
    <div class="section glass anim-fade-in-up" style="padding:16px;">
      <div class="section-title">Новое задание</div>
      <form id="task-form">
        <div class="field">
          <label for="tk-title">Название</label>
          <input id="tk-title" type="text" required />
        </div>
        <div class="field">
          <label for="tk-desc">Описание</label>
          <input id="tk-desc" type="text" />
        </div>
        <div class="field">
          <label for="tk-reward">Награда (DUM)</label>
          <input id="tk-reward" type="number" min="0" step="1" required />
        </div>
        <div class="field">
          <label for="tk-max">Максимум участников (0 = без ограничений)</label>
          <input id="tk-max" type="number" min="0" step="1" value="0" />
        </div>
        <button type="submit" class="btn btn--primary" id="tk-submit">Создать задание</button>
      </form>
    </div>

    <div class="section mt-24">
      <div class="section-title">Все задания</div>
      ${tasks.length === 0 ? `<p class="text-muted">Заданий пока нет</p>` : tasks.map(renderAdminTaskCard).join('')}
    </div>
  `;

  qs('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#tk-submit');
    submitBtn.disabled = true;
    try {
      await Admin.createTask({
        title: qs('#tk-title').value.trim(),
        description: qs('#tk-desc').value.trim(),
        reward: qs('#tk-reward').value,
        max_takers: qs('#tk-max').value
      });
      showSuccess('Задание создано');
      refreshAdminContent();
    } catch (err) {
      showError(err.message || 'Не удалось создать задание');
    } finally {
      submitBtn.disabled = false;
    }
  });

  qsa('[data-complete-taker]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await completeTaskForTaker(btn.dataset.completeTaker);
        showSuccess('Задание отмечено выполненным, награда начислена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message || 'Не удалось завершить задание');
      } finally {
        btn.disabled = false;
      }
    });
  });

  qsa('[data-delete-task]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить задание безвозвратно? Все записи об участниках тоже будут удалены.')) return;
      btn.disabled = true;
      try {
        await Admin.deleteTask(btn.dataset.deleteTask);
        showSuccess('Задание удалено');
        refreshAdminContent();
      } catch (err) {
        showError(err.message || 'Не удалось удалить задание');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderAdminTaskCard(task) {
  const maxLabel = task.max_takers > 0 ? `${task.takers.length}/${task.max_takers}` : `${task.takers.length}`;
  return `
    <div class="task-card glass anim-fade-in-up">
      <div class="task-card__title">${escapeHtml(task.title)}</div>
      <div class="task-card__desc">${escapeHtml(task.description || '')}</div>
      <div class="task-card__footer">
        <div class="task-card__reward">${formatAmount(task.reward)}</div>
        <div class="task-card__participants">Участников: ${maxLabel}</div>
      </div>
      <button class="btn btn--small btn--danger mt-8" data-delete-task="${task.id}">Удалить задание</button>
      ${
        task.takers.length === 0
          ? `<p class="text-muted mt-8">Пока никто не взялся</p>`
          : `<div class="mt-8">${task.takers
              .map(
                (t) => `
            <div class="admin-row">
              <span>${escapeHtml(t.username)}</span>
              ${
                t.status === 'done'
                  ? `<span class="status-pill status-pill--done">✅ Выполнено</span>`
                  : `<button class="btn btn--small btn--primary" data-complete-taker="${t.id}">✓</button>`
              }
            </div>
          `
              )
              .join('')}</div>`
      }
    </div>
  `;
}

/* ---------- Промокоды ---------- */

async function fillAdminPromocodes(content) {
  const promos = await Admin.listPromoCodes();

  content.innerHTML = `
    <div class="section glass anim-fade-in-up" style="padding:16px;">
      <div class="section-title">Новый промокод</div>
      <form id="promo-create-form">
        <div class="field">
          <label for="pc-code">Название промокода (необязательно)</label>
          <input id="pc-code" type="text" placeholder="Например: NEWYEAR2026 — иначе сгенерируется автоматически" style="text-transform:uppercase;" />
        </div>
        <div class="field">
          <label for="pc-amount">Сумма (DUM)</label>
          <input id="pc-amount" type="number" min="1" step="1" required />
        </div>
        <div class="field">
          <label for="pc-max">Максимум активаций (0 = без ограничений)</label>
          <input id="pc-max" type="number" min="0" step="1" value="0" />
        </div>
        <button type="submit" class="btn btn--primary" id="pc-submit">Создать промокод</button>
      </form>
    </div>

    <div class="section mt-24">
      <div class="section-title">Промокоды</div>
      ${promos.length === 0 ? `<p class="text-muted">Промокодов пока нет</p>` : promos.map(renderAdminPromoRow).join('')}
    </div>
  `;

  const codeInput = qs('#pc-code');
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase();
  });

  qs('#promo-create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#pc-submit');
    submitBtn.disabled = true;
    try {
      const promo = await Admin.createPromoCode({
        amount: qs('#pc-amount').value,
        max_uses: qs('#pc-max').value,
        customCode: codeInput.value.trim()
      });
      showSuccess(`Промокод ${promo.code} создан`);
      refreshAdminContent();
    } catch (err) {
      showError(err.message || 'Не удалось создать промокод');
    } finally {
      submitBtn.disabled = false;
    }
  });

  qsa('[data-toggle-promo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.setPromoCodeActive(btn.dataset.togglePromo, btn.dataset.nextState === 'true');
        refreshAdminContent();
      } catch (err) {
        showError(err.message || 'Не удалось изменить промокод');
      } finally {
        btn.disabled = false;
      }
    });
  });

  qsa('[data-delete-promo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить промокод безвозвратно?')) return;
      btn.disabled = true;
      try {
        await Admin.deletePromoCode(btn.dataset.deletePromo);
        showSuccess('Промокод удалён');
        refreshAdminContent();
      } catch (err) {
        showError(err.message || 'Не удалось удалить промокод');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderAdminPromoRow(promo) {
  const maxLabel = promo.max_uses > 0 ? `${promo.used_count}/${promo.max_uses}` : `${promo.used_count}`;
  return `
    <div class="admin-row glass anim-fade-in-up">
      <div>
        <div style="font-weight:700;letter-spacing:0.05em;">${escapeHtml(promo.code)}</div>
        <div class="text-muted" style="font-size:12px;">${formatAmount(promo.amount)} · использований: ${maxLabel}</div>
      </div>
      <div class="admin-row__actions">
        <span class="chip ${promo.active ? 'chip--active' : ''}">${promo.active ? 'Активен' : 'Выключен'}</span>
        <button class="btn btn--small btn--ghost" data-toggle-promo="${promo.id}" data-next-state="${!promo.active}">${promo.active ? 'Выключить' : 'Включить'}</button>
        <button class="btn btn--small btn--danger" data-delete-promo="${promo.id}">Удалить</button>
      </div>
    </div>
  `;
}

/* ---------- Граждане ---------- */

async function fillAdminCitizens(content) {
  const citizens = await Admin.listCitizens();

  content.innerHTML = `
    <div class="section mt-8">
      ${citizens.length === 0 ? `<p class="text-muted">Граждан пока нет</p>` : citizens.map(renderAdminCitizenRow).join('')}
    </div>
  `;

  qsa('[data-freeze]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.freezeCitizen(btn.dataset.freeze);
        showSuccess('Аккаунт заморожен');
        refreshAdminContent();
      } catch (err) {
        showError(err.message || 'Не удалось заморозить аккаунт');
      } finally {
        btn.disabled = false;
      }
    });
  });

  qsa('[data-unfreeze]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.unfreezeCitizen(btn.dataset.unfreeze);
        showSuccess('Аккаунт разморожен');
        refreshAdminContent();
      } catch (err) {
        showError(err.message || 'Не удалось разморозить аккаунт');
      } finally {
        btn.disabled = false;
      }
    });
  });

  qsa('[data-delete-citizen]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Удалить гражданина ${btn.dataset.deleteCitizen} безвозвратно? Будут удалены все его транзакции и данные.`)) return;
      btn.disabled = true;
      try {
        await Admin.deleteCitizenCascade(btn.dataset.deleteCitizen);
        showSuccess('Гражданин удалён');
        refreshAdminContent();
      } catch (err) {
        showError(err.message || 'Не удалось удалить гражданина');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderAdminCitizenRow(citizen) {
  return `
    <div class="admin-row glass anim-fade-in-up">
      <div>
        <div style="font-weight:700;">${escapeHtml(citizen.username)} ${citizen.frozen ? '<span class="chip chip--frozen">❄️ заморожен</span>' : ''}</div>
        <div class="text-muted" style="font-size:12px;">${formatAmount(citizen.balance)} · ${escapeHtml(citizen.city || '—')}</div>
      </div>
      <div class="admin-row__actions">
        ${
          citizen.frozen
            ? `<button class="btn btn--small btn--ghost" data-unfreeze="${citizen.username}">🔥</button>`
            : `<button class="btn btn--small btn--ghost" data-freeze="${citizen.username}">❄️</button>`
        }
        <button class="btn btn--small btn--danger" data-delete-citizen="${citizen.username}">Удалить</button>
      </div>
    </div>
  `;
}

/* ==================== СТАРТ ==================== */

document.addEventListener('DOMContentLoaded', bootstrap);

// Экспортируем на случай необходимости ручного вызова из консоли/отладки
window.__fbankLogout = logout;
