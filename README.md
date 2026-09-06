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

## Screens

- **Punch** — kiosk for clock in / out
- **Staff** — add or deactivate team members
- **History** — filter punches by date

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/staff` | Active staff + clock status |
| POST | `/api/staff` | Create staff `{ name, pin, role }` |
| PATCH | `/api/staff/:id` | Update / deactivate |
| POST | `/api/punch` | Clock in/out `{ staff_id, pin }` |
| GET | `/api/punches?date=YYYY-MM-DD` | Punch history |
| GET | `/api/punches/today` | Today's punches |

## Security notes

- The **service_role** key stays in `server/.env` only — never put it in the React app.
- Staff verify with a PIN on each punch.
- Tables use RLS with no public policies; the Node server bypasses RLS via the service role.
