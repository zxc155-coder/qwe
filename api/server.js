import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import {
  listAllProducts, getProduct,
  getCart, addToCart, setCartQty, removeFromCart, clearCart,
  listFavorites, addFavorite, removeFavorite,
  insertOrder, insertOrderItem, listOrdersByUser,
  listReviewsForProduct, reviewSummaryForProduct,
  getOrder, setOrderReceipt, getUser,
} from '../db/database.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function startApi({ port = 3001, bot } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_, res) => res.json({ ok: true, brand: 'VIBE CLOUD' }));

  app.get('/api/products', (_, res) => {
    res.json(listAllProducts.all());
  });

  app.get('/api/products/:id', (req, res) => {
    const p = getProduct.get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'not found' });
    res.json(p);
  });

  app.get('/api/products/:id/reviews', (req, res) => {
    const id = Number(req.params.id);
    const summary = reviewSummaryForProduct.get(id);
    const items = listReviewsForProduct.all(id);
    res.json({ summary, items });
  });

  app.get('/api/cart/:tgId', (req, res) => {
    res.json(getCart.all(Number(req.params.tgId)));
  });

  app.post('/api/cart/:tgId/add', (req, res) => {
    const tgId = Number(req.params.tgId);
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId required' });
    addToCart.run(tgId, Number(productId));
    res.json(getCart.all(tgId));
  });

  app.post('/api/cart/:tgId/qty', (req, res) => {
    const tgId = Number(req.params.tgId);
    const { productId, qty } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId required' });
    if (qty <= 0) removeFromCart.run(tgId, Number(productId));
    else setCartQty.run(Number(qty), tgId, Number(productId));
    res.json(getCart.all(tgId));
  });

  app.post('/api/cart/:tgId/clear', (req, res) => {
    clearCart.run(Number(req.params.tgId));
    res.json([]);
  });

  app.get('/api/favorites/:tgId', (req, res) => {
    res.json(listFavorites.all(Number(req.params.tgId)));
  });

  app.post('/api/favorites/:tgId/toggle', (req, res) => {
    const tgId = Number(req.params.tgId);
    const { productId, on } = req.body;
    if (on) addFavorite.run(tgId, Number(productId));
    else    removeFavorite.run(tgId, Number(productId));
    res.json(listFavorites.all(tgId));
  });

  app.get('/api/orders/:tgId', (req, res) => {
    res.json(listOrdersByUser.all(Number(req.params.tgId)));
  });

  app.post('/api/orders/:tgId', async (req, res) => {
    const tgId = Number(req.params.tgId);
    const { address, comment, delivery_time, bank } = req.body;
    const items = getCart.all(tgId);
    if (!items.length) return res.status(400).json({ error: 'cart empty' });
    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const { lastInsertRowid: orderId, display_id } = insertOrder.run({
      tg_id: tgId, address, phone: null, comment: comment || '',
      payment_method: 'card',
      subtotal, bonus_applied: 0, total: subtotal,
      delivery_time: delivery_time || null,
      bank: bank || null,
    });
    for (const it of items) {
      insertOrderItem.run({
        order_id: orderId, product_id: it.product_id,
        name: `${it.brand} ${it.name}`, price: it.price, qty: it.qty,
      });
    }
    clearCart.run(tgId);

    if (bot && process.env.ADMIN_ID) {
      try {
        const cardHolder = process.env.CARD_HOLDER || '—';
        await bot.telegram.sendMessage(
          Number(process.env.ADMIN_ID),
          `Новый заказ из Web App #${display_id}\nОплата: СБП · ${cardHolder}\nСумма: ${subtotal}₽\nАдрес: ${address}\nВремя: ${delivery_time || '—'}\nОжидается чек в Web App.`,
        );
      } catch {}
    }
    res.json({
      orderId,
      display_id,
      total: subtotal,
      payment_method: 'sbp',
      payment: {
        method: 'sbp',
        number: process.env.CARD_NUMBER || '',
        holder: process.env.CARD_HOLDER || '',
        support: process.env.SUPPORT_USERNAME || '@VibeCloudSupport',
      },
    });
  });

  // Приём чека из Web App: multipart "receipt" файл. Пересылаем админу.
  const RECEIPTS_DIR = path.resolve(process.env.RECEIPTS_DIR || 'db/receipts');
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

  app.post('/api/orders/:orderId/receipt', upload.single('receipt'), async (req, res) => {
    const orderId = Number(req.params.orderId);
    const o = getOrder.get(orderId);
    if (!o) return res.status(404).json({ error: 'order not found' });
    if (!req.file) return res.status(400).json({ error: 'receipt file required' });

    // Сначала — локальный бэкап файла на сервере
    let savedPath = null;
    try {
      const ext = (req.file.mimetype && req.file.mimetype.split('/')[1]) || 'jpg';
      savedPath = path.join(RECEIPTS_DIR, `${o.display_id}-${Date.now()}.${ext}`);
      fs.writeFileSync(savedPath, req.file.buffer);
    } catch (e) {
      console.warn('failed to persist receipt locally:', e.message);
    }

    let forwarded = false;
    let fileId = `web:${Date.now()}`;
    if (bot && process.env.ADMIN_ID) {
      try {
        const u = getUser.get(o.tg_id);
        const caption =
          `Чек по заказу #${o.display_id}\n` +
          `От: Бот ID #${u?.display_id ?? '—'} (tg ${o.tg_id})\n` +
          `Сумма: ${o.total}₽ · СБП · ${process.env.CARD_HOLDER || '—'}\n` +
          `(прислан из Web App)`;
        const sent = await bot.telegram.sendPhoto(
          Number(process.env.ADMIN_ID),
          { source: req.file.buffer, filename: req.file.originalname || 'receipt.jpg' },
          { caption },
        );
        if (sent?.photo?.length) {
          fileId = sent.photo[sent.photo.length - 1].file_id;
        }
        forwarded = true;
        // Уведомим клиента в бот (если он стартовал /start)
        try {
          await bot.telegram.sendMessage(
            o.tg_id,
            `Чек по заказу #${o.display_id} получен из Web App. Поддержка: ${process.env.SUPPORT_USERNAME || '@VibeCloudSupport'}`,
          );
        } catch {}
      } catch (e) {
        console.warn('receipt forward to admin failed:', e.message);
      }
    }

    setOrderReceipt.run(fileId, orderId);
    res.json({
      ok: true,
      display_id: o.display_id,
      forwarded,
      saved: !!savedPath,
    });
  });

  app.listen(port, () => console.log(`🚀 VIBE CLOUD API on :${port}`));
  return app;
}
