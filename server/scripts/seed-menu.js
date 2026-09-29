/**
 * Replaces all POS products and categories with the U Coffee menu.
 *
 *   node server/scripts/seed-menu.js --dry   # only check image links
 *   node server/scripts/seed-menu.js         # delete old products/categories, insert menu
 *
 * Past orders keep their item names; their product link is set to null.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const img = (id) => `https://images.unsplash.com/photo-${id}?w=400&q=80`;

// Each item lists image candidates; the first that loads is used.
const MENU = [
  {
    category: 'Coffee',
    prefix: 'CF',
    items: [
      ['Americano', 6, ['1514432324607-a09d9b4aefdd', '1495474472287-4d71bcdd2085']],
      ['Latte', 9, ['1561882468-9110e03e0f78', '1517701604599-bb29b565090c']],
      ['Caramel Latte', 11, ['1599398054066-846f28917f38', '1485808191679-5f86510681a2', '1461023058943-07fcbe16d735']],
      ['Vanilla Latte', 11, ['1570968915860-54d5c301fa9f', '1541167760496-1628856ab772', '1517701604599-bb29b565090c']],
      ['Hazelnut Latte', 11, ['1572442388796-11668a67e53d', '1509042239860-f550ce710b93']],
      ['Mocha', 11, ['1578314675249-a6910f80cc4e', '1497935586351-b67a49e012bf', '1504630083234-14187a9df0f5']],
    ],
  },
  {
    category: 'Matcha',
    prefix: 'MT',
    items: [
      ['Matcha Latte', 11, ['1536256263959-770b48d82b0a', '1515823064-d6e0c04616a7']],
      ['Dirty Matcha', 13, ['1582785513054-8d1bf9d69c1a', '1515823064-d6e0c04616a7', '1536256263959-770b48d82b0a']],
      ['Strawberry Matcha', 14, ['1515823064-d6e0c04616a7', '1536256263959-770b48d82b0a']],
    ],
  },
  {
    category: 'Non-Coffee',
    prefix: 'NC',
    items: [
      ['Classic Chocolate', 11, ['1542990253-0d0f5be5f0ed', '1517578239113-b03992dcdd25']],
      ['Blue Lagoon', 7, ['1551024709-8f23befc6f87', '1536935338788-846bb9981813']],
      ['Lemonade', 7, ['1523677011781-c91d1bbe2f9e', '1621263764928-df1444c5e859']],
      ['Press Orange', 9, ['1600271886742-f049cd451bba', '1613478223719-2ab802602423']],
      ['Markisa', 9, ['1622597467836-f3285f2131b8', '1546173159-315724a31696', '1513558161293-cdaf765ed2fd']],
      ['Chocolate Strawberry', 14, ['1553177595-4de2bb0842b9', '1579954115545-a95591f28bfc', '1542990253-0d0f5be5f0ed']],
    ],
  },
  {
    category: 'Hot Bites',
    prefix: 'HB',
    items: [
      ['Roti Bakar', 5, ['1525351484163-7529414344d8', '1484723091739-30a097e8f929']],
      ['French Fries', 6, ['1573080496219-bb080dd4f877', '1630384060421-cb20d0e0649d']],
      ['Loaded Fries', 13, ['1585109649139-366815a0d713', '1630384060421-cb20d0e0649d', '1573080496219-bb080dd4f877']],
      ['French Fries Beef', 14, ['1541592106381-b31e9677c0e5', '1585109649139-366815a0d713', '1573080496219-bb080dd4f877']],
      ['Keropok Lekor', 7, ['1601050690597-df0568f70950', '1599487488170-d11ec9c172f0']],
      ['Meat Ball', 12, ['1529042410759-befb1204b468', '1515516969-d4008cc6241a']],
      ['Jacket Potato (Chicken)', 13, ['1633436375153-d7045cb93e38', '1518977676601-b53f82aba655']],
      ['Jacket Potato (Beef)', 14, ['1633436375153-d7045cb93e38', '1518977676601-b53f82aba655']],
      ['Chicken Nuggets', 9, ['1562967914-608f82629710', '1606755962773-d324e0a13086']],
    ],
  },
  {
    category: 'Burgers',
    prefix: 'BG',
    items: [
      ['Smash Beef Burger', 15, ['1568901346375-23c9450c58cd', '1550547660-d9450f859349']],
      ['Crispy Chicken Burger', 16, ['1606755962773-d324e0a13086', '1553979459-d2229ba7433b', '1568901346375-23c9450c58cd']],
    ],
  },
  {
    category: 'Pasta',
    prefix: 'PS',
    items: [
      ['Spaghetti Bolognese', 13, ['1622973536968-3ead9e780960', '1551892374-ecf8754cf8b0']],
      ['Spaghetti Carbonara', 13, ['1612874742237-6526221588e3', '1588013273468-315fd88ea34c']],
      ['Spaghetti Aglio Olio', 12, ['1563379926898-05f4575a45d8', '1621996346565-e3dbc646d9a9']],
    ],
  },
];

function skuFor(prefix, name) {
  const slug = name
    .toUpperCase()
    .replace(/\(([^)]+)\)/g, ' $1')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}-${slug}`;
}

async function loads(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok && String(res.headers.get('content-type')).startsWith('image/');
  } catch {
    return false;
  }
}

async function pickImage(ids) {
  for (const id of ids) {
    const url = img(id);
    if (await loads(url)) return url;
  }
  return null;
}

async function main() {
  const dry = process.argv.includes('--dry');

  const rows = [];
  for (const [catIndex, group] of MENU.entries()) {
    for (const [itemIndex, [name, price, ids]] of group.items.entries()) {
      const image_url = await pickImage(ids);
      rows.push({
        category: group.category,
        catIndex,
        name,
        sku: skuFor(group.prefix, name),
        base_price: price,
        image_url,
        sort_order: itemIndex + 1,
      });
      console.log(
        `${image_url ? 'ok  ' : 'NONE'} ${group.category.padEnd(11)} ${name.padEnd(24)} ${price
          .toFixed(2)
          .padStart(6)}  ${image_url || ''}`
      );
    }
  }
  if (dry) return;

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and a Supabase key in server/.env');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const del = await db.from('pos_products').delete().not('id', 'is', null);
  if (del.error) throw del.error;

  const names = MENU.map((g) => g.category);
  const { data: existing, error: catErr } = await db.from('pos_categories').select('id, name');
  if (catErr) throw catErr;
  const stale = (existing || []).filter((c) => !names.includes(c.name)).map((c) => c.id);
  if (stale.length) {
    const r = await db.from('pos_categories').delete().in('id', stale);
    if (r.error) throw r.error;
  }

  const { data: cats, error: upErr } = await db
    .from('pos_categories')
    .upsert(
      names.map((name, i) => ({ name, sort_order: i + 1, active: true })),
      { onConflict: 'name' }
    )
    .select('id, name');
  if (upErr) throw upErr;
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  const { error: insErr } = await db.from('pos_products').insert(
    rows.map((r) => ({
      category_id: catId[r.category],
      name: r.name,
      sku: r.sku,
      base_price: r.base_price,
      image_url: r.image_url,
      sort_order: r.sort_order,
      active: true,
    }))
  );
  if (insErr) throw insErr;

  console.log(`\nDone: ${cats.length} categories, ${rows.length} products.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
