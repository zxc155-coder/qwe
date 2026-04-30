import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'vibe_cloud.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY,
    tg_id        INTEGER UNIQUE NOT NULL,
    username     TEXT,
    first_name   TEXT,
    age_verified INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY,
    brand       TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    flavor      TEXT,
    strength    TEXT,
    puffs       INTEGER,
    volume      TEXT,
    battery     TEXT,
    price       INTEGER NOT NULL,
    old_price   INTEGER,
    rating      REAL    NOT NULL DEFAULT 4.5,
    image       TEXT,
    in_stock    INTEGER NOT NULL DEFAULT 1,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS cart (
    id         INTEGER PRIMARY KEY,
    tg_id      INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty        INTEGER NOT NULL DEFAULT 1,
    UNIQUE (tg_id, product_id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id         INTEGER PRIMARY KEY,
    tg_id      INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    UNIQUE (tg_id, product_id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY,
    tg_id      INTEGER NOT NULL,
    address    TEXT,
    phone      TEXT,
    comment    TEXT,
    total      INTEGER NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'new',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY,
    order_id   INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    price      INTEGER NOT NULL,
    qty        INTEGER NOT NULL,
    FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_cart_tg          ON cart(tg_id);
  CREATE INDEX IF NOT EXISTS idx_orders_tg        ON orders(tg_id);
  CREATE INDEX IF NOT EXISTS idx_favorites_tg     ON favorites(tg_id);
`);

export const upsertUser = db.prepare(`
  INSERT INTO users (tg_id, username, first_name)
  VALUES (@tg_id, @username, @first_name)
  ON CONFLICT(tg_id) DO UPDATE SET
    username = excluded.username,
    first_name = excluded.first_name
`);

export const setAgeVerified = db.prepare(
  `UPDATE users SET age_verified = 1 WHERE tg_id = ?`,
);

export const getUser = db.prepare(`SELECT * FROM users WHERE tg_id = ?`);

export const listProducts = db.prepare(
  `SELECT * FROM products WHERE category = ? ORDER BY id`,
);
export const listAllProducts = db.prepare(`SELECT * FROM products ORDER BY id`);
export const getProduct = db.prepare(`SELECT * FROM products WHERE id = ?`);
export const countProducts = db.prepare(
  `SELECT COUNT(*) AS c FROM products`,
);

export const addToCart = db.prepare(`
  INSERT INTO cart (tg_id, product_id, qty) VALUES (?, ?, 1)
  ON CONFLICT(tg_id, product_id) DO UPDATE SET qty = qty + 1
`);
export const setCartQty = db.prepare(`
  UPDATE cart SET qty = ? WHERE tg_id = ? AND product_id = ?
`);
export const removeFromCart = db.prepare(
  `DELETE FROM cart WHERE tg_id = ? AND product_id = ?`,
);
export const clearCart = db.prepare(`DELETE FROM cart WHERE tg_id = ?`);
export const getCart = db.prepare(`
  SELECT c.product_id, c.qty, p.name, p.brand, p.price, p.image
  FROM cart c JOIN products p ON p.id = c.product_id
  WHERE c.tg_id = ? ORDER BY c.id
`);

export const addFavorite = db.prepare(
  `INSERT OR IGNORE INTO favorites (tg_id, product_id) VALUES (?, ?)`,
);
export const removeFavorite = db.prepare(
  `DELETE FROM favorites WHERE tg_id = ? AND product_id = ?`,
);
export const isFavorite = db.prepare(
  `SELECT 1 FROM favorites WHERE tg_id = ? AND product_id = ?`,
);
export const listFavorites = db.prepare(`
  SELECT p.* FROM favorites f JOIN products p ON p.id = f.product_id
  WHERE f.tg_id = ? ORDER BY f.id DESC
`);

export const insertOrder = db.prepare(`
  INSERT INTO orders (tg_id, address, phone, comment, total, status)
  VALUES (@tg_id, @address, @phone, @comment, @total, 'new')
`);
export const insertOrderItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, name, price, qty)
  VALUES (@order_id, @product_id, @name, @price, @qty)
`);
export const listOrdersByUser = db.prepare(`
  SELECT * FROM orders WHERE tg_id = ? ORDER BY id DESC LIMIT 20
`);
export const getOrder = db.prepare(`SELECT * FROM orders WHERE id = ?`);
export const getOrderItems = db.prepare(
  `SELECT * FROM order_items WHERE order_id = ?`,
);
export const listOrdersByStatus = db.prepare(`
  SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 50
`);
export const setOrderStatus = db.prepare(
  `UPDATE orders SET status = ? WHERE id = ?`,
);
export const statsTotalRevenue = db.prepare(`
  SELECT COALESCE(SUM(total),0) AS revenue,
         COUNT(*) AS orders_count
  FROM orders WHERE status NOT IN ('cancelled')
`);
export const statsByStatus = db.prepare(`
  SELECT status, COUNT(*) AS c FROM orders GROUP BY status
`);

export default db;
