/**
 * Rule-based "where to improve" tips for a report period.
 * Benchmarks are common cafe targets: ingredient cost 25–35% of sales,
 * staff cost 25–35% of sales, rent + utilities 20% or less.
 */
export const COGS_TARGET = 35;
export const LABOUR_TARGET = 35;
export const OVERHEAD_TARGET = 20;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const rm = (n) => `RM ${Number(n || 0).toFixed(2)}`;
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

function hourLabel(h) {
  const fmt = (x) => {
    const hr = x % 24;
    const suffix = hr >= 12 ? 'PM' : 'AM';
    return `${hr % 12 || 12} ${suffix}`;
  };
  return `${fmt(h)}–${fmt(h + 1)}`;
}

/**
 * @param {object} p
 * @param {object} p.totals      summary totals (sales, cost, gross, discount, orders)
 * @param {number} p.salary      staff salary for the period
 * @param {object} p.previous    previous period { sales, net } or null
 * @param {Array}  p.products    sold products with quantity, sales, profit, margin
 * @param {Array}  p.menu        full menu from costing (total_cost, name, active)
 * @param {Array}  p.days        per-day rows { key, sales, net } (day buckets only)
 * @param {Array}  p.hours       [{ hour, orders, sales }]
 * @param {Array}  p.weekdays    [{ dow, orders, sales, days }]
 * @param {string} p.periodName  "week" | "month" | "year"
 */
export function buildInsights({
  totals,
  salary,
  overhead = 0,
  overheadByCategory = {},
  hasExpenses = true,
  previous,
  products = [],
  menu = [],
  days = [],
  hours = [],
  weekdays = [],
  periodName,
}) {
  const tips = [];
  const sales = Number(totals.sales || 0);
  const gross = Number(totals.gross || 0);
  const net = gross - salary - overhead;
  const grossMargin = share(gross, sales);

  if (!sales) {
    return [{ tone: 'warn', title: 'No sales yet', text: `No paid orders this ${periodName}.` }];
  }

  if (hasExpenses && overhead === 0) {
    tips.push({
      tone: 'warn',
      title: 'No overheads recorded',
      text: 'Rent, electricity and water are missing, so net profit looks better than reality. Add them in the Overheads tab.',
    });
  }

  const unsetMenu = menu.filter((m) => m.active !== false && !Number(m.total_cost));
  if (unsetMenu.length) {
    tips.push({
      tone: 'warn',
      title: `${unsetMenu.length} menu item(s) have no cost`,
      text: `Profit looks higher than it really is. Set cost in the Profit tab for: ${unsetMenu
        .slice(0, 6)
        .map((m) => m.name)
        .join(', ')}${unsetMenu.length > 6 ? '…' : ''}.`,
    });
  }

  if (net < 0) {
    const fixed = salary + overhead;
    const breakEven = grossMargin > 0 ? fixed / (grossMargin / 100) : null;
    tips.push({
      tone: 'bad',
      title: `Loss of ${rm(-net)}`,
      text: breakEven
        ? `At your ${pct(grossMargin)} gross margin you need about ${rm(breakEven)} in sales to cover salary and overheads, which is ${rm(breakEven - sales)} more than you made.`
        : 'Sales did not cover costs, salary and overheads.',
    });
  }

  const overheadShare = share(overhead, sales);
  if (overhead > 0 && overheadShare > OVERHEAD_TARGET) {
    const top = Object.entries(overheadByCategory).sort((a, b) => b[1] - a[1])[0];
    tips.push({
      tone: 'bad',
      title: `Overheads are ${pct(overheadShare)} of sales`,
      text: `Aim for 20% or less. Biggest is ${top ? `${top[0]} (${rm(top[1])})` : 'rent'}. Grow sales per day or check for savings (e.g. air-con timers, lights off after closing).`,
    });
  }

  const labour = share(salary, sales);
  if (salary > 0 && labour > LABOUR_TARGET) {
    const slow = weekdays
      .filter((w) => w.days > 0)
      .map((w) => ({ ...w, avg: w.sales / w.days }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 2)
      .map((w) => DAY_NAMES[w.dow]);
    tips.push({
      tone: 'bad',
      title: `Staff cost is ${pct(labour)} of sales`,
      text: `A healthy cafe keeps this around 25–35%. Cut hours on slow days${
        slow.length ? ` (${slow.join(', ')})` : ''
      } or push sales at quiet hours.`,
    });
  }

  const cogs = share(totals.cost, sales);
  if (totals.cost > 0 && cogs > COGS_TARGET) {
    tips.push({
      tone: 'bad',
      title: `Ingredient cost is ${pct(cogs)} of sales`,
      text: `Target is 35% or lower. Check supplier prices, portion sizes and waste.`,
    });
  }

  const avgQty = products.length
    ? products.reduce((s, p) => s + p.quantity, 0) / products.length
    : 0;
  const lowMarginPopular = products
    .filter((p) => p.cost > 0 && p.margin != null && p.margin < 60 && p.quantity >= avgQty)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 4);
  if (lowMarginPopular.length) {
    tips.push({
      tone: 'warn',
      title: 'Popular items with thin margin',
      text: `${lowMarginPopular
        .map((p) => `${p.product_name} (${pct(p.margin)})`)
        .join(', ')}. Small price increases or cheaper ingredients here have the biggest effect.`,
    });
  }

  const stars = products
    .filter((p) => p.cost > 0 && p.margin >= 65 && p.quantity >= avgQty)
    .slice(0, 3);
  if (stars.length) {
    tips.push({
      tone: 'good',
      title: 'Your best earners',
      text: `${stars.map((p) => p.product_name).join(', ')} sell well with high margin. Promote them and put them first on the menu.`,
    });
  }

  const soldNames = new Set(products.map((p) => p.product_name));
  const notSold = menu.filter((m) => m.active !== false && !soldNames.has(m.name));
  if (notSold.length && periodName !== 'week') {
    tips.push({
      tone: 'warn',
      title: `${notSold.length} item(s) did not sell at all`,
      text: `${notSold
        .slice(0, 6)
        .map((m) => m.name)
        .join(', ')}${notSold.length > 6 ? '…' : ''}. Promote, bundle or remove them to cut waste.`,
    });
  }

  const lossDays = days.filter((d) => d.sales > 0 && d.net < 0);
  if (lossDays.length && days.length > 1) {
    const byDow = {};
    for (const d of lossDays) {
      const dow = new Date(`${d.key}T12:00:00`).getDay();
      byDow[dow] = (byDow[dow] || 0) + 1;
    }
    const worst = Object.entries(byDow).sort((a, b) => b[1] - a[1])[0];
    tips.push({
      tone: 'warn',
      title: `${lossDays.length} day(s) lost money`,
      text: `Most often on ${DAY_NAMES[worst[0]]}. Consider fewer staff or a promotion that day.`,
    });
  }

  const busy = [...hours].filter((h) => h.orders > 0).sort((a, b) => b.orders - a.orders);
  if (busy.length >= 3) {
    const quiet = busy[busy.length - 1];
    tips.push({
      tone: 'info',
      title: `Busiest hour: ${hourLabel(busy[0].hour)}`,
      text: `Schedule your strongest staff then. Quietest trading hour is ${hourLabel(
        quiet.hour
      )}, a good time for prep or a happy-hour deal.`,
    });
  }

  const discountShare = share(totals.discount, sales + Number(totals.discount || 0));
  if (discountShare > 5) {
    tips.push({
      tone: 'warn',
      title: `Discounts took ${pct(discountShare)} of sales`,
      text: `That is ${rm(totals.discount)}. Make sure promotions bring in extra orders, not just cheaper ones.`,
    });
  }

  if (previous && previous.sales > 0) {
    const change = share(sales - previous.sales, previous.sales);
    if (change <= -10) {
      tips.push({
        tone: 'bad',
        title: `Sales down ${pct(-change)} vs last ${periodName}`,
        text: 'Check what changed (weather, holidays, menu, staff) and plan a promotion.',
      });
    } else if (change >= 10) {
      tips.push({
        tone: 'good',
        title: `Sales up ${pct(change)} vs last ${periodName}`,
        text: 'Keep doing what worked and watch that costs grow slower than sales.',
      });
    }
  }

  const aov = totals.orders ? sales / totals.orders : 0;
  if (aov > 0 && periodName !== 'week') {
    tips.push({
      tone: 'info',
      title: `Average order ${rm(aov)}`,
      text: 'Raise it by suggesting a food add-on with every drink (e.g. drink + Roti Bakar combo).',
    });
  }

  if (!tips.some((t) => t.tone === 'bad' || t.tone === 'warn')) {
    tips.unshift({
      tone: 'good',
      title: 'Healthy result',
      text: `Profitable with ${pct(share(net, sales))} net margin. Keep costs in check as sales grow.`,
    });
  }

  return tips;
}
