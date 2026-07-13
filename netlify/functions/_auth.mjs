const SESSION_COOKIE = "silo_discord_session";
const OAUTH_STATE_COOKIE = "silo_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return new Uint8Array(Buffer.from(normalized + padding, "base64"));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index];
  }

  return difference === 0;
}

async function hmac(value) {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET غير موجود أو قصير. يجب أن يكون 32 حرفاً على الأقل.",
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

export async function createSessionToken(user) {
  const payload = {
    id: String(user.id),
    username: String(user.username || ""),
    globalName: String(user.global_name || ""),
    avatar: user.avatar ? String(user.avatar) : null,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };

  const encodedPayload = base64UrlEncode(
    encoder.encode(JSON.stringify(payload)),
  );

  const signature = base64UrlEncode(await hmac(encodedPayload));
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token) {
  try {
    if (!token || !token.includes(".")) return null;

    const [encodedPayload, encodedSignature] = token.split(".");
    const receivedSignature = base64UrlDecode(encodedSignature);
    const expectedSignature = await hmac(encodedPayload);

    if (!timingSafeEqual(receivedSignature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(
      decoder.decode(base64UrlDecode(encodedPayload)),
    );

    if (!payload.id || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch (error) {
    console.error("verifySessionToken error:", error);
    return null;
  }
}

export async function getSessionUser(context) {
  const token = context.cookies.get(SESSION_COOKIE);
  return verifySessionToken(token);
}

export function setSessionCookie(context, token) {
  context.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie(context) {
  context.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
  });
}

export function setOAuthStateCookie(context, state) {
  context.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });
}

export function getOAuthStateCookie(context) {
  return context.cookies.get(OAUTH_STATE_COOKIE);
}

export function clearOAuthStateCookie(context) {
  context.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
  });
}

export function createOAuthState() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export function discordAvatarUrl(user, size = 128) {
  if (!user?.avatar) return null;

  const extension = String(user.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=${size}`;
}

export function publicDiscordUser(user) {
  if (!user) return null;

  return {
    id: String(user.id),
    username: String(user.username || ""),
    globalName: String(user.globalName || user.global_name || ""),
    displayName: String(
      user.globalName ||
      user.global_name ||
      user.username ||
      "Discord User"
    ),
    avatar: user.avatar || null,
    avatarUrl: discordAvatarUrl(user),
  };
}
