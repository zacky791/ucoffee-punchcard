const express = require('express');
const hardware = require('../integrations/hardware');

function createPosRouter(getSupabase) {
  const router = express.Router();

  function requireDb(req, res, next) {
    const db = getSupabase();
    if (!db) {
      return res.status(503).json({
        error: 'Database not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
      });
    }
    req.supabase = db;
    next();
  }

  async function getSettings(db) {
    const { data, error } = await db.from('pos_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return (
      data || {
        cafe_name: 'U Coffee',
        currency: 'MYR',
        tax_rate: 0,
        service_charge_rate: 0,
        hardware_provider: 'mock',
        cash_drawer_enabled: true,
        payment_methods: ['qr', 'cash', 'card', 'ewallet', 'other'],
        order_prefix: 'UC',
        next_order_seq: 1,
        receipt_width_mm: 80,
        receipt_footer: 'Thank you for visiting U Coffee!',
      }
    );
  }

  async function logIntegration(db, entry) {
    try {
      await db.from('pos_integration_logs').insert(entry);
    } catch (err) {
      console.error('integration log failed', err.message);
    }
  }

  function money(n) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  function calcTotals(items, discount, settings) {
    const subtotal = money(
      (items || []).reduce((sum, item) => sum + Number(item.line_total || 0), 0)
    );
    const disc = money(Math.max(0, Number(discount || 0)));
    const taxable = Math.max(0, subtotal - disc);
    const tax_amount = money(taxable * Number(settings.tax_rate || 0));
    const service_charge = money(taxable * Number(settings.service_charge_rate || 0));
    const beforeRound = taxable + tax_amount + service_charge;
    const grand_total = money(beforeRound);
    const rounding = money(grand_total - beforeRound);
    return { subtotal, discount: disc, tax_amount, service_charge, rounding, grand_total };
  }

  function normalizeItems(rawItems = []) {
    return rawItems.map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
      const modifierTotal = modifiers.reduce(
        (s, m) => s + Number(m.price_delta || 0),
        0
      );
      const unit_price = money(Number(item.unit_price ?? item.base_price) + modifierTotal);
      return {
        product_id: item.product_id || null,
        product_name: String(item.product_name || item.name || 'Item'),
        sku: item.sku || null,
        quantity,
        unit_price,
        line_total: money(unit_price * quantity),
        modifiers,
        notes: item.notes ? String(item.notes).slice(0, 200) : null,
      };
    });
  }

  async function allocateOrderNumber(db, settings) {
    const prefix = settings.order_prefix || 'UC';
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const seq = Number(settings.next_order_seq || 1);
    const order_number = `${prefix}-${y}${m}${d}-${String(seq).padStart(4, '0')}`;
    await db
      .from('pos_settings')
      .update({ next_order_seq: seq + 1, updated_at: new Date().toISOString() })
      .eq('id', 1);
    return order_number;
  }

  async function loadOrderBundle(db, orderId) {
    const { data: order, error } = await db
      .from('pos_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error) throw error;

    const { data: items, error: itemsError } = await db
      .from('pos_order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at');
    if (itemsError) throw itemsError;

    const { data: payments, error: payError } = await db
      .from('pos_payments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at');
    if (payError) throw payError;

    const { data: receipts, error: recError } = await db
      .from('pos_receipts')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (recError) throw recError;

    return {
      ...order,
      items: items || [],
      payments: payments || [],
      receipts: receipts || [],
      payment: (payments || [])[0] || null,
      receipt: (receipts || [])[0] || null,
    };
  }

  function sendError(res, err) {
    const missingSchema = ['42703', 'PGRST204', 'PGRST205', '42P01'].includes(err?.code);
    res.status(err?.status || 500).json({
      error: missingSchema
        ? `${err.message}. Run supabase/pos-costing.sql, pos-recipe.sql and pos-overheads.sql in the Supabase SQL Editor.`
        : err?.message || 'Request failed',
    });
  }

  function qty3(n) {
    return Math.round(Number(n || 0) * 1000) / 1000;
  }

  function costPerUnit(inv) {
    const size = Number(inv?.pack_size) || 0;
    return size > 0 ? Number(inv.pack_price || 0) / size : 0;
  }

  function marginPct(profit, price) {
    return Number(price) > 0 ? Math.round((profit / Number(price)) * 1000) / 10 : null;
  }

  function periodStart(period) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (period === 'weekly') start.setDate(start.getDate() - 6);
    if (period === 'monthly') start.setDate(1);
    return start;
  }

  // Explicit from/to (sent by the browser in cafe local time) wins over ?period.
  function reportRange(query) {
    const from = query.from ? new Date(String(query.from)) : null;
    const to = query.to ? new Date(String(query.to)) : null;
    if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from) {
      return { start: from, end: to };
    }
    return { start: periodStart(query.period || 'daily'), end: new Date() };
  }

  // Unit cost per product = sum(recipe qty × ingredient cost per unit) + extra_cost.
  async function loadProductCosts(db, productIds) {
    const ids = [...new Set(productIds.filter(Boolean))];
    const costs = {};
    if (!ids.length) return costs;

    const [{ data: products, error: pErr }, { data: links, error: lErr }] = await Promise.all([
      db.from('pos_products').select('id, extra_cost').in('id', ids),
      db
        .from('pos_product_ingredients')
        .select(
          'product_id, inventory_item_id, quantity_per_unit, item:pos_inventory_items(id, name, unit, pack_price, pack_size)'
        )
        .in('product_id', ids),
    ]);
    if (pErr) throw pErr;
    if (lErr) throw lErr;

    for (const p of products || []) {
      costs[p.id] = {
        extra_cost: money(p.extra_cost),
        ingredients: [],
        ingredient_cost: 0,
        total_cost: 0,
      };
    }
    for (const l of links || []) {
      const entry = costs[l.product_id];
      if (!entry) continue;
      const unitCost = costPerUnit(l.item);
      const cost = Number(l.quantity_per_unit) * unitCost;
      entry.ingredients.push({
        inventory_item_id: l.inventory_item_id,
        name: l.item?.name || 'Unknown item',
        unit: l.item?.unit || '',
        quantity_per_unit: Number(l.quantity_per_unit),
        cost_per_unit: unitCost,
        cost: Math.round(cost * 10000) / 10000,
      });
      entry.ingredient_cost += cost;
    }
    for (const entry of Object.values(costs)) {
      entry.ingredients.sort((a, b) => a.name.localeCompare(b.name));
      entry.ingredient_cost = Math.round(entry.ingredient_cost * 10000) / 10000;
      entry.total_cost = Math.round((entry.ingredient_cost + entry.extra_cost) * 10000) / 10000;
    }
    return costs;
  }

  // changes: { [inventory_item_id]: signed quantity }
  async function moveStock(db, changes, { type, note, orderId = null }) {
    const ids = Object.keys(changes).filter((id) => qty3(changes[id]) !== 0);
    if (!ids.length) return;
    const { data: items, error } = await db
      .from('pos_inventory_items')
      .select('id, quantity')
      .in('id', ids);
    if (error) throw error;
    for (const inv of items || []) {
      const delta = qty3(changes[inv.id]);
      const { error: upErr } = await db
        .from('pos_inventory_items')
        .update({ quantity: qty3(Number(inv.quantity) + delta) })
        .eq('id', inv.id);
      if (upErr) throw upErr;
      await db.from('pos_stock_movements').insert({
        inventory_item_id: inv.id,
        type,
        quantity: delta,
        note,
        order_id: orderId,
      });
    }
  }

  async function deductInventory(db, order) {
    const soldByProduct = {};
    for (const item of order.items || []) {
      if (!item.product_id) continue;
      soldByProduct[item.product_id] =
        (soldByProduct[item.product_id] || 0) + Number(item.quantity);
    }
    const productIds = Object.keys(soldByProduct);
    if (!productIds.length) return;

    const { data: links, error } = await db
      .from('pos_product_ingredients')
      .select('product_id, inventory_item_id, quantity_per_unit')
      .in('product_id', productIds);
    if (error) throw error;

    const usage = {};
    for (const l of links || []) {
      usage[l.inventory_item_id] =
        (usage[l.inventory_item_id] || 0) -
        Number(l.quantity_per_unit) * soldByProduct[l.product_id];
    }
    await moveStock(db, usage, {
      type: 'order',
      note: `Order ${order.order_number}`,
      orderId: order.id,
    });
  }

  async function restoreInventory(db, order) {
    const { data: moves, error } = await db
      .from('pos_stock_movements')
      .select('inventory_item_id, quantity')
      .eq('order_id', order.id)
      .eq('type', 'order');
    if (error) throw error;
    const back = {};
    for (const m of moves || []) {
      back[m.inventory_item_id] = (back[m.inventory_item_id] || 0) - Number(m.quantity);
    }
    await moveStock(db, back, {
      type: 'in',
      note: `Cancelled ${order.order_number}`,
      orderId: order.id,
    });
  }

  // ——— Categories ———
  router.get('/categories', requireDb, async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('pos_categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/categories', requireDb, async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      const { data, error } = await req.supabase
        .from('pos_categories')
        .insert({
          name,
          sort_order: Number(req.body?.sort_order) || 0,
          active: req.body?.active !== false,
          ...(['drink', 'food'].includes(req.body?.kind) && { kind: req.body.kind }),
        })
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/categories/:id', requireDb, async (req, res) => {
    try {
      const updates = {};
      if (req.body?.name) updates.name = String(req.body.name).trim();
      if (req.body?.sort_order !== undefined) updates.sort_order = Number(req.body.sort_order);
      if (typeof req.body?.active === 'boolean') updates.active = req.body.active;
      if (['drink', 'food'].includes(req.body?.kind)) updates.kind = req.body.kind;
      const { data, error } = await req.supabase
        .from('pos_categories')
        .update(updates)
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ——— Products ———
  router.get('/products', requireDb, async (req, res) => {
    try {
      let query = req.supabase
        .from('pos_products')
        .select('*, category:pos_categories(id, name, sort_order)')
        .order('sort_order')
        .order('name');
      if (req.query.active === 'true') query = query.eq('active', true);
      if (req.query.category_id) query = query.eq('category_id', req.query.category_id);
      const { data, error } = await query;
      if (error) throw error;

      const catOrder = (p) => p.category?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const products = (data || []).sort(
        (a, b) => catOrder(a) - catOrder(b) || a.sort_order - b.sort_order
      );
      if (!products.length) return res.json([]);

      const ids = products.map((p) => p.id);
      const { data: groups, error: gErr } = await req.supabase
        .from('pos_modifier_groups')
        .select('*, modifiers:pos_modifiers(*)')
        .in('product_id', ids)
        .order('sort_order');
      if (gErr) throw gErr;

      const byProduct = {};
      for (const g of groups || []) {
        const mods = (g.modifiers || [])
          .filter((m) => m.active !== false)
          .sort((a, b) => a.sort_order - b.sort_order);
        (byProduct[g.product_id] ||= []).push({ ...g, modifiers: mods });
      }

      res.json(
        products.map((p) => ({
          ...p,
          modifier_groups: (byProduct[p.id] || []).sort(
            (a, b) => a.sort_order - b.sort_order
          ),
        }))
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/products', requireDb, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name) return res.status(400).json({ error: 'name is required' });
      const { data, error } = await req.supabase
        .from('pos_products')
        .insert({
          name: String(body.name).trim(),
          sku: body.sku || null,
          category_id: body.category_id || null,
          description: body.description || null,
          base_price: money(body.base_price),
          image_url: body.image_url || null,
          active: body.active !== false,
          track_inventory: Boolean(body.track_inventory),
          sort_order: Number(body.sort_order) || 0,
        })
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/products/:id', requireDb, async (req, res) => {
    try {
      const body = req.body || {};
      const updates = { updated_at: new Date().toISOString() };
      for (const key of [
        'name',
        'sku',
        'category_id',
        'description',
        'image_url',
      ]) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (body.base_price !== undefined) updates.base_price = money(body.base_price);
      if (typeof body.active === 'boolean') updates.active = body.active;
      if (typeof body.track_inventory === 'boolean') {
        updates.track_inventory = body.track_inventory;
      }
      if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order);

      const { data, error } = await req.supabase
        .from('pos_products')
        .update(updates)
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ——— Settings ———
  router.get('/settings', requireDb, async (req, res) => {
    try {
      res.json(await getSettings(req.supabase));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/settings', requireDb, async (req, res) => {
    try {
      const body = req.body || {};
      const allowed = [
        'cafe_name',
        'address',
        'phone',
        'currency',
        'tax_rate',
        'service_charge_rate',
        'receipt_footer',
        'receipt_width_mm',
        'order_prefix',
        'hardware_provider',
        'printer_connection',
        'printer_host',
        'printer_port',
        'cash_drawer_enabled',
        'payment_methods',
        'feedback_qr_url',
        'logo_url',
      ];
      const updates = { updated_at: new Date().toISOString() };
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      const { data, error } = await req.supabase
        .from('pos_settings')
        .upsert({ id: 1, ...updates })
        .select('*')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ——— Tables ———
  router.get('/tables', requireDb, async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('pos_tables')
        .select('*')
        .eq('active', true)
        .order('label');
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ——— Orders ———
  router.get('/orders', requireDb, async (req, res) => {
    try {
      let query = req.supabase
        .from('pos_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(req.query.limit) || 50, 200));

      if (req.query.status) query = query.eq('status', req.query.status);
      if (req.query.q) query = query.ilike('order_number', `%${req.query.q}%`);
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;
      if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        query = query.gte('created_at', from.toISOString()).lt('created_at', to.toISOString());
      } else if (req.query.date) {
        const start = new Date(`${req.query.date}T00:00:00`);
        const end = new Date(`${req.query.date}T23:59:59.999`);
        if (!Number.isNaN(start.getTime())) {
          query = query
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const orders = data || [];
      if (!orders.length) return res.json([]);

      const ids = orders.map((o) => o.id);
      const { data: payments } = await req.supabase
        .from('pos_payments')
        .select('*')
        .in('order_id', ids);

      const payMap = {};
      for (const p of payments || []) {
        if (!payMap[p.order_id]) payMap[p.order_id] = p;
      }

      let filtered = orders.map((o) => ({ ...o, payment: payMap[o.id] || null }));
      if (req.query.payment_method) {
        filtered = filtered.filter(
          (o) => o.payment?.method === req.query.payment_method
        );
      }
      res.json(filtered);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/orders/:id', requireDb, async (req, res) => {
    try {
      res.json(await loadOrderBundle(req.supabase, req.params.id));
    } catch (err) {
      res.status(404).json({ error: err.message || 'Order not found' });
    }
  });

  router.post('/orders/checkout', requireDb, async (req, res) => {
    const db = req.supabase;
    try {
      const body = req.body || {};
      const items = normalizeItems(body.items);
      if (!items.length) {
        return res.status(400).json({ error: 'Cart is empty' });
      }

      const settings = await getSettings(db);
      const totals = calcTotals(items, body.discount, settings);
      const method = String(body.payment_method || 'cash').toLowerCase();
      const allowed = ['qr', ...(settings.payment_methods || ['cash', 'card', 'ewallet', 'other'])];
      if (!allowed.includes(method)) {
        return res.status(400).json({ error: `Invalid payment method: ${method}` });
      }

      const amount_received =
        body.amount_received === undefined || body.amount_received === null
          ? totals.grand_total
          : money(body.amount_received);

      if (method === 'cash' && amount_received < totals.grand_total) {
        return res.status(400).json({
          error: `Insufficient cash. Need ${totals.grand_total.toFixed(2)}, received ${amount_received.toFixed(2)}`,
        });
      }

      const change_due =
        method === 'cash' ? money(Math.max(0, amount_received - totals.grand_total)) : 0;

      const order_number = await allocateOrderNumber(db, settings);
      const now = new Date().toISOString();

      const { data: order, error: orderError } = await db
        .from('pos_orders')
        .insert({
          order_number,
          status: 'paid',
          order_type: body.order_type || 'dine_in',
          table_label: body.table_label || null,
          cashier_id: body.cashier_id || null,
          cashier_name: body.cashier_name || 'Cashier',
          notes: body.notes || null,
          ...totals,
          paid_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (orderError) throw orderError;

      let costs = null;
      try {
        costs = await loadProductCosts(db, items.map((i) => i.product_id));
      } catch (costErr) {
        console.error('cost lookup failed (run supabase/pos-costing.sql?)', costErr.message);
      }
      const itemRows = items.map((item) => ({
        ...item,
        order_id: order.id,
        ...(costs && { unit_cost: costs[item.product_id]?.total_cost ?? null }),
      }));
      const { error: itemsError } = await db.from('pos_order_items').insert(itemRows);
      if (itemsError) throw itemsError;

      const { data: payment, error: payError } = await db
        .from('pos_payments')
        .insert({
          order_id: order.id,
          method,
          amount: totals.grand_total,
          amount_received,
          change_due,
          reference: body.payment_reference || null,
          status: 'completed',
        })
        .select('*')
        .single();
      if (payError) throw payError;

      const receipt_number = `R-${order_number}`;
      const { data: receipt, error: recError } = await db
        .from('pos_receipts')
        .insert({
          order_id: order.id,
          receipt_number,
          print_status: 'pending',
          print_attempts: 0,
        })
        .select('*')
        .single();
      if (recError) throw recError;

      const bundle = await loadOrderBundle(db, order.id);
      bundle.receipt_number = receipt_number;

      let inventoryWarning = null;
      try {
        await deductInventory(db, bundle);
      } catch (invErr) {
        inventoryWarning = invErr.message;
        console.error('inventory deduct failed', invErr);
      }

      const hw = await hardware.afterPayment(
        {
          ...bundle,
          receipt_number,
          payment,
        },
        settings
      );

      const printOk = Boolean(hw.printResult?.ok);
      await db
        .from('pos_receipts')
        .update({
          print_status: printOk ? 'printed' : 'failed',
          print_attempts: 1,
          last_error: printOk ? null : hw.printResult?.message || 'Print failed',
          payload: {
            receipt_text: hw.printResult?.receipt_text || null,
            drawer: hw.drawerResult,
          },
          printed_at: printOk ? now : null,
        })
        .eq('id', receipt.id);

      await logIntegration(db, {
        action: 'after_payment',
        provider: settings.hardware_provider || 'mock',
        order_id: order.id,
        success: printOk,
        message: hw.printResult?.message,
        meta: hw,
      });

      const fresh = await loadOrderBundle(db, order.id);
      res.status(201).json({
        order: fresh,
        hardware: hw,
        inventory_warning: inventoryWarning,
        message: printOk
          ? 'Payment complete. Receipt printed.'
          : 'Payment saved, but printing failed. You can retry print.',
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Checkout failed' });
    }
  });

  router.post('/orders/:id/reprint', requireDb, async (req, res) => {
    try {
      const settings = await getSettings(req.supabase);
      const bundle = await loadOrderBundle(req.supabase, req.params.id);
      const receipt = bundle.receipt;
      if (!receipt) {
        return res.status(404).json({ error: 'No receipt for this order' });
      }

      const result = await hardware.retryPrint(
        {
          ...bundle,
          receipt_number: receipt.receipt_number,
          payment: bundle.payment,
        },
        settings
      );

      await req.supabase
        .from('pos_receipts')
        .update({
          print_status: result.ok ? 'printed' : 'failed',
          print_attempts: Number(receipt.print_attempts || 0) + 1,
          last_error: result.ok ? null : result.message,
          printed_at: result.ok ? new Date().toISOString() : receipt.printed_at,
          payload: {
            ...(receipt.payload || {}),
            receipt_text: result.receipt_text,
            last_retry: result,
          },
        })
        .eq('id', receipt.id);

      await logIntegration(req.supabase, {
        action: 'retry_print',
        provider: settings.hardware_provider || 'mock',
        order_id: bundle.id,
        success: Boolean(result.ok),
        message: result.message,
        meta: result,
      });

      res.json({ ok: Boolean(result.ok), result, order: await loadOrderBundle(req.supabase, bundle.id) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Puts back every stock change made for this order and removes those movement rows. */
  async function undoOrderStock(db, orderId) {
    const { data: moves, error } = await db
      .from('pos_stock_movements')
      .select('id, inventory_item_id, quantity')
      .eq('order_id', orderId);
    if (error) throw error;
    if (!moves?.length) return;
    const back = {};
    for (const m of moves) {
      back[m.inventory_item_id] = (back[m.inventory_item_id] || 0) - Number(m.quantity);
    }
    const ids = Object.keys(back).filter((id) => qty3(back[id]) !== 0);
    if (ids.length) {
      const { data: items, error: invErr } = await db
        .from('pos_inventory_items')
        .select('id, quantity')
        .in('id', ids);
      if (invErr) throw invErr;
      for (const inv of items || []) {
        const { error: upErr } = await db
          .from('pos_inventory_items')
          .update({ quantity: qty3(Number(inv.quantity) + back[inv.id]) })
          .eq('id', inv.id);
        if (upErr) throw upErr;
      }
    }
    const { error: delErr } = await db
      .from('pos_stock_movements')
      .delete()
      .in('id', moves.map((m) => m.id));
    if (delErr) throw delErr;
  }

  router.patch('/orders/:id', requireDb, async (req, res) => {
    const db = req.supabase;
    try {
      const body = req.body || {};
      const bundle = await loadOrderBundle(db, req.params.id);
      if (bundle.status === 'cancelled') {
        return res.status(400).json({ error: 'Cancelled orders cannot be edited' });
      }

      const qtyById = new Map(
        (Array.isArray(body.items) ? body.items : []).map((i) => [
          i.id,
          Math.max(0, Math.floor(Number(i.quantity) || 0)),
        ])
      );
      const kept = [];
      const removed = [];
      for (const item of bundle.items) {
        const quantity = qtyById.has(item.id) ? qtyById.get(item.id) : Number(item.quantity);
        if (quantity <= 0) removed.push(item.id);
        else kept.push({ ...item, quantity, line_total: money(Number(item.unit_price) * quantity) });
      }

      const addRequests = (Array.isArray(body.add) ? body.add : []).filter(
        (a) => a?.product_id && Math.floor(Number(a.quantity) || 0) > 0
      );
      let added = [];
      if (addRequests.length) {
        const { data: products, error: prodErr } = await db
          .from('pos_products')
          .select('id, name, sku, base_price')
          .in('id', [...new Set(addRequests.map((a) => a.product_id))]);
        if (prodErr) throw prodErr;
        const byId = new Map((products || []).map((p) => [p.id, p]));
        added = normalizeItems(
          addRequests
            .filter((a) => byId.has(a.product_id))
            .map((a) => {
              const p = byId.get(a.product_id);
              const modifiers = (Array.isArray(a.modifiers) ? a.modifiers : [])
                .map((m) => ({ name: String(m?.name || '').slice(0, 60), price_delta: 0 }))
                .filter((m) => m.name);
              return {
                product_id: p.id,
                product_name: p.name,
                sku: p.sku,
                unit_price: Number(p.base_price) || 0,
                quantity: Math.floor(Number(a.quantity)),
                modifiers,
              };
            })
        );
      }

      if (!kept.length && !added.length) {
        return res.status(400).json({ error: 'An order needs at least one item. Delete the order instead.' });
      }

      const settings = await getSettings(db);
      const discount = body.discount !== undefined ? body.discount : bundle.discount;
      const totals = calcTotals([...kept, ...added], discount, settings);
      const now = new Date().toISOString();

      if (added.length) {
        let costs = null;
        try {
          costs = await loadProductCosts(db, added.map((i) => i.product_id));
        } catch (costErr) {
          console.error('cost lookup failed', costErr.message);
        }
        const { error } = await db.from('pos_order_items').insert(
          added.map((item) => ({
            ...item,
            order_id: bundle.id,
            ...(costs && { unit_cost: costs[item.product_id]?.total_cost ?? null }),
          }))
        );
        if (error) throw error;
      }
      if (removed.length) {
        const { error } = await db.from('pos_order_items').delete().in('id', removed);
        if (error) throw error;
      }
      for (const item of kept) {
        const { error } = await db
          .from('pos_order_items')
          .update({ quantity: item.quantity, line_total: item.line_total })
          .eq('id', item.id);
        if (error) throw error;
      }

      const orderUpdates = { ...totals, updated_at: now };
      if (['dine_in', 'takeaway', 'delivery'].includes(body.order_type)) {
        orderUpdates.order_type = body.order_type;
      }
      if (body.table_label !== undefined) orderUpdates.table_label = body.table_label || null;
      if (body.notes !== undefined) orderUpdates.notes = body.notes || null;
      const { error: orderErr } = await db.from('pos_orders').update(orderUpdates).eq('id', bundle.id);
      if (orderErr) throw orderErr;

      if (bundle.payment) {
        const allowed = ['qr', ...(settings.payment_methods || ['cash', 'card', 'ewallet', 'other'])];
        const method = allowed.includes(String(body.payment_method || '').toLowerCase())
          ? String(body.payment_method).toLowerCase()
          : bundle.payment.method;
        const received =
          method === 'cash'
            ? Math.max(Number(bundle.payment.amount_received) || 0, totals.grand_total)
            : totals.grand_total;
        const { error: payErr } = await db
          .from('pos_payments')
          .update({
            method,
            amount: totals.grand_total,
            amount_received: received,
            change_due: money(received - totals.grand_total),
          })
          .eq('id', bundle.payment.id);
        if (payErr) throw payErr;
      }

      let inventoryWarning = null;
      try {
        await undoOrderStock(db, bundle.id);
        await deductInventory(db, await loadOrderBundle(db, bundle.id));
      } catch (invErr) {
        inventoryWarning = invErr.message;
        console.error('inventory re-sync failed', invErr);
      }

      res.json({ order: await loadOrderBundle(db, bundle.id), inventory_warning: inventoryWarning });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/orders/:id', requireDb, async (req, res) => {
    const db = req.supabase;
    try {
      const { data: order, error } = await db
        .from('pos_orders')
        .select('id, order_number')
        .eq('id', req.params.id)
        .single();
      if (error || !order) return res.status(404).json({ error: 'Order not found' });

      await undoOrderStock(db, order.id);
      await db.from('pos_integration_logs').delete().eq('order_id', order.id);
      const { error: delErr } = await db.from('pos_orders').delete().eq('id', order.id);
      if (delErr) throw delErr;
      res.json({ ok: true, order_number: order.order_number });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/orders/:id/cancel', requireDb, async (req, res) => {
    try {
      const reason = String(req.body?.reason || '').slice(0, 200);
      const { data: order, error } = await req.supabase
        .from('pos_orders')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (error || !order) return res.status(404).json({ error: 'Order not found' });
      if (order.status === 'cancelled') {
        return res.status(400).json({ error: 'Order already cancelled' });
      }
      if (['completed'].includes(order.status)) {
        return res.status(400).json({ error: 'Completed orders cannot be cancelled' });
      }

      const { data, error: upErr } = await req.supabase
        .from('pos_orders')
        .update({
          status: 'cancelled',
          cancel_reason: reason || null,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .select('*')
        .single();
      if (upErr) throw upErr;

      let inventoryWarning = null;
      try {
        await restoreInventory(req.supabase, order);
      } catch (invErr) {
        inventoryWarning = invErr.message;
        console.error('inventory restore failed', invErr);
      }
      res.json({ ...data, inventory_warning: inventoryWarning });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/orders/:id/status', requireDb, async (req, res) => {
    try {
      const status = String(req.body?.status || '');
      const allowed = [
        'draft',
        'pending_payment',
        'paid',
        'preparing',
        'ready',
        'completed',
        'cancelled',
      ];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      const { data, error } = await req.supabase
        .from('pos_orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ——— Hardware ———
  router.get('/hardware/status', requireDb, async (req, res) => {
    try {
      const settings = await getSettings(req.supabase);
      const status = await hardware.checkPrinterStatus(settings);
      res.json({ settings: { hardware_provider: settings.hardware_provider }, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/hardware/test-print', requireDb, async (req, res) => {
    try {
      const settings = await getSettings(req.supabase);
      const sample = {
        order_number: 'TEST-0000',
        receipt_number: 'R-TEST',
        cashier_name: 'Test',
        order_type: 'takeaway',
        created_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
        items: [
          {
            quantity: 1,
            product_name: 'Test Latte',
            modifiers: [{ name: 'Iced', price_delta: 0 }],
            line_total: 12,
          },
        ],
        subtotal: 12,
        discount: 0,
        tax_amount: 0,
        service_charge: 0,
        rounding: 0,
        grand_total: 12,
        payment: { method: 'cash', amount_received: 20, change_due: 8 },
      };
      const result = await hardware.printReceipt(sample, {
        ...settings,
        cash_drawer_enabled: false,
      });
      await logIntegration(req.supabase, {
        action: 'test_print',
        provider: settings.hardware_provider || 'mock',
        success: Boolean(result.ok),
        message: result.message,
        meta: result,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/hardware/open-drawer', requireDb, async (req, res) => {
    try {
      const settings = await getSettings(req.supabase);
      const result = await hardware.openCashDrawer(settings);
      await logIntegration(req.supabase, {
        action: 'open_drawer',
        provider: settings.hardware_provider || 'mock',
        success: Boolean(result.ok),
        message: result.message,
        meta: result,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ——— Inventory ———
  router.get('/inventory', requireDb, async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('pos_inventory_items')
        .select('*')
        .order('name');
      if (error) throw error;
      res.json((data || []).map((i) => ({ ...i, cost_per_unit: costPerUnit(i) })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  function inventoryFields(body) {
    const out = {};
    if (body.name !== undefined) out.name = String(body.name).trim();
    if (body.unit !== undefined) out.unit = String(body.unit).trim() || 'pcs';
    if (body.min_threshold !== undefined) out.min_threshold = qty3(body.min_threshold);
    if (body.pack_price !== undefined) out.pack_price = money(Math.max(0, Number(body.pack_price) || 0));
    if (body.pack_size !== undefined) {
      const size = qty3(body.pack_size);
      if (size <= 0) throw Object.assign(new Error('Pack size must be more than 0'), { status: 400 });
      out.pack_size = size;
    }
    if (typeof body.active === 'boolean') out.active = body.active;
    return out;
  }

  router.post('/inventory', requireDb, async (req, res) => {
    try {
      const body = req.body || {};
      if (!String(body.name || '').trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      const { data, error } = await req.supabase
        .from('pos_inventory_items')
        .insert({ ...inventoryFields(body), quantity: qty3(body.quantity) })
        .select('*')
        .single();
      if (error) throw error;
      if (Number(data.quantity)) {
        await req.supabase.from('pos_stock_movements').insert({
          inventory_item_id: data.id,
          type: 'in',
          quantity: Number(data.quantity),
          note: 'Opening stock',
        });
      }
      res.status(201).json({ ...data, cost_per_unit: costPerUnit(data) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/inventory/:id', requireDb, async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('pos_inventory_items')
        .update(inventoryFields(req.body || {}))
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json({ ...data, cost_per_unit: costPerUnit(data) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/inventory/movements', requireDb, async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 40));
      const { data, error } = await req.supabase
        .from('pos_stock_movements')
        .select('*, item:pos_inventory_items(name, unit)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ——— Overheads (rent, utilities, ...) ———
  const EXPENSE_CATEGORIES = ['rent', 'electricity', 'water', 'internet', 'gas', 'maintenance', 'marketing', 'other'];
  const EXPENSE_KINDS = ['recurring', 'month', 'one_off'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function expenseFields(body, partial) {
    const out = {};
    const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
    if (!partial || body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) throw bad('Name is required');
      out.name = name.slice(0, 120);
    }
    if (!partial || body.category !== undefined) {
      out.category = EXPENSE_CATEGORIES.includes(body.category) ? body.category : 'other';
    }
    if (!partial || body.kind !== undefined) {
      if (!EXPENSE_KINDS.includes(body.kind)) throw bad('Invalid type');
      out.kind = body.kind;
    }
    if (!partial || body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) throw bad('Amount must be 0 or more');
      out.amount = money(amount);
    }
    if (!partial || body.start_date !== undefined) {
      if (!DATE_RE.test(String(body.start_date || ''))) throw bad('Start date is required');
      out.start_date = body.start_date;
    }
    if (body.end_date !== undefined) {
      if (body.end_date && !DATE_RE.test(String(body.end_date))) throw bad('Invalid end date');
      out.end_date = body.end_date || null;
    }
    if (body.note !== undefined) out.note = String(body.note || '').slice(0, 300) || null;
    return out;
  }

  router.get('/expenses', requireDb, async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('pos_expenses')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/expenses', requireDb, async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('pos_expenses')
        .insert(expenseFields(req.body || {}, false))
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/expenses/:id', requireDb, async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('pos_expenses')
        .update(expenseFields(req.body || {}, true))
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/expenses/:id', requireDb, async (req, res) => {
    try {
      const { error } = await req.supabase.from('pos_expenses').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ——— Daily expenses (purchases / restock) ———
  function purchaseFields(body) {
    const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
    if (!DATE_RE.test(String(body.purchase_date || ''))) throw bad('Date is required');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) throw bad('Amount must be 0 or more');
    const itemId = body.inventory_item_id || null;
    const quantity = itemId ? qty3(body.quantity) : null;
    if (itemId && !(quantity > 0)) throw bad('Enter how much you bought');
    return {
      purchase_date: body.purchase_date,
      name: String(body.name || '').trim().slice(0, 120),
      inventory_item_id: itemId,
      quantity,
      amount: money(amount),
      note: String(body.note || '').slice(0, 300) || null,
    };
  }

  async function changeStock(db, itemId, delta) {
    const { data: item, error } = await db
      .from('pos_inventory_items')
      .select('id, name, quantity')
      .eq('id', itemId)
      .single();
    if (error || !item) throw Object.assign(new Error('Inventory item not found'), { status: 400 });
    const { error: upErr } = await db
      .from('pos_inventory_items')
      .update({ quantity: qty3(Number(item.quantity) + delta) })
      .eq('id', item.id);
    if (upErr) throw upErr;
    return item;
  }

  async function addPurchaseStock(db, fields) {
    if (!fields.inventory_item_id || !(fields.quantity > 0)) return null;
    await changeStock(db, fields.inventory_item_id, fields.quantity);
    const { data, error } = await db
      .from('pos_stock_movements')
      .insert({
        inventory_item_id: fields.inventory_item_id,
        type: 'in',
        quantity: fields.quantity,
        note: `Purchase: ${fields.name}`,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  async function removePurchaseStock(db, purchase) {
    if (!purchase.stock_movement_id) return;
    const { data: move } = await db
      .from('pos_stock_movements')
      .select('id, inventory_item_id, quantity')
      .eq('id', purchase.stock_movement_id)
      .maybeSingle();
    if (!move) return;
    await changeStock(db, move.inventory_item_id, -Number(move.quantity));
    const { error } = await db.from('pos_stock_movements').delete().eq('id', move.id);
    if (error) throw error;
  }

  async function withItemName(db, fields) {
    if (fields.name || !fields.inventory_item_id) {
      if (!fields.name) throw Object.assign(new Error('Name is required'), { status: 400 });
      return fields;
    }
    const { data } = await db
      .from('pos_inventory_items')
      .select('name')
      .eq('id', fields.inventory_item_id)
      .maybeSingle();
    return { ...fields, name: data?.name || 'Stock' };
  }

  const PURCHASE_SELECT = '*, item:pos_inventory_items(id, name, unit)';

  router.get('/purchases', requireDb, async (req, res) => {
    try {
      let query = req.supabase
        .from('pos_purchases')
        .select(PURCHASE_SELECT)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (DATE_RE.test(String(req.query.from || ''))) query = query.gte('purchase_date', req.query.from);
      if (DATE_RE.test(String(req.query.to || ''))) query = query.lte('purchase_date', req.query.to);
      const { data, error } = await query.limit(2000);
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/purchases', requireDb, async (req, res) => {
    const db = req.supabase;
    try {
      const fields = await withItemName(db, purchaseFields(req.body || {}));
      const stock_movement_id = await addPurchaseStock(db, fields);
      const { data, error } = await db
        .from('pos_purchases')
        .insert({ ...fields, stock_movement_id })
        .select(PURCHASE_SELECT)
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/purchases/:id', requireDb, async (req, res) => {
    const db = req.supabase;
    try {
      const { data: old, error: findErr } = await db
        .from('pos_purchases')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (findErr || !old) return res.status(404).json({ error: 'Expense not found' });
      const fields = await withItemName(db, purchaseFields(req.body || {}));
      const stockChanged =
        fields.inventory_item_id !== old.inventory_item_id ||
        Number(fields.quantity || 0) !== Number(old.quantity || 0);
      let stock_movement_id = old.stock_movement_id;
      if (stockChanged) {
        await removePurchaseStock(db, old);
        stock_movement_id = await addPurchaseStock(db, fields);
      } else if (old.stock_movement_id && fields.name !== old.name) {
        await db
          .from('pos_stock_movements')
          .update({ note: `Purchase: ${fields.name}` })
          .eq('id', old.stock_movement_id);
      }
      const { data, error } = await db
        .from('pos_purchases')
        .update({ ...fields, stock_movement_id })
        .eq('id', old.id)
        .select(PURCHASE_SELECT)
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/purchases/:id', requireDb, async (req, res) => {
    const db = req.supabase;
    try {
      const { data: old, error: findErr } = await db
        .from('pos_purchases')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (findErr || !old) return res.status(404).json({ error: 'Expense not found' });
      await removePurchaseStock(db, old);
      const { error } = await db.from('pos_purchases').delete().eq('id', old.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ——— Customer survey: how did you hear about us? ———
  const SURVEY_SOURCES = ['banner', 'tiktok', 'instagram', 'friends', 'google', 'other'];

  router.get('/survey', requireDb, async (req, res) => {
    try {
      let query = req.supabase
        .from('pos_survey_responses')
        .select('*, order:pos_orders(order_number)')
        .order('created_at', { ascending: false });
      if (req.query.from) query = query.gte('created_at', String(req.query.from));
      if (req.query.to) query = query.lt('created_at', String(req.query.to));
      const { data, error } = await query.limit(5000);
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/survey', requireDb, async (req, res) => {
    try {
      const body = req.body || {};
      const source = String(body.source || '');
      if (!SURVEY_SOURCES.includes(source)) {
        return res.status(400).json({ error: 'Choose how the customer heard about us' });
      }
      const otherText = String(body.other_text || '').trim().slice(0, 200);
      if (source === 'other' && !otherText) {
        return res.status(400).json({ error: 'Type where the customer heard about us' });
      }
      const { data, error } = await req.supabase
        .from('pos_survey_responses')
        .insert({
          order_id: body.order_id || null,
          source,
          other_text: source === 'other' ? otherText : null,
        })
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/survey/:id', requireDb, async (req, res) => {
    try {
      const { error } = await req.supabase
        .from('pos_survey_responses')
        .delete()
        .eq('id', req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ——— Costing / profit margin ———
  router.get('/costing', requireDb, async (req, res) => {
    try {
      const { data: products, error } = await req.supabase
        .from('pos_products')
        .select('*, category:pos_categories(*)')
        .order('sort_order');
      if (error) throw error;
      const costs = await loadProductCosts(req.supabase, (products || []).map((p) => p.id));
      const catOrder = (p) => p.category?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const rows = (products || [])
        .sort((a, b) => catOrder(a) - catOrder(b) || a.sort_order - b.sort_order)
        .map((p) => {
          const c = costs[p.id] || { extra_cost: 0, ingredients: [], ingredient_cost: 0, total_cost: 0 };
          const price = Number(p.base_price);
          const profit = money(price - c.total_cost);
          return {
            ...p,
            ...c,
            profit,
            margin: marginPct(price - c.total_cost, price),
          };
        });
      res.json(rows);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/products/:id/costing', requireDb, async (req, res) => {
    const db = req.supabase;
    try {
      const body = req.body || {};
      const productId = req.params.id;

      const updates = { updated_at: new Date().toISOString() };
      if (body.extra_cost !== undefined) {
        updates.extra_cost = money(Math.max(0, Number(body.extra_cost) || 0));
      }
      if (body.recipe_notes !== undefined) {
        updates.recipe_notes = String(body.recipe_notes || '').slice(0, 4000) || null;
      }
      const { error: upErr } = await db.from('pos_products').update(updates).eq('id', productId);
      if (upErr) throw upErr;

      if (Array.isArray(body.ingredients)) {
        const merged = {};
        for (const row of body.ingredients) {
          const qty = qty3(row.quantity_per_unit);
          if (!row.inventory_item_id || qty <= 0) continue;
          merged[row.inventory_item_id] = qty3((merged[row.inventory_item_id] || 0) + qty);
        }

        const { error: delErr } = await db
          .from('pos_product_ingredients')
          .delete()
          .eq('product_id', productId);
        if (delErr) throw delErr;

        const rows = Object.entries(merged).map(([inventory_item_id, quantity_per_unit]) => ({
          product_id: productId,
          inventory_item_id,
          quantity_per_unit,
        }));
        if (rows.length) {
          const { error: insErr } = await db.from('pos_product_ingredients').insert(rows);
          if (insErr) throw insErr;
        }
      }

      const costs = await loadProductCosts(db, [productId]);
      res.json(costs[productId] || null);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/inventory/adjust', requireDb, async (req, res) => {
    try {
      const { inventory_item_id, quantity, type = 'adjust', note } = req.body || {};
      if (!inventory_item_id) {
        return res.status(400).json({ error: 'inventory_item_id required' });
      }
      const qty = qty3(quantity);
      const { data: item, error } = await req.supabase
        .from('pos_inventory_items')
        .select('*')
        .eq('id', inventory_item_id)
        .single();
      if (error || !item) return res.status(404).json({ error: 'Item not found' });

      let next = Number(item.quantity);
      if (type === 'in') next += Math.abs(qty);
      else if (type === 'out') next -= Math.abs(qty);
      else next = qty;

      const { data, error: upErr } = await req.supabase
        .from('pos_inventory_items')
        .update({ quantity: qty3(next) })
        .eq('id', item.id)
        .select('*')
        .single();
      if (upErr) throw upErr;

      await req.supabase.from('pos_stock_movements').insert({
        inventory_item_id: item.id,
        type: ['in', 'out', 'adjust'].includes(type) ? type : 'adjust',
        quantity: type === 'adjust' ? qty3(next - Number(item.quantity)) : qty3(type === 'out' ? -Math.abs(qty) : Math.abs(qty)),
        note: note || null,
      });

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ——— Reports / Dashboard ———
  router.get('/reports/dashboard', requireDb, async (req, res) => {
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const { data: orders, error } = await req.supabase
        .from('pos_orders')
        .select('id, order_number, status, grand_total, created_at')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;

      const paid = (orders || []).filter((o) =>
        ['paid', 'preparing', 'ready', 'completed'].includes(o.status)
      );
      const totalSales = money(paid.reduce((s, o) => s + Number(o.grand_total), 0));
      const orderCount = paid.length;
      const average = orderCount ? money(totalSales / orderCount) : 0;

      const ids = paid.map((o) => o.id);
      let bestSellers = [];
      let paymentBreakdown = {};

      if (ids.length) {
        const { data: items } = await req.supabase
          .from('pos_order_items')
          .select('product_name, quantity, line_total, order_id')
          .in('order_id', ids);
        const map = {};
        for (const it of items || []) {
          const key = it.product_name;
          map[key] ||= { product_name: key, quantity: 0, sales: 0 };
          map[key].quantity += Number(it.quantity);
          map[key].sales = money(map[key].sales + Number(it.line_total));
        }
        bestSellers = Object.values(map)
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);

        const { data: payments } = await req.supabase
          .from('pos_payments')
          .select('method, amount, order_id')
          .in('order_id', ids)
          .eq('status', 'completed');
        for (const p of payments || []) {
          paymentBreakdown[p.method] = money(
            (paymentBreakdown[p.method] || 0) + Number(p.amount)
          );
        }
      }

      // last 7 days trend
      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - 6);
      const { data: weekOrders } = await req.supabase
        .from('pos_orders')
        .select('grand_total, created_at, status')
        .gte('created_at', weekStart.toISOString())
        .in('status', ['paid', 'preparing', 'ready', 'completed']);

      const trendMap = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        trendMap[key] = 0;
      }
      for (const o of weekOrders || []) {
        const key = String(o.created_at).slice(0, 10);
        if (trendMap[key] !== undefined) {
          trendMap[key] = money(trendMap[key] + Number(o.grand_total));
        }
      }

      res.json({
        today: {
          total_sales: totalSales,
          order_count: orderCount,
          average_order_value: average,
        },
        best_sellers: bestSellers,
        payment_breakdown: paymentBreakdown,
        recent_orders: (orders || []).slice(0, 8),
        sales_trend: Object.entries(trendMap).map(([date, total]) => ({
          date,
          total,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/reports/sales', requireDb, async (req, res) => {
    try {
      const period = req.query.period || 'daily';
      const { start, end } = reportRange(req.query);

      const { data: orders, error } = await req.supabase
        .from('pos_orders')
        .select('*')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .in('status', ['paid', 'preparing', 'ready', 'completed']);
      if (error) throw error;

      const ids = (orders || []).map((o) => o.id);
      let items = [];
      let payments = [];
      if (ids.length) {
        const { data: itemRows } = await req.supabase
          .from('pos_order_items')
          .select('*, order_id')
          .in('order_id', ids);
        items = itemRows || [];
        const { data: payRows } = await req.supabase
          .from('pos_payments')
          .select('*')
          .in('order_id', ids);
        payments = payRows || [];
      }

      const byProduct = {};
      const byMethod = {};
      for (const it of items) {
        byProduct[it.product_name] ||= { product_name: it.product_name, quantity: 0, sales: 0 };
        byProduct[it.product_name].quantity += Number(it.quantity);
        byProduct[it.product_name].sales = money(
          byProduct[it.product_name].sales + Number(it.line_total)
        );
      }
      for (const p of payments) {
        byMethod[p.method] = money((byMethod[p.method] || 0) + Number(p.amount));
      }

      res.json({
        period,
        from: start.toISOString(),
        to: end.toISOString(),
        total_sales: money((orders || []).reduce((s, o) => s + Number(o.grand_total), 0)),
        order_count: (orders || []).length,
        products: Object.values(byProduct).sort((a, b) => b.sales - a.sales),
        payment_methods: byMethod,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const PAID_STATUSES = ['paid', 'preparing', 'ready', 'completed'];
  const CAFE_TZ = process.env.CAFE_TZ || 'Asia/Kuala_Lumpur';
  const BUSINESS_CUTOFF_MS = 6 * 60 * 60 * 1000;
  const tzParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAFE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });

  function localParts(date) {
    const p = Object.fromEntries(tzParts.formatToParts(date).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  }

  // Business date rolls over at 6 AM cafe time, same as shifts.
  function businessDate(iso) {
    return localParts(new Date(new Date(iso).getTime() - BUSINESS_CUTOFF_MS)).date;
  }

  async function fetchAll(buildQuery) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await buildQuery().range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  router.get('/reports/summary', requireDb, async (req, res) => {
    try {
      const db = req.supabase;
      const { start, end } = reportRange(req.query);
      const bucket = req.query.bucket === 'month' ? 'month' : 'day';
      const keyOf = (iso) => {
        const d = businessDate(iso);
        return bucket === 'month' ? d.slice(0, 7) : d;
      };

      const [orders, items] = await Promise.all([
        fetchAll(() =>
          db
            .from('pos_orders')
            .select('id, created_at, subtotal, discount')
            .gte('created_at', start.toISOString())
            .lt('created_at', end.toISOString())
            .in('status', PAID_STATUSES)
            .order('id')
        ),
        fetchAll(() =>
          db
            .from('pos_order_items')
            .select('id, product_id, product_name, quantity, line_total, unit_cost, pos_orders!inner(created_at, status)')
            .gte('pos_orders.created_at', start.toISOString())
            .lt('pos_orders.created_at', end.toISOString())
            .in('pos_orders.status', PAID_STATUSES)
            .order('id')
        ),
      ]);

      const missing = items.filter((it) => it.unit_cost == null).map((it) => it.product_id);
      const current = missing.length ? await loadProductCosts(db, missing) : {};

      const buckets = {};
      const ensureBucket = (key) =>
        (buckets[key] ||= { key, sales: 0, cost: 0, orders: 0, discount: 0 });
      const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }));
      const weekdays = Array.from({ length: 7 }, (_, dow) => ({
        dow,
        orders: 0,
        sales: 0,
        dates: new Set(),
      }));

      let sales = 0;
      let discount = 0;
      for (const o of orders) {
        const net = Number(o.subtotal) - Number(o.discount || 0);
        const b = ensureBucket(keyOf(o.created_at));
        b.sales += net;
        b.orders += 1;
        b.discount += Number(o.discount || 0);
        sales += net;
        discount += Number(o.discount || 0);

        const { hour } = localParts(new Date(o.created_at));
        hours[hour].orders += 1;
        hours[hour].sales += net;

        const bd = businessDate(o.created_at);
        const dow = new Date(`${bd}T00:00:00Z`).getUTCDay();
        weekdays[dow].orders += 1;
        weekdays[dow].sales += net;
        weekdays[dow].dates.add(bd);
      }

      const byProduct = {};
      let cost = 0;
      let estimated = 0;
      let itemsSold = 0;
      for (const it of items) {
        let unit = it.unit_cost;
        if (unit == null) {
          unit = current[it.product_id]?.total_cost ?? 0;
          estimated += Number(it.quantity);
        }
        const lineCost = Number(unit) * Number(it.quantity);
        cost += lineCost;
        itemsSold += Number(it.quantity);
        ensureBucket(keyOf(it.pos_orders.created_at)).cost += lineCost;
        const row = (byProduct[it.product_name] ||= {
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: 0,
          sales: 0,
          cost: 0,
        });
        row.quantity += Number(it.quantity);
        row.sales += Number(it.line_total);
        row.cost += lineCost;
      }

      const gross = money(sales - cost);
      res.json({
        from: start.toISOString(),
        to: end.toISOString(),
        bucket,
        totals: {
          sales: money(sales),
          cost: money(cost),
          gross,
          margin: marginPct(gross, sales),
          discount: money(discount),
          orders: orders.length,
          items_sold: itemsSold,
          estimated_items: estimated,
        },
        buckets: Object.values(buckets)
          .map((b) => ({
            ...b,
            sales: money(b.sales),
            cost: money(b.cost),
            gross: money(b.sales - b.cost),
            discount: money(b.discount),
          }))
          .sort((a, b) => a.key.localeCompare(b.key)),
        products: Object.values(byProduct)
          .map((p) => {
            const profit = money(p.sales - p.cost);
            return {
              ...p,
              sales: money(p.sales),
              cost: money(p.cost),
              profit,
              margin: marginPct(profit, p.sales),
            };
          })
          .sort((a, b) => b.profit - a.profit),
        hours: hours.map((h) => ({ ...h, sales: money(h.sales) })),
        weekdays: weekdays.map(({ dates, ...w }) => ({
          ...w,
          sales: money(w.sales),
          days: dates.size,
        })),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/reports/profit', requireDb, async (req, res) => {
    try {
      const period = req.query.period || 'daily';
      const { start, end } = reportRange(req.query);

      const { data: orders, error } = await req.supabase
        .from('pos_orders')
        .select('id, subtotal, discount')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .in('status', ['paid', 'preparing', 'ready', 'completed']);
      if (error) throw error;

      const ids = (orders || []).map((o) => o.id);
      let items = [];
      const paymentMethods = {};
      if (ids.length) {
        const [{ data, error: itemsErr }, { data: payRows, error: payErr }] = await Promise.all([
          req.supabase.from('pos_order_items').select('*').in('order_id', ids),
          req.supabase
            .from('pos_payments')
            .select('method, amount')
            .in('order_id', ids)
            .eq('status', 'completed'),
        ]);
        if (itemsErr) throw itemsErr;
        if (payErr) throw payErr;
        items = data || [];
        for (const p of payRows || []) {
          paymentMethods[p.method] = money((paymentMethods[p.method] || 0) + Number(p.amount));
        }
      }

      const missing = items.filter((it) => it.unit_cost == null).map((it) => it.product_id);
      const current = missing.length ? await loadProductCosts(req.supabase, missing) : {};

      const byProduct = {};
      let cost = 0;
      let estimated = 0;
      for (const it of items) {
        let unit = it.unit_cost;
        if (unit == null) {
          unit = current[it.product_id]?.total_cost ?? 0;
          estimated += Number(it.quantity);
        }
        const lineCost = Number(unit) * Number(it.quantity);
        cost += lineCost;
        const row = (byProduct[it.product_name] ||= {
          product_name: it.product_name,
          quantity: 0,
          sales: 0,
          cost: 0,
        });
        row.quantity += Number(it.quantity);
        row.sales += Number(it.line_total);
        row.cost += lineCost;
      }

      const sales = money(
        (orders || []).reduce((s, o) => s + Number(o.subtotal) - Number(o.discount || 0), 0)
      );
      const totalCost = money(cost);
      const profit = money(sales - totalCost);

      res.json({
        period,
        from: start.toISOString(),
        to: end.toISOString(),
        order_count: (orders || []).length,
        sales,
        cost: totalCost,
        profit,
        margin: marginPct(profit, sales),
        estimated_items: estimated,
        payment_methods: paymentMethods,
        products: Object.values(byProduct)
          .map((p) => {
            const pProfit = money(p.sales - p.cost);
            return {
              ...p,
              sales: money(p.sales),
              cost: money(p.cost),
              profit: pProfit,
              margin: marginPct(pProfit, p.sales),
            };
          })
          .sort((a, b) => b.profit - a.profit),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

module.exports = { createPosRouter };
