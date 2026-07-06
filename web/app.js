const { useState, useEffect, useRef } = React;
const h = React.createElement;
const API_BASE = window.API_BASE || "http://localhost:4000";

function useInterval(cb, ms) {
  const saved = useRef();
  useEffect(() => {
    saved.current = cb;
  }, [cb]);
  useEffect(() => {
    if (ms == null) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
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

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Unable to read image")));
    reader.readAsDataURL(file);
  });
}

function Toasts({ toasts }) {
  return h(
    "div",
    { id: "toast-container" },
    toasts.map((t) =>
      h(
        "div",
        { key: t.id, className: `toast ${t.tone === "warn" ? "warn" : ""}` },
        t.message
      )
    )
  );
}

function App() {
  const [userId, setUserId] = useState(null);
  const [userLabel, setUserLabel] = useState(null);
  const [active, setActive] = useState([]);
  const [closed, setClosed] = useState([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState(null);
  const [joinedAuctions, setJoinedAuctions] = useState(new Set());
  const [socket, setSocket] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    refreshAuctions();
    refreshClosed();
  }, []);

  useInterval(() => refreshAuctions(false), 15000);
  useInterval(() => setTick((t) => t + 1), 1000);

  function pushToast(message, tone = "info") {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { id, message, tone }]);
    setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), 4000);
  }

  async function refreshAuctions(showToastOnError = true) {
    try {
      const res = await fetch(`${API_BASE}/auctions?status=active`);
      if (!res.ok) throw new Error("Failed to load auctions");
      const data = await res.json();
      setActive(data);
      if (selectedAuctionId) {
        const match = data.find((a) => a.id === selectedAuctionId);
        if (!match) setSelectedAuctionId(null);
      }
    } catch (err) {
      if (showToastOnError) pushToast(err.message, "warn");
    }
    refreshClosed(false);
  }

  async function refreshClosed(showToastOnError = true) {
    try {
      const res = await fetch(`${API_BASE}/auctions?status=closed`);
      if (!res.ok) throw new Error("Failed to load closed auctions");
      const data = await res.json();
      setClosed(data);
    } catch (err) {
      if (showToastOnError) pushToast(err.message, "warn");
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
      if (!response.ok) throw new Error(data.error || "Unable to register user");
      setUserId(Number(data.id));
      setUserLabel(data.display_name || data.email);
      pushToast(`Connected as ${data.display_name || data.email}`);
      connectSocket(Number(data.id));
    } catch (err) {
      pushToast(err.message, "warn");
    }
  }

  function connectSocket(uid) {
    if (socket) socket.disconnect();
    const s = io(API_BASE, { transports: ["websocket", "polling"] });
    setSocket(s);
    s.on("connect", () => {
      s.emit("AUTH", { userId: uid });
      for (const id of joinedAuctions) {
        s.emit("JOIN_AUCTION", { auctionId: id });
      }
    });
    s.on("NEW_BID", ({ bid }) => {
      if (!bid) return;
      pushToast(`Auction ${bid.auction_id} has a new bid of ₹${bid.amount}`);
      refreshAuctions(false);
    });
    s.on("OUTBID", (payload) => pushToast(payload.message || "You have been outbid", "warn"));
    s.on("AUCTION_CLOSED", (payload) => {
      pushToast(`Auction ${payload.auctionId} closed${payload.finalAmount ? ` at ₹${payload.finalAmount}` : ""}`);
      setJoinedAuctions((prev) => {
        const copy = new Set(prev);
        copy.delete(payload.auctionId);
        return copy;
      });
      refreshAuctions(false);
    });
  }

  function joinAuctionRoom(auctionId) {
    if (!userId || !socket) {
      pushToast("Connect first to join auctions", "warn");
      return;
    }
    socket.emit("JOIN_AUCTION", { auctionId });
    setJoinedAuctions((s) => new Set(s).add(auctionId));
    pushToast(`Watching auction ${auctionId}`);
    setSelectedAuctionId(auctionId);
  }

  async function submitBid(auctionId, amount) {
    if (!userId) {
      pushToast("Connect a user first", "warn");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/auctions/${auctionId}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidderId: userId, amount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to place bid");
      pushToast("Bid placed!");
      refreshAuctions(false);
    } catch (err) {
      pushToast(err.message, "warn");
    }
  }

  async function createAuction(form) {
    if (!userId) return pushToast("Connect a user before creating auctions", "warn");
    try {
      const { title, description, imageFile, start, end } = form;
      const imageUrl = imageFile ? await readImageFile(imageFile) : undefined;
      const response = await fetch(`${API_BASE}/auctions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: userId,
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
      pushToast("Auction created");
      refreshAuctions();
    } catch (err) {
      pushToast(err.message, "warn");
    }
  }

  const selected = active.find((a) => a.id === selectedAuctionId);

  return h(
    "div",
    null,
    h(
      "header",
      null,
      h("h1", null, "Realtime Auction House"),
      h("p", null, "Place bids, stay synced, never refresh.")
    ),
    h(
      "main",
      null,
      h(
        "section",
        { className: "panel", id: "user-panel" },
        h("h2", null, "Your Session"),
        h(UserForm, { onRegister: registerUser, userLabel }),
        h(
          "p",
          { id: "user-status" },
          userLabel ? `Connected as ${userLabel} (id ${userId})` : "Not connected"
        )
      ),
      h(
        "section",
        { className: "panel", id: "create-panel" },
        h("h2", null, "List A New Item"),
        h(CreateForm, { onCreate: createAuction })
      ),
      h(
        "section",
        { className: "panel", id: "active-panel" },
        h(
          "div",
          { className: "panel-header" },
          h("h2", null, "Active Auctions"),
          h("div", null, h("button", { onClick: () => refreshAuctions() }, "Refresh"))
        ),
        h(AuctionList, {
          auctions: active,
          joined: joinedAuctions,
          onJoin: joinAuctionRoom,
          onSelect: (id) => setSelectedAuctionId(id),
        })
      ),
      h(
        "section",
        { className: "panel", id: "selected-panel" },
        h("h2", null, "Selected Auction"),
        h(
          "div",
          { id: "selected-content" },
          selected
            ? h(SelectedAuction, { auction: selected, onBid: submitBid })
            : h("div", { className: "empty-state" }, "Join or select an active auction to bid.")
        )
      ),
      h(
        "section",
        { className: "panel", id: "closed-panel" },
        h(
          "div",
          { className: "panel-header" },
          h("h2", null, "Closed Auctions"),
          h("button", { onClick: () => refreshClosed() }, "Refresh")
        ),
        h(ClosedList, { auctions: closed })
      )
    ),
    h(Toasts, { toasts })
  );
}

function UserForm({ onRegister, userLabel }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  return h(
    "form",
    {
      id: "user-form",
      onSubmit: (e) => {
        e.preventDefault();
        if (!email) return;
        onRegister(email, name || undefined);
        setEmail("");
        setName("");
      },
    },
    h(
      "label",
      null,
      "Email",
      h("input", {
        type: "email",
        value: email,
        onChange: (e) => setEmail(e.target.value),
        required: true,
      })
    ),
    h(
      "label",
      null,
      "Display Name",
      h("input", {
        type: "text",
        value: name,
        onChange: (e) => setName(e.target.value),
      })
    ),
    h("button", { type: "submit" }, userLabel ? "Reconnect" : "Connect")
  );
}

function CreateForm({ onCreate }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  return h(
    "form",
    {
      id: "create-auction-form",
      onSubmit: async (e) => {
        e.preventDefault();
        if (!title || !description || !start || !end) return;
        await onCreate({ title, description, start, end, imageFile });
        setTitle("");
        setDescription("");
        setStart("");
        setEnd("");
        setImageFile(null);
        e.target.reset();
      },
    },
    h(
      "div",
      { className: "form-grid" },
      h(
        "label",
        null,
        "Title",
        h("input", {
          type: "text",
          id: "auction-title",
          value: title,
          onChange: (e) => setTitle(e.target.value),
          required: true,
        })
      ),
      h(
        "label",
        null,
        "Image",
        h("input", {
          type: "file",
          id: "auction-image",
          accept: "image/*",
          onChange: (e) => setImageFile(e.target.files[0]),
        }),
        h(
          "div",
          {
            className: `file-input-display${!imageFile ? " empty" : ""}`,
          },
          imageFile
            ? h(
                "span",
                { className: "file-chosen" },
                previewUrl &&
                  h("img", {
                    src: previewUrl,
                    alt: "Selected preview",
                    className: "file-preview-thumb",
                  }),
                imageFile.name
              )
            : h(
                "span",
                null,
                "Choose File  ",
                h("span", { className: "file-button" }, "↗")
              )
        )
      ),
      h(
        "label",
        { className: "full" },
        "Description",
        h("textarea", {
          id: "auction-description",
          rows: "3",
          value: description,
          onChange: (e) => setDescription(e.target.value),
          required: true,
        })
      ),
      h(
        "label",
        null,
        "Start Time",
        h("input", {
          type: "datetime-local",
          id: "auction-start",
          value: start,
          onChange: (e) => setStart(e.target.value),
          required: true,
        })
      ),
      h(
        "label",
        null,
        "End Time",
        h("input", {
          type: "datetime-local",
          id: "auction-end",
          value: end,
          onChange: (e) => setEnd(e.target.value),
          required: true,
        })
      )
    ),
    h("button", { type: "submit" }, "Create Auction")
  );
}

function AuctionList({ auctions, joined, onJoin, onSelect }) {
  if (!auctions.length) {
    return h("p", { className: "empty-state" }, "No active auctions right now.");
  }
  return h(
    "div",
    { id: "active-auctions", className: "auction-list" },
    auctions.map((auction) =>
      h(
        "div",
        {
          key: auction.id,
          className: `auction-card${auction.imageUrl ? "" : " no-image"}`,
        },
        auction.imageUrl &&
          h("img", {
            className: "auction-thumb",
            src: auction.imageUrl,
            alt: auction.title,
            loading: "lazy",
          }),
        h(
          "div",
          null,
          h("h3", null, auction.title),
          h(
            "p",
            { className: "auction-meta" },
            `${
              auction.currentBid
                ? `Highest: ₹${auction.currentBid} (user ${auction.highestBidderId})`
                : "No bids yet"
            } • Ends in ${formatDuration(computeRemainingSeconds(auction))}`
          ),
          h(
            "span",
            { className: `status-pill ${auction.state}` },
            auction.state.toUpperCase()
          )
        ),
        h(
          "div",
          { className: "actions" },
          h(
            "button",
            {
              className: joined.has(auction.id) ? "secondary" : "",
              onClick: () => onJoin(auction.id),
            },
            joined.has(auction.id) ? "Watching" : "Join"
          ),
          h("button", { onClick: () => onSelect(auction.id) }, "Details")
        )
      )
    )
  );
}

function SelectedAuction({ auction, onBid }) {
  const [amount, setAmount] = useState("");
  return h(
    "div",
    null,
    h("h3", null, auction.title),
    auction.imageUrl &&
      h("img", {
        src: auction.imageUrl,
        className: "selected-auction-image",
        alt: auction.title,
      }),
    h("p", null, auction.description),
    h(
      "p",
      null,
      h("strong", null, "Ends:"),
      ` ${new Date(auction.endTime).toLocaleString()} • `,
      h("strong", null, "Remaining:"),
      ` ${formatDuration(computeRemainingSeconds(auction))}`
    ),
    h(
      "p",
      null,
      h("strong", null, "Current Bid:"),
      ` ${auction.currentBid ? `₹${auction.currentBid}` : "No bids yet"}`
    ),
    h(
      "form",
      {
        id: "bid-form",
        onSubmit: (e) => {
          e.preventDefault();
          const val = Number(amount);
          if (!val) return;
          onBid(auction.id, val);
          setAmount("");
        },
      },
      h(
        "label",
        null,
        "Your Bid (₹)",
        h("input", {
          type: "number",
          id: "bid-amount",
          min: "1",
          step: "1",
          value: amount,
          onChange: (e) => setAmount(e.target.value),
          required: true,
        })
      ),
      h("button", { type: "submit" }, "Place Bid")
    )
  );
}

function ClosedList({ auctions }) {
  if (!auctions.length) {
    return h("p", { className: "empty-state" }, "No closed auctions yet.");
  }
  return h(
    "div",
    { id: "closed-auctions", className: "auction-list" },
    auctions.map((auction) =>
      h(
        "div",
        {
          key: auction.id,
          className: `auction-card${auction.imageUrl ? "" : " no-image"}`,
        },
        auction.imageUrl &&
          h("img", {
            className: "auction-thumb",
            src: auction.imageUrl,
            alt: auction.title,
            loading: "lazy",
          }),
        h(
          "div",
          null,
          h("h3", null, auction.title),
          h(
            "p",
            { className: "auction-meta" },
            auction.currentBid
              ? `Sold for ₹${auction.currentBid} to user ${auction.highestBidderId}`
              : "No winning bids"
          ),
          h("span", { className: "status-pill closed" }, "CLOSED")
        )
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
