import db from './database.js';

const FLAVORS = [
  'Арбуз-лед', 'Манго-маракуйя', 'Клубника-банан', 'Виноградный сок',
  'Колотый лед', 'Энергетик', 'Бабл-гам', 'Лимон-лайм', 'Ананас-кокос',
  'Персик', 'Черная смородина', 'Табак классик', 'Мятный джеле',
  'Голубика-черника', 'Мятная свежесть', 'Дыня-холод', 'Кола-вишня',
  'Тропический микс', 'Яблоко-гранат', 'Ежевика-мята',
];

const STRENGTHS_DISP = ['20mg', '50mg'];
const STRENGTHS_LIQ  = ['0mg', '3mg', '6mg', '12mg', '20mg'];

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
  { brand: 'VooPoo',     name: 'Argus P1' },
  { brand: 'VooPoo',     name: 'Drag X2' },
  { brand: 'SMOK',       name: 'Novo 5' },
  { brand: 'SMOK',       name: 'Nord 50W' },
  { brand: 'GeekVape',   name: 'Wenax K2' },
  { brand: 'GeekVape',   name: 'Aegis Boost 3' },
  { brand: 'Vaporesso',  name: 'XROS 4 Mini' },
  { brand: 'Vaporesso',  name: 'Luxe X Pro' },
  { brand: 'OXVA',       name: 'Xlim Pro' },
  { brand: 'OXVA',       name: 'Oneo' },
];

const ACCESSORIES = [
  { brand: 'Wotofo',    name: 'Сменные испарители 0.4 Ом (5 шт)', desc: 'Mesh-катушки для прямой парогенерации.' },
  { brand: 'GeekVape',  name: 'Аккумулятор 18650 3000mAh',         desc: 'Высокотоковый аккумулятор для боксмодов.' },
  { brand: 'Vaporesso', name: 'Зарядное устройство Type-C',         desc: 'Быстрая зарядка для пода и устройств.' },
  { brand: 'SMOK',      name: 'Сменный картридж 4ml',               desc: 'Запасной картридж с сетчатой катушкой.' },
  { brand: 'OXVA',      name: 'Силиконовый чехол Xlim',             desc: 'Защитный чехол с ремешком на руку.' },
];

const rand    = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick    = (arr)  => arr[Math.floor(Math.random() * arr.length)];
const round90 = (n)    => Math.round(n / 10) * 10 - 1; // даёт цены типа 1290, 1690 и т.д.

function buildDisposables() {
  const out = [];
  for (let i = 0; i < 15; i++) {
    const m      = DISP_MODELS[i % DISP_MODELS.length];
    const flavor = pick(FLAVORS);
    const price  = round90(800 + m.puffs * 0.18 + rand(0, 400));
    out.push({
      brand: m.brand,
      name: m.name,
      category: 'disposable',
      type: 'Одноразка',
      flavor,
      strength: pick(STRENGTHS_DISP),
      puffs: m.puffs,
      volume: null,
      battery: m.battery,
      price,
      old_price: rand(0, 1) ? round90(price * 1.25) : null,
      rating: +(4.3 + Math.random() * 0.6).toFixed(1),
      image: `https://picsum.photos/seed/vibe-disp-${i}/600/600`,
      in_stock: 1,
      description: `Компактная одноразка ${m.brand} ${m.name} с насыщенным вкусом «${flavor}». До ${m.puffs} затяжек, аккумулятор ${m.battery}.`,
    });
  }
  return out;
}

function buildLiquids() {
  const out = [];
  for (let i = 0; i < 20; i++) {
    const brand    = pick(LIQUID_BRANDS);
    const flavor   = pick(FLAVORS);
    const volume   = pick(LIQUID_VOLUMES);
    const strength = pick(STRENGTHS_LIQ);
    const base     = volume === '30ml' ? 550 : volume === '60ml' ? 850 : volume === '100ml' ? 1200 : 1450;
    const price    = round90(base + rand(0, 200));
    out.push({
      brand,
      name: `${flavor} ${volume}`,
      category: 'liquid',
      type: 'Жидкость',
      flavor,
      strength,
      puffs: null,
      volume,
      battery: null,
      price,
      old_price: rand(0, 2) === 0 ? round90(price * 1.2) : null,
      rating: +(4.2 + Math.random() * 0.7).toFixed(1),
      image: `https://picsum.photos/seed/vibe-liq-${i}/600/600`,
      in_stock: 1,
      description: `Премиальная жидкость ${brand} объёмом ${volume}, крепость ${strength}. Сбалансированный вкус «${flavor}».`,
    });
  }
  return out;
}

function buildPods() {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const m      = POD_MODELS[i % POD_MODELS.length];
    const power  = pick([15, 18, 25, 30, 40, 50, 80]);
    const price  = round90(2200 + power * 35 + rand(0, 600));
    out.push({
      brand: m.brand,
      name: m.name,
      category: 'pod',
      type: 'POD-система',
      flavor: null,
      strength: null,
      puffs: null,
      volume: pick(['2ml', '3ml', '4ml']),
      battery: pick(['1000mAh', '1500mAh', '2000mAh', '2500mAh']),
      price,
      old_price: rand(0, 1) ? round90(price * 1.18) : null,
      rating: +(4.4 + Math.random() * 0.5).toFixed(1),
      image: `https://picsum.photos/seed/vibe-pod-${i}/600/600`,
      in_stock: 1,
      description: `POD-система ${m.brand} ${m.name}. Мощность до ${power}W, быстрая зарядка Type-C, сменные картриджи.`,
    });
  }
  return out;
}

function buildAccessories() {
  return ACCESSORIES.map((a, i) => ({
    brand: a.brand,
    name: a.name,
    category: 'accessory',
    type: 'Аксессуар',
    flavor: null,
    strength: null,
    puffs: null,
    volume: null,
    battery: null,
    price: round90(450 + i * 220 + rand(0, 200)),
    old_price: null,
    rating: +(4.5 + Math.random() * 0.4).toFixed(1),
    image: `https://picsum.photos/seed/vibe-acc-${i}/600/600`,
    in_stock: 1,
    description: a.desc,
  }));
}

const PRODUCTS = [
  ...buildDisposables(),
  ...buildLiquids(),
  ...buildPods(),
  ...buildAccessories(),
];

const insert = db.prepare(`
  INSERT INTO products
    (brand, name, category, type, flavor, strength, puffs, volume, battery,
     price, old_price, rating, image, in_stock, description)
  VALUES
    (@brand, @name, @category, @type, @flavor, @strength, @puffs, @volume, @battery,
     @price, @old_price, @rating, @image, @in_stock, @description)
`);

const txn = db.transaction((items) => {
  db.prepare('DELETE FROM products').run();
  for (const it of items) insert.run(it);
});

txn(PRODUCTS);

const total = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
console.log(`☁️  VIBE CLOUD: засеяно ${total} товаров.`);
process.exit(0);
