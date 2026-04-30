import express from 'express';
import cors from 'cors';
import {
  listAllProducts, getProduct,
  getCart, addToCart, setCartQty, removeFromCart, clearCart,
  listFavorites, addFavorite, removeFavorite,
  insertOrder, insertOrderItem, listOrdersByUser,
} from '../db/database.js';

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
    const { address, phone, comment } = req.body;
    const items = getCart.all(tgId);
    if (!items.length) return res.status(400).json({ error: 'cart empty' });
    const total = items.reduce((s, it) => s + it.price * it.qty, 0);
    const orderId = insertOrder.run({
      tg_id: tgId, address, phone, comment: comment || '', total,
    }).lastInsertRowid;
    for (const it of items) {
      insertOrderItem.run({
        order_id: orderId, product_id: it.product_id,
        name: `${it.brand} ${it.name}`, price: it.price, qty: it.qty,
      });
    }
    clearCart.run(tgId);

    if (bot && process.env.ADMIN_ID) {
      try {
        await bot.telegram.sendMessage(
          Number(process.env.ADMIN_ID),
          `🆕 Новый заказ из Web App #${orderId}\nСумма: ${total}₽\nТел: ${phone}\nАдрес: ${address}`,
        );
      } catch {}
    }
    res.json({ orderId, total });
  });

  app.listen(port, () => console.log(`🚀 VIBE CLOUD API on :${port}`));
  return app;
}
