import {
  createOAuthState,
  setOAuthStateCookie,
} from "./_auth.mjs";

export default async (request, context) => {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();

  if (!clientId) {
    return new Response(
      "DISCORD_CLIENT_ID غير موجود داخل متغيرات Netlify.",
      { status: 500 },
    );
  }

  const state = createOAuthState();
  setOAuthStateCookie(context, state);

  const redirectUri = new URL(
    "/.netlify/functions/auth-callback",
    request.url,
  ).toString();

  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "consent");

  return Response.redirect(authorizeUrl.toString(), 302);
};
