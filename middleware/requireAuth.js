import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

export async function getSession(req) {
  return auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
}

export async function requireAuth(req, res, next) {
  try {
    const session = await getSession(req);

    if (!session) {
      return res.status(401).json({ message: "Please sign in to continue." });
    }

    req.user = session.user;
    req.session = session.session;
    next();
  } catch (error) {
    next(error);
  }
}
