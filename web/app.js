const API_BASE = window.API_BASE || "http://localhost:4000";

const state = {
  userId: null,
  socket: null,
  active: [],
  closed: [],
  selectedAuctionId: null,
  joinedAuctions: new Set(),
};

document.addEventListener("DOMContentLoaded", () => {
  bindForms();
  refreshAuctions();
  setInterval(() => refreshAuctions(false), 15_000);
  setInterval(tickCountdowns, 1_000);
});

function bindForms() {
  const userForm = document.getElementById("user-form");
  userForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("user-email-input").value.trim();
    const displayName = document.getElementById("user-name-input").value.trim();
    if (!email) {
      showToast("Enter a valid email", "warn");
      return;
    }
    registerUser(email, displayName || undefined);
  });

  const createForm = document.getElementById("create-auction-form");
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.userId) {
      showToast("Connect a user before creating auctions", "warn");
      return;
    }

    const title = document.getElementById("auction-title").value.trim();
    const description = document
      .getElementById("auction-description")
      .value.trim();
    const imageUrl = document.getElementById("auction-image").value.trim();
    const start = document.getElementById("auction-start").value;
    const end = document.getElementById("auction-end").value;

    if (!title || !description || !start || !end) {
      showToast("All fields except image are required", "warn");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/auctions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: state.userId,
          title,
          description,
          imageUrl: imageUrl || undefined,
          startTime: new Date(start).toISOString(),
          endTime: new Date(end).toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Unable to create auction");
      }

      showToast("Auction created");
      createForm.reset();
      refreshAuctions();
    } catch (err) {
      showToast(err.message, "warn");
    }
  });

  document
    .getElementById("refresh-active")
    .addEventListener("click", () => refreshAuctions());
  document
    .getElementById("refresh-closed")
    .addEventListener("click", () => refreshClosed());
}

async function refreshAuctions(showToastOnError = true) {
  try {
    const res = await fetch(`${API_BASE}/auctions?status=active`);
    if (!res.ok) throw new Error("Failed to load auctions");
    state.active = await res.json();
    renderActive();
    if (state.selectedAuctionId) {
      const match = state.active.find(
        (a) => a.id === state.selectedAuctionId
      );
      if (!match) {
        state.selectedAuctionId = null;
      }
    }
    renderSelected();
  } catch (err) {
    if (showToastOnError) showToast(err.message, "warn");
  }
  refreshClosed(false);
}

async function refreshClosed(showToastOnError = true) {
  try {
    const res = await fetch(`${API_BASE}/auctions?status=closed`);
    if (!res.ok) throw new Error("Failed to load closed auctions");
    state.closed = await res.json();
    renderClosed();
  } catch (err) {
    if (showToastOnError) showToast(err.message, "warn");
  }
}

async function registerUser(email, displayName) {
  try {
    const response = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to register user");
    }
    state.userId = Number(data.id);
    connectSocket();
    const label = data.display_name || data.email;
    document.getElementById(
      "user-status"
    ).textContent = `Connected as ${label} (id ${data.id})`;
    showToast(`Connected as ${label}`);
  } catch (err) {
    showToast(err.message, "warn");
  }
}

function renderActive() {
  const container = document.getElementById("active-auctions");
  container.innerHTML = "";
  if (!state.active.length) {
    container.innerHTML = `<p class="empty-state">No active auctions right now.</p>`;
    return;
  }

  state.active.forEach((auction) => {
    const card = document.createElement("div");
    card.className = "auction-card";
    const left = document.createElement("div");
    const right = document.createElement("div");
    right.className = "actions";

    const title = document.createElement("h3");
    title.textContent = auction.title;

    const meta = document.createElement("p");
    meta.className = "auction-meta";
    const remainingSeconds = computeRemainingSeconds(auction);
    const bidText = auction.currentBid
      ? `Highest: ₹${auction.currentBid} (user ${auction.highestBidderId})`
      : "No bids yet";
    meta.textContent = `${bidText} • Ends in ${formatDuration(
      remainingSeconds
    )}`;

    const pill = document.createElement("span");
    pill.className = `status-pill ${auction.state}`;
    pill.textContent = auction.state.toUpperCase();

    left.appendChild(title);
    left.appendChild(meta);
    left.appendChild(pill);

    const joinBtn = document.createElement("button");
    joinBtn.textContent = state.joinedAuctions.has(auction.id)
      ? "Watching"
      : "Join";
    joinBtn.className = state.joinedAuctions.has(auction.id)
      ? "secondary"
      : "";
    joinBtn.addEventListener("click", () => joinAuctionRoom(auction.id));

    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Details";
    selectBtn.addEventListener("click", () => {
      state.selectedAuctionId = auction.id;
      renderSelected();
    });

    right.appendChild(joinBtn);
    right.appendChild(selectBtn);

    card.appendChild(left);
    card.appendChild(right);
    container.appendChild(card);
  });
}

function renderClosed() {
  const container = document.getElementById("closed-auctions");
  container.innerHTML = "";
  if (!state.closed.length) {
    container.innerHTML = `<p class="empty-state">No closed auctions yet.</p>`;
    return;
  }

  state.closed.forEach((auction) => {
    const card = document.createElement("div");
    card.className = "auction-card";
    const left = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = auction.title;

    const meta = document.createElement("p");
    meta.className = "auction-meta";
    const winnerText = auction.currentBid
      ? `Sold for ₹${auction.currentBid} to user ${auction.highestBidderId}`
      : "No winning bids";
    meta.textContent = `${winnerText}`;

    const pill = document.createElement("span");
    pill.className = "status-pill closed";
    pill.textContent = "CLOSED";

    left.appendChild(title);
    left.appendChild(meta);
    left.appendChild(pill);

    card.appendChild(left);
    container.appendChild(card);
  });
}

function renderSelected() {
  const wrapper = document.getElementById("selected-content");
  wrapper.innerHTML = "";

  if (!state.selectedAuctionId) {
    wrapper.className = "empty-state";
    wrapper.textContent = "Join or select an active auction to bid.";
    return;
  }

  const auction = state.active.find(
    (a) => a.id === state.selectedAuctionId
  );
  if (!auction) {
    wrapper.className = "empty-state";
    wrapper.textContent = "This auction is no longer active.";
    return;
  }

  wrapper.className = "";
  const title = document.createElement("h3");
  title.textContent = auction.title;

  const info = document.createElement("p");
  info.textContent = auction.description;

  const timing = document.createElement("p");
  timing.innerHTML = `<strong>Ends:</strong> ${new Date(
    auction.endTime
  ).toLocaleString()} • <strong>Remaining:</strong> ${formatDuration(
    computeRemainingSeconds(auction)
  )}`;

  const price = document.createElement("p");
  price.innerHTML = `<strong>Current Bid:</strong> ${
    auction.currentBid ? `₹${auction.currentBid}` : "No bids yet"
  }`;

  const bidForm = document.createElement("form");
  bidForm.id = "bid-form";
  bidForm.innerHTML = `
    <label>
      Your Bid (₹)
      <input type="number" id="bid-amount" min="1" step="1" required />
    </label>
    <button type="submit">Place Bid</button>
  `;
  bidForm.addEventListener("submit", (e) => submitBid(e, auction.id));

  wrapper.appendChild(title);
  wrapper.appendChild(info);
  wrapper.appendChild(timing);
  wrapper.appendChild(price);
  wrapper.appendChild(bidForm);
}

function connectSocket() {
  if (state.socket) {
    state.socket.disconnect();
  }
  const socket = io(API_BASE, { transports: ["websocket", "polling"] });
  state.socket = socket;

  socket.on("connect", () => {
    socket.emit("AUTH", { userId: state.userId });
    for (const id of state.joinedAuctions) {
      socket.emit("JOIN_AUCTION", { auctionId: id });
    }
  });

  socket.on("NEW_BID", ({ bid }) => {
    if (!bid) return;
    showToast(
      `Auction ${bid.auction_id} has a new bid of ₹${bid.amount}`,
      "info"
    );
    refreshAuctions(false);
  });

  socket.on("OUTBID", (payload) => {
    showToast(payload.message || "You have been outbid", "warn");
  });

  socket.on("AUCTION_CLOSED", (payload) => {
    showToast(
      `Auction ${payload.auctionId} closed${
        payload.finalAmount ? ` at ₹${payload.finalAmount}` : ""
      }`
    );
    state.joinedAuctions.delete(payload.auctionId);
    refreshAuctions(false);
  });
}

function joinAuctionRoom(auctionId) {
  if (!state.userId || !state.socket) {
    showToast("Connect first to join auctions", "warn");
    return;
  }
  state.socket.emit("JOIN_AUCTION", { auctionId });
  state.joinedAuctions.add(auctionId);
  showToast(`Watching auction ${auctionId}`);
  renderActive();
  state.selectedAuctionId = auctionId;
  renderSelected();
}

async function submitBid(event, auctionId) {
  event.preventDefault();
  if (!state.userId) {
    showToast("Connect a user first", "warn");
    return;
  }
  const amount = Number(document.getElementById("bid-amount").value);
  if (!amount) return;

  try {
    const response = await fetch(`${API_BASE}/auctions/${auctionId}/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidderId: state.userId, amount }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to place bid");
    }
    showToast("Bid placed!");
    document.getElementById("bid-amount").value = "";
    refreshAuctions(false);
  } catch (err) {
    showToast(err.message, "warn");
  }
}

function formatDuration(seconds) {
  if (seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return h === "00" ? `${m}:${s}` : `${h}:${m}:${s}`;
}

function computeRemainingSeconds(auction) {
  if (!auction?.endTime) return 0;
  const endMs = new Date(auction.endTime).getTime();
  const diffMs = endMs - Date.now();
  return Math.max(0, Math.floor(diffMs / 1000));
}

function tickCountdowns() {
  if (!state.active.length) return;
  renderActive();
  if (state.selectedAuctionId) {
    renderSelected();
  }
}

function showToast(message, tone = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${tone === "warn" ? "warn" : ""}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
