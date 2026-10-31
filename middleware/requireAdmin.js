import { getSession } from "./requireAuth.js";

export async function requireAdmin(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session) {
      return res.status(401).json({ message: "Please sign in to continue." });
    }

    if (session.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required." });
    }

    req.user = session.user;
    req.session = session.session;
    next();
  } catch (error) {
    next(error);
  }
}
