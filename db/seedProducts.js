import db from './database.js';

/* ─── Curated product imagery (Unsplash, free license, product-only — no people) ─── */
const U  = (id) => `https://images.unsplash.com/${id}?w=900&h=900&fit=crop&q=80&auto=format`;
const UP = (id) => `https://plus.unsplash.com/${id}?w=900&h=900&fit=crop&q=80&auto=format`;

// Disposable / pen-style vapes — product shots only
const DISP_IMAGES = [
  U('photo-1741771308130-84e25ffefc8b'), // pink disposable on concrete
  U('photo-1606333545291-c1ff7fa91d31'), // STLTH disposable
  U('photo-1530745342582-0795f23ec976'), // vape devices display
  U('photo-1623071280399-238e1f181fa6'), // black tube vape on white
  U('photo-1579165466814-e646cfa4a3be'), // vape devices in display rack
];

// E-liquid bottles
const LIQ_IMAGES = [
  U('photo-1715613814310-495d5f4256a2'), // pod + e-liquid bottle
  U('photo-1553289469-615ef4cde485'),   // e-juice bottle on grey
  U('photo-1519416985016-549fe88e380d'), // naked vape juice bottle
  U('photo-1676914880511-11858c619845'), // e-liquid + device
  U('photo-1618589036063-e78447db6936'), // colourful liquid bottles
  U('photo-1749244217993-5ed475589068'), // bottle on neon
];

// Pods / mods / devices
const POD_IMAGES = [
  U('photo-1715613814310-495d5f4256a2'), // pod kit
  U('photo-1563330107-2be055371737'),    // black mod
  U('photo-1623071280399-238e1f181fa6'), // tube vape
  U('photo-1579165466814-e646cfa4a3be'), // device display
];

// Accessories — coils / batteries / chargers (recycle product shots)
const ACC_IMAGES = [
  U('photo-1530745342582-0795f23ec976'),
  U('photo-1563330107-2be055371737'),
  U('photo-1579165466814-e646cfa4a3be'),
];

// Snus / nicotine pouches — pure product shots
const SNUS_IMAGES = [
  U('photo-1680429528539-19e0b9762a9d'),                   // ZYN tin in snow
  UP('premium_photo-1741708871689-b5b5936a55ec'),          // pouches in tin
  UP('premium_photo-1741708875611-30f6111b4156'),          // pouches in container
];

const FLAVORS = [
  'Арбуз-лед', 'Манго-маракуйя', 'Клубника-банан', 'Виноградный сок',
  'Колотый лед', 'Энергетик', 'Бабл-гам', 'Лимон-лайм', 'Ананас-кокос',
  'Персик', 'Черная смородина', 'Табак классик', 'Мятный джеле',
  'Голубика-черника', 'Мятная свежесть', 'Дыня-холод', 'Кола-вишня',
  'Тропический микс', 'Яблоко-гранат', 'Ежевика-мята',
];

const STRENGTHS_DISP = ['20mg', '50mg'];
// Standard freebase liquids (low/no-nic); strong saltnic liquids handled separately
const STRENGTHS_LIQ      = ['0mg', '3mg', '6mg', '12mg', '20mg'];
const STRENGTHS_SALTNIC  = ['20mg', '30mg', '40mg', '50mg', '60mg'];

const DISP_MODELS = [
  { brand: 'HQD',       name: 'Cuvie Plus 1200',  puffs: 1200, battery: '650mAh' },
  { brand: 'HQD',       name: 'Super Pro 5000',   puffs: 5000, battery: '950mAh' },
  { brand: 'Elf Bar',   name: 'BC5000',           puffs: 5000, battery: '850mAh' },
  { brand: 'Elf Bar',   name: 'Lowit 7000',       puffs: 7000, battery: '1000mAh' },
  { brand: 'Lost Mary', name: 'OS5000',           puffs: 5000, battery: '900mAh' },
  { brand: 'Lost Mary', name: 'BM6000',           puffs: 6000, battery: '950mAh' },
  { brand: 'Bang',      name: 'King 8000',        puffs: 8000, battery: '1100mAh' },
  { brand: 'Bang',      name: 'XXL 2000',         puffs: 2000, battery: '700mAh' },
  { brand: 'Alibarbar', name: 'Akso 2500',        puffs: 2500, battery: '750mAh' },
  { brand: 'OXVA',      name: 'Vivi Bar 4500',    puffs: 4500, battery: '850mAh' },
  { brand: 'Pacho',     name: 'Mini 1500',        puffs: 1500, battery: '600mAh' },
  { brand: 'Salt',      name: 'Switch 6000',      puffs: 6000, battery: '950mAh' },
  { brand: 'Lost Mary', name: 'Dare 5000',        puffs: 5000, battery: '900mAh' },
  { brand: 'Elf Bar',   name: 'Pi9000',           puffs: 9000, battery: '1100mAh' },
  { brand: 'HQD',       name: 'Glaze 8000',       puffs: 8000, battery: '1050mAh' },
];

const LIQUID_BRANDS  = ['Nasty', 'Dead Rabbit', 'Bad Drip', 'Pacho', 'Salt', 'Husky', 'Jam Monster', 'Maxwells'];
const LIQUID_VOLUMES = ['30ml', '60ml', '100ml', '120ml'];

const POD_MODELS = [
  { brand: 'VooPoo',    name: 'Argus P1' },
  { brand: 'VooPoo',    name: 'Drag X2' },
  { brand: 'SMOK',      name: 'Novo 5' },
  { brand: 'SMOK',      name: 'Nord 50W' },
  { brand: 'GeekVape',  name: 'Wenax K2' },
  { brand: 'GeekVape',  name: 'Aegis Boost 3' },
  // Vaporesso XROS — полная линейка
  { brand: 'Vaporesso', name: 'XROS 3' },
  { brand: 'Vaporesso', name: 'XROS 3 Mini' },
  { brand: 'Vaporesso', name: 'XROS 3 Nano' },
  { brand: 'Vaporesso', name: 'XROS 4' },
  { brand: 'Vaporesso', name: 'XROS 4 Mini' },
  { brand: 'Vaporesso', name: 'XROS Pro' },
  { brand: 'Vaporesso', name: 'Luxe X Pro' },
  { brand: 'OXVA',      name: 'Xlim Pro' },
  { brand: 'OXVA',      name: 'Oneo' },
];

const ACCESSORIES = [
  { brand: 'Wotofo',    name: 'Сменные испарители 0.4 Ом (5 шт)', desc: 'Mesh-катушки для прямой парогенерации.' },
  { brand: 'GeekVape',  name: 'Аккумулятор 18650 3000 mAh',        desc: 'Высокотоковый аккумулятор для боксмодов.' },
  { brand: 'Vaporesso', name: 'Зарядное устройство Type-C',         desc: 'Быстрая зарядка для пода и устройств.' },
  { brand: 'SMOK',      name: 'Сменный картридж 4 ml',              desc: 'Запасной картридж с сетчатой катушкой.' },
  { brand: 'OXVA',      name: 'Силиконовый чехол Xlim',             desc: 'Защитный чехол с ремешком на руку.' },
];

const SNUS_BRANDS = ['ZYN', 'Velo', 'Pablo', 'Killa', 'Lyft', 'Siberia', 'Skruf', 'Loop', 'Iceberg', 'Fix'];
const SNUS_FLAVORS = [
  'Cool Mint', 'Spearmint', 'Citrus', 'Cherry', 'Bubblegum',
  'Tropical', 'Wintergreen', 'Watermelon', 'Espresso', 'Apple Mint',
];
const SNUS_STRENGTHS = ['6mg', '9mg', '20mg', '50mg', '70mg', '100mg'];

const rand    = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick    = (arr)  => arr[Math.floor(Math.random() * arr.length)];
const round90 = (n)    => Math.round(n / 10) * 10 - 1;

function buildDisposables() {
  return DISP_MODELS.map((m, i) => {
    const flavor = pick(FLAVORS);
    const price  = round90(800 + m.puffs * 0.18 + rand(0, 400));
    return {
      brand: m.brand, name: m.name, category: 'disposable', type: 'Одноразка',
      flavor, strength: pick(STRENGTHS_DISP), puffs: m.puffs, volume: null, battery: m.battery,
      price, old_price: rand(0, 1) ? round90(price * 1.25) : null,
      rating: +(4.3 + Math.random() * 0.6).toFixed(1),
      image: DISP_IMAGES[i % DISP_IMAGES.length], in_stock: 1,
      description: `Компактная одноразка ${m.brand} ${m.name} с насыщенным вкусом «${flavor}». До ${m.puffs} затяжек, аккумулятор ${m.battery}.`,
    };
  });
}

function buildLiquids() {
  const out = [];
  // 20 стандартных (freebase, 0–20 mg)
  for (let i = 0; i < 20; i++) {
    const brand    = pick(LIQUID_BRANDS);
    const flavor   = pick(FLAVORS);
    const volume   = pick(LIQUID_VOLUMES);
    const strength = pick(STRENGTHS_LIQ);
    const base     = volume === '30ml' ? 550 : volume === '60ml' ? 850 : volume === '100ml' ? 1200 : 1450;
    const price    = round90(base + rand(0, 200));
    out.push({
      brand, name: `${flavor} ${volume}`, category: 'liquid', type: 'Жидкость',
      flavor, strength, puffs: null, volume, battery: null,
      price, old_price: rand(0, 2) === 0 ? round90(price * 1.2) : null,
      rating: +(4.2 + Math.random() * 0.7).toFixed(1),
      image: LIQ_IMAGES[i % LIQ_IMAGES.length], in_stock: 1,
      description: `Премиальная жидкость ${brand} объёмом ${volume}, крепость ${strength}. Сбалансированный вкус «${flavor}».`,
    });
  }
  // 14 солевых / высоконикотиновых (saltnic, 20–60 mg) — для POD-систем
  for (let i = 0; i < 14; i++) {
    const brand    = pick(LIQUID_BRANDS);
    const flavor   = pick(FLAVORS);
    const volume   = pick(['10ml', '15ml', '30ml']);
    const strength = pick(STRENGTHS_SALTNIC);
    const base     = volume === '10ml' ? 480 : volume === '15ml' ? 620 : 950;
    const nicBoost = (parseInt(strength) - 20) * 6;
    const price    = round90(base + nicBoost + rand(0, 150));
    out.push({
      brand, name: `${flavor} Соль ${strength}`, category: 'liquid', type: 'Жидкость солевая',
      flavor, strength, puffs: null, volume, battery: null,
      price, old_price: rand(0, 2) === 0 ? round90(price * 1.18) : null,
      rating: +(4.3 + Math.random() * 0.6).toFixed(1),
      image: LIQ_IMAGES[i % LIQ_IMAGES.length], in_stock: 1,
      description: `Солевая жидкость ${brand} «${flavor}» объёмом ${volume}. Высокая крепость ${strength}, подходит для POD-систем.`,
    });
  }
  return out;
}

function buildPods() {
  return POD_MODELS.map((m, i) => {
    const power = pick([15, 18, 25, 30, 40, 50, 80]);
    const price = round90(2200 + power * 35 + rand(0, 600));
    return {
      brand: m.brand, name: m.name, category: 'pod', type: 'POD-система',
      flavor: null, strength: null, puffs: null,
      volume: pick(['2ml', '3ml', '4ml']),
      battery: pick(['1000mAh', '1500mAh', '2000mAh', '2500mAh']),
      price, old_price: rand(0, 1) ? round90(price * 1.18) : null,
      rating: +(4.4 + Math.random() * 0.5).toFixed(1),
      image: POD_IMAGES[i % POD_IMAGES.length], in_stock: 1,
      description: `POD-система ${m.brand} ${m.name}. Мощность до ${power}W, быстрая зарядка Type-C, сменные картриджи.`,
    };
  });
}

function buildAccessories() {
  return ACCESSORIES.map((a, i) => ({
    brand: a.brand, name: a.name, category: 'accessory', type: 'Аксессуар',
    flavor: null, strength: null, puffs: null, volume: null, battery: null,
    price: round90(450 + i * 220 + rand(0, 200)),
    old_price: null,
    rating: +(4.5 + Math.random() * 0.4).toFixed(1),
    image: ACC_IMAGES[i % ACC_IMAGES.length], in_stock: 1,
    description: a.desc,
  }));
}

function buildSnus() {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const brand    = SNUS_BRANDS[i % SNUS_BRANDS.length];
    const flavor   = pick(SNUS_FLAVORS);
    const strength = pick(SNUS_STRENGTHS);
    const price    = round90(450 + (parseInt(strength) || 6) * 8 + rand(0, 200));
    out.push({
      brand, name: `${flavor} ${strength}`, category: 'snus', type: 'Снюс',
      flavor, strength, puffs: null, volume: null, battery: null,
      price, old_price: rand(0, 2) === 0 ? round90(price * 1.18) : null,
      rating: +(4.4 + Math.random() * 0.5).toFixed(1),
      image: SNUS_IMAGES[i % SNUS_IMAGES.length], in_stock: 1,
      description: `Никотиновые подушечки ${brand} «${flavor}». Крепость ${strength}, без табака, без курения.`,
    });
  }
  return out;
}

const PRODUCTS = [
  ...buildDisposables(),
  ...buildLiquids(),
  ...buildPods(),
  ...buildAccessories(),
  ...buildSnus(),
];

const insert = db.prepare(`
  INSERT INTO products
    (brand, name, category, type, flavor, strength, puffs, volume, battery,
     price, old_price, rating, image, in_stock, description)
  VALUES
    (@brand, @name, @category, @type, @flavor, @strength, @puffs, @volume, @battery,
     @price, @old_price, @rating, @image, @in_stock, @description)
`);

// products are referenced by cart_items / favorites / order_items;
// drop dependents (carts/favorites are session-scoped) and keep order history intact.
// products are referenced by cart / favorites / order_items.
// FK pragma must be toggled OUTSIDE the transaction (sqlite ignores it inside).
db.pragma('foreign_keys = OFF');
const txn = db.transaction((items) => {
  db.prepare('DELETE FROM cart').run();
  db.prepare('DELETE FROM favorites').run();
  db.prepare('DELETE FROM products').run();
  for (const it of items) insert.run(it);
});
txn(PRODUCTS);
db.pragma('foreign_keys = ON');

const total = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
console.log(`VIBE CLOUD: засеяно ${total} товаров.`);
process.exit(0);
