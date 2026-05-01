import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProductCard from './components/ProductCard.jsx';
import CartDrawer  from './components/CartDrawer.jsx';
import { apiUrl } from './api.js';

const VAPE_CATEGORIES = [
  { key: 'all',        label: 'Все' },
  { key: 'disposable', label: 'Одноразки' },
  { key: 'liquid',     label: 'Жидкости' },
  { key: 'pod',        label: 'POD-системы' },
  { key: 'accessory',  label: 'Аксессуары' },
];

const SNUS_CATEGORIES = [
  { key: 'all', label: 'Все' },
];

const STRENGTHS = ['все', '0mg', '3mg', '6mg', '12mg', '20mg', '50mg'];
const SNUS_STRENGTHS = ['все', '6mg', '9mg', '20mg', '50mg', '70mg', '100mg'];
const PAGE_SIZE = 12;

function getTgUserId() {
  try {
    const tg = window?.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) return tg.initDataUnsafe.user.id;
  } catch {}
  return 0; // dev fallback
}

const fmt = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;

export default function App() {
  const [mode,      setMode]      = useState('landing'); // 'landing' | 'vapes' | 'snus'
  const [products,  setProducts]  = useState([]);
  const [cart,      setCart]      = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [query,     setQuery]     = useState('');
  const [category,  setCategory]  = useState('all');
  const [strength,  setStrength]  = useState('все');
  const [visible,   setVisible]   = useState(PAGE_SIZE);
  const [drawerOpen, setDrawer]   = useState(false);
  const [loading,   setLoading]   = useState(true);

  const tgId = useMemo(() => getTgUserId(), []);

  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    try {
      tg?.ready();
      tg?.expand();
      tg?.setHeaderColor?.('#0A0A0B');
      tg?.setBackgroundColor?.('#0A0A0B');
    } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, c, f] = await Promise.all([
          fetch(apiUrl('/api/products')).then((r) => r.json()),
          fetch(apiUrl(`/api/cart/${tgId}`)).then((r) => r.json()),
          fetch(apiUrl(`/api/favorites/${tgId}`)).then((r) => r.json()),
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

  const isVapeCat = (c) => c !== 'snus';

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (mode === 'snus' && p.category !== 'snus') return false;
      if (mode === 'vapes' && !isVapeCat(p.category)) return false;
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
  }, [products, mode, category, strength, query]);

  useEffect(() => { setVisible(PAGE_SIZE); }, [mode, category, strength, query]);

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
    const res = await fetch(apiUrl(`/api/cart/${tgId}/add`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    });
    setCart(await res.json());
  }

  async function changeQty(productId, qty) {
    const res = await fetch(apiUrl(`/api/cart/${tgId}/qty`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, qty }),
    });
    setCart(await res.json());
  }

  async function clearCart() {
    const res = await fetch(apiUrl(`/api/cart/${tgId}/clear`), { method: 'POST' });
    setCart(await res.json());
  }

  async function toggleFavorite(p) {
    const on = !favorites.includes(p.id);
    const res = await fetch(apiUrl(`/api/favorites/${tgId}/toggle`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: p.id, on }),
    });
    const list = await res.json();
    setFavorites(list.map((x) => x.id));
  }

  async function checkout(form) {
    const res = await fetch(apiUrl(`/api/orders/${tgId}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) throw new Error('order failed');
    const data = await res.json();
    setCart([]);
    return data;
  }

  function goCategory(target) {
    setMode(target);
    setCategory('all');
    setStrength('все');
    setQuery('');
  }

  const cartCount = cart.reduce((s, it) => s + it.qty, 0);
  const totalSum  = cart.reduce((s, it) => s + it.price * it.qty, 0);

  const cats       = mode === 'snus' ? SNUS_CATEGORIES : VAPE_CATEGORIES;
  const strengths  = mode === 'snus' ? SNUS_STRENGTHS  : STRENGTHS;
  const sectionTitle = mode === 'snus' ? 'Снюс' : 'Вейпы';

  return (
    <div className="relative min-h-screen z-10 pb-32 md:pb-10">
      <Header
        mode={mode}
        cartCount={cartCount}
        onOpenCart={() => setDrawer(true)}
        onHome={() => setMode('landing')}
      />

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 md:pt-8">
        {mode === 'landing' ? (
          <Landing onPick={goCategory} />
        ) : (
          <>
            <SectionHero title={sectionTitle} mode={mode} />

            <Toolbar
              query={query} setQuery={setQuery}
              strength={strength} setStrength={setStrength}
              strengths={strengths}
              category={category} setCategory={setCategory}
              cats={cats}
            />

            {loading ? (
              <Skeleton />
            ) : (
              <motion.div
                layout
                className="mt-6 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
              <p className="text-center text-ink-400 mt-16">
                Ничего не нашлось — попробуйте другие фильтры.
              </p>
            )}
          </>
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

      {/* sticky bottom cart bar (mobile-first) */}
      {cartCount > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          className="fixed bottom-3 left-3 right-3 md:left-auto md:right-6 md:bottom-6
                     md:max-w-md z-30
                     bg-ink-850/95 backdrop-blur-md border border-gold/40 rounded-sharp
                     shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
        >
          <button
            onClick={() => setDrawer(true)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center min-w-[36px] h-[36px]
                               px-2 rounded-sharp bg-gold text-ink-900 font-bold tabular-nums">
                {cartCount}
              </span>
              <div>
                <div className="text-xs text-ink-400 uppercase tracking-widest">Корзина</div>
                <div className="font-display text-base font-semibold tabular-nums">{fmt(totalSum)}</div>
              </div>
            </div>
            <span className="text-gold font-medium">Открыть →</span>
          </button>
        </motion.div>
      )}

      <Footer />
    </div>
  );
}

/* ─── Header ─── */

function Header({ mode, cartCount, onOpenCart, onHome }) {
  return (
    <header className="sticky top-0 z-30 bg-ink-900/95 backdrop-blur-sm border-b border-ink-600/60">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3 md:py-4">
        <button onClick={onHome} className="flex items-center gap-2 group">
          <span className="font-display text-lg sm:text-xl font-bold text-gold tracking-[0.32em]">
            VIBE
          </span>
          <span className="font-display text-lg sm:text-xl font-bold text-ink-100 tracking-[0.32em]">
            CLOUD
          </span>
        </button>

        <div className="flex items-center gap-2">
          {mode !== 'landing' && (
            <button onClick={onHome} className="btn-ghost text-xs sm:text-sm px-3 sm:px-4 py-2">
              ← Меню
            </button>
          )}
          <button onClick={onOpenCart} className="btn-ghost relative text-xs sm:text-sm px-3 sm:px-4 py-2">
            Корзина
            {cartCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center
                               min-w-[20px] h-[20px] px-1.5 rounded-full
                               bg-gold text-ink-900 text-xs font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─── Landing screen with two big tiles ─── */

function Landing({ onPick }) {
  const tiles = [
    {
      key: 'vapes',
      title: 'ВЕЙПЫ',
      sub: 'Одноразки · жидкости · POD-системы · аксессуары',
    },
    {
      key: 'snus',
      title: 'СНЮС',
      sub: 'Никотиновые подушечки без табака',
    },
  ];

  return (
    <section className="pt-2 md:pt-6">
      <p className="label-mute mb-3">Премиум вейпшоп · доставка по городу</p>
      <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-bold text-ink-100
                     leading-[1.05] tracking-tight max-w-3xl">
        Что сегодня <span className="text-emerald-300">в ассортименте?</span>
      </h1>
      <p className="mt-4 text-ink-300 text-sm sm:text-base max-w-xl leading-relaxed">
        Выбирай раздел — каталог откроется с фильтрами. Корзина одна на оба раздела.
      </p>

      <div className="mt-8 md:mt-12 grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2">
        {tiles.map((t) => (
          <motion.button
            key={t.key}
            whileTap={{ scale: 0.985 }}
            onClick={() => onPick(t.key)}
            className="tile group text-left"
          >
            <div className="relative aspect-[16/10] sm:aspect-[4/3] overflow-hidden
                            bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900
                            border-b border-ink-100/10
                            flex flex-col justify-between px-6 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-400">
                VIBE CLOUD · {t.key === 'snus' ? 'snus' : 'vape'}
              </p>
              <h3 className="font-display text-[44px] sm:text-[64px] md:text-[80px] font-extrabold
                             text-ink-100 leading-none tracking-tight">
                {t.title}
              </h3>
              <span className="self-end text-emerald-300 font-semibold text-sm">Открыть →</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4">
              <div>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-ink-100 tracking-tight">
                  {t.title}
                </h3>
                <p className="text-xs sm:text-sm text-ink-400 mt-1">{t.sub}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <p className="mt-10 label-mute">18+ · никотин вызывает зависимость</p>
    </section>
  );
}

/* ─── Section hero (above category list) ─── */

function SectionHero({ title, mode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="border-b border-ink-600/60 pb-5"
    >
      <p className="label-mute">{mode === 'snus' ? 'Никотиновые подушечки' : 'Электронные системы'}</p>
      <h1 className="font-display text-3xl sm:text-5xl font-bold text-ink-100 leading-tight tracking-tight">
        {title}
        <span className="text-gold">.</span>
      </h1>
    </motion.div>
  );
}

/* ─── Toolbar ─── */

function Toolbar({ query, setQuery, strength, setStrength, strengths, category, setCategory, cats }) {
  return (
    <>
      <div className="card mt-5 p-2.5 sm:p-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 select-none">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: бренд, вкус, название"
            className="input pl-9 py-2.5 sm:py-3"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {strengths.map((s) => (
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

      {cats.length > 1 && (
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {cats.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`chip ${category === c.key ? 'chip-active' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Skeleton ─── */

function Skeleton() {
  return (
    <div className="mt-6 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card aspect-[3/5] animate-pulse"/>
      ))}
    </div>
  );
}

/* ─── Footer ─── */

function Footer() {
  return (
    <footer className="relative border-t border-ink-600/60 py-8 mt-10 text-center text-ink-400 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        VIBE CLOUD · @VibeCloudRuBot · 18+
      </div>
    </footer>
  );
}
