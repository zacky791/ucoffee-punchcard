# U Coffee — Staff Punch Card

Clock-in / clock-out system for cafe staff.

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **Database:** Supabase (free tier)

## Folder structure

```
U Coffee/
├── client/          # React app (punch kiosk UI)
├── server/          # Express API
├── supabase/        # SQL schema to run in Supabase
└── package.json     # Run both apps with one command
```

## 1. Create a free Supabase project

1. Go to [https://supabase.com](https://supabase.com) and create a free project.
2. Open **SQL Editor** → New query.
3. Paste and run everything in `supabase/schema.sql`.
4. Open **Project Settings → API** and copy:
   - **Project URL**
   - **service_role** key (secret — server only)

## 2. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your project URL and **publishable** (or secret) key:

```env
PORT=3001
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

Then also run `supabase/rls-publishable.sql` so the publishable key is allowed to read/write.

If you have the **secret / service_role** key, prefer that instead:

```env
SUPABASE_SERVICE_ROLE_KEY=your_secret_key
```

## 3. Install & run

From the `U Coffee` folder:

```bash
npm run install:all
npm run dev
```

- Punch UI: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3001](http://localhost:3001)

## How staff use it

1. Open **Punch** (home screen).
2. Tap your name.
3. Enter your **4-digit PIN**.
4. The system toggles automatically:
   - If you are off → **clock in**
   - If you are on floor → **clock out**

Sample staff from the schema (change these PINs after setup):

| Name         | PIN  |
|--------------|------|
| Aisha Rahman | 1234 |
| Daniel Lim   | 2345 |
| Mei Chen     | 3456 |
| Omar Hassan  | 4567 |

## Deploy

### A) Frontend — Netlify

1. Connect the GitHub repo on Netlify.
2. Build settings are in `netlify.toml`:
   - Base: `client`
   - Command: `npm run build`
   - Publish: `dist`
3. After the API is live (step B), add env var:
   ```
   VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
   ```
4. Trigger a new deploy (env vars are baked in at build time).

### B) Backend — Render

1. Go to [https://render.com](https://render.com) → **New** → **Blueprint** (or Web Service).
2. Connect `zacky791/u-coffee---clock-in-staff` (uses `render.yaml`).
3. Set env vars (same values as local `server/.env`):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Deploy, then open `https://YOUR-SERVICE.onrender.com/api/health` — should return `{ "ok": true }`.
5. Put that URL (no trailing slash) into Netlify `VITE_API_URL` and redeploy Netlify.

Free Render services sleep when idle; the first request after sleep can take ~30–60s.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/staff` | Active staff + clock status |
| POST | `/api/staff` | Create staff `{ name, role }` |
| PATCH | `/api/staff/:id` | Update / deactivate |
| POST | `/api/punch` | Clock in/out with GPS |
| GET | `/api/punches` | Punch history |
| GET | `/api/punches/today` | Today's punches |

## Security notes

- Keep Supabase keys in server/hosting env only — never commit `server/.env`.
- GPS location is required for each punch.
- With the publishable key, run `supabase/rls-publishable.sql`.
