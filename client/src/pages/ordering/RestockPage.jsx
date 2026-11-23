import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import Toast from '../../components/Toast';
import { businessDateKey } from '../../lib/performance';
import { INV_STATIONS, groupByStation, stationLabel } from '../../lib/stations';

function fmtQty(n) {
  return Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 3 });
}

const round2 = (n) => Math.round(n * 100) / 100;
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;
const MAX_RECEIPTS = 6;
const UNITS = ['g', 'ml', 'pcs', 'kg', 'L', 'slice', 'pack'];

function modeFromSeed(seed, isEdit) {
  return isEdit || seed.inventory_item_id || seed.type || seed.name ? 'manual' : 'auto';
}

function groupStockOptions(stockList, suggestions = []) {
  const ordered = suggestions.length
    ? [
        ...suggestions,
        ...stockList.filter((i) => !suggestions.some((s) => s.id === i.id)),
      ]
    : stockList;
  return groupByStation(ordered, (i) => stockList.find((s) => s.id === i.id) || i);
}

function compressReceipt(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Upload receipt photos (JPG/PNG).'));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process image'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not open image'));
    };
    img.src = objectUrl;
  });
}

function emptyForm(date, purchase = {}) {
  return {
    type:
      purchase.id && !purchase.inventory_item_id
        ? 'other'
        : purchase.type || (purchase.inventory_item_id ? 'stock' : 'stock'),
    inventory_item_id: purchase.inventory_item_id || '',
    name: purchase.inventory_item_id ? '' : purchase.name || '',
    packs: purchase.packs != null ? String(purchase.packs) : '',
    quantity: purchase.quantity != null ? String(Number(purchase.quantity)) : '',
    byPack: purchase.packs != null,
    amount: purchase.amount != null ? String(Number(purchase.amount)) : '',
    amountTouched: purchase.amount != null,
    purchase_date: purchase.purchase_date || date,
    note: purchase.note || '',
  };
}

export default function RestockPage() {
  const today = businessDateKey(new Date().toISOString());
  const navigate = useNavigate();
  const location = useLocation();
  const seed = location.state?.purchase || {};
  const isEdit = Boolean(seed.id);

  const [inventory, setInventory] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [entryMode, setEntryMode] = useState(() => modeFromSeed(seed, isEdit));
  const [form, setForm] = useState(() => emptyForm(today, seed));
  const [receipts, setReceipts] = useState([]);
  const [parsed, setParsed] = useState([]);
  const [stockList, setStockList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const next = location.state?.purchase || {};
    const editing = Boolean(next.id);
    setEntryMode(modeFromSeed(next, editing));
    setForm(emptyForm(today, next));
    setReceipts([]);
    setParsed([]);
    setError('');
  }, [location.key, today]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.posGetInventory().catch(() => []), api.posGetSettings().catch(() => null)]).then(
      ([inv, settings]) => {
        if (!alive) return;
        const list = (inv || []).filter((i) => i.active !== false);
        setInventory(list);
        setStockList(list);
        setCurrency(settings?.currency || 'MYR');
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  const item = inventory.find((i) => i.id === form.inventory_item_id);
  const packSize = item ? Number(item.pack_size) || 0 : 0;
  const packPrice = item ? Number(item.pack_price) || 0 : 0;
  const canPack = form.type === 'stock' && packSize > 0 && (packSize !== 1 || packPrice > 0);
  const byPack = canPack && form.byPack;
  const stockQty = byPack ? (Number(form.packs) || 0) * packSize : Number(form.quantity) || 0;
  const suggested =
    item && packPrice > 0 && packSize > 0 ? round2((stockQty / packSize) * packPrice) : null;
  const isAuto = !isEdit && entryMode === 'auto';

  function set(patch) {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!next.amountTouched) {
        const it = inventory.find((i) => i.id === next.inventory_item_id);
        const size = Number(it?.pack_size) || 0;
        const price = Number(it?.pack_price) || 0;
        if (next.type === 'stock' && it && size > 0 && price > 0) {
          const qty = next.byPack ? (Number(next.packs) || 0) * size : Number(next.quantity) || 0;
          next.amount = qty ? String(round2((qty / size) * price)) : '';
        }
      }
      return next;
    });
  }

  async function onPickReceipts(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setError('');
    setParsed([]);
    try {
      const room = MAX_RECEIPTS - receipts.length;
      if (room <= 0) {
        setError(`You can upload up to ${MAX_RECEIPTS} receipt photos.`);
        return;
      }
      const next = [];
      for (const file of files.slice(0, room)) {
        const url = await compressReceipt(file);
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name || 'receipt.jpg',
          url,
        });
      }
      setReceipts((prev) => [...prev, ...next].slice(0, MAX_RECEIPTS));
    } catch (err) {
      setError(err.message || 'Could not attach receipt');
    }
  }

  function removeReceipt(id) {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
    setParsed([]);
  }

  function patchParsed(index, patch) {
    setParsed((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function scanReceipts() {
    if (!receipts.length) {
      setError('Upload at least one receipt photo first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const urls = receipts.map((r) => r.url);
      const data = await api.posParseReceipt({
        image: urls[0],
        images: urls,
        purchase_date: form.purchase_date,
      });
      const rows = (data.items || []).map((row) => {
        const suggestedId = row.inventory_item_id || row.suggestions?.[0]?.id || '';
        const matched = stockList.find((i) => i.id === suggestedId);
        const unit =
          matched?.unit ||
          row.unit ||
          row.suggestions?.[0]?.unit ||
          'pcs';
        return {
          inventory_item_id: suggestedId,
          name: row.name || '',
          quantity: row.quantity != null ? String(row.quantity) : '1',
          amount: String(Number(row.amount || 0)),
          note: row.note || '',
          unit,
          suggestions: row.suggestions || [],
          question: row.question || '',
          action: suggestedId ? 'topup' : 'new',
          include: true,
        };
      });
      if (!rows.length) throw new Error('Could not read any product lines. Try clearer photos or Manual.');
      setParsed(rows);
    } catch (err) {
      setError(err.message || 'Could not read receipt');
    } finally {
      setBusy(false);
    }
  }

  async function submitAuto(e) {
    e.preventDefault();
    if (!receipts.length) {
      setError('Receipt photo is required for Auto.');
      return;
    }
    const rows = parsed.filter((r) => r.include);
    if (!rows.length) {
      setError('Keep at least one item, or scan again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let saved = 0;
      let nextStock = [...stockList];
      for (const row of rows) {
        let inventoryItemId = row.inventory_item_id || null;
        let unit = row.unit || 'pcs';
        const quantity = Number(row.quantity);

        if (row.action === 'new') {
          const uom = String(row.unit || unit || 'pcs').trim() || 'pcs';
          const created = await api.posCreateInventory({
            name: row.name,
            unit: uom,
            quantity: 0,
            pack_size: 1,
            pack_price: Number(row.amount) || 0,
            min_threshold: 0,
            active: true,
          });
          inventoryItemId = created.id;
          unit = created.unit || uom;
          nextStock = [...nextStock, created];
          setStockList(nextStock);
        } else if (row.action === 'topup') {
          const inv = nextStock.find((i) => i.id === inventoryItemId);
          if (!inv) throw new Error(`Choose which registered stock “${row.name}” belongs to`);
          unit = inv.unit || row.unit || unit;
        } else {
          inventoryItemId = null;
        }

        const payload = {
          purchase_date: form.purchase_date,
          name:
            row.action === 'topup'
              ? nextStock.find((i) => i.id === inventoryItemId)?.name || row.name
              : row.name,
          inventory_item_id: inventoryItemId,
          quantity: inventoryItemId && quantity > 0 ? quantity : null,
          amount: Number(row.amount),
          note: row.note || (receipts.length ? `Receipt ×${receipts.length}` : ''),
        };
        if (!payload.name) throw new Error('Each line needs a name');
        if (payload.inventory_item_id && !(payload.quantity > 0)) {
          throw new Error(`Enter quantity for ${payload.name}`);
        }
        if (!Number.isFinite(payload.amount) || payload.amount < 0) {
          throw new Error(`Enter amount paid for ${payload.name}`);
        }
        await api.posCreatePurchase(payload);
        saved += 1;
      }
      setToast({
        tone: 'ok',
        text: saved === 1 ? '1 restock recorded' : `${saved} restock items recorded`,
      });
      setTimeout(() => navigate('/ordering/restock-overview'), 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitManual(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        purchase_date: form.purchase_date,
        name: form.type === 'stock' ? item?.name || '' : form.name,
        inventory_item_id: form.type === 'stock' ? form.inventory_item_id || null : null,
        quantity: form.type === 'stock' ? stockQty : null,
        amount: Number(form.amount),
        note: form.note,
      };
      if (form.type === 'stock' && !payload.inventory_item_id) {
        throw new Error('Choose the stock item you bought');
      }
      if (isEdit) await api.posUpdatePurchase(seed.id, payload);
      else await api.posCreatePurchase(payload);
      setToast({
        tone: 'ok',
        text: isEdit ? `${payload.name} updated` : `${payload.name} recorded`,
      });
      setTimeout(() => navigate('/ordering/restock-overview'), 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="pos-page-head">
        <h1>Restock</h1>
      </div>

      <form
        className="pos-card pos-restock-composer"
        onSubmit={isAuto ? submitAuto : submitManual}
      >
        <div className="pos-restock-composer-head">
          <h2 className="pos-card-title" style={{ margin: 0 }}>
            {isEdit ? `Edit ${seed.name || 'restock'}` : 'Add restock'}
          </h2>
          {!isEdit && (
            <div className="pos-segment" role="radiogroup" aria-label="Entry mode">
              <button
                type="button"
                role="radio"
                aria-checked={entryMode === 'auto'}
                className={entryMode === 'auto' ? 'active' : ''}
                onClick={() => setEntryMode('auto')}
              >
                Auto
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={entryMode === 'manual'}
                className={entryMode === 'manual' ? 'active' : ''}
                onClick={() => setEntryMode('manual')}
              >
                Manual
              </button>
            </div>
          )}
        </div>

        {error && <div className="pos-alert error">{error}</div>}

        {isAuto ? (
          <div className="pos-form-grid">
            <label className="pos-field">
              <span>Date</span>
              <input
                className="pos-input"
                type="date"
                required
                value={form.purchase_date}
                onChange={(e) => set({ purchase_date: e.target.value })}
              />
            </label>
            <div className="pos-field">
              <span>Receipt photos</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                hidden
                onChange={onPickReceipts}
              />
              <button
                type="button"
                className="pos-btn ghost"
                style={{ width: '100%' }}
                disabled={busy || receipts.length >= MAX_RECEIPTS}
                onClick={() => fileRef.current?.click()}
              >
                {receipts.length ? 'Add more photos' : 'Upload receipt(s)'}
              </button>
            </div>

            {receipts.length > 0 && (
              <div className="pos-field full">
                <div className="pos-restock-receipt-grid">
                  {receipts.map((r) => (
                    <div key={r.id} className="pos-restock-receipt-thumb">
                      <img src={r.url} alt={r.name} />
                      <button
                        type="button"
                        className="pos-chat-attach-remove"
                        aria-label={`Remove ${r.name}`}
                        onClick={() => removeReceipt(r.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="pos-btn primary"
                  style={{ marginTop: '0.55rem' }}
                  disabled={busy}
                  onClick={scanReceipts}
                >
                  {busy && !parsed.length ? 'Reading…' : `Scan ${receipts.length} photo(s) with AI`}
                </button>
              </div>
            )}

            {parsed.length > 0 && (
              <div className="pos-field full pos-restock-parsed">
                <strong>Found {parsed.length} line(s) — confirm each match</strong>
                <div className="pos-restock-parsed-grid">
                {parsed.map((row, index) => (
                  <div
                    key={index}
                    className={`pos-restock-parsed-card ${row.include ? '' : 'dimmed'}`}
                  >
                    <div className="pos-restock-parsed-head">
                      <input
                        className="pos-input"
                        placeholder="Receipt item name"
                        value={row.name}
                        onChange={(e) => patchParsed(index, { name: e.target.value })}
                        required={row.include}
                      />
                      <button
                        type="button"
                        className="pos-btn ghost"
                        onClick={() => patchParsed(index, { include: !row.include })}
                      >
                        {row.include ? 'Skip' : 'Keep'}
                      </button>
                    </div>

                    {row.include && (
                      <>
                        <div
                          className="pos-segment small"
                          role="radiogroup"
                          aria-label={`Match for ${row.name}`}
                        >
                          <button
                            type="button"
                            className={row.action === 'topup' ? 'active' : ''}
                            onClick={() => patchParsed(index, { action: 'topup' })}
                          >
                            Top up existing
                          </button>
                          <button
                            type="button"
                            className={row.action === 'new' ? 'active' : ''}
                            onClick={() =>
                              patchParsed(index, {
                                action: 'new',
                                inventory_item_id: '',
                                unit: row.unit || 'pcs',
                              })
                            }
                          >
                            Register new
                          </button>
                          {/* <button
                            type="button"
                            className={row.action === 'other' ? 'active' : ''}
                            onClick={() =>
                              patchParsed(index, { action: 'other', inventory_item_id: '' })
                            }
                          >
                            One off
                          </button> */}
                        </div>

                        {row.action === 'topup' && (
                          <div className="pos-restock-stock-pick">
                            <select
                              className="pos-select"
                              value={row.inventory_item_id}
                              required
                              onChange={(e) => {
                                const id = e.target.value;
                                const inv = stockList.find((i) => i.id === id);
                                patchParsed(index, {
                                  inventory_item_id: id,
                                  unit: inv?.unit || row.unit || 'pcs',
                                });
                              }}
                            >
                              <option value="">Choose registered stock…</option>
                              {[
                                ...INV_STATIONS.map((s) => [s.id, s.label]),
                              ].map(([key, label]) => {
                                const items = groupStockOptions(
                                  stockList,
                                  row.suggestions || []
                                )[key];
                                if (!items.length) return null;
                                return (
                                  <optgroup key={key} label={label}>
                                    {items.map((i) => (
                                      <option key={i.id} value={i.id}>
                                        {i.name}
                                        {i.unit ? ` (${i.unit})` : ''}
                                        {row.suggestions?.some((s) => s.id === i.id)
                                          ? ' · suggested'
                                          : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                );
                              })}
                            </select>
                            {(() => {
                              const selected = stockList.find(
                                (i) => i.id === row.inventory_item_id
                              );
                              if (!selected) return null;
                              return (
                                <div className="pos-restock-stock-preview">
                                  <span className="pos-restock-stock-thumb">
                                    {selected.image_url ? (
                                      <img
                                        src={selected.image_url}
                                        alt={selected.name}
                                        loading="lazy"
                                      />
                                    ) : (
                                      <span aria-hidden="true" />
                                    )}
                                  </span>
                                  <div>
                                    <strong>{selected.name}</strong>
                                    <span className="pos-meta">
                                      {selected.unit || '—'}
                                      {` · ${stationLabel(selected.station)}`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* {row.action === 'new' && (
                          <p className="pos-meta" style={{ margin: 0 }}>
                            Will create inventory “{row.name || '…'}” ({row.unit || 'pcs'}) then add the
                            qty below.
                          </p>
                        )} */}

                        {/* {row.action === 'other' && (
                          <p className="pos-meta" style={{ margin: 0 }}>
                            Records what you paid only — nothing is added to inventory (e.g. cleaning,
                            bags, one-off buys you don’t track as stock).
                          </p>
                        )} */}

                        <div className="pos-restock-parsed-nums">
                          <label className="pos-field">
                            <span>
                              Qty
                              {row.action === 'other'
                                ? ' (optional)'
                                : row.unit
                                  ? ` (${row.unit})`
                                  : ''}
                            </span>
                            <input
                              className="pos-input"
                              type="number"
                              min="0"
                              step="any"
                              value={row.quantity}
                              onChange={(e) => patchParsed(index, { quantity: e.target.value })}
                              required={row.action !== 'other'}
                            />
                          </label>
                          <label className="pos-field">
                            <span>Unit</span>
                            <select
                              className="pos-select"
                              value={UNITS.includes(row.unit) ? row.unit : row.unit || 'pcs'}
                              onChange={(e) => patchParsed(index, { unit: e.target.value })}
                              required={row.action === 'new' || row.action === 'topup'}
                            >
                              {!UNITS.includes(row.unit) && row.unit ? (
                                <option value={row.unit}>{row.unit}</option>
                              ) : null}
                              {UNITS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="pos-field">
                            <span>Paid ({currency})</span>
                            <input
                              className="pos-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.amount}
                              onChange={(e) => patchParsed(index, { amount: e.target.value })}
                              required
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                </div>
              </div>
            )}

          </div>
        ) : (
          <>
            <div
              className="pos-segment"
              role="radiogroup"
              aria-label="Restock type"
              style={{ marginBottom: '0.85rem' }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={form.type === 'stock'}
                className={form.type === 'stock' ? 'active' : ''}
                onClick={() => set({ type: 'stock' })}
              >
                Restock item
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={form.type === 'other'}
                className={form.type === 'other' ? 'active' : ''}
                onClick={() => set({ type: 'other' })}
              >
                Other
              </button>
            </div>

            <div className="pos-form-grid">
              {form.type === 'stock' ? (
                <>
                  <label className="pos-field full">
                    <span>Stock item</span>
                    <select
                      className="pos-select"
                      required
                      value={form.inventory_item_id}
                      onChange={(e) => set({ inventory_item_id: e.target.value, byPack: true })}
                    >
                      <option value="">Choose item…</option>
                      {inventory.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({fmtQty(i.quantity)} {i.unit} left)
                        </option>
                      ))}
                    </select>
                  </label>
                  {canPack && (
                    <div className="pos-field full">
                      <div className="pos-segment small" role="radiogroup" aria-label="Count by">
                        <button
                          type="button"
                          className={byPack ? 'active' : ''}
                          onClick={() => set({ byPack: true })}
                        >
                          Packs ({fmtQty(packSize)} {item.unit})
                        </button>
                        <button
                          type="button"
                          className={!byPack ? 'active' : ''}
                          onClick={() => set({ byPack: false })}
                        >
                          {item.unit}
                        </button>
                      </div>
                    </div>
                  )}
                  <label className="pos-field">
                    <span>
                      {byPack ? 'Packs bought' : `Amount bought${item ? ` (${item.unit})` : ''}`}
                    </span>
                    <input
                      className="pos-input"
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={byPack ? form.packs : form.quantity}
                      onChange={(e) =>
                        set(byPack ? { packs: e.target.value } : { quantity: e.target.value })
                      }
                    />
                  </label>
                </>
              ) : (
                <label className="pos-field full">
                  <span>What did you buy?</span>
                  <input
                    className="pos-input"
                    required
                    placeholder="e.g. Ice, cleaning supplies, gas"
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </label>
              )}
              <label className={`pos-field ${form.type === 'stock' ? '' : 'full'}`}>
                <span>Paid ({currency})</span>
                <input
                  className="pos-input"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.amount}
                  onChange={(e) => set({ amount: e.target.value, amountTouched: true })}
                />
              </label>
              {form.type === 'stock' && item && stockQty > 0 && (
                <p className="pos-meta pos-field full" style={{ margin: 0 }}>
                  Adds {fmtQty(stockQty)} {item.unit} to stock →{' '}
                  {fmtQty(
                    Number(item.quantity) +
                      stockQty -
                      (seed.inventory_item_id === item.id ? Number(seed.quantity) || 0 : 0)
                  )}{' '}
                  {item.unit}
                  {suggested != null && form.amountTouched && Number(form.amount) !== suggested
                    ? ` · usual price ${formatMoney(suggested, currency)}`
                    : ''}
                </p>
              )}
              <label className="pos-field">
                <span>Date</span>
                <input
                  className="pos-input"
                  type="date"
                  required
                  value={form.purchase_date}
                  onChange={(e) => set({ purchase_date: e.target.value })}
                />
              </label>
              <label className="pos-field">
                <span>Note (optional)</span>
                <input
                  className="pos-input"
                  placeholder="e.g. shop name"
                  value={form.note}
                  onChange={(e) => set({ note: e.target.value })}
                />
              </label>
            </div>
          </>
        )}

        {(!isAuto || parsed.length > 0) && (
          <div className="pos-restock-composer-actions">
            <button
              type="button"
              className="pos-btn ghost"
              disabled={busy}
              onClick={() => navigate('/ordering/restock-overview')}
            >
              Cancel
            </button>
            <button type="submit" className="pos-btn primary" disabled={busy}>
              {busy ? 'Saving…' : isAuto ? 'Save restock' : isEdit ? 'Save' : 'Add'}
            </button>
          </div>
        )}
      </form>

      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
