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
    id             INTEGER PRIMARY KEY,
    tg_id          INTEGER UNIQUE NOT NULL,
    username       TEXT,
    first_name     TEXT,
    age_verified   INTEGER NOT NULL DEFAULT 0,
    referrer_tg_id INTEGER,
    bonus_balance  INTEGER NOT NULL DEFAULT 0,
    bonus_earned   INTEGER NOT NULL DEFAULT 0,
    bonus_spent    INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
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
    id             INTEGER PRIMARY KEY,
    tg_id          INTEGER NOT NULL,
    address        TEXT,
    phone          TEXT,
    comment        TEXT,
    payment_method TEXT    NOT NULL DEFAULT 'cash',
    total          INTEGER NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'new',
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS bonus_log (
    id         INTEGER PRIMARY KEY,
    tg_id      INTEGER NOT NULL,
    delta      INTEGER NOT NULL,
    reason     TEXT,
    order_id   INTEGER,
    other_tg_id INTEGER,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id              INTEGER PRIMARY KEY,
    product_id      INTEGER NOT NULL,
    customer_bot_id INTEGER NOT NULL,
    items_summary   TEXT    NOT NULL,
    rating          INTEGER NOT NULL,
    body            TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS customer_logs (
    id         INTEGER PRIMARY KEY,
    tg_id      INTEGER NOT NULL,
    action     TEXT    NOT NULL,
    payload    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_cart_tg          ON cart(tg_id);
  CREATE INDEX IF NOT EXISTS idx_orders_tg        ON orders(tg_id);
  CREATE INDEX IF NOT EXISTS idx_favorites_tg     ON favorites(tg_id);
  CREATE INDEX IF NOT EXISTS idx_bonus_log_tg     ON bonus_log(tg_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_product  ON reviews(product_id);
  CREATE INDEX IF NOT EXISTS idx_logs_tg          ON customer_logs(tg_id);
`);

// Display ID base — first user is 38, first order is 49
export const USER_DISPLAY_ID_BASE  = 38;
export const ORDER_DISPLAY_ID_BASE = 49;

// Migration for previously-created users tables — add referral columns if missing.
// SQLite forbids UNIQUE in ALTER TABLE ADD COLUMN, so we add plain columns and
// enforce uniqueness through indices below.
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
for (const [col, ddl] of [
  ['referrer_tg_id', 'INTEGER'],
  ['bonus_balance',  'INTEGER NOT NULL DEFAULT 0'],
  ['bonus_earned',   'INTEGER NOT NULL DEFAULT 0'],
  ['bonus_spent',    'INTEGER NOT NULL DEFAULT 0'],
  ['display_id',     'INTEGER'],
]) {
  if (!userCols.includes(col)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} ${ddl}`);
  }
}

// Backfill display_id for any user without one, in tg_id order (deterministic).
// Always start the counter at the configured base.
const usersWithoutDisplay = db.prepare(`
  SELECT tg_id FROM users WHERE display_id IS NULL ORDER BY id ASC
`).all();
if (usersWithoutDisplay.length > 0) {
  const maxRow = db.prepare(`SELECT COALESCE(MAX(display_id), ?) AS m FROM users`)
                   .get(USER_DISPLAY_ID_BASE - 1);
  let next = (maxRow.m || (USER_DISPLAY_ID_BASE - 1)) + 1;
  if (next < USER_DISPLAY_ID_BASE) next = USER_DISPLAY_ID_BASE;
  const upd = db.prepare(`UPDATE users SET display_id = ? WHERE tg_id = ?`);
  for (const u of usersWithoutDisplay) {
    upd.run(next, u.tg_id);
    next++;
  }
}

// Migration for orders — track applied bonuses + receipt + display_id
const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
for (const [col, ddl] of [
  ['bonus_applied',  'INTEGER NOT NULL DEFAULT 0'],
  ['subtotal',       'INTEGER'],
  ['display_id',     'INTEGER'],
  ['delivery_time',  'TEXT'],
  ['bank',           'TEXT'],
  ['receipt_file_id','TEXT'],
  ['paid_confirmed', 'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!orderCols.includes(col)) {
    db.exec(`ALTER TABLE orders ADD COLUMN ${col} ${ddl}`);
  }
}

// Backfill order display_ids
const ordersWithoutDisplay = db.prepare(`
  SELECT id FROM orders WHERE display_id IS NULL ORDER BY id ASC
`).all();
if (ordersWithoutDisplay.length > 0) {
  const maxRow = db.prepare(`SELECT COALESCE(MAX(display_id), ?) AS m FROM orders`)
                   .get(ORDER_DISPLAY_ID_BASE - 1);
  let next = (maxRow.m || (ORDER_DISPLAY_ID_BASE - 1)) + 1;
  if (next < ORDER_DISPLAY_ID_BASE) next = ORDER_DISPLAY_ID_BASE;
  const upd = db.prepare(`UPDATE orders SET display_id = ? WHERE id = ?`);
  for (const o of ordersWithoutDisplay) {
    upd.run(next, o.id);
    next++;
  }
}

// Indices that depend on migrated columns
db.exec(`
  CREATE INDEX        IF NOT EXISTS idx_users_referrer    ON users(referrer_tg_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_id  ON users(display_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_id ON orders(display_id);
`);

// Insert/update user, allocating a sequential display_id on first insert.
const _insertUser = db.prepare(`
  INSERT INTO users (tg_id, username, first_name, display_id)
  VALUES (@tg_id, @username, @first_name, @display_id)
  ON CONFLICT(tg_id) DO UPDATE SET
    username   = excluded.username,
    first_name = excluded.first_name
`);
const _maxUserDisplay = db.prepare(`SELECT COALESCE(MAX(display_id), ?) AS m FROM users`);
export const upsertUser = {
  run({ tg_id, username, first_name }) {
    const tx = db.transaction(() => {
      const existing = db.prepare(`SELECT display_id FROM users WHERE tg_id = ?`).get(tg_id);
      const display_id = existing?.display_id
        ?? Math.max(USER_DISPLAY_ID_BASE, _maxUserDisplay.get(USER_DISPLAY_ID_BASE - 1).m + 1);
      _insertUser.run({ tg_id, username, first_name, display_id });
      return display_id;
    });
    return tx();
  },
};

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
  SELECT c.product_id, c.qty, p.name, p.brand, p.price, p.image, p.category
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

// Insert order with sequential display_id allocation
const _insertOrder = db.prepare(`
  INSERT INTO orders (tg_id, address, phone, comment, payment_method,
                      subtotal, bonus_applied, total, status, display_id,
                      delivery_time, bank)
  VALUES (@tg_id, @address, @phone, @comment, @payment_method,
          @subtotal, @bonus_applied, @total, 'new', @display_id,
          @delivery_time, @bank)
`);
const _maxOrderDisplay = db.prepare(`SELECT COALESCE(MAX(display_id), ?) AS m FROM orders`);
export const insertOrder = {
  run(params) {
    const tx = db.transaction(() => {
      const display_id = Math.max(
        ORDER_DISPLAY_ID_BASE,
        _maxOrderDisplay.get(ORDER_DISPLAY_ID_BASE - 1).m + 1,
      );
      const info = _insertOrder.run({
        delivery_time: null, bank: null,
        ...params,
        display_id,
      });
      return { lastInsertRowid: info.lastInsertRowid, display_id };
    });
    return tx();
  },
};

export const setOrderReceipt = db.prepare(`
  UPDATE orders SET receipt_file_id = ?, paid_confirmed = 1 WHERE id = ?
`);

/* ───── Reviews ───── */
export const insertReview = db.prepare(`
  INSERT INTO reviews (product_id, customer_bot_id, items_summary, rating, body, created_at)
  VALUES (@product_id, @customer_bot_id, @items_summary, @rating, @body, COALESCE(@created_at, datetime('now')))
`);
export const listReviewsForProduct = db.prepare(`
  SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC LIMIT 30
`);
export const reviewSummaryForProduct = db.prepare(`
  SELECT COUNT(*) AS total,
         AVG(rating) AS avg_rating,
         SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS r5,
         SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS r4,
         SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS r3,
         SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS r2,
         SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS r1
  FROM reviews WHERE product_id = ?
`);
export const countReviews = db.prepare(`SELECT COUNT(*) AS c FROM reviews`);
export const truncateReviews = db.prepare(`DELETE FROM reviews`);

/* ───── Customer logs ───── */
export const insertCustomerLog = db.prepare(`
  INSERT INTO customer_logs (tg_id, action, payload) VALUES (?, ?, ?)
`);
export const listCustomerLogs = db.prepare(`
  SELECT * FROM customer_logs WHERE tg_id = ? ORDER BY id DESC LIMIT 50
`);

/* ───── Admin settings ───── */
export const getAdminSetting = db.prepare(`SELECT value FROM admin_settings WHERE key = ?`);
export const setAdminSetting = db.prepare(`
  INSERT INTO admin_settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

/* ───── Users admin listing ───── */
export const listAllUsers = db.prepare(`
  SELECT u.tg_id, u.display_id, u.username, u.first_name, u.referrer_tg_id,
         u.bonus_balance, u.bonus_earned, u.bonus_spent, u.created_at,
         (SELECT COUNT(*) FROM orders o WHERE o.tg_id = u.tg_id) AS orders_count,
         (SELECT COALESCE(SUM(total), 0) FROM orders o
            WHERE o.tg_id = u.tg_id AND o.status NOT IN ('cancelled')) AS spent
  FROM users u ORDER BY u.display_id ASC
`);
export const getUserByDisplayId = db.prepare(`SELECT * FROM users WHERE display_id = ?`);

/* ───── Referral / bonus statements ───── */
export const setReferrerIfNull = db.prepare(`
  UPDATE users SET referrer_tg_id = @ref WHERE tg_id = @tg_id
    AND (referrer_tg_id IS NULL) AND (tg_id <> @ref)
`);
export const getReferrer = db.prepare(`
  SELECT referrer_tg_id FROM users WHERE tg_id = ?
`);
export const countReferrals = db.prepare(`
  SELECT COUNT(*) AS c FROM users WHERE referrer_tg_id = ?
`);
export const listReferrals = db.prepare(`
  SELECT tg_id, username, first_name, created_at
  FROM users WHERE referrer_tg_id = ? ORDER BY id DESC LIMIT 50
`);
export const getBonusInfo = db.prepare(`
  SELECT bonus_balance, bonus_earned, bonus_spent FROM users WHERE tg_id = ?
`);
export const addBonus = db.prepare(`
  UPDATE users
  SET bonus_balance = bonus_balance + ?,
      bonus_earned  = bonus_earned  + ?
  WHERE tg_id = ?
`);
export const spendBonus = db.prepare(`
  UPDATE users
  SET bonus_balance = bonus_balance - ?,
      bonus_spent   = bonus_spent   + ?
  WHERE tg_id = ? AND bonus_balance >= ?
`);
export const insertBonusLog = db.prepare(`
  INSERT INTO bonus_log (tg_id, delta, reason, order_id, other_tg_id)
  VALUES (@tg_id, @delta, @reason, @order_id, @other_tg_id)
`);
export const refCreditExistsForOrder = db.prepare(`
  SELECT 1 FROM bonus_log WHERE order_id = ? AND reason LIKE 'ref_credit_%'
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
