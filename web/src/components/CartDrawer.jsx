import React, { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiUrl } from '../api.js';

const fmt = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;

const PAYMENT = {
  number: '+7 (243) 456-78-78',
  holder: 'Альфа-Банк (СБП)',
  support: '@VibeCloudSupport',
};

function isValidTime(input) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(input.trim());
  if (!m) return false;
  return Number(m[1]) >= 12;
}

export default function CartDrawer({
  open, onClose, items, total, onChangeQty, onClear, onCheckout,
}) {
  // stages: cart → form → pay (with receipt upload) → done
  const [stage, setStage]   = useState('cart');
  const [form, setForm]     = useState({
    address: '', delivery_time: '', comment: '',
  });
  const [orderId, setOrder] = useState(null);
  const [displayId, setDisplay] = useState(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [payment, setPayment]   = useState(PAYMENT);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const reset = () => {
    setStage('cart');
    setOrder(null);
    setDisplay(null);
    setOrderTotal(0);
    setError('');
    setPayment(PAYMENT);
    setForm({ address: '', delivery_time: '', comment: '' });
  };
  const close = () => { onClose(); setTimeout(reset, 300); };

  async function gotoPay(e) {
    e.preventDefault();
    if (form.address.trim().length < 5) {
      setError('Введите адрес доставки.');
      return;
    }
    if (!isValidTime(form.delivery_time)) {
      setError('Время в формате ЧЧ:ММ, не раньше 12:00.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const data = await onCheckout({ ...form, bank: 'sbp' });
      setOrder(data.orderId);
      setDisplay(data.display_id ?? data.orderId);
      setOrderTotal(data.total ?? total);
      if (data.payment) setPayment({ ...PAYMENT, ...data.payment });
      setStage('pay');
    } catch {
      setError('Не удалось оформить заказ. Попробуйте ещё раз.');
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
            className="fixed inset-0 z-40 bg-black/70"
          />
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[440px] z-50
                       bg-ink-900 border-l border-ink-600/60 flex flex-col"
          >
            <header className="flex items-center justify-between px-5 py-4 border-b border-ink-600/60">
              <div>
                <p className="label-mute mb-1">VIBE CLOUD</p>
                <h2 className="font-display text-xl font-bold text-ink-100">
                  {stage === 'cart' && 'Корзина'}
                  {stage === 'form' && 'Доставка'}
                  {stage === 'pay'  && 'Оплата · СБП'}
                  {stage === 'done' && 'Готово'}
                </h2>
              </div>
              <button onClick={close} className="btn-icon" aria-label="Закрыть">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            {stage === 'cart' && (
              <CartStage
                items={items}
                total={total}
                onChangeQty={onChangeQty}
                onClear={onClear}
                onCheckout={() => setStage('form')}
              />
            )}

            {stage === 'form' && (
              <FormStage
                form={form}
                setForm={setForm}
                total={total}
                error={error}
                busy={busy}
                onBack={() => setStage('cart')}
                onSubmit={gotoPay}
              />
            )}

            {stage === 'pay' && (
              <PayStage
                orderId={orderId}
                displayId={displayId}
                total={orderTotal}
                payment={payment}
                onDone={() => setStage('done')}
              />
            )}

            {stage === 'done' && (
              <DoneStage displayId={displayId} payment={payment} onClose={close} />
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Cart stage ─── */

function CartStage({ items, total, onChangeQty, onClear, onCheckout }) {
  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {items.length === 0 && (
          <p className="text-ink-400 text-center mt-10">
            Корзина пуста.
          </p>
        )}
        {items.map((it) => (
          <motion.div
            key={it.product_id}
            layout
            className="card p-3 flex gap-3 items-center"
          >
            <div className="flex-1 min-w-0">
              <p className="label-mute mb-0.5">{it.brand}</p>
              <p className="text-ink-100 truncate text-sm">{it.name}</p>
              <p className="font-display font-bold text-ink-100 tabular-nums mt-1">
                {fmt(it.price * it.qty)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => onChangeQty(it.product_id, it.qty - 1)}
                      className="btn-icon w-8 h-8">−</button>
              <span className="w-7 text-center tabular-nums">{it.qty}</span>
              <button onClick={() => onChangeQty(it.product_id, it.qty + 1)}
                      className="btn-icon w-8 h-8">+</button>
            </div>
          </motion.div>
        ))}
      </div>

      <footer className="p-5 border-t border-ink-600/60 space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="label-mute">Итого</span>
          <span className="font-display text-2xl font-bold text-ink-100 tabular-nums">
            {fmt(total)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onClear}
            disabled={!items.length}
            className="btn-ghost disabled:opacity-40"
          >
            Очистить
          </button>
          <button
            onClick={onCheckout}
            disabled={!items.length}
            className="btn-primary disabled:opacity-40"
          >
            Оформить →
          </button>
        </div>
      </footer>
    </>
  );
}

/* ─── Form stage: address + time only ─── */

function FormStage({ form, setForm, total, error, busy, onBack, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <button type="button" onClick={onBack} className="chip">← назад в корзину</button>

        <div className="space-y-1.5">
          <label className="label-mute">Адрес доставки</label>
          <input
            required
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Город, улица, дом, квартира"
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <label className="label-mute">Время доставки (от 12:00)</label>
          <input
            required
            value={form.delivery_time}
            onChange={(e) => setForm({ ...form, delivery_time: e.target.value })}
            placeholder="14:30"
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <label className="label-mute">Комментарий (необязательно)</label>
          <textarea
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            rows={3}
            className="input resize-none"
          />
        </div>

        <p className="text-xs text-ink-400">
          Оплата через СБП на следующем шаге.
        </p>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      <footer className="p-5 border-t border-ink-600/60 space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="label-mute">К оплате</span>
          <span className="font-display text-2xl font-bold text-ink-100 tabular-nums">
            {fmt(total)}
          </span>
        </div>
        <button disabled={busy} className="btn-primary w-full disabled:opacity-50">
          {busy ? 'Создаём заказ…' : 'К оплате СБП →'}
        </button>
      </footer>
    </form>
  );
}

/* ─── Pay + Receipt upload stage ─── */

function PayStage({ orderId, displayId, total, payment, onDone }) {
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function pickFile() { fileRef.current?.click(); }

  function copyNumber() {
    navigator.clipboard?.writeText(payment.number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  async function send() {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('receipt', file);
      const r = await fetch(apiUrl(`/api/orders/${orderId}/receipt`), {
        method: 'POST',
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      onDone();
    } catch (e) {
      setError('Не удалось отправить чек. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <p className="label-mute">Заказ оформлен · #{displayId}</p>
        <h3 className="font-display text-xl font-bold text-ink-100">
          Переведи {fmt(total)} по СБП
        </h3>

        <div className="card p-4 space-y-3">
          <div>
            <p className="label-mute mb-1">Номер для перевода (СБП)</p>
            <p className="font-mono text-lg text-ink-100 tabular-nums select-all">
              {payment.number}
            </p>
          </div>
          <div>
            <p className="label-mute mb-1">Получатель</p>
            <p className="text-ink-100">{payment.holder}</p>
          </div>
          <button onClick={copyNumber} className="btn-ghost w-full text-sm">
            {copied ? 'Скопировано' : 'Скопировать номер'}
          </button>
        </div>

        <div className="space-y-2">
          <p className="label-mute">Прикрепи чек об оплате</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          {!file ? (
            <button onClick={pickFile} className="btn-ghost w-full py-4 border-dashed">
              Выбрать фото чека
            </button>
          ) : (
            <div className="card p-3 flex items-center justify-between gap-3">
              <p className="text-ink-100 text-sm truncate flex-1">{file.name}</p>
              <button onClick={pickFile} className="chip">Заменить</button>
            </div>
          )}
        </div>

        <p className="text-xs text-ink-400">
          Чек уйдёт администратору на проверку. После подтверждения мы свяжемся
          с тобой через бота или поддержку{' '}
          <span className="text-emerald-300">{payment.support}</span>.
        </p>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      <footer className="p-5 border-t border-ink-600/60 space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="label-mute">К оплате</span>
          <span className="font-display text-2xl font-bold text-ink-100 tabular-nums">
            {fmt(total)}
          </span>
        </div>
        <button
          onClick={send}
          disabled={!file || busy}
          className="btn-primary w-full disabled:opacity-40"
        >
          {busy ? 'Отправляем…' : 'Отправить чек админу'}
        </button>
      </footer>
    </div>
  );
}

/* ─── Done stage ─── */

function DoneStage({ displayId, payment, onClose }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-5">
      <div className="w-14 h-14 rounded-full border-2 border-emerald-300 flex items-center justify-center">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#7CC295" strokeWidth="2.4">
          <path d="M5 12l4 4 10-10" />
        </svg>
      </div>
      <div>
        <p className="label-mute mb-2">Заказ #{displayId}</p>
        <h3 className="font-display text-2xl font-bold text-ink-100">Чек ушёл админу</h3>
      </div>
      <p className="text-ink-300 max-w-xs">
        Подтвердим оплату и выйдем на связь. Если что — пиши в поддержку.
      </p>
      <p className="text-ink-300 text-sm">
        Поддержка: <span className="text-emerald-300 font-semibold">{payment?.support || '@VibeCloudSupport'}</span>
      </p>
      <button onClick={onClose} className="btn-ghost">Закрыть</button>
    </div>
  );
}
