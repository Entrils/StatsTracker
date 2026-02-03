export function createRequireAuth(admin) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = decoded;
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid auth token" });
    }
  };
}
