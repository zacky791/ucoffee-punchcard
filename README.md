# U Coffee — Staff Punch Card + Ordering System (POS)

Clock-in / clock-out for cafe staff, plus a red-themed café POS under **Ordering System**.

- **Frontend:** React (Vite) — `client/`
- **Backend:** Node.js + Express — `server/`
- **Database:** Supabase (PostgreSQL)
- **Hardware:** Provider-based printer / cash drawer layer (`mock` by default)

## Folder structure

```
U Coffee/
├── client/              # React app
├── server/              # Express API (+ POS + hardware integrations)
├── netlify/functions/   # Serverless API wrapper for Netlify
├── supabase/            # SQL schema (punch + POS)
└── netlify.toml
```

## Local setup

1. Create / open your Supabase project and run:
   - `supabase/schema.sql` (and any schedule migrations you already use)
   - `supabase/rls-publishable.sql`
   - **`supabase/pos-schema.sql`** (Ordering System tables + sample menu)
   - **`supabase/pos-rls.sql`** (POS table grants / policies)

2. Copy env:

```bash
cp server/.env.example server/.env
```

```env
PORT=3001
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

3. Run:

```bash
npm run install:all
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001
- Ordering System: http://localhost:5173/ordering

> POS checkout and hardware always go through the Express API (Vite proxies `/api` → `:3001`). Keep the server running even if punch uses direct Supabase.

## Ordering System

Top nav → **Ordering System**. Sidebar pages:

| Page | Path |
|------|------|
| Dashboard | `/ordering` |
| New Order (POS) | `/ordering/pos` |
| Orders | `/ordering/orders` |
| Products | `/ordering/products` |
| Categories | `/ordering/categories` |
| Inventory | `/ordering/inventory` |
| Reports | `/ordering/reports` |
| Settings | `/ordering/settings` |

### Cashier / printer / cash drawer

Browsers cannot open a physical cash drawer or silently print ESC/POS. After payment the backend calls `HardwareIntegrationService`:

| Provider | Behavior |
|----------|----------|
| `mock` (default) | Logs receipt text + drawer kick in the **server** console |
| `escpos` | Scaffold for USB/TCP/serial — needs your printer path/host before live I/O |
| `local_bridge` | Forwards print/drawer to a service on the cashier PC (`LOCAL_BRIDGE_URL`) |
| `cashier_api` | Adapter stub — wire real vendor endpoints when you have API docs |

Configure under **Ordering System → Settings** (test connection / test print / open drawer).

If print fails after a successful payment, the order is still saved — use **Retry print** on the success banner or Orders → Details → Reprint.

### Sample POS API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pos/products` | Menu + modifiers |
| POST | `/api/pos/orders/checkout` | Pay, save, print, open drawer |
| GET | `/api/pos/orders` | Order list |
| POST | `/api/pos/orders/:id/reprint` | Reprint receipt |
| GET | `/api/pos/reports/dashboard` | Today’s sales |
| GET/PUT | `/api/pos/settings` | Café + hardware config |

## Deploy on Netlify

Same as before (`netlify.toml`). After deploy, run `pos-schema.sql` + `pos-rls.sql` on Supabase. For USB printers with a remote API, run a **local hardware bridge** on the cashier PC and set provider to `local_bridge`.

## Staff punch (existing)

1. Open **Punch**.
2. Tap your name → check GPS map → confirm clock in/out.

## Punch API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/staff` | Active staff + clock status |
| POST | `/api/staff` | Create staff `{ name, role }` |
| PATCH | `/api/staff/:id` | Update / deactivate |
| POST | `/api/punch` | Clock in/out with GPS |
| GET | `/api/punches` | Punch history |
| GET | `/api/punches/today` | Today's punches |
