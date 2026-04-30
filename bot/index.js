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
} from '../db/database.js';
import { startApi } from '../api/server.js';

dotenv.config();

const BOT_TOKEN  = process.env.BOT_TOKEN || process.env.VIBE_CLOUD_BOT_TOKEN;
const ADMIN_ID   = Number(process.env.ADMIN_ID || 8417505079);
const WEB_APP_URL = process.env.WEB_APP_URL || '';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан. Заполните .env (см. .env.example).');
  process.exit(1);
}

if (countProducts.get().c === 0) {
  console.error('⚠️  В БД нет товаров. Запустите `npm run seed` перед стартом бота.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

/* ───────────────────── 🫧  Тексты и стили VIBE CLOUD ───────────────────── */

const BRAND = '☁️ VIBE CLOUD ☁️';

const CATEGORY_LABELS = {
  disposable: '💨 Одноразки',
  liquid:     '🧪 Жидкости',
  pod:        '🔋 Поды и POD-системы',
  accessory:  '🧰 Аксессуары',
};

const CATEGORY_ORDER = ['disposable', 'liquid', 'pod', 'accessory'];

const STATUS_LABELS = {
  new:       '🆕 Новый',
  confirmed: '✅ Подтверждён',
  shipped:   '🚚 В пути',
  delivered: '📬 Доставлен',
  cancelled: '❌ Отменён',
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
    ['🛒 Каталог',        '📦 Моя корзина'],
    ['✅ Оформить заказ', '📋 История заказов'],
    ['⭐ Избранное',      '❓ Помощь'],
  ];
  if (WEB_APP_URL) rows.push(['🌐 Открыть Web App']);
  if (isAdmin(ctx)) rows.push(['🛠 Админ-панель']);
  return Markup.keyboard(rows).resize();
}

function ageGateKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Мне есть 18', 'age:yes')],
    [Markup.button.callback('❌ Мне меньше 18', 'age:no')],
  ]);
}

function categoriesKeyboard() {
  const rows = CATEGORY_ORDER.map((c) => [
    Markup.button.callback(CATEGORY_LABELS[c], `cat:${c}:0`),
  ]);
  rows.push([Markup.button.callback('⬅️ В меню', 'menu')]);
  return Markup.inlineKeyboard(rows);
}

const PAGE_SIZE = 5;

function categoryListKeyboard(category, page, total) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const nav = [];
  if (page > 0)
    nav.push(Markup.button.callback('⬅️', `cat:${category}:${page - 1}`));
  nav.push(Markup.button.callback(`${page + 1}/${pages}`, 'noop'));
  if (page < pages - 1)
    nav.push(Markup.button.callback('➡️', `cat:${category}:${page + 1}`));
  return Markup.inlineKeyboard([
    nav,
    [Markup.button.callback('⬅️ Категории', 'catalog')],
  ]);
}

function productActionsKeyboard(productId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔍 Подробнее', `prod:${productId}`),
      Markup.button.callback('➕ В корзину', `add:${productId}`),
    ],
  ]);
}

function productDetailKeyboard(productId, fav) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛒 Добавить в корзину', `add:${productId}`)],
    [
      Markup.button.callback(
        fav ? '💔 Убрать из избранного' : '⭐ В избранное',
        `fav:${productId}`,
      ),
    ],
    [Markup.button.callback('⬅️ Назад', 'catalog')],
  ]);
}

function cartKeyboard(items) {
  if (items.length === 0) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🛒 В каталог', 'catalog')],
    ]);
  }
  const rows = items.map((it) => [
    Markup.button.callback('➖', `qty:${it.product_id}:dec`),
    Markup.button.callback(`${it.name} × ${it.qty}`, 'noop'),
    Markup.button.callback('➕', `qty:${it.product_id}:inc`),
  ]);
  rows.push([
    Markup.button.callback('🗑 Очистить', 'cart:clear'),
    Markup.button.callback('✅ Оформить', 'cart:checkout'),
  ]);
  return Markup.inlineKeyboard(rows);
}

/* ───────────────────── 🫧  Рендер ───────────────────── */

function renderProductLine(p, idx) {
  const oldPrice = p.old_price ? ` ~~${fmtPrice(p.old_price)}~~` : '';
  return [
    `🍃 [${idx}] *${escapeMd(p.brand)} ${escapeMd(p.name)}*`,
    `💰 ${fmtPrice(p.price)}${oldPrice} | ⭐ ${p.rating}`,
    p.strength ? `💨 Крепость: ${escapeMd(p.strength)}` : null,
    p.flavor   ? `🍏 Вкус: ${escapeMd(p.flavor)}`       : null,
    p.volume   ? `🧪 Объём: ${escapeMd(p.volume)}`      : null,
  ].filter(Boolean).join('\n');
}

function renderProductCard(p) {
  return [
    `📦 *VIBE CLOUD рекомендует:*`,
    ``,
    `*Название:* ${escapeMd(p.name)}`,
    `*Бренд:* ${escapeMd(p.brand)}`,
    `*Тип:* ${escapeMd(p.type)}`,
    p.puffs    ? `*Затяжек:* ${p.puffs}`                : null,
    p.strength ? `*Крепость:* ${escapeMd(p.strength)}`  : null,
    p.flavor   ? `*Вкус:* ${escapeMd(p.flavor)}`        : null,
    p.volume   ? `*Объём:* ${escapeMd(p.volume)}`       : null,
    p.battery  ? `*Батарея:* ${escapeMd(p.battery)}`    : null,
    `*В наличии:* ${p.in_stock ? '✅' : '❌'}`,
    ``,
    `💰 *Цена:* ${fmtPrice(p.price)}`,
    p.description ? `\n_${escapeMd(p.description)}_` : null,
  ].filter(Boolean).join('\n');
}

function renderCart(items) {
  if (items.length === 0) {
    return '🛒 *Твоя корзина VIBE CLOUD пуста.*\n\nЗагляни в каталог 👇';
  }
  const lines = items.map(
    (it, i) =>
      `${i + 1}. ${escapeMd(it.name)} × ${it.qty} = ${fmtPrice(it.price * it.qty)}`,
  );
  const total = items.reduce((s, it) => s + it.price * it.qty, 0);
  return [
    '🛒 *Твоя корзина VIBE CLOUD:*',
    '',
    ...lines,
    '—————————————',
    `🥫 *Итого:* ${fmtPrice(total)}`,
  ].join('\n');
}

// Telegram MarkdownV1 — экранируем только * _ ` [ чтобы не ломать форматирование
function escapeMd(s) {
  return String(s ?? '').replace(/([_*`\[])/g, '\\$1');
}

/* ───────────────────── 🫧  /start + age gate ───────────────────── */

bot.start(async (ctx) => {
  upsertUser.run({
    tg_id: ctx.from.id,
    username: ctx.from.username || null,
    first_name: ctx.from.first_name || null,
  });

  const u = getUser.get(ctx.from.id);
  const greeting = `${BRAND}\n\nПривет, *${escapeMd(ctx.from.first_name || 'друг')}*!\nТвой любимый вейпшоп всегда с тобой.`;

  if (u && u.age_verified) {
    await ctx.replyWithMarkdown(greeting, mainMenuKeyboard(ctx));
    await ctx.replyWithMarkdown('🫧 *Главное меню VIBE CLOUD:*', mainMenuKeyboard(ctx));
    return;
  }

  await ctx.replyWithMarkdown(
    `${greeting}\n\n🔞 Подтверди возраст (18+), чтобы продолжить.`,
    ageGateKeyboard(),
  );
});

bot.action('age:yes', async (ctx) => {
  setAgeVerified.run(ctx.from.id);
  await ctx.answerCbQuery('Добро пожаловать!');
  await ctx.editMessageText('✅ Возраст подтверждён.');
  await ctx.replyWithMarkdown('🫧 *Главное меню VIBE CLOUD:*', mainMenuKeyboard(ctx));
});

bot.action('age:no', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '🚫 К сожалению, продажа никотинсодержащей продукции разрешена только лицам старше 18 лет.',
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

bot.hears('🛒 Каталог', async (ctx) => {
  await ctx.replyWithMarkdown('🫧 *Категории VIBE CLOUD:*', categoriesKeyboard());
});

bot.hears('📦 Моя корзина', async (ctx) => {
  const items = getCart.all(ctx.from.id);
  await ctx.replyWithMarkdown(renderCart(items), cartKeyboard(items));
});

bot.hears('✅ Оформить заказ', async (ctx) => startCheckout(ctx));

bot.hears('📋 История заказов', async (ctx) => {
  await sendOrderHistory(ctx);
});

bot.hears('⭐ Избранное', async (ctx) => {
  const favs = listFavorites.all(ctx.from.id);
  if (!favs.length) {
    await ctx.reply('Список избранного пуст. Открой карточку товара и нажми ⭐.');
    return;
  }
  await ctx.replyWithMarkdown('⭐ *Избранное VIBE CLOUD:*');
  for (let i = 0; i < favs.length; i++) {
    const p = favs[i];
    await ctx.replyWithPhoto(p.image, {
      caption: renderProductLine(p, i + 1),
      parse_mode: 'Markdown',
      ...productActionsKeyboard(p.id),
    });
  }
});

bot.hears('❓ Помощь', async (ctx) => {
  await ctx.replyWithMarkdown(
    [
      `${BRAND}`,
      '',
      'Я твой телеграм-консьерж VIBE CLOUD. Доступные действия:',
      '',
      '🛒 *Каталог* — все товары по категориям',
      '📦 *Моя корзина* — список выбранного',
      '✅ *Оформить заказ* — адрес, телефон, подтверждение',
      '📋 *История заказов* — статусы по твоим заказам',
      '⭐ *Избранное* — быстрый доступ к любимкам',
      '🌐 */shop* — открыть премиум Web App',
      '',
      'Если нужен живой человек — пиши прямо в этот чат, админ ответит.',
    ].join('\n'),
  );
});

bot.hears('🌐 Открыть Web App', async (ctx) => sendWebAppLink(ctx));
bot.command('shop', async (ctx) => sendWebAppLink(ctx));

async function sendWebAppLink(ctx) {
  if (!WEB_APP_URL) {
    await ctx.reply('🌐 Web App ещё не опубликован. Запустите ngrok и заполните WEB_APP_URL в .env.');
    return;
  }
  await ctx.reply(
    '🌐 Премиум витрина VIBE CLOUD:',
    Markup.inlineKeyboard([
      [Markup.button.webApp('Открыть Web App', WEB_APP_URL)],
    ]),
  );
}

/* ───────────────────── 🫧  Каталог ───────────────────── */

bot.action('menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown('🫧 *Главное меню VIBE CLOUD:*', mainMenuKeyboard(ctx));
});

bot.action('catalog', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown('🫧 *Категории VIBE CLOUD:*', categoriesKeyboard());
});

bot.action(/^cat:([a-z]+):(\d+)$/, async (ctx) => {
  const [, category, pageStr] = ctx.match;
  const page = Number(pageStr);
  await ctx.answerCbQuery();

  const all = listProducts.all(category);
  if (!all.length) {
    await ctx.reply('В этой категории пока пусто.');
    return;
  }
  const start = page * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);

  await ctx.replyWithMarkdown(`📂 *${CATEGORY_LABELS[category]}* — стр. ${page + 1}`);

  for (let i = 0; i < slice.length; i++) {
    const p = slice[i];
    await ctx.replyWithPhoto(p.image, {
      caption: renderProductLine(p, start + i + 1),
      parse_mode: 'Markdown',
      ...productActionsKeyboard(p.id),
    });
  }

  await ctx.reply('Навигация:', categoryListKeyboard(category, page, all.length));
});

bot.action(/^prod:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const p = getProduct.get(id);
  await ctx.answerCbQuery();
  if (!p) return ctx.reply('Товар не найден.');

  const fav = !!isFavorite.get(ctx.from.id, id);
  await ctx.replyWithPhoto(p.image, {
    caption: renderProductCard(p),
    parse_mode: 'Markdown',
    ...productDetailKeyboard(id, fav),
  });
});

bot.action(/^add:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const p = getProduct.get(id);
  if (!p) return ctx.answerCbQuery('Товар не найден');
  addToCart.run(ctx.from.id, id);
  await ctx.answerCbQuery(`✅ ${p.name} добавлен в корзину`);
});

bot.action(/^fav:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  if (isFavorite.get(ctx.from.id, id)) {
    removeFavorite.run(ctx.from.id, id);
    await ctx.answerCbQuery('💔 Убрано из избранного');
  } else {
    addFavorite.run(ctx.from.id, id);
    await ctx.answerCbQuery('⭐ Добавлено в избранное');
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
    await ctx.editMessageText('🧹 Корзина пуста.', cartKeyboard([]));
  } catch {
    await ctx.reply('🧹 Корзина пуста.');
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
    await ctx.reply('Сначала добавь что-нибудь в корзину 🛒');
    return;
  }
  setMode(ctx.from.id, 'checkout:address', { items });
  await ctx.reply('📍 Адрес доставки: (напиши текстом, город + улица + дом + квартира)');
}

bot.command('skip', async (ctx) => {
  const s = getMode(ctx.from.id);
  if (s?.mode !== 'checkout:comment') return;
  s.data.comment = '';
  await finalizeCheckoutPreview(ctx);
});

bot.action('order:confirm', async (ctx) => {
  const s = getMode(ctx.from.id);
  if (s?.mode !== 'checkout:confirm') {
    return ctx.answerCbQuery('Сессия истекла, оформите заказ заново.');
  }
  const total = s.data.items.reduce((sum, it) => sum + it.price * it.qty, 0);

  const orderId = insertOrder.run({
    tg_id: ctx.from.id,
    address: s.data.address,
    phone: s.data.phone,
    comment: s.data.comment || '',
    total,
  }).lastInsertRowid;

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
  clearMode(ctx.from.id);

  await ctx.answerCbQuery('Заказ оформлен!');
  await ctx.editMessageText(
    `✅ *Заказ #${orderId} в VIBE CLOUD оформлен!*\n\nМы свяжемся с тобой в ближайшее время.`,
    { parse_mode: 'Markdown' },
  );

  // уведомляем админа
  try {
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🆕 *Новый заказ #${orderId}*\nОт: ${ctx.from.first_name || ''} @${ctx.from.username || '—'}\nСумма: ${fmtPrice(total)}\nТел: ${s.data.phone}\nАдрес: ${s.data.address}`,
      { parse_mode: 'Markdown' },
    );
  } catch (e) {
    console.warn('Не удалось уведомить админа:', e.message);
  }
});

bot.action('order:cancel', async (ctx) => {
  clearMode(ctx.from.id);
  await ctx.answerCbQuery('Отменено');
  await ctx.editMessageText('❌ Оформление отменено.');
});

async function finalizeCheckoutPreview(ctx) {
  const s = getMode(ctx.from.id);
  if (!s) return;
  const items = s.data.items;
  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const lines = items.map(
    (it, i) =>
      `${i + 1}. ${it.brand} ${it.name} × ${it.qty} = ${fmtPrice(it.price * it.qty)}`,
  );

  const text = [
    `✅ *Заказ в VIBE CLOUD:*`,
    '',
    ...lines,
    '—————————————',
    `📍 Адрес: ${s.data.address}`,
    `📞 Телефон: ${s.data.phone}`,
    s.data.comment ? `📝 Комментарий: ${s.data.comment}` : null,
    `🥫 Итого: *${fmtPrice(total)}*`,
  ].filter(Boolean).join('\n');

  setMode(ctx.from.id, 'checkout:confirm', s.data);
  await ctx.replyWithMarkdown(
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Подтверждаю', 'order:confirm'),
        Markup.button.callback('❌ Отмена', 'order:cancel'),
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
    return `🔹 #${o.id} | ${fmtPrice(o.total)} | ${STATUS_LABELS[o.status] || o.status} | ${date}`;
  });
  await ctx.replyWithMarkdown(
    `📋 *Твои заказы в VIBE CLOUD:*\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад в меню', 'menu')]]),
  );
}

/* ───────────────────── 🫧  Обработка свободного текста (checkout) ───────────────────── */

bot.on('text', async (ctx, next) => {
  const s = getMode(ctx.from.id);
  if (!s) return next();
  const text = ctx.message.text.trim();

  if (s.mode === 'checkout:address') {
    s.data.address = text;
    setMode(ctx.from.id, 'checkout:phone', s.data);
    await ctx.reply('📞 Телефон: (формат +7XXXXXXXXXX)');
    return;
  }
  if (s.mode === 'checkout:phone') {
    if (!/^\+?\d{10,15}$/.test(text.replace(/\s|-/g, ''))) {
      return ctx.reply('Кажется, это не телефон. Попробуй ещё раз: +7XXXXXXXXXX');
    }
    s.data.phone = text;
    setMode(ctx.from.id, 'checkout:comment', s.data);
    await ctx.reply('📝 Комментарий (можно пропустить: /skip)');
    return;
  }
  if (s.mode === 'checkout:comment') {
    s.data.comment = text;
    await finalizeCheckoutPreview(ctx);
    return;
  }
  return next();
});

/* ───────────────────── 🫧  Админ-панель ───────────────────── */

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📦 Новые заказы', 'adm:list:new')],
    [
      Markup.button.callback('✅ Подтверждённые', 'adm:list:confirmed'),
      Markup.button.callback('🚚 В пути',         'adm:list:shipped'),
    ],
    [Markup.button.callback('📊 Статистика VIBE CLOUD', 'adm:stats')],
  ]);
}

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('🚫 Доступ только для админа VIBE CLOUD.');
  await ctx.replyWithMarkdown('🛠 *Админ-панель VIBE CLOUD*', adminKeyboard());
});

bot.hears('🛠 Админ-панель', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.replyWithMarkdown('🛠 *Админ-панель VIBE CLOUD*', adminKeyboard());
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
      (it) => `• ${it.name} × ${it.qty} = ${fmtPrice(it.price * it.qty)}`,
    ).join('\n');
    await ctx.replyWithMarkdown(
      [
        `*Заказ #${o.id}* — ${STATUS_LABELS[o.status] || o.status}`,
        `Сумма: *${fmtPrice(o.total)}*`,
        `Тел: ${o.phone}`,
        `Адрес: ${o.address}`,
        o.comment ? `Комментарий: ${o.comment}` : null,
        '',
        itemsText,
      ].filter(Boolean).join('\n'),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Подтвердить', `adm:set:${o.id}:confirmed`),
          Markup.button.callback('🚚 Отправить',   `adm:set:${o.id}:shipped`),
        ],
        [
          Markup.button.callback('📬 Доставлен', `adm:set:${o.id}:delivered`),
          Markup.button.callback('❌ Отменить',  `adm:set:${o.id}:cancelled`),
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
        `📦 Статус твоего заказа #${id} обновлён: ${STATUS_LABELS[status] || status}`,
      );
    } catch {}
  }
});

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
      `📊 *Статистика VIBE CLOUD*`,
      ``,
      `💰 Выручка (без отменённых): *${fmtPrice(rev.revenue)}*`,
      `📦 Всего заказов: *${rev.orders_count}*`,
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

const apiPort = Number(process.env.API_PORT || 3001);
startApi({ port: apiPort, bot });

bot.launch().then(() => {
  console.log(`☁️  VIBE CLOUD bot online. Admin id = ${ADMIN_ID}. API on :${apiPort}`);
  if (WEB_APP_URL) console.log(`🌐 Web App: ${WEB_APP_URL}`);
});

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
