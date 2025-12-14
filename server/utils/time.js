function nowUtc() {
  return new Date();
}

function hasAuctionStarted(auction, reference = nowUtc()) {
  return reference >= new Date(auction.start_time);
}

function hasAuctionEnded(auction, reference = nowUtc()) {
  return reference >= new Date(auction.end_time);
}

function isAuctionActive(auction, reference = nowUtc()) {
  return (
    hasAuctionStarted(auction, reference) &&
    !hasAuctionEnded(auction, reference) &&
    auction.status !== "CLOSED"
  );
}

function secondsUntilEnd(auction, reference = nowUtc()) {
  const end = new Date(auction.end_time).getTime();
  const diffMs = end - reference.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

module.exports = {
  nowUtc,
  hasAuctionStarted,
  hasAuctionEnded,
  isAuctionActive,
  secondsUntilEnd,
};
