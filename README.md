## Realtime Auction House

A real-time auction platform where sellers list items and buyers compete in live bidding. Get instant updates and never miss being outbid.

**Features:**
- Sellers list items with title, description, image, and custom start/end times.
- Buyers join live auction rooms and place bids instantly.
- Real-time updates sync across all participants without refreshing.
- Highest bidders are notified if someone outbids them.
- Background job closes finished auctions and emails the winner.

---

## Using the Deployed App

Simply visit the app in your browser and start bidding:

1. Enter your email (and optional display name) to connect.
2. Create auctions or join active ones.
3. Place bids and watch the action in real-time.
4. Receive notifications when outbid or when auctions close.

> Tip: Open two browser windows with different emails to see live sync in action.

---

## Running Locally

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

# Optional: Enable winner emails via Brevo transactional API
BREVO_API_KEY=your-brevo-api-key
EMAIL_FROM=your-verified-sender@example.com
```

Run the server:

```bash
npm run dev    # nodemon reloads on save
# or
npm start
```

### Database Migration

Run the initial schema:

```bash
psql -h localhost -U postgres -d auction -f server/migrations/001_init.sql
```

### Frontend Setup

Serve the frontend from the `web/` directory:

```bash
cd web
npx serve .
# or use your favorite static server
```

Open `http://localhost:3000` in your browser and start bidding.
