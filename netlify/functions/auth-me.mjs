import {
  getSessionUser,
  publicDiscordUser,
} from "./_auth.mjs";

import {
  DiscordApiError,
  discordBotRequest,
  discordRoleErrorMessage,
  getDiscordRoleConfig,
} from "./_shared.mjs";

function response(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export default async (_request, context) => {
  const sessionUser = await getSessionUser(context);

  if (!sessionUser) {
    return response({
      authenticated: false,
      user: null,
      whitelist: null,
    });
  }

  const user = publicDiscordUser(sessionUser);

  try {
    const {
      guildId,
      acceptedRoleId,
    } = getDiscordRoleConfig();

    const memberResult = await discordBotRequest(
      `/guilds/${guildId}/members/${sessionUser.id}`,
    );

    const memberRoles = new Set(memberResult.data?.roles ?? []);
    const alreadyAccepted = memberRoles.has(acceptedRoleId);

    return response({
      authenticated: true,
      user,
      whitelist: {
        isGuildMember: true,
        alreadyAccepted,
        canApply: !alreadyAccepted,
        reason: alreadyAccepted
          ? "حسابك حاصل على رتبة مقبول تفعيل مسبقاً."
          : null,
      },
    });
  } catch (error) {
    // الشخص مسجل دخول لكن ليس عضواً داخل سيرفر الديسكورد.
    if (
      error instanceof DiscordApiError &&
      (error.code === 10007 || error.status === 404)
    ) {
      return response({
        authenticated: true,
        user,
        whitelist: {
          isGuildMember: false,
          alreadyAccepted: false,
          canApply: false,
          reason: "يجب أن تدخل سيرفر الديسكورد قبل تقديم طلب التفعيل.",
        },
      });
    }

    console.error("auth-me role check failed:", error);

    return response(
      {
        authenticated: true,
        user,
        whitelist: {
          isGuildMember: null,
          alreadyAccepted: false,
          canApply: false,
          reason: discordRoleErrorMessage(error),
        },
      },
      503,
    );
  }
};
