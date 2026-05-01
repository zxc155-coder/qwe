import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiUrl } from '../api.js';

const fmt = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;

function Stars({ n }) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span className="text-emerald-300 tracking-tight">
      {'★'.repeat(v)}<span className="text-ink-500">{'★'.repeat(5 - v)}</span>
    </span>
  );
}

export default function ProductCard({ product, isFavorite, onAdd, onFav }) {
  const discount =
    product.old_price ? Math.round((1 - product.price / product.old_price) * 100) : 0;
  const ratingNum = Number(product.rating || 0);

  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState(null); // { summary, items }
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch(apiUrl(`/api/products/${product.id}/reviews`))
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ summary: { total: 0 }, items: [] }))
      .finally(() => setLoading(false));
  }, [open, data, product.id]);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="card card-hover overflow-hidden flex flex-col group"
    >
      {/* typographic header — replaces image area, no marble, no watermark, no glyph */}
      <div className="relative px-5 pt-5 pb-4 flex flex-col justify-between min-h-[180px] sm:min-h-[220px]
                      bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900
                      border-b border-ink-100/10">
        <div className="flex items-start justify-between gap-3">
          <p className="label-mute text-[11px] sm:text-xs">{product.brand}</p>
          <div className="flex items-center gap-1 text-ink-300 text-xs tabular-nums">
            <span className="text-emerald-300">★</span>
            {ratingNum.toFixed(1)}
          </div>
        </div>

        <h3 className="font-display text-[22px] sm:text-3xl font-bold text-ink-100 leading-[1.05] tracking-tight mt-2">
          {product.name}
        </h3>

        <div className="mt-3 flex items-end justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-400">
            VIBE CLOUD
          </div>
          {discount > 0 && (
            <span className="px-2 py-1 text-[10px] uppercase tracking-widest font-semibold
                             bg-emerald-300 text-ink-900 rounded-sharp">
              −{discount}%
            </span>
          )}
        </div>

        {/* favorite button */}
        <button
          onClick={onFav}
          aria-label="избранное"
          className={`absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-sharp
                      border transition-colors z-10
                      ${isFavorite
                        ? 'bg-emerald-300 border-emerald-300 text-ink-900'
                        : 'bg-ink-900/60 border-ink-100/20 text-ink-200 hover:border-emerald-300/60'}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill={isFavorite ? 'currentColor' : 'none'}
               stroke="currentColor" strokeWidth="1.6">
            <path d="M12 17.27 5.82 21l1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19 .61-5.46 4.73L18.18 21z" />
          </svg>
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex flex-wrap gap-1.5 text-ink-300">
          {product.flavor   && <span className="chip">{product.flavor}</span>}
          {product.strength && <span className="chip">{product.strength}</span>}
          {product.volume   && <span className="chip">{product.volume}</span>}
          {product.puffs    && <span className="chip">{product.puffs}</span>}
        </div>

        <div className="mt-auto pt-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div className="leading-none">
            {product.old_price && (
              <div className="text-xs text-ink-400 line-through tabular-nums mb-1">
                {fmt(product.old_price)}
              </div>
            )}
            <div className="font-display text-xl sm:text-2xl font-bold text-ink-100 tabular-nums">
              {fmt(product.price)}
            </div>
          </div>
          <button onClick={onAdd} className="btn-primary text-sm w-full sm:w-auto">
            В&nbsp;корзину
          </button>
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          className="text-left text-xs text-ink-300 hover:text-emerald-300 transition-colors mt-1
                     border-t border-ink-100/10 pt-3 flex items-center justify-between"
        >
          <span className="label-mute">Отзывы</span>
          <span className="text-ink-300">{open ? 'свернуть ▲' : 'смотреть ▼'}</span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="reviews"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {loading && <p className="text-xs text-ink-400 py-2">Загружаем…</p>}
              {!loading && data && data.summary?.total ? (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Stars n={data.summary.avg_rating} />
                    <span className="text-ink-300 tabular-nums">
                      {Number(data.summary.avg_rating).toFixed(1)} · {data.summary.total} {data.summary.total === 1 ? 'отзыв' : 'отзывов'}
                    </span>
                  </div>
                  {data.items.slice(0, 3).map((r) => (
                    <div key={r.id} className="border-t border-ink-100/10 pt-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Stars n={r.rating} />
                        <span className="text-ink-400 font-mono">Бот ID #{r.customer_bot_id}</span>
                      </div>
                      <p className="text-ink-400 italic mb-1">Покупал: {r.items_summary}</p>
                      <p className="text-ink-200 leading-snug">{r.body}</p>
                    </div>
                  ))}
                </div>
              ) : (!loading && (
                <p className="text-xs text-ink-400 py-2">Отзывов пока нет.</p>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
