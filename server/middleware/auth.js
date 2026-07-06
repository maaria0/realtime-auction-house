const jwt = require("jsonwebtoken");

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return payload.userId;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  try {
    req.userId = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { signToken, verifyToken, requireAuth };
