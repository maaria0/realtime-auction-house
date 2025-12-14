const express = require("express");
const { z } = require("zod");

const pool = require("../db");
const {
  hasAuctionEnded,
  isAuctionActive,
  secondsUntilEnd,
} = require("../utils/time");

const router = express.Router();

const isoDateSchema = z.preprocess((value) => {
  const parsed =
    typeof value === "string" || value instanceof Date
      ? new Date(value)
      : undefined;
  if (!parsed || Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}, z.date());

const numericIdSchema = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}, z.number().int().positive());

const createAuctionSchema = z
  .object({
    ownerId: numericIdSchema,
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1),
    imageUrl: z
      .string()
      .trim()
      .url()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    startTime: isoDateSchema,
    endTime: isoDateSchema,
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

router.post("/", async (req, res) => {
  let parsed;
  try {
    parsed = createAuctionSchema.parse(req.body);
  } catch (err) {
    const issues = err.errors?.map((e) => e.message).join(", ") || err.message;
    return res.status(400).json({ error: issues });
  }

  const { ownerId, title, description, imageUrl, startTime, endTime } = parsed;

  try {
    const result = await pool.query(
      `INSERT INTO auctions (owner_id, title, description, image_url, start_time, end_time, status)
       VALUES ($1,$2,$3,$4,$5,$6,'OPEN')
       RETURNING *`,
      [ownerId, title, description, imageUrl || null, startTime, endTime]
    );
    return res.status(201).json(formatAuction(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const BASE_SELECT = `
  SELECT
    a.*,
    top_bid.amount AS current_bid,
    top_bid.bidder_id AS current_bidder_id
  FROM auctions a
  LEFT JOIN LATERAL (
    SELECT bidder_id, amount
    FROM bids
    WHERE auction_id = a.id
    ORDER BY amount DESC
    LIMIT 1
  ) AS top_bid ON TRUE
`;

router.get("/", async (req, res) => {
  const status = (req.query.status || "active").toLowerCase();
  const now = new Date();

  let sql;
  switch (status) {
    case "closed":
      sql = `${BASE_SELECT}
        WHERE a.end_time <= $1 OR a.status = 'CLOSED'
        ORDER BY a.end_time DESC`;
      break;
    case "active":
    default:
      sql = `${BASE_SELECT}
        WHERE a.start_time <= $1 AND a.end_time > $1 AND a.status <> 'CLOSED'
        ORDER BY a.end_time ASC`;
      break;
  }

  try {
    const result = await pool.query(sql, [now]);
    const auctions = result.rows.map((row) => formatAuction(row, now));
    return res.json(auctions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function formatAuction(row, now = new Date()) {
  const status = row.status || "OPEN";
  const closed = status === "CLOSED" || hasAuctionEnded(row, now);
  const active = !closed && isAuctionActive(row, now);
  const state = closed ? "closed" : active ? "active" : "upcoming";

  return {
    id: Number(row.id),
    ownerId: Number(row.owner_id),
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    startTime: new Date(row.start_time).toISOString(),
    endTime: new Date(row.end_time).toISOString(),
    status,
    state,
    currentBid: row.current_bid ? Number(row.current_bid) : null,
    highestBidderId: row.current_bidder_id
      ? Number(row.current_bidder_id)
      : null,
    secondsRemaining: closed ? 0 : secondsUntilEnd(row, now),
  };
}

module.exports = router;
