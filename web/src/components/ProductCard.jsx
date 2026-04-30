import React from 'react';
import { motion } from 'framer-motion';

const fmt = (n) => `${Number(n).toLocaleString('ru-RU')}₽`;

export default function ProductCard({ product, isFavorite, onAdd, onFav }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -6, rotateX: 2, rotateY: -2 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className="glass overflow-hidden flex flex-col group hover:shadow-glowStrong transition-shadow"
    >
      <div className="relative aspect-square overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <button
          onClick={onFav}
          aria-label="избранное"
          className={`absolute top-3 right-3 grid place-items-center w-9 h-9 rounded-full backdrop-blur-md border border-white/20
                      ${isFavorite ? 'bg-vibe-accent/40 text-white shadow-glow' : 'bg-black/30 text-white/80 hover:bg-black/50'}`}
        >
          {isFavorite ? '⭐' : '☆'}
        </button>
        {product.old_price && (
          <span className="absolute top-3 left-3 chip chip-active text-[10px] uppercase tracking-widest">
            -{Math.round((1 - product.price / product.old_price) * 100)}%
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/50">{product.brand}</p>
            <h3 className="font-display text-lg leading-tight">{product.name}</h3>
          </div>
          <div className="text-xs text-white/60 shrink-0">⭐ {product.rating}</div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {product.flavor && <span className="chip">🍃 {product.flavor}</span>}
          {product.strength && <span className="chip">💨 {product.strength}</span>}
          {product.volume && <span className="chip">🧪 {product.volume}</span>}
          {product.puffs && <span className="chip">🔥 {product.puffs}</span>}
        </div>

        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            {product.old_price && (
              <span className="text-xs text-white/40 line-through mr-2">
                {fmt(product.old_price)}
              </span>
            )}
            <span className="text-2xl font-bold price-glow">{fmt(product.price)}</span>
          </div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onAdd}
            className="neon-btn"
          >
            + в корзину
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}
