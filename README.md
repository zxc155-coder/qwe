# ☁️ VIBE CLOUD

Премиум вейпшоп: **Telegram-бот** (Node.js + Telegraf) **+ красивый Web App** (React/Vite + TailwindCSS + Framer Motion). Все основные функции работают **без Web App** — только кнопками в Telegram. Web App — это бонус-витрина с премиум-дизайном.

---

## 🚀 Быстрый старт (3 команды)

```bash
# 1. установить зависимости (root + web)
npm run install:all

# 2. скопировать пример конфига и вписать токен
cp .env.example .env
$EDITOR .env       # BOT_TOKEN=… , ADMIN_ID=8417505079

# 3. засеять БД и запустить бота
npm run seed
npm run bot
```

В отдельной вкладке (опционально, для Web App):

```bash
npm run web
```

---

## 🔐 .env

```dotenv
BOT_TOKEN=...                # из @BotFather
ADMIN_ID=8417505079          # тот, у кого появится /admin
WEB_APP_URL=                 # URL после ngrok / cloudflared
API_PORT=3001
DB_PATH=./db/vibe_cloud.sqlite
```

---

## 🧩 Что умеет бот (всё кнопками)

* `/start` → подтверждение возраста (18+) → главное меню
* 🛒 **Каталог** по 4 категориям (одноразки / жидкости / поды / аксессуары) с пагинацией
* Карточка товара (`📦 VIBE CLOUD рекомендует`) с фото, описанием и звёздами
* ➕ Добавление в корзину, ⭐ избранное
* 🛒 **Корзина**: изменение количества, очистка, оформление
* ✅ Оформление: адрес → телефон → комментарий (или `/skip`) → подтверждение
* 📋 **История заказов** со статусами
* `/admin` — только для пользователя с `ADMIN_ID` из `.env` (по умолчанию **8417505079**):
  новые заказы, подтвердить / отправить / отменить, статистика
* `/shop` или кнопка «🌐 Открыть Web App» — премиум витрина

---

## 🌐 Web App

* Vite + React 18 + TailwindCSS + Framer Motion
* Тёмный градиент `#0B0A1A → #1A0B2E`, акценты `#C084FC` / `#A855F7`
* Стеклянные карточки (`backdrop-blur`), пузырьки пара, glitch-логотип
* Поиск, фильтр по категориям и крепости, infinite scroll
* Корзина-drawer справа, оформление заказа в три шага
* Корзина и заказы синхронизированы с ботом через REST API (Express, порт `3001`)
* На карточках — изображения с picsum.photos (можно заменить на свои/AI-арт)

### Публикация Web App в Telegram

```bash
# 1. поднять туннель к localhost:5173
ngrok http 5173            # или: cloudflared tunnel --url http://localhost:5173

# 2. вписать выданный https-URL в .env как WEB_APP_URL и перезапустить бот
# 3. в @BotFather: /mybots → <bot> → Bot Settings → Menu Button → Configure menu button
#    URL: тот же WEB_APP_URL, текст: "VIBE CLOUD"
```

После этого:

* в Telegram у бота появится синяя кнопка меню «VIBE CLOUD»
* команда `/shop` пришлёт inline-кнопку Web App
* в самом Web App работают: каталог, поиск/фильтры, корзина, оформление заказа (создаёт настоящую запись в SQLite + уведомляет админа)

---

## 🗄 Структура проекта

```
vibe-cloud/
├── bot/index.js              # Telegraf-бот (всё меню, корзина, заказы, /admin)
├── api/server.js             # Express REST API для Web App
├── db/
│   ├── database.js           # SQLite + prepared statements
│   └── seedProducts.js       # генерация 50 товаров (15 / 20 / 10 / 5)
├── web/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css
│       └── components/
│           ├── ProductCard.jsx
│           └── CartDrawer.jsx
├── .env.example
├── package.json
└── README.md
```

---

## 🧪 Скрипты

| Команда                  | Что делает                                                |
| ------------------------ | --------------------------------------------------------- |
| `npm run install:all`    | установить deps в корне и `web/`                          |
| `npm run seed`           | заполнить SQLite 50 товарами VIBE CLOUD                   |
| `npm run bot`            | запустить Telegram-бот + REST API                         |
| `npm run web`            | дев-сервер Vite (`http://localhost:5173`)                 |
| `npm run web:build`      | прод-сборка Web App в `web/dist`                          |
| `npm run web:preview`    | предпросмотр прод-сборки                                  |

---

## ⚠️ Безопасность токена

Если токен бота когда-либо был отправлен в открытом сообщении (чате, скриншоте, документе), **немедленно отзовите его** в [@BotFather](https://t.me/BotFather): `/revoke` → выбрать бота → получить новый токен и положить в `.env` (никогда не коммитить).

---

## 📜 Возрастное предупреждение

VIBE CLOUD — продукт строго **18+**. Никотин вызывает зависимость. Возрастное подтверждение встроено в бота (первый шаг `/start`).
