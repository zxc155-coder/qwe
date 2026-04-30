import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProductCard from './components/ProductCard.jsx';
import CartDrawer from './components/CartDrawer.jsx';

const CATEGORIES = [
  { key: 'all',        label: 'Все' },
  { key: 'disposable', label: '💨 Одноразки' },
  { key: 'liquid',     label: '🧪 Жидкости' },
  { key: 'pod',        label: '🔋 POD-системы' },
  { key: 'accessory',  label: '🧰 Аксессуары' },
];

const STRENGTHS = ['все', '0mg', '3mg', '6mg', '12mg', '20mg', '50mg'];
const PAGE_SIZE = 12;

function getTgUserId() {
  try {
    const tg = window?.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) return tg.initDataUnsafe.user.id;
  } catch {}
  // dev fallback so the app works in plain browser
  return 0;
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart]         = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [query, setQuery]       = useState('');
  const [category, setCategory] = useState('all');
  const [strength, setStrength] = useState('все');
  const [visible, setVisible]   = useState(PAGE_SIZE);
  const [drawerOpen, setDrawer] = useState(false);
  const [loading, setLoading]   = useState(true);

  const tgId = useMemo(() => getTgUserId(), []);

  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    try { tg?.ready(); tg?.expand(); } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, c, f] = await Promise.all([
          fetch('/api/products').then((r) => r.json()),
          fetch(`/api/cart/${tgId}`).then((r) => r.json()),
          fetch(`/api/favorites/${tgId}`).then((r) => r.json()),
        ]);
        if (!alive) return;
        setProducts(p);
        setCart(c);
        setFavorites(f.map((x) => x.id));
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tgId]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (strength !== 'все' && p.strength !== strength) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.brand.toLowerCase().includes(q) &&
          !(p.flavor || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [products, category, strength, query]);

  useEffect(() => { setVisible(PAGE_SIZE); }, [category, strength, query]);

  // infinite scroll
  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
        setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [filtered.length]);

  async function addToCart(productId) {
    const res = await fetch(`/api/cart/${tgId}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    });
    setCart(await res.json());
    setDrawer(true);
  }

  async function changeQty(productId, qty) {
    const res = await fetch(`/api/cart/${tgId}/qty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, qty }),
    });
    setCart(await res.json());
  }

  async function clearCart() {
    const res = await fetch(`/api/cart/${tgId}/clear`, { method: 'POST' });
    setCart(await res.json());
  }

  async function toggleFavorite(p) {
    const on = !favorites.includes(p.id);
    const res = await fetch(`/api/favorites/${tgId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: p.id, on }),
    });
    const list = await res.json();
    setFavorites(list.map((x) => x.id));
  }

  async function checkout(form) {
    const res = await fetch(`/api/orders/${tgId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) throw new Error('order failed');
    const data = await res.json();
    setCart([]);
    return data;
  }

  const cartCount = cart.reduce((s, it) => s + it.qty, 0);
  const totalSum  = cart.reduce((s, it) => s + it.price * it.qty, 0);

  return (
    <div className="relative min-h-screen z-10">
      {/* floating bubbles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="bubble"
            style={{
              left: `${(i * 73) % 100}%`,
              animationDelay: `${(i * 0.6) % 5}s`,
              transform: `scale(${0.6 + ((i * 17) % 10) / 10})`,
            }}
          />
        ))}
      </div>

      <Header
        cartCount={cartCount}
        onOpenCart={() => setDrawer(true)}
      />

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-24 pt-6">
        <Hero />

        <div className="glass p-4 mt-8 flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔎 Поиск: бренд, вкус, название…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-vibe-accent placeholder-white/40"
          />
          <div className="flex gap-2 flex-wrap">
            {STRENGTHS.map((s) => (
              <button
                key={s}
                onClick={() => setStrength(s)}
                className={`chip ${strength === s ? 'chip-active' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`chip ${category === c.key ? 'chip-active' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <Skeleton />
        ) : (
          <motion.div
            layout
            className="mt-8 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <AnimatePresence>
              {filtered.slice(0, visible).map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isFavorite={favorites.includes(p.id)}
                  onAdd={() => addToCart(p.id)}
                  onFav={() => toggleFavorite(p)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-center text-white/60 mt-16">
            Ничего не нашлось. Попробуй другие фильтры 🫧
          </p>
        )}
      </main>

      <CartDrawer
        open={drawerOpen}
        onClose={() => setDrawer(false)}
        items={cart}
        total={totalSum}
        onChangeQty={changeQty}
        onClear={clearCart}
        onCheckout={checkout}
      />

      <Footer />
    </div>
  );
}

function Header({ cartCount, onOpenCart }) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-vibe-bg0/60 border-b border-white/10">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <span className="text-2xl animate-floaty">💨</span>
          <span className="font-display text-2xl tracking-widest neon-text animate-glitch">
            VIBE&nbsp;CLOUD
          </span>
        </motion.div>

        <button onClick={onOpenCart} className="relative neon-btn">
          🛒 Корзина
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-vibe-accent2 text-white text-xs font-bold rounded-full w-6 h-6 grid place-items-center shadow-glow">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass p-8 md:p-12 mt-2 relative overflow-hidden"
    >
      <div className="absolute inset-0 -z-10 opacity-50"
           style={{ background: 'radial-gradient(600px 200px at 70% 0%, rgba(192,132,252,0.35), transparent 60%)' }}/>
      <h1 className="font-display text-4xl md:text-6xl tracking-wider neon-text">
        Премиум вейпшоп <span className="text-vibe-accent">в облаке</span>
      </h1>
      <p className="mt-3 text-white/70 max-w-2xl">
        ~50 позиций: одноразки, жидкости, поды и аксессуары. Доставка по городу,
        синхронизация корзины с Telegram-ботом, оплата при получении.
      </p>
      <p className="mt-6 text-xs text-white/40 uppercase tracking-[0.3em]">
        18+ • никотин вызывает зависимость
      </p>
    </motion.section>
  );
}

function Skeleton() {
  return (
    <div className="mt-8 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="glass h-80 animate-pulse"/>
      ))}
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative mt-12 border-t border-white/10 py-8 text-center text-white/50 text-sm">
      © {new Date().getFullYear()} VIBE CLOUD — премиум вейпшоп. 18+
    </footer>
  );
}
