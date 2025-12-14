const pool = require("../db");
const { emitAuctionClosed } = require("../sockets/auctionSocket");
const { sendEmail } = require("../utils/email");

const CLOSE_INTERVAL_MS =
  Number(process.env.AUCTION_CLOSE_INTERVAL_MS) || 5_000;
const CLOSE_BATCH_SIZE =
  Number(process.env.AUCTION_CLOSE_BATCH_SIZE) || 10;

function startAuctionCloser(io) {
  if (!io) {
    throw new Error("startAuctionCloser requires a socket.io instance");
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await closeExpiredAuctions(io);
    } catch (err) {
      console.error("[auctionCloser] cycle failed", err);
    } finally {
      running = false;
    }
  };

  // run once on boot so newly expired auctions are handled immediately
  tick();
  const interval = setInterval(tick, CLOSE_INTERVAL_MS);
  return interval;
}

async function closeExpiredAuctions(io) {
  const client = await pool.connect();
  const closed = [];

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT *
       FROM auctions
       WHERE end_time <= NOW()
         AND status <> 'CLOSED'
       ORDER BY end_time ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [CLOSE_BATCH_SIZE]
    );

    if (!rows.length) {
      await client.query("COMMIT");
      return 0;
    }

    for (const auction of rows) {
      const topBidRes = await client.query(
        `SELECT bidder_id, amount
         FROM bids
         WHERE auction_id = $1
         ORDER BY amount DESC
         LIMIT 1`,
        [auction.id]
      );

      const winningBid = topBidRes.rows[0] || null;

      await client.query(
        `UPDATE auctions
         SET status = 'CLOSED'
         WHERE id = $1`,
        [auction.id]
      );

      closed.push({ auction, winningBid });
    }

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }

  for (const entry of closed) {
    await announceAndNotify(io, entry);
  }

  return closed.length;
}

async function announceAndNotify(io, { auction, winningBid }) {
  const winnerId = winningBid ? Number(winningBid.bidder_id) : null;
  const finalAmount = winningBid ? Number(winningBid.amount) : null;
  const payload = {
    auctionId: Number(auction.id),
    title: auction.title,
    winnerId,
    finalAmount,
    closedAt: new Date().toISOString(),
    message: winnerId
      ? "Auction finished. Winner has been notified."
      : "Auction finished with no bids.",
  };

  emitAuctionClosed(io, auction.id, payload);

  if (winnerId && finalAmount) {
    const email = await fetchUserEmail(winnerId);
    if (email) {
      await safeSendEmail({
        to: email,
        subject: `You won the auction: ${auction.title}`,
        text: `Congratulations! You won \"${auction.title}\" for Rs.${finalAmount}. Our team will reach out with the next steps shortly.`,
      });
    }
  }
}

async function fetchUserEmail(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT email FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return rows[0]?.email || null;
  } catch (err) {
    console.warn(
      `[auctionCloser] unable to fetch email for user ${userId}: ${err.message}`
    );
    return null;
  }
}

async function safeSendEmail(payload) {
  try {
    await sendEmail(payload);
  } catch (err) {
    console.error("[auctionCloser] failed to send email", err);
  }
}

module.exports = { startAuctionCloser };
