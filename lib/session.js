// Jetons de session signés (HMAC-SHA256) via l'API Web Crypto : disponible
// dans Node 20 (tests, Server Actions) ET dans le runtime edge du middleware.
// Format du jeton : "<expiration en ms>.<signature hex>".

const encoder = new TextEncoder();

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signSession(expiresAtMs, secret) {
  const payload = String(expiresAtMs);
  return `${payload}.${await hmacHex(payload, secret)}`;
}

export async function verifySession(token, secret, nowMs) {
  if (typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(payload) || Number(payload) <= nowMs) return false;
  const expected = await hmacHex(payload, secret);
  if (signature.length !== expected.length) return false;
  // Comparaison en temps constant : on parcourt toujours toute la chaîne
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const SESSION_COOKIE = "lc_admin";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
