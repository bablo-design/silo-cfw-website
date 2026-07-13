import {
  getSessionUser,
  publicDiscordUser,
} from "./_auth.mjs";

export default async (_request, context) => {
  const user = await getSessionUser(context);

  return Response.json(
    user
      ? { authenticated: true, user: publicDiscordUser(user) }
      : { authenticated: false, user: null },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
