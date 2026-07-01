// Shared password-gate constants, imported by BOTH the edge middleware and the
// Node login route — keep this module free of Node-only APIs so it runs on edge.

export const SITE_PASSWORD =
  process.env.SITE_PASSWORD === undefined ? "NCDE2026" : process.env.SITE_PASSWORD;

export const AUTH_COOKIE = "site_auth";

// Opaque cookie value issued after a correct password (never the password itself).
// Bound to the password by a small synchronous hash so that changing SITE_PASSWORD
// invalidates old sessions. Not cryptographic — this is a soft audience gate.
function tokenFor(pw: string): string {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = (((h << 5) + h) ^ pw.charCodeAt(i)) >>> 0;
  return "v1-" + h.toString(36);
}

export const AUTH_TOKEN = tokenFor(SITE_PASSWORD || "");
