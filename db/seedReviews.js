/* Generates ~30 fake reviews for the catalog.
 *
 * Distribution (per user spec):
 *   - 4 × 1★  (vape/snus problems, NOT delivery problems)
 *   - 4 × 2★  (минор complaints — burnt taste, weak strength)
 *   - 0 × 3★  (skipped)
 *   - rest    (~22) split between 4★ and 5★, with teen-slang body
 *
 * Each review is attached to a product_id and tagged with:
 *   - customer_bot_id (sequential, starts at 38)
 *   - items_summary   (free-text "what they bought")
 *
 * Run:  node db/seedReviews.js
 */
import db, {
  listAllProducts,
  insertReview,
  truncateReviews,
  USER_DISPLAY_ID_BASE,
} from './database.js';

const POSITIVE_5 = [
  'ахуенно прям, вкус как из коробки',
  'топчик, забираю еще друзьям',
  'пиздато, нихера не подвело',
  'огнище, вкус прям держится',
  'база, советую',
  'кайф полный, тяга ровная',
  'бомба, второй раз беру',
  'чисто кайфанул, вкус не пресный',
  'жирно тянет, никотин чувствуется',
  'охуеть как качественно собрано',
  'четко, без сюрпризов',
  'прям как заявлено, без воды',
];
const POSITIVE_4 = [
  'норм, но никотин чуть слабее ожидал',
  'вкус ок, но мог бы быть посочнее',
  'неплохо, цена честная',
  'все четенько, держит до конца',
  'отлично, единственный минус — быстро кончается',
  'вкус классный, но насадка хлипкая',
  'ровно, но не вау',
  'для своих денег прям топ',
];
const NEG_2 = [
  'на последних затяжках начал гарик ловить, обидно',
  'после половины полез горелый привкус, остатки выкинул',
  'жижа течет в рот, бесит',
  'крепость ниже заявленной, не хватает',
  'вкус через день стал плоский',
  'батарея сдохла раньше времени, отзыв на тройку с минусом',
  'пшикает нормально, но привкус пластика',
];
const NEG_1 = [
  'умер на второй день, нихера не пыхает',
  'вообще без вкуса, как воздух тянешь',
  'после первой зарядки не включается',
  'под не работает с этой жижей, протекает наглухо',
  'крепость как у воды, явно левак',
  'дрова, выкинул нахрен',
];

function pick(arr, used) {
  let i = Math.floor(Math.random() * arr.length);
  let tries = 0;
  while (used.has(i) && tries < arr.length) {
    i = (i + 1) % arr.length;
    tries++;
  }
  used.add(i);
  return arr[i];
}

function describePurchase(p) {
  // short "what they bought" line
  if (p.category === 'liquid') return `${p.brand} ${p.name}${p.flavor ? `, ${p.flavor}` : ''}${p.volume ? `, ${p.volume}` : ''}`;
  if (p.category === 'snus')   return `${p.brand} ${p.name}${p.strength ? `, ${p.strength}` : ''}`;
  return `${p.brand} ${p.name}${p.flavor ? `, ${p.flavor}` : ''}`;
}

function buildReviews() {
  const products = listAllProducts.all();
  if (!products.length) {
    console.error('Сначала запустите `npm run seed` (нет товаров).');
    process.exit(1);
  }

  // shuffle products for variety
  const shuffled = [...products].sort(() => Math.random() - 0.5);

  const reviews = [];
  const usedPos5 = new Set(), usedPos4 = new Set();
  const usedNeg2 = new Set(), usedNeg1 = new Set();

  // 4 × 1★
  for (let i = 0; i < 4; i++) {
    const p = shuffled[i % shuffled.length];
    reviews.push({ product_id: p.id, items_summary: describePurchase(p), rating: 1,
                   body: pick(NEG_1, usedNeg1) });
  }
  // 4 × 2★
  for (let i = 0; i < 4; i++) {
    const p = shuffled[(i + 4) % shuffled.length];
    reviews.push({ product_id: p.id, items_summary: describePurchase(p), rating: 2,
                   body: pick(NEG_2, usedNeg2) });
  }
  // rest — split between 4 and 5 star, ~22 total
  const totalRest = 22;
  for (let i = 0; i < totalRest; i++) {
    const p = shuffled[(i + 8) % shuffled.length];
    const rating = i % 3 === 0 ? 4 : 5;            // ~33% 4★ / ~67% 5★
    const body = rating === 5
      ? pick(POSITIVE_5, usedPos5)
      : pick(POSITIVE_4, usedPos4);
    reviews.push({ product_id: p.id, items_summary: describePurchase(p), rating, body });
  }

  // shuffle final list so star distribution isn't grouped
  reviews.sort(() => Math.random() - 0.5);
  return reviews;
}

function run() {
  truncateReviews.run();
  const reviews = buildReviews();
  // sequential bot ids starting at base
  let botId = USER_DISPLAY_ID_BASE;
  // spread created_at over the past 90 days
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  const txn = db.transaction(() => {
    for (const r of reviews) {
      const offset = Math.floor(Math.random() * 90) * day + Math.floor(Math.random() * 12 * 3600 * 1000);
      const created = new Date(now - offset).toISOString().slice(0, 19).replace('T', ' ');
      insertReview.run({
        ...r,
        customer_bot_id: botId,
        created_at: created,
      });
      botId++;
    }
  });
  txn();
  console.log(`Засеяно ${reviews.length} отзывов (bot id ${USER_DISPLAY_ID_BASE}…${botId - 1}).`);
}

run();
