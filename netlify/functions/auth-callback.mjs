import {
  clearOAuthStateCookie,
  createSessionToken,
  getOAuthStateCookie,
  setSessionCookie,
} from "./_auth.mjs";

const DISCORD_API = "https://discord.com/api/v10";

function errorRedirect(request, code) {
  const target = new URL("/", request.url);
  target.searchParams.set("discord_error", code);
  target.hash = "whitelist";
  return Response.redirect(target.toString(), 302);
}

export default async (request, context) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const discordError = url.searchParams.get("error");
  const savedState = getOAuthStateCookie(context);

  clearOAuthStateCookie(context);

  if (discordError) {
    return errorRedirect(request, "cancelled");
  }

  if (!code || !returnedState || !savedState || returnedState !== savedState) {
    return errorRedirect(request, "invalid_state");
  }

  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return errorRedirect(request, "missing_config");
  }

  const redirectUri = new URL(
    "/.netlify/functions/auth-callback",
    request.url,
  ).toString();

  try {
    const tokenResponse = await fetch(
      `${DISCORD_API}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    const tokenData = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Discord token exchange failed:", tokenData);
      return errorRedirect(request, "token_exchange");
    }

    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const discordUser = await userResponse.json().catch(() => ({}));

    if (!userResponse.ok || !discordUser.id) {
      console.error("Discord user fetch failed:", discordUser);
      return errorRedirect(request, "user_fetch");
    }

    const sessionToken = await createSessionToken(discordUser);
    setSessionCookie(context, sessionToken);

    const successUrl = new URL("/", request.url);
    successUrl.searchParams.set("discord_connected", "1");
    successUrl.hash = "whitelist";

    return Response.redirect(successUrl.toString(), 302);
  } catch (error) {
    console.error("auth-callback error:", error);
    return errorRedirect(request, "server_error");
  }
};
