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
        payment_methods: ['cash', 'card', 'ewallet', 'other'],
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

  async function deductInventory(db, order) {
    for (const item of order.items || []) {
      if (!item.product_id) continue;
      const { data: links, error } = await db
        .from('pos_product_ingredients')
        .select('inventory_item_id, quantity_per_unit')
        .eq('product_id', item.product_id);
      if (error) throw error;
      for (const link of links || []) {
        const qty = money(Number(link.quantity_per_unit) * Number(item.quantity));
        const { data: inv, error: invError } = await db
          .from('pos_inventory_items')
          .select('id, quantity')
          .eq('id', link.inventory_item_id)
          .single();
        if (invError) throw invError;
        const next = money(Number(inv.quantity) - qty);
        await db
          .from('pos_inventory_items')
          .update({ quantity: next })
          .eq('id', inv.id);
        await db.from('pos_stock_movements').insert({
          inventory_item_id: inv.id,
          type: 'order',
          quantity: -qty,
          note: `Order ${order.order_number}`,
          order_id: order.id,
        });
      }
    }
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
        })
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/categories/:id', requireDb, async (req, res) => {
    try {
      const updates = {};
      if (req.body?.name) updates.name = String(req.body.name).trim();
      if (req.body?.sort_order !== undefined) updates.sort_order = Number(req.body.sort_order);
      if (typeof req.body?.active === 'boolean') updates.active = req.body.active;
      const { data, error } = await req.supabase
        .from('pos_categories')
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
      if (req.query.date) {
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
      const allowed = settings.payment_methods || ['cash', 'card', 'ewallet', 'other'];
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

      const itemRows = items.map((item) => ({ ...item, order_id: order.id }));
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
      res.json(data);
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
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inventory/adjust', requireDb, async (req, res) => {
    try {
      const { inventory_item_id, quantity, type = 'adjust', note } = req.body || {};
      if (!inventory_item_id) {
        return res.status(400).json({ error: 'inventory_item_id required' });
      }
      const qty = money(quantity);
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
        .update({ quantity: money(next) })
        .eq('id', item.id)
        .select('*')
        .single();
      if (upErr) throw upErr;

      await req.supabase.from('pos_stock_movements').insert({
        inventory_item_id: item.id,
        type: ['in', 'out', 'adjust'].includes(type) ? type : 'adjust',
        quantity: type === 'adjust' ? money(next - Number(item.quantity)) : money(type === 'out' ? -Math.abs(qty) : Math.abs(qty)),
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
        .select('id, order_number, status, grand_total, created_at, cashier_name')
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
      const now = new Date();
      let start = new Date();
      start.setHours(0, 0, 0, 0);
      if (period === 'weekly') start.setDate(start.getDate() - 6);
      if (period === 'monthly') start.setDate(1);

      const { data: orders, error } = await req.supabase
        .from('pos_orders')
        .select('*')
        .gte('created_at', start.toISOString())
        .lte('created_at', now.toISOString())
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
      const byCashier = {};
      const byMethod = {};
      for (const it of items) {
        byProduct[it.product_name] ||= { product_name: it.product_name, quantity: 0, sales: 0 };
        byProduct[it.product_name].quantity += Number(it.quantity);
        byProduct[it.product_name].sales = money(
          byProduct[it.product_name].sales + Number(it.line_total)
        );
      }
      for (const o of orders || []) {
        const key = o.cashier_name || 'Unknown';
        byCashier[key] ||= { cashier_name: key, orders: 0, sales: 0 };
        byCashier[key].orders += 1;
        byCashier[key].sales = money(byCashier[key].sales + Number(o.grand_total));
      }
      for (const p of payments) {
        byMethod[p.method] = money((byMethod[p.method] || 0) + Number(p.amount));
      }

      res.json({
        period,
        from: start.toISOString(),
        to: now.toISOString(),
        total_sales: money((orders || []).reduce((s, o) => s + Number(o.grand_total), 0)),
        order_count: (orders || []).length,
        products: Object.values(byProduct).sort((a, b) => b.sales - a.sales),
        cashiers: Object.values(byCashier).sort((a, b) => b.sales - a.sales),
        payment_methods: byMethod,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createPosRouter };
