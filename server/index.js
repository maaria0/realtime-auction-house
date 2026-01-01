require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const auctionRoutes = require("./routes/auctions");
const bidRoutes = require("./routes/bids");
const userRoutes = require("./routes/users");
const { initAuctionSocket } = require("./sockets/auctionSocket");
const { startAuctionCloser } = require("./jobs/auctionCloser");

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGINS ||
  "http://localhost:8080,http://localhost:4173,http://localhost:3000").split(
  ","
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.get("/", (req, res) => res.send("Auction backend running"));

app.use("/auctions", auctionRoutes);
app.use("/auctions", bidRoutes);
app.use("/", userRoutes);

// Create HTTP server + attach socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
  },
});

// make io available in routes via app locals
app.set("io", io);

// init socket handlers
initAuctionSocket(io);
startAuctionCloser(io);

server.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
