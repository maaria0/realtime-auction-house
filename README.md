## Realtime Auction House

This repository contains a Node.js + Socket.IO backend (`server/`) and a lightweight browser client (`web/`) that together deliver a zero-refresh auction experience:

- Sellers list items with title, description, image, and custom start/end times.
- Buyers join live auction rooms, place bids, and see the feed update instantly.
- Highest bidder is notified in real-time if someone outbids them.
- Background job closes finished auctions, pushes results to every subscriber, and emails the winner (logs to console in this demo).

### Prerequisites

- Node.js 18+
- PostgreSQL database with `auctions`, `bids`, and `users` (needs an `email` column for winners).

### Backend Setup

```bash
cd server
npm install
```

Create a `.env` in `server/` (or export env vars) with:

```
PORT=4000
# Either provide a single DATABASE_URL or individual PG* variables
DATABASE_URL=postgres://user:pass@localhost:5432/auction
# or
PGHOST=localhost
PGDATABASE=auction
PGUSER=postgres
PGPASSWORD=postgres
PGPORT=5432
```

Run the server:

```bash
npm run dev    # nodemon reloads on save
# or
npm start
```

### Frontend Setup

The client is a static HTML/JS experience under `web/`. Serve it with any static server (examples below assume the backend runs on `http://localhost:4000`).

```bash
cd web
npx serve .
# or use your favorite static server
```

Open the printed URL in a browser. In the UI:

1. Enter a numeric user id to connect (acts as login + bidder identity).
2. Create auctions (start/end times use your local timezone).
3. Join an active auction to start receiving live events.
4. Place bids; toast notifications fire whenever you are outbid or when auctions close.

> Tip: open two browser windows with different user ids to see the live sync and outbid notifications in action.

If your backend is hosted elsewhere, define `window.API_BASE` before `app.js` is loaded in `web/index.html`.
