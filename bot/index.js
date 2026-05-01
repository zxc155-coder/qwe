import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import {
  upsertUser, setAgeVerified, getUser,
  listProducts, listAllProducts, getProduct,
  addToCart, setCartQty, removeFromCart, clearCart, getCart,
  addFavorite, removeFavorite, isFavorite, listFavorites,
  insertOrder, insertOrderItem, listOrdersByUser,
  getOrder, getOrderItems, listOrdersByStatus, setOrderStatus,
  statsTotalRevenue, statsByStatus,
  countProducts,
  setReferrerIfNull, getReferrer, countReferrals, listReferrals,
  getBonusInfo, addBonus, spendBonus, insertBonusLog,
  refCreditExistsForOrder,
  setOrderReceipt,
  listReviewsForProduct, reviewSummaryForProduct,
  insertCustomerLog,
  getAdminSetting, setAdminSetting,
  listAllUsers,
} from '../db/database.js';

const REFERRAL_PERCENT = 30; // referrer earns this % of friend's order
import { startApi } from '../api/server.js';

dotenv.config();

const BOT_TOKEN  = process.env.BOT_TOKEN || process.env.VIBE_CLOUD_BOT_TOKEN;
const ADMIN_ID   = Number(process.env.ADMIN_ID || 8417505079);
const WEB_APP_URL = process.env.WEB_APP_URL || '';
const SUPPORT_USERNAME = (process.env.SUPPORT_USERNAME || '@VibeCloudSupport').replace(/^@?/, '@');
const CARD_NUMBER  = process.env.CARD_NUMBER  || 'XXXX XXXX XXXX XXXX';
const CARD_HOLDER  = process.env.CARD_HOLDER  || 'IVAN IVANOV';

// СБП-only flow: единственный платёжный «канал» — СБП по номеру телефона
const BANKS = [
  { key: 'sbp',    label: 'СБП · Альфа-Банк' },
  { key: 'sber',   label: 'Сбербанк' },
  { key: 'tbank',  label: 'Т-Банк (Тинькофф)' },
  { key: 'alfa',   label: 'Альфа-Банк' },
  { key: 'vtb',    label: 'ВТБ' },
  { key: 'raif',   label: 'Райффайзен' },
  { key: 'ozon',   label: 'Озон Банк' },
  { key: 'other',  label: 'Другой / СБП' },
];
const BANK_LABEL = Object.fromEntries(BANKS.map((b) => [b.key, b.label]));

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан. Заполните .env (см. .env.example).');
  process.exit(1);
}

if (countProducts.get().c === 0) {
  console.error('⚠️  В БД нет товаров. Запустите `npm run seed` перед стартом бота.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

/* ───────────────────── Тексты и стили VIBE CLOUD ───────────────────── */

const BRAND = 'VIBE CLOUD';

const CATEGORY_LABELS = {
  disposable: 'Одноразки',
  liquid:     'Жидкости',
  pod:        'POD-системы',
  accessory:  'Аксессуары',
  snus:       'Снюс',
};

const VAPE_CATEGORIES = ['disposable', 'liquid', 'pod', 'accessory'];
const CATEGORY_ORDER  = [...VAPE_CATEGORIES, 'snus'];

const STATUS_LABELS = {
  new:       'Новый',
  confirmed: 'Подтверждён',
  shipped:   'В пути',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};

const fmtPrice = (n) => `${Number(n).toLocaleString('ru-RU')}₽`;
const isAdmin  = (ctx) => ctx.from && ctx.from.id === ADMIN_ID;

/* ───────────────────── In-memory state ───────────────────── */

const sessions = new Map(); // tg_id -> { mode, data }

const setMode = (tgId, mode, data = {}) =>
  sessions.set(tgId, { mode, data });
const getMode = (tgId) => sessions.get(tgId);
const clearMode = (tgId) => sessions.delete(tgId);

/* ───────────────────── 🫧  Меню ───────────────────── */

function mainMenuKeyboard(ctx) {
  const rows = [
    ['Каталог',          'Корзина'],
    ['Оформить заказ',   'История'],
    ['Профиль',          'Рефералка'],
    ['Избранное',        'Помощь'],
  ];
  if (WEB_APP_URL) rows.push([Markup.button.webApp('Открыть Web App', WEB_APP_URL)]);
  if (isAdmin(ctx)) rows.push(['Админ-панель']);
  return Markup.keyboard(rows).resize();
}

/* ───────────────────── Action logger ───────────────────── */

const LOG_TYPES = [
  { key: 'visit',            label: 'Заход / /start' },
  { key: 'browse',           label: 'Открытие каталога / категории' },
  { key: 'product_view',     label: 'Открытие карточки товара' },
  { key: 'cart_change',      label: 'Изменения корзины' },
  { key: 'profile_open',     label: 'Открытие профиля' },
  { key: 'referral_signup',  label: 'Новый реферал' },
  { key: 'order_placed',     label: 'Оформление заказа' },
  { key: 'receipt_uploaded', label: 'Загрузка чека' },
  { key: 'user_message',     label: 'Сообщение клиента' },
];
const LOG_TYPE_KEYS = LOG_TYPES.map((l) => l.key);
const DEFAULT_LOG_ON = new Set(['order_placed', 'receipt_uploaded', 'referral_signup']);

function isLogEnabled(key) {
  const row = getAdminSetting.get(`log_${key}`);
  if (!row) return DEFAULT_LOG_ON.has(key);
  return row.value === '1';
}
function setLogEnabled(key, on) {
  setAdminSetting.run(`log_${key}`, on ? '1' : '0');
}

async function logAction(ctx, action, payload) {
  if (!ctx.from) return;
  if (ctx.from.id === ADMIN_ID) return;
  insertCustomerLog.run(ctx.from.id, action, payload ? String(payload) : null);
  if (!isLogEnabled(action)) return;

  const u = getUser.get(ctx.from.id);
  const idLabel = u?.display_id ? `Бот ID #${u.display_id}` : `tg:${ctx.from.id}`;
  const nameLabel = ctx.from.first_name ? ` (${ctx.from.first_name})` : '';
  const lines = [
    `*${LOG_TYPES.find((l) => l.key === action)?.label || action}*`,
    `${idLabel}${nameLabel}`,
  ];
  if (payload) lines.push(payload);
  try {
    await bot.telegram.sendMessage(ADMIN_ID, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch {}
}

function ageGateKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Мне есть 18', 'age:yes')],
    [Markup.button.callback('Мне меньше 18', 'age:no')],
  ]);
}

function topCatalogKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Вейпы',  'top:vapes')],
    [Markup.button.callback('Снюс',   'top:snus')],
    [Markup.button.callback('← В меню', 'menu')],
  ]);
}

function vapeCategoriesKeyboard() {
  const rows = VAPE_CATEGORIES.map((c) => [
    Markup.button.callback(CATEGORY_LABELS[c], `cat:${c}:0`),
  ]);
  rows.push([Markup.button.callback('← Назад', 'catalog')]);
  return Markup.inlineKeyboard(rows);
}

function categoriesKeyboard() {
  // legacy alias — used by some buttons that say "⬅️ Категории"
  return topCatalogKeyboard();
}

const PAGE_SIZE = 5;

function categoryListKeyboard(category, page, total) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const nav = [];
  if (page > 0)
    nav.push(Markup.button.callback('←', `cat:${category}:${page - 1}`));
  nav.push(Markup.button.callback(`${page + 1}/${pages}`, 'noop'));
  if (page < pages - 1)
    nav.push(Markup.button.callback('→', `cat:${category}:${page + 1}`));
  // for snus, "back" goes straight to top-level; otherwise back to vape categories
  const backTarget = category === 'snus' ? 'catalog' : 'top:vapes';
  const backLabel  = category === 'snus' ? '← В каталог'  : '← К вейпам';
  return Markup.inlineKeyboard([
    nav,
    [Markup.button.callback(backLabel, backTarget)],
  ]);
}

function productActionsKeyboard(productId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Подробнее', `prod:${productId}`),
      Markup.button.callback('В корзину', `add:${productId}`),
    ],
  ]);
}

function productDetailKeyboard(productId, fav) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Добавить в корзину', `add:${productId}`)],
    [
      Markup.button.callback(
        fav ? 'Убрать из избранного' : 'В избранное',
        `fav:${productId}`,
      ),
    ],
    [Markup.button.callback('← Назад', 'catalog')],
  ]);
}

function cartKeyboard(items) {
  if (items.length === 0) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('В каталог', 'catalog')],
    ]);
  }
  const rows = items.map((it) => [
    Markup.button.callback('−', `qty:${it.product_id}:dec`),
    Markup.button.callback(`${it.name} × ${it.qty}`, 'noop'),
    Markup.button.callback('+', `qty:${it.product_id}:inc`),
  ]);
  rows.push([
    Markup.button.callback('Очистить', 'cart:clear'),
    Markup.button.callback('Оформить', 'cart:checkout'),
  ]);
  return Markup.inlineKeyboard(rows);
}

/* ───────────────────── 🫧  Рендер ───────────────────── */

function starsLine(rating, max = 5) {
  const r = Math.round(Math.max(1, Math.min(max, rating)));
  return '★'.repeat(r) + '☆'.repeat(max - r);
}

function renderProductLine(p, idx) {
  const oldPrice = p.old_price ? ` · ~~${fmtPrice(p.old_price)}~~` : '';
  return [
    `[${idx}] *${escapeMd(p.brand)} ${escapeMd(p.name)}*`,
    `${fmtPrice(p.price)}${oldPrice} · ${starsLine(p.rating)} ${p.rating}`,
    p.strength ? `Крепость: ${escapeMd(p.strength)}` : null,
    p.flavor   ? `Вкус: ${escapeMd(p.flavor)}`       : null,
    p.volume   ? `Объём: ${escapeMd(p.volume)}`      : null,
  ].filter(Boolean).join('\n');
}

function renderProductCard(p) {
  return [
    `*VIBE CLOUD рекомендует:*`,
    ``,
    `*Название:* ${escapeMd(p.name)}`,
    `*Бренд:* ${escapeMd(p.brand)}`,
    `*Тип:* ${escapeMd(p.type)}`,
    p.puffs    ? `*Затяжек:* ${p.puffs}`                : null,
    p.strength ? `*Крепость:* ${escapeMd(p.strength)}`  : null,
    p.flavor   ? `*Вкус:* ${escapeMd(p.flavor)}`        : null,
    p.volume   ? `*Объём:* ${escapeMd(p.volume)}`       : null,
    p.battery  ? `*Батарея:* ${escapeMd(p.battery)}`    : null,
    `*В наличии:* ${p.in_stock ? 'да' : 'нет'}`,
    ``,
    `*Цена:* ${fmtPrice(p.price)}`,
    p.description ? `\n_${escapeMd(p.description)}_` : null,
  ].filter(Boolean).join('\n');
}

function renderReviewsBlock(productId) {
  const sum = reviewSummaryForProduct.get(productId);
  if (!sum || !sum.total) return null;
  const list = listReviewsForProduct.all(productId).slice(0, 4);
  const head = `*Отзывы* — ${starsLine(Math.round(sum.avg_rating))} ${(sum.avg_rating).toFixed(1)} (${sum.total})`;
  const body = list.map((r) => [
    `${starsLine(r.rating)}  · Бот ID #${r.customer_bot_id}`,
    `_Покупал: ${escapeMd(r.items_summary)}_`,
    escapeMd(r.body),
  ].join('\n')).join('\n\n');
  return `${head}\n\n${body}`;
}

function renderCart(items) {
  if (items.length === 0) {
    return '*Корзина VIBE CLOUD пуста.*\n\nЗагляни в каталог.';
  }
  const lines = items.map(
    (it, i) =>
      `${i + 1}. ${escapeMd(it.name)} × ${it.qty} = ${fmtPrice(it.price * it.qty)}`,
  );
  const total = items.reduce((s, it) => s + it.price * it.qty, 0);
  return [
    '*Корзина VIBE CLOUD:*',
    '',
    ...lines,
    '—————————————',
    `*Итого:* ${fmtPrice(total)}`,
  ].join('\n');
}

// Telegram MarkdownV1 — экранируем только * _ ` [ чтобы не ломать форматирование
function escapeMd(s) {
  return String(s ?? '').replace(/([_*`\[])/g, '\\$1');
}

/* ───────────────────── 🫧  /start + age gate ───────────────────── */

bot.start(async (ctx) => {
  const isNew = !getUser.get(ctx.from.id);
  const displayId = upsertUser.run({
    tg_id: ctx.from.id,
    username: ctx.from.username || null,
    first_name: ctx.from.first_name || null,
  });

  // referral payload: /start ref_<id>  or  /start ref<id>
  const payload = (ctx.startPayload || '').trim();
  const refMatch = /^ref_?(\d{4,15})$/.exec(payload);
  if (refMatch) {
    const refId = Number(refMatch[1]);
    if (refId !== ctx.from.id) {
      const res = setReferrerIfNull.run({ tg_id: ctx.from.id, ref: refId });
      if (res.changes > 0) {
        const refUser = getUser.get(refId);
        // notify referrer
        try {
          await bot.telegram.sendMessage(
            refId,
            `По твоей реферальной ссылке зашёл новый друг (Бот ID #${displayId}). Когда он оформит заказ — получишь ${REFERRAL_PERCENT}% от суммы на бонусный баланс.`,
          );
        } catch {}
        await logAction(ctx, 'referral_signup',
          `Пригласил: Бот ID #${refUser?.display_id ?? '—'} (tg ${refId})`);
      }
    }
  }

  await logAction(ctx, 'visit', isNew ? `Новый клиент. Бот ID #${displayId}` : `Возврат, Бот ID #${displayId}`);

  const u = getUser.get(ctx.from.id);
  const greeting = `*${BRAND}*\n\nПривет, *${escapeMd(ctx.from.first_name || 'друг')}*.\nТвой вейпшоп всегда с тобой.`;

  if (u && u.age_verified) {
    await ctx.replyWithMarkdown(greeting, mainMenuKeyboard(ctx));
    await ctx.replyWithMarkdown('*Главное меню VIBE CLOUD:*', mainMenuKeyboard(ctx));
    return;
  }

  await ctx.replyWithMarkdown(
    `${greeting}\n\n18+ — подтверди возраст, чтобы продолжить.`,
    ageGateKeyboard(),
  );
});

bot.action('age:yes', async (ctx) => {
  setAgeVerified.run(ctx.from.id);
  await ctx.answerCbQuery('Добро пожаловать');
  await ctx.editMessageText('Возраст подтверждён.');
  await ctx.replyWithMarkdown('*Главное меню VIBE CLOUD:*', mainMenuKeyboard(ctx));
});

bot.action('age:no', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'К сожалению, продажа никотинсодержащей продукции разрешена только лицам старше 18 лет.',
  );
});

/* ───────────────────── 🫧  Guard: проверка 18+ ───────────────────── */

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  // /start всегда пропускаем
  if (ctx.message?.text?.startsWith('/start')) return next();
  if (ctx.callbackQuery?.data?.startsWith('age:')) return next();

  const u = getUser.get(ctx.from.id);
  if (!u || !u.age_verified) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Сначала подтвердите 18+ через /start');
    else await ctx.reply('Пожалуйста, подтвердите возраст: /start');
    return;
  }
  return next();
});

/* ───────────────────── 🫧  Главное меню (text buttons) ───────────────────── */

bot.hears(['Каталог', '🛒 Каталог'], async (ctx) => {
  await ctx.replyWithMarkdown('*Разделы VIBE CLOUD:*\n\nВыбери, что интересует:', topCatalogKeyboard());
  await logAction(ctx, 'browse', 'Открыл каталог');
});

bot.hears(['Профиль', 'Мой профиль'], async (ctx) => sendProfileCard(ctx));
bot.command('profile', async (ctx) => sendProfileCard(ctx));

async function sendProfileCard(ctx) {
  const u   = getUser.get(ctx.from.id);
  const bal = getBonusInfo.get(ctx.from.id) || { bonus_balance: 0, bonus_earned: 0, bonus_spent: 0 };
  const orders = listOrdersByUser.all(ctx.from.id);
  const ordersCount = orders.length;
  const ordersSum = orders.filter((o) => o.status !== 'cancelled')
                          .reduce((s, o) => s + (o.total || 0), 0);

  const ordersList = orders.slice(0, 8).map((o) => {
    const date = (o.created_at || '').slice(5, 10).replace('-', '.');
    return `· #${o.display_id ?? o.id} · ${fmtPrice(o.total)} · ${STATUS_LABELS[o.status] || o.status} · ${date}`;
  });

  const text = [
    `*Профиль*`,
    '',
    `*Бот ID:* #${u?.display_id ?? '—'}`,
    `*Telegram ID:* \`${ctx.from.id}\``,
    '',
    `*Бонусный баланс:* ${fmtPrice(bal.bonus_balance)}`,
    `Всего заработано: ${fmtPrice(bal.bonus_earned)} · потрачено: ${fmtPrice(bal.bonus_spent)}`,
    '',
    `*Заказов:* ${ordersCount} · потратил: *${fmtPrice(ordersSum)}*`,
    ordersList.length ? '\n*Последние заказы:*\n' + ordersList.join('\n') : '\n_Заказов пока нет._',
  ].join('\n');

  // try to send with telegram avatar as photo
  try {
    const photos = await bot.telegram.getUserProfilePhotos(ctx.from.id, 0, 1);
    const fileId = photos?.photos?.[0]?.[photos.photos[0].length - 1]?.file_id;
    if (fileId) {
      await ctx.replyWithPhoto(fileId, { caption: text, parse_mode: 'Markdown' });
    } else {
      await ctx.replyWithMarkdown(text);
    }
  } catch {
    await ctx.replyWithMarkdown(text);
  }
  await logAction(ctx, 'profile_open');
}

bot.hears(['Корзина', '📦 Моя корзина'], async (ctx) => {
  const items = getCart.all(ctx.from.id);
  await ctx.replyWithMarkdown(renderCart(items), cartKeyboard(items));
});

bot.hears(['Оформить заказ', '✅ Оформить заказ'], async (ctx) => startCheckout(ctx));

bot.hears(['История', '📋 История заказов'], async (ctx) => {
  await sendOrderHistory(ctx);
});

bot.hears(['Избранное', '⭐ Избранное'], async (ctx) => {
  const favs = listFavorites.all(ctx.from.id);
  if (!favs.length) {
    await ctx.reply('Список избранного пуст. Открой карточку товара и нажми «В избранное».');
    return;
  }
  await ctx.replyWithMarkdown('*Избранное VIBE CLOUD:*');
  for (let i = 0; i < favs.length; i++) {
    const p = favs[i];
    await ctx.replyWithMarkdown(renderProductLine(p, i + 1), productActionsKeyboard(p.id));
  }
});

bot.hears(['Рефералка', 'Моя ссылка'], async (ctx) => sendReferralCard(ctx));
bot.command('referral', async (ctx) => sendReferralCard(ctx));

async function sendReferralCard(ctx) {
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=ref_${ctx.from.id}`;
  const cnt  = countReferrals.get(ctx.from.id)?.c || 0;
  const bal  = getBonusInfo.get(ctx.from.id) || { bonus_balance: 0, bonus_earned: 0, bonus_spent: 0 };

  const text = [
    `*Реферальная программа VIBE CLOUD*`,
    '',
    `Приглашай друзей — получай *${REFERRAL_PERCENT}%* от каждого их заказа на бонусный баланс.Бонусами можно оплачивать свои заказы — до совпадения с суммой заказа.`,
    '',
    `Твоя ссылка:`,
    '`' + link + '`',
    '',
    `Приглашено: *${cnt}*`,
    `Баланс: *${fmtPrice(bal.bonus_balance)}*`,
    `Всего заработано: ${fmtPrice(bal.bonus_earned)} · потрачено: ${fmtPrice(bal.bonus_spent)}`,
  ].join('\n');

  await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([
    [Markup.button.url('Поделиться ссылкой',
        `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('VIBE CLOUD — премиум вейпшоп в Telegram')}`)],
    [Markup.button.callback('Каталог', 'catalog')],
  ]));
}

bot.hears(['Помощь', '❓ Помощь'], async (ctx) => {
  await ctx.replyWithMarkdown(
    [
      `*${BRAND}*`,
      '',
      'Я твой телеграм-консьерж VIBE CLOUD. Доступные действия:',
      '',
      '*Каталог* — все товары: вейпы и снюс',
      '*Корзина* — список выбранного',
      '*Оформить заказ* — адрес, телефон, оплата, подтверждение',
      '*История* — статусы по твоим заказам',
      '*Избранное* — быстрый доступ к любимкам',
      `*Рефералка* — личная ссылка + ${REFERRAL_PERCENT}% от заказов друзей`,
      '*/shop* — открыть Web-App витрину',
      '*/referral* — открыть карточку рефералок',
      '',
      'Если нужен живой человек — пиши прямо в этот чат, админ ответит.',
    ].join('\n'),
  );
});

bot.hears(['Открыть Web App', '🌐 Открыть Web App'], async (ctx) => sendWebAppLink(ctx));
bot.command('shop', async (ctx) => sendWebAppLink(ctx));

async function sendWebAppLink(ctx) {
  if (!WEB_APP_URL) {
    await ctx.reply('Web App ещё не опубликован. Запустите ngrok и заполните WEB_APP_URL в .env.');
    return;
  }
  await ctx.reply(
    'Витрина VIBE CLOUD:',
    Markup.inlineKeyboard([
      [Markup.button.webApp('Открыть Web App', WEB_APP_URL)],
    ]),
  );
}

/* ───────────────────── 🫧  Каталог ───────────────────── */

bot.action('menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown('*Главное меню VIBE CLOUD:*', mainMenuKeyboard(ctx));
});

bot.action('catalog', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown('*Разделы VIBE CLOUD:*\n\nВыбери, что интересует:', topCatalogKeyboard());
});

bot.action('top:vapes', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown('*Вейпы — категории:*', vapeCategoriesKeyboard());
});

bot.action('top:snus', async (ctx) => {
  await ctx.answerCbQuery();
  // jump straight into snus listing, page 0
  return showCategoryPage(ctx, 'snus', 0);
});

async function showCategoryPage(ctx, category, page) {
  const all = listProducts.all(category);
  if (!all.length) {
    await ctx.reply('В этой категории пока пусто.');
    return;
  }
  const start = page * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);

  await ctx.replyWithMarkdown(`*${CATEGORY_LABELS[category]}* — стр. ${page + 1}`);

  for (let i = 0; i < slice.length; i++) {
    const p = slice[i];
    await ctx.replyWithMarkdown(
      renderProductLine(p, start + i + 1),
      productActionsKeyboard(p.id),
    );
  }

  await ctx.reply('Навигация:', categoryListKeyboard(category, page, all.length));
}

bot.action(/^cat:([a-z]+):(\d+)$/, async (ctx) => {
  const [, category, pageStr] = ctx.match;
  await ctx.answerCbQuery();
  return showCategoryPage(ctx, category, Number(pageStr));
});

bot.action(/^prod:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const p = getProduct.get(id);
  await ctx.answerCbQuery();
  if (!p) return ctx.reply('Товар не найден.');

  const fav = !!isFavorite.get(ctx.from.id, id);
  await ctx.replyWithMarkdown(renderProductCard(p), productDetailKeyboard(id, fav));
  const reviews = renderReviewsBlock(id);
  if (reviews) await ctx.replyWithMarkdown(reviews);
  await logAction(ctx, 'product_view', `${p.brand} ${p.name} (#${p.id})`);
});

bot.action(/^add:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const p = getProduct.get(id);
  if (!p) return ctx.answerCbQuery('Товар не найден');
  addToCart.run(ctx.from.id, id);
  await ctx.answerCbQuery(`${p.name} · в корзине`);
  await logAction(ctx, 'cart_change', `+ ${p.brand} ${p.name}`);
});

bot.action(/^fav:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  if (isFavorite.get(ctx.from.id, id)) {
    removeFavorite.run(ctx.from.id, id);
    await ctx.answerCbQuery('Убрано из избранного');
  } else {
    addFavorite.run(ctx.from.id, id);
    await ctx.answerCbQuery('Добавлено в избранное');
  }
});

/* ───────────────────── 🫧  Корзина ───────────────────── */

bot.action(/^qty:(\d+):(inc|dec)$/, async (ctx) => {
  const [, idStr, op] = ctx.match;
  const id = Number(idStr);
  const items = getCart.all(ctx.from.id);
  const it = items.find((x) => x.product_id === id);
  if (!it) return ctx.answerCbQuery('Нет в корзине');

  const newQty = op === 'inc' ? it.qty + 1 : it.qty - 1;
  if (newQty <= 0) removeFromCart.run(ctx.from.id, id);
  else setCartQty.run(newQty, ctx.from.id, id);

  await ctx.answerCbQuery();
  const fresh = getCart.all(ctx.from.id);
  try {
    await ctx.editMessageText(renderCart(fresh), {
      parse_mode: 'Markdown',
      ...cartKeyboard(fresh),
    });
  } catch {
    await ctx.replyWithMarkdown(renderCart(fresh), cartKeyboard(fresh));
  }
});

bot.action('cart:clear', async (ctx) => {
  clearCart.run(ctx.from.id);
  await ctx.answerCbQuery('Корзина очищена');
  try {
    await ctx.editMessageText('Корзина пуста.', cartKeyboard([]));
  } catch {
    await ctx.reply('Корзина пуста.');
  }
});

bot.action('cart:checkout', async (ctx) => {
  await ctx.answerCbQuery();
  await startCheckout(ctx);
});

/* ───────────────────── 🫧  Оформление заказа ───────────────────── */

async function startCheckout(ctx) {
  const items = getCart.all(ctx.from.id);
  if (!items.length) {
    await ctx.reply('Сначала добавь что-нибудь в корзину.');
    return;
  }
  setMode(ctx.from.id, 'checkout:address', { items, payment_method: 'card' });
  await ctx.reply('Адрес доставки: (город, улица, дом, квартира — одной строкой)');
}

// Validate "HH:MM" >= 12:00, <= 23:59
function parseDeliveryTime(input) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(input.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h < 12) return null;
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

async function askBonusSpending(ctx) {
  const s = getMode(ctx.from.id);
  if (!s) return;
  const subtotal = s.data.items.reduce((sum, it) => sum + it.price * it.qty, 0);
  s.data.subtotal = subtotal;
  const bonus = (getBonusInfo.get(ctx.from.id) || {}).bonus_balance || 0;
  const usable = Math.min(bonus, subtotal);
  if (usable > 0 && !s.data.bonus_decided) {
    setMode(ctx.from.id, 'checkout:bonus', s.data);
    await ctx.replyWithMarkdown(
      [
        `На твоём бонусном балансе: *${fmtPrice(bonus)}*`,
        `Можно списать в счёт этого заказа до *${fmtPrice(usable)}*.`,
      ].join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback(`Списать ${fmtPrice(usable)}`, `bonus:max`)],
        [Markup.button.callback('Не использовать бонусы',       `bonus:no`)],
      ]),
    );
    return;
  }
  s.data.bonus_applied = s.data.bonus_applied || 0;
  await goPayment(ctx);
}

async function goPayment(ctx) {
  const s = getMode(ctx.from.id);
  if (!s) return;
  s.data.bank = 'sbp';
  s.data.payment_method = 'sbp';
  await finalizeCheckoutPreview(ctx);
}

bot.action(/^bonus:(max|no)$/, async (ctx) => {
  const s = getMode(ctx.from.id);
  if (s?.mode !== 'checkout:bonus') return ctx.answerCbQuery('Сессия истекла');
  const bonus = (getBonusInfo.get(ctx.from.id) || {}).bonus_balance || 0;
  const usable = Math.min(bonus, s.data.subtotal);
  s.data.bonus_applied = ctx.match[1] === 'max' ? usable : 0;
  s.data.bonus_decided = true;
  await ctx.answerCbQuery(s.data.bonus_applied ? `Списали ${fmtPrice(s.data.bonus_applied)}` : 'Без бонусов');
  await goPayment(ctx);
});

bot.action('order:confirm', async (ctx) => {
  const s = getMode(ctx.from.id);
  if (s?.mode !== 'checkout:confirm') {
    return ctx.answerCbQuery('Сессия истекла, оформите заказ заново.');
  }
  const subtotal     = s.data.items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const bonusApplied = Math.min(s.data.bonus_applied || 0, subtotal);
  const total        = Math.max(0, subtotal - bonusApplied);

  // re-check bonus balance just before applying
  if (bonusApplied > 0) {
    const ok = spendBonus.run(bonusApplied, bonusApplied, ctx.from.id, bonusApplied);
    if (ok.changes === 0) {
      return ctx.answerCbQuery('Не хватает бонусов, попробуйте ещё раз');
    }
  }

  const { lastInsertRowid: orderId, display_id: displayId } = insertOrder.run({
    tg_id: ctx.from.id,
    address: s.data.address,
    phone: null,
    comment: s.data.comment || '',
    payment_method: 'card',
    subtotal,
    bonus_applied: bonusApplied,
    total,
    delivery_time: s.data.delivery_time,
    bank: s.data.bank,
  });

  if (bonusApplied > 0) {
    insertBonusLog.run({
      tg_id: ctx.from.id, delta: -bonusApplied,
      reason: 'spend_on_order', order_id: orderId, other_tg_id: null,
    });
  }

  for (const it of s.data.items) {
    insertOrderItem.run({
      order_id: orderId,
      product_id: it.product_id,
      name: `${it.brand} ${it.name}`,
      price: it.price,
      qty: it.qty,
    });
  }
  clearCart.run(ctx.from.id);

  await ctx.answerCbQuery('Заказ создан');

  // Move user into "awaiting receipt" mode and show payment instructions
  setMode(ctx.from.id, 'checkout:await_receipt', {
    order_id: orderId,
    display_id: displayId,
    bank: s.data.bank,
    total,
  });

  const text = [
    `*Заказ #${displayId} оформлен*`,
    '',
    bonusApplied > 0 ? `Списано бонусов: ${fmtPrice(bonusApplied)}` : null,
    `*К оплате: ${fmtPrice(total)}*`,
    '',
    `*Оплата через СБП*`,
    `Номер: \`${CARD_NUMBER}\``,
    `Получатель: *${escapeMd(CARD_HOLDER)}*`,
    '',
    `Переведи ${fmtPrice(total)} по СБП на номер выше и нажми «Я оплатил» — затем пришли *скриншот чека*.`,
  ].filter(Boolean);
  await ctx.replyWithMarkdown(
    text.join('\n'),
    Markup.inlineKeyboard([
      [Markup.button.callback('Я оплатил — отправить чек', `pay:done:${orderId}`)],
      [Markup.button.callback('Отменить заказ',            `pay:cancel:${orderId}`)],
    ]),
  );

  // notify admin (always, even if log toggles off)
  try {
    const u = getUser.get(ctx.from.id);
    await bot.telegram.sendMessage(
      ADMIN_ID,
      [
        `*Новый заказ #${displayId}*`,
        `От: Бот ID #${u?.display_id ?? '—'} (tg \`${ctx.from.id}\`)`,
        `Сумма: ${fmtPrice(subtotal)}`,
        bonusApplied > 0 ? `Бонусы: −${fmtPrice(bonusApplied)}` : null,
        `К оплате: *${fmtPrice(total)}*`,
        `Оплата: СБП · ${escapeMd(CARD_HOLDER)}`,
        `Адрес: ${escapeMd(s.data.address)}`,
        `Время: ${escapeMd(s.data.delivery_time || '—')}`,
        s.data.comment ? `Комментарий: ${escapeMd(s.data.comment)}` : null,
      ].filter(Boolean).join('\n'),
      { parse_mode: 'Markdown' },
    );
  } catch (e) {
    console.warn('Не удалось уведомить админа:', e.message);
  }
  await logAction(ctx, 'order_placed', `#${displayId} · ${fmtPrice(total)} · СБП`);
});

bot.action(/^pay:done:(\d+)$/, async (ctx) => {
  const orderId = Number(ctx.match[1]);
  const o = getOrder.get(orderId);
  if (!o || o.tg_id !== ctx.from.id) return ctx.answerCbQuery('Заказ не найден');
  setMode(ctx.from.id, 'checkout:upload_receipt', { order_id: orderId, display_id: o.display_id });
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
    [
      `*Жду фото чека* по заказу #${o.display_id}.`,
      `Пришли скриншотом сюда — отправлю на проверку.`,
    ].join('\n'),
  );
});

bot.action(/^pay:cancel:(\d+)$/, async (ctx) => {
  const orderId = Number(ctx.match[1]);
  const o = getOrder.get(orderId);
  if (!o || o.tg_id !== ctx.from.id) return ctx.answerCbQuery('Заказ не найден');
  setOrderStatus.run('cancelled', orderId);
  // refund bonus if any
  if (o.bonus_applied > 0) {
    addBonus.run(o.bonus_applied, 0, ctx.from.id);
    insertBonusLog.run({
      tg_id: ctx.from.id, delta: o.bonus_applied,
      reason: 'refund_cancel', order_id: orderId, other_tg_id: null,
    });
  }
  clearMode(ctx.from.id);
  await ctx.answerCbQuery('Отменено');
  await ctx.editMessageText(`Заказ #${o.display_id} отменён.`);
  try {
    await bot.telegram.sendMessage(ADMIN_ID, `Заказ #${o.display_id} отменён клиентом.`);
  } catch {}
});

bot.action('order:cancel', async (ctx) => {
  clearMode(ctx.from.id);
  await ctx.answerCbQuery('Отменено');
  await ctx.editMessageText('Оформление отменено.');
});

async function finalizeCheckoutPreview(ctx) {
  const s = getMode(ctx.from.id);
  if (!s) return;
  const items        = s.data.items;
  const subtotal     = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const bonusApplied = Math.min(s.data.bonus_applied || 0, subtotal);
  const total        = Math.max(0, subtotal - bonusApplied);
  const lines = items.map(
    (it, i) =>
      `${i + 1}. ${escapeMd(it.brand)} ${escapeMd(it.name)} × ${it.qty} = ${fmtPrice(it.price * it.qty)}`,
  );

  const text = [
    `*Предварительный заказ VIBE CLOUD:*`,
    '',
    ...lines,
    '—————————————',
    `Адрес: ${escapeMd(s.data.address)}`,
    `Время: ${escapeMd(s.data.delivery_time)}`,
    s.data.comment ? `Комментарий: ${escapeMd(s.data.comment)}` : null,
    `Оплата: СБП · ${escapeMd(CARD_HOLDER)}`,
    `Сумма: ${fmtPrice(subtotal)}`,
    bonusApplied > 0 ? `Бонусы: −${fmtPrice(bonusApplied)}` : null,
    `К оплате: *${fmtPrice(total)}*`,
  ].filter(Boolean).join('\n');

  setMode(ctx.from.id, 'checkout:confirm', s.data);
  await ctx.replyWithMarkdown(
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('Подтверждаю', 'order:confirm'),
        Markup.button.callback('Отмена', 'order:cancel'),
      ],
    ]),
  );
}

/* ───────────────────── 🫧  История заказов ───────────────────── */

async function sendOrderHistory(ctx) {
  const orders = listOrdersByUser.all(ctx.from.id);
  if (!orders.length) {
    await ctx.reply('У тебя пока нет заказов. Загляни в каталог!');
    return;
  }
  const lines = orders.map((o) => {
    const date = (o.created_at || '').slice(5, 10).replace('-', '.');
    return `· #${o.display_id ?? o.id} · ${fmtPrice(o.total)} · ${STATUS_LABELS[o.status] || o.status} · ${date}`;
  });
  await ctx.replyWithMarkdown(
    `*Твои заказы в VIBE CLOUD:*\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад в меню', 'menu')]]),
  );
}

/* ───────────────────── 🫧  Обработка свободного текста (checkout) ───────────────────── */

bot.command('skip', async (ctx) => {
  const s = getMode(ctx.from.id);
  if (s?.mode !== 'checkout:comment') return;
  s.data.comment = '';
  setMode(ctx.from.id, 'checkout:bonus_or_bank', s.data);
  await askBonusSpending(ctx);
});

bot.on('text', async (ctx, next) => {
  const s = getMode(ctx.from.id);
  if (!s) {
    // log free-text non-command messages from non-admin users
    if (ctx.message?.text && !ctx.message.text.startsWith('/')) {
      await logAction(ctx, 'user_message', ctx.message.text.slice(0, 200));
    }
    return next();
  }
  const text = ctx.message.text.trim();

  if (s.mode === 'checkout:address') {
    if (text.length < 5) {
      return ctx.reply('Слишком коротко. Напиши адрес: город, улица, дом, квартира.');
    }
    s.data.address = text;
    setMode(ctx.from.id, 'checkout:time', s.data);
    await ctx.reply('Удобное время доставки: формат ЧЧ:ММ (только от 12:00, например 14:30)');
    return;
  }
  if (s.mode === 'checkout:time') {
    const t = parseDeliveryTime(text);
    if (!t) {
      return ctx.reply('Время не подходит. Введи в формате ЧЧ:ММ, не раньше 12:00. Например: 14:30');
    }
    s.data.delivery_time = t;
    setMode(ctx.from.id, 'checkout:comment', s.data);
    await ctx.reply('Комментарий курьеру (или /skip, если ничего не нужно)');
    return;
  }
  if (s.mode === 'checkout:comment') {
    s.data.comment = text;
    setMode(ctx.from.id, 'checkout:bonus_or_bank', s.data);
    await askBonusSpending(ctx);
    return;
  }
  if (s.mode === 'checkout:upload_receipt') {
    return ctx.reply('Ожидаем *фото* чека по заказу. Прикрепи изображение.', { parse_mode: 'Markdown' });
  }
  return next();
});

/* ───── Receipt upload handler ───── */
bot.on('photo', async (ctx, next) => {
  const s = getMode(ctx.from.id);
  if (s?.mode !== 'checkout:upload_receipt') return next?.();
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  const orderId = s.data.order_id;
  const o = getOrder.get(orderId);
  if (!o) return ctx.reply('Заказ не найден.');

  setOrderReceipt.run(fileId, orderId);
  clearMode(ctx.from.id);

  await ctx.replyWithMarkdown(
    [
      `Чек по заказу *#${o.display_id}* получен. Передал на проверку.`,
      '',
      `Поддержка: ${SUPPORT_USERNAME}`,
      `Если что — напиши в поддержку с номером заказа *#${o.display_id}*, мы отследим.`,
    ].join('\n'),
    Markup.inlineKeyboard([
      [Markup.button.url('Написать в поддержку',
          `https://t.me/${SUPPORT_USERNAME.replace(/^@/, '')}?text=${encodeURIComponent(`Привет! Заказ #${o.display_id}`)}`)],
      [Markup.button.callback('Главное меню', 'menu')],
    ]),
  );

  // forward receipt + summary to admin
  try {
    const u = getUser.get(ctx.from.id);
    await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
      caption: [
        `*Чек по заказу #${o.display_id}*`,
        `От: Бот ID #${u?.display_id ?? '—'} (tg \`${ctx.from.id}\`)`,
        `Сумма: ${fmtPrice(o.total)} · СБП · ${escapeMd(CARD_HOLDER)}`,
      ].join('\n'),
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('Подтвердить заказ', `adm:set:${orderId}:confirmed`),
          Markup.button.callback('Отменить',          `adm:set:${orderId}:cancelled`),
        ],
      ]),
    });
  } catch (e) {
    console.warn('Не удалось переслать чек админу:', e.message);
  }
  await logAction(ctx, 'receipt_uploaded', `Чек по заказу #${o.display_id}`);
});

/* ───────────────────── 🫧  Админ-панель ───────────────────── */

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Новые заказы',     'adm:list:new')],
    [
      Markup.button.callback('Подтверждённые',  'adm:list:confirmed'),
      Markup.button.callback('В пути',          'adm:list:shipped'),
    ],
    [Markup.button.callback('Все клиенты',      'adm:users')],
    [Markup.button.callback('Логи действий',    'adm:logs')],
    [Markup.button.callback('Статистика',       'adm:stats')],
  ]);
}

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Доступ только для админа VIBE CLOUD.');
  await ctx.replyWithMarkdown('*Админ-панель VIBE CLOUD*', adminKeyboard());
});

bot.command('admin_users', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await sendAdminUsers(ctx);
});

bot.command('admin_logs', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await sendAdminLogToggles(ctx);
});

bot.hears(['Админ-панель', '🛠 Админ-панель'], async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.replyWithMarkdown('*Админ-панель VIBE CLOUD*', adminKeyboard());
});

bot.action('adm:users', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Только админ');
  await ctx.answerCbQuery();
  await sendAdminUsers(ctx);
});

bot.action('adm:logs', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Только админ');
  await ctx.answerCbQuery();
  await sendAdminLogToggles(ctx);
});

async function sendAdminUsers(ctx) {
  const users = listAllUsers.all();
  if (!users.length) {
    return ctx.reply('Пока нет ни одного клиента.');
  }
  const lines = users.map((u) => {
    const name = u.first_name || '—';
    const refTag = u.referrer_tg_id ? ` · от tg:${u.referrer_tg_id}` : '';
    return [
      `*#${u.display_id}* · ${escapeMd(name)} · tg:\`${u.tg_id}\`${refTag}`,
      `_бонус_: ${fmtPrice(u.bonus_balance)} · _заказов_: ${u.orders_count} · _потратил_: ${fmtPrice(u.spent)}`,
    ].join('\n');
  });
  // chunk by 15 to avoid Telegram message-length limit
  const CHUNK = 15;
  for (let i = 0; i < lines.length; i += CHUNK) {
    await ctx.replyWithMarkdown(
      `*Клиенты VIBE CLOUD* (${i + 1}-${Math.min(i + CHUNK, lines.length)} из ${lines.length})\n\n` +
      lines.slice(i, i + CHUNK).join('\n\n'),
    );
  }
}

function logTogglesKeyboard() {
  const rows = LOG_TYPES.map((l) => {
    const on = isLogEnabled(l.key);
    return [Markup.button.callback(`${on ? '[ON] ' : '[off] '}${l.label}`, `adm:log:${l.key}`)];
  });
  return Markup.inlineKeyboard(rows);
}

async function sendAdminLogToggles(ctx) {
  await ctx.replyWithMarkdown(
    '*Логи действий клиентов*\n\nНажми на пункт, чтобы включить/выключить уведомления.',
    logTogglesKeyboard(),
  );
}

bot.action(/^adm:log:([a-z_]+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Только админ');
  const key = ctx.match[1];
  if (!LOG_TYPE_KEYS.includes(key)) return ctx.answerCbQuery('Неизвестный лог');
  const next = !isLogEnabled(key);
  setLogEnabled(key, next);
  await ctx.answerCbQuery(next ? 'Включено' : 'Выключено');
  try {
    await ctx.editMessageReplyMarkup(logTogglesKeyboard().reply_markup);
  } catch {}
});

bot.action(/^adm:list:([a-z]+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Только админ');
  const status = ctx.match[1];
  await ctx.answerCbQuery();
  const orders = listOrdersByStatus.all(status);
  if (!orders.length) {
    await ctx.reply(`Нет заказов со статусом "${STATUS_LABELS[status] || status}".`);
    return;
  }
  for (const o of orders) {
    const items = getOrderItems.all(o.id);
    const itemsText = items.map(
      (it) => `• ${escapeMd(it.name)} × ${it.qty} = ${fmtPrice(it.price * it.qty)}`,
    ).join('\n');
    const u = getUser.get(o.tg_id);
    await ctx.replyWithMarkdown(
      [
        `*Заказ #${o.display_id ?? o.id}* — ${STATUS_LABELS[o.status] || o.status}`,
        `Клиент: Бот ID #${u?.display_id ?? '—'} (tg \`${o.tg_id}\`)`,
        `Сумма: *${fmtPrice(o.total)}*`,
        o.bonus_applied > 0 ? `Бонусы: −${fmtPrice(o.bonus_applied)}` : null,
        `Оплата: Карта (${escapeMd(BANK_LABEL[o.bank] || '—')})`,
        `Адрес: ${escapeMd(o.address || '—')}`,
        `Время: ${escapeMd(o.delivery_time || '—')}`,
        o.comment ? `Комментарий: ${escapeMd(o.comment)}` : null,
        o.receipt_file_id ? '_чек загружен_' : '_чек ещё не загружен_',
        '',
        itemsText,
      ].filter(Boolean).join('\n'),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Подтвердить', `adm:set:${o.id}:confirmed`),
          Markup.button.callback('Отправить',   `adm:set:${o.id}:shipped`),
        ],
        [
          Markup.button.callback('Доставлен', `adm:set:${o.id}:delivered`),
          Markup.button.callback('Отменить',  `adm:set:${o.id}:cancelled`),
        ],
      ]),
    );
  }
});

bot.action(/^adm:set:(\d+):([a-z]+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Только админ');
  const id = Number(ctx.match[1]);
  const status = ctx.match[2];
  setOrderStatus.run(status, id);
  await ctx.answerCbQuery(`Статус: ${STATUS_LABELS[status] || status}`);
  const o = getOrder.get(id);
  if (o) {
    try {
      await bot.telegram.sendMessage(
        o.tg_id,
        `Статус заказа #${o.display_id ?? id} обновлён: ${STATUS_LABELS[status] || status}\n\nПоддержка: ${SUPPORT_USERNAME}`,
      );
    } catch {}

    // credit referrer once when order moves into a "fulfilled" state
    const FULFILLED = ['confirmed', 'shipped', 'delivered'];
    if (FULFILLED.includes(status)) {
      await maybeCreditReferrer(o);
    }
  }
});

async function maybeCreditReferrer(order) {
  if (refCreditExistsForOrder.get(order.id)) return; // already credited
  const ref = getReferrer.get(order.tg_id)?.referrer_tg_id;
  if (!ref) return;
  // cashback base = subtotal (so any gift bonus the buyer already used is not double-paid)
  const base = order.subtotal ?? order.total;
  const reward = Math.round((base * REFERRAL_PERCENT) / 100);
  if (reward <= 0) return;
  addBonus.run(reward, reward, ref);
  insertBonusLog.run({
    tg_id: ref, delta: reward,
    reason: `ref_credit_${REFERRAL_PERCENT}pct`,
    order_id: order.id, other_tg_id: order.tg_id,
  });
  try {
    await bot.telegram.sendMessage(
      ref,
      `Тебе зачислено *${fmtPrice(reward)}* бонусов за заказ друга #${order.display_id ?? order.id}. /referral — посмотреть баланс.`,
      { parse_mode: 'Markdown' },
    );
  } catch {}
}

bot.action('adm:stats', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Только админ');
  await ctx.answerCbQuery();
  const rev = statsTotalRevenue.get();
  const byS = statsByStatus.all();
  const byStatusLines = byS
    .map((r) => `• ${STATUS_LABELS[r.status] || r.status}: ${r.c}`)
    .join('\n') || '—';
  await ctx.replyWithMarkdown(
    [
      `*Статистика VIBE CLOUD*`,
      ``,
      `Выручка (без отменённых): *${fmtPrice(rev.revenue)}*`,
      `Всего заказов: *${rev.orders_count}*`,
      ``,
      `*По статусам:*`,
      byStatusLines,
    ].join('\n'),
  );
});

/* ───────────────────── 🫧  Прочее ───────────────────── */

bot.action('noop', (ctx) => ctx.answerCbQuery());

bot.catch((err, ctx) => {
  console.error('🚨 Bot error', err);
  if (ctx) ctx.reply('Что-то пошло не так. Попробуй ещё раз.').catch(() => {});
});

/* ───────────────────── 🫧  Запуск ───────────────────── */

const apiPort = Number(process.env.PORT || process.env.API_PORT || 3001);
startApi({ port: apiPort, bot });

bot.launch().then(() => {
  console.log(`☁️  VIBE CLOUD bot online. Admin id = ${ADMIN_ID}. API on :${apiPort}`);
  if (WEB_APP_URL) console.log(`🌐 Web App: ${WEB_APP_URL}`);
});

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
