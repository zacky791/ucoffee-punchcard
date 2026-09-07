# U Coffee — Staff Punch Card

Clock-in / clock-out system for cafe staff.

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express (local) / Netlify Functions (production)
- **Database:** Supabase (free tier)

## Folder structure

```
U Coffee/
├── client/              # React app
├── server/              # Express API
├── netlify/functions/   # Serverless API wrapper for Netlify
├── supabase/            # SQL schema
└── netlify.toml         # Netlify build + redirects
```

## Local setup

1. Create a free Supabase project and run `supabase/schema.sql` then `supabase/rls-publishable.sql`.
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

## Deploy on Netlify (frontend + API together)

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import from Git**.
3. Settings (handled by `netlify.toml` — leave Base directory **empty / repo root**):
   - Build command: `npm run build:netlify`
   - Publish directory: `client/dist`
   - Functions directory: `netlify/functions`
4. **Site settings → Environment variables** — add:

| Key | Value |
|-----|--------|
| `SUPABASE_URL` | `https://vjorugrrizrpoojpocns.supabase.co` |
| `SUPABASE_ANON_KEY` | your publishable / anon key |

Do **not** set `VITE_API_URL` on Netlify — the app calls `/api` on the same site.

5. Deploy. Staff punch and history should work.

### Important
- Do **not** set Base directory to `client` (that was why the old deploy served raw `.jsx`).
- Use the **production deploy URL**, not only the draft preview, after a successful build.

## How staff use it

1. Open **Punch**.
2. Tap your name → check GPS map → confirm clock in/out.
3. **History** shows all dates; expand a person for punch details + map.

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
# ucoffee-punchcard
# ucoffee-punchcard
