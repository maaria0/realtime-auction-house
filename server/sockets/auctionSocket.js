// Very simple in-memory map: userId -> socketId
// (For MVP. Later you can support multiple sockets per user.)
const userSockets = new Map();

function initAuctionSocket(io) {
  io.on("connection", (socket) => {
    // Client should call: socket.emit("AUTH", { userId })
    socket.on("AUTH", ({ userId }) => {
      if (!userId) return;
      userSockets.set(String(userId), socket.id);
    });

    // Client should call: socket.emit("JOIN_AUCTION", { auctionId })
    socket.on("JOIN_AUCTION", ({ auctionId }) => {
      if (!auctionId) return;
      socket.join(`auction:${auctionId}`);
    });

    socket.on("LEAVE_AUCTION", ({ auctionId }) => {
      if (!auctionId) return;
      socket.leave(`auction:${auctionId}`);
    });

    socket.on("disconnect", () => {
      // remove from map (best-effort)
      for (const [uid, sid] of userSockets.entries()) {
        if (sid === socket.id) userSockets.delete(uid);
      }
    });
  });
}

function emitNewBid(io, auctionId, payload) {
  io.to(`auction:${auctionId}`).emit("NEW_BID", payload);
}

function emitOutbid(io, outbidUserId, payload) {
  const sid = userSockets.get(String(outbidUserId));
  if (sid) io.to(sid).emit("OUTBID", payload);
}

function emitAuctionClosed(io, auctionId, payload) {
  io.to(`auction:${auctionId}`).emit("AUCTION_CLOSED", payload);
}

module.exports = {
  initAuctionSocket,
  emitNewBid,
  emitOutbid,
  emitAuctionClosed,
};
