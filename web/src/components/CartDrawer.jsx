import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const fmt = (n) => `${Number(n).toLocaleString('ru-RU')}₽`;

export default function CartDrawer({
  open, onClose, items, total, onChangeQty, onClear, onCheckout,
}) {
  const [stage, setStage]   = useState('cart'); // cart | form | done
  const [form, setForm]     = useState({ address: '', phone: '', comment: '' });
  const [orderId, setOrder] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const reset = () => { setStage('cart'); setOrder(null); setError(''); setForm({ address: '', phone: '', comment: '' }); };
  const close = () => { onClose(); setTimeout(reset, 300); };

  async function submit(e) {
    e.preventDefault();
    if (!form.address.trim() || !form.phone.trim()) {
      setError('Заполни адрес и телефон.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const data = await onCheckout(form);
      setOrder(data.orderId);
      setStage('done');
    } catch {
      setError('Не удалось оформить заказ. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="ovr"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] z-50 bg-vibe-bg1/90 backdrop-blur-xl border-l border-white/10 flex flex-col"
          >
            <header className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="font-display text-2xl neon-text">🛒 Корзина</h2>
              <button onClick={close} className="text-white/70 hover:text-white text-xl">✕</button>
            </header>

            {stage === 'cart' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {items.length === 0 && (
                    <p className="text-white/60 text-center mt-10">Корзина пуста 🫧</p>
                  )}
                  {items.map((it) => (
                    <motion.div
                      key={it.product_id}
                      layout
                      className="glass p-3 flex gap-3 items-center"
                    >
                      <img src={it.image} alt={it.name} className="w-16 h-16 rounded-xl object-cover"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/50 uppercase tracking-widest">{it.brand}</p>
                        <p className="truncate">{it.name}</p>
                        <p className="price-glow font-bold">{fmt(it.price * it.qty)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onChangeQty(it.product_id, it.qty - 1)} className="chip">−</button>
                        <span className="w-6 text-center">{it.qty}</span>
                        <button onClick={() => onChangeQty(it.product_id, it.qty + 1)} className="chip">+</button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <footer className="p-5 border-t border-white/10 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Итого</span>
                    <span className="text-2xl font-bold price-glow">{fmt(total)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={onClear} disabled={!items.length} className="chip flex-1 disabled:opacity-40">🗑 Очистить</button>
                    <button
                      disabled={!items.length}
                      onClick={() => setStage('form')}
                      className="neon-btn flex-1 disabled:opacity-40"
                    >
                      ✅ Оформить
                    </button>
                  </div>
                </footer>
              </>
            )}

            {stage === 'form' && (
              <form onSubmit={submit} className="flex-1 flex flex-col p-5 gap-3 overflow-y-auto">
                <button type="button" onClick={() => setStage('cart')} className="chip self-start">⬅ назад</button>
                <h3 className="font-display text-xl">Доставка VIBE CLOUD</h3>

                <label className="text-sm text-white/60">📍 Адрес доставки</label>
                <input
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Город, улица, дом, кв"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-vibe-accent"
                />

                <label className="text-sm text-white/60">📞 Телефон</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+7XXXXXXXXXX"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-vibe-accent"
                />

                <label className="text-sm text-white/60">📝 Комментарий (необязательно)</label>
                <textarea
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  rows={3}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-vibe-accent resize-none"
                />

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="mt-auto flex justify-between items-center pt-3">
                  <span className="text-white/60">Сумма</span>
                  <span className="text-2xl font-bold price-glow">{fmt(total)}</span>
                </div>
                <button disabled={busy} className="neon-btn">
                  {busy ? 'Оформляем…' : '✅ Подтвердить заказ'}
                </button>
              </form>
            )}

            {stage === 'done' && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                <div className="text-6xl animate-floaty">💨</div>
                <h3 className="font-display text-2xl neon-text">
                  Заказ #{orderId} оформлен!
                </h3>
                <p className="text-white/70">
                  Мы свяжемся с тобой в Telegram. Спасибо, что выбрал VIBE CLOUD ☁️
                </p>
                <button onClick={close} className="neon-btn">Закрыть</button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
