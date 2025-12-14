const express = require("express");
const pool = require("../db");
const { emitNewBid, emitOutbid } = require("../sockets/auctionSocket");

const router = express.Router();

/**
 * POST /auctions/:id/bids
 * Body: { bidderId: number, amount: number }
 *
 * Rules:
 * - Owner cannot bid
 * - Auction must be active (server time)
 * - First bid >= 5
 * - Next bid >= current + 1
 * - Concurrency-safe using SELECT ... FOR UPDATE
 */
router.post("/:id/bids", async (req, res) => {
  const auctionId = Number(req.params.id);
  const bidderId = Number(req.body.bidderId);
  const amount = Number(req.body.amount);

  if (!auctionId || !bidderId || !Number.isFinite(amount)) {
    return res.status(400).json({ error: "Invalid auctionId/bidderId/amount" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock auction row so concurrent bids can't both win
    const auctionRes = await client.query(
      `SELECT * FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );

    if (auctionRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Auction not found" });
    }

    const auction = auctionRes.rows[0];
    const now = new Date();

    // Not started yet
    if (now < auction.start_time) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Auction has not started yet" });
    }

    // Ended
    if (now >= auction.end_time || auction.status === "CLOSED") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Auction ended" });
    }

    // Owner cannot bid
    if (Number(auction.owner_id) === bidderId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cannot bid on your own item" });
    }

    // Get current highest bid (if any)
    const topBidRes = await client.query(
      `SELECT amount, bidder_id
       FROM bids
       WHERE auction_id = $1
       ORDER BY amount DESC
       LIMIT 1`,
      [auctionId]
    );

    const prevTop = topBidRes.rows.length ? topBidRes.rows[0] : null;

    // Validate amount rule
    if (!prevTop) {
      if (amount < 5) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Minimum first bid is 5" });
      }
    } else {
      const current = Number(prevTop.amount);
      const minNext = current + 1;
      if (amount < minNext) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `Bid must be >= ${minNext}` });
      }
    }

    // Insert bid
    const insertedRes = await client.query(
      `INSERT INTO bids (auction_id, bidder_id, amount)
       VALUES ($1, $2, $3)
       RETURNING id, auction_id, bidder_id, amount, created_at`,
      [auctionId, bidderId, amount]
    );

    const newBid = insertedRes.rows[0];

    await client.query("COMMIT");

    // ---- Real-time events (after commit) ----
    const io = req.app.get("io");

    // Send to everyone watching this auction
    emitNewBid(io, auctionId, { bid: newBid });

    // Notify previous highest bidder they got outbid
    if (prevTop && Number(prevTop.bidder_id) !== bidderId) {
      emitOutbid(io, Number(prevTop.bidder_id), {
        auctionId,
        newAmount: Number(newBid.amount),
        yourPreviousAmount: Number(prevTop.amount),
        message: "You have been outbid",
      });
    }

    return res.json({ success: true, bid: newBid });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
