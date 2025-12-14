require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const auctionRoutes = require("./routes/auctions");
const bidRoutes = require("./routes/bids");
const { initAuctionSocket } = require("./sockets/auctionSocket");
const { startAuctionCloser } = require("./jobs/auctionCloser");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Auction backend running"));

app.use("/auctions", auctionRoutes);
app.use("/auctions", bidRoutes);

// Create HTTP server + attach socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// make io available in routes via app locals
app.set("io", io);

// init socket handlers
initAuctionSocket(io);
startAuctionCloser(io);

server.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
