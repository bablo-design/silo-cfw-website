import {
  getSessionUser,
  publicDiscordUser,
} from "./_auth.mjs";

import {
  DISCORD_API,
  buildApplicationText,
  buildReviewComponents,
  buildReviewEmbed,
  cleanText,
  createApplicantToken,
  createApplicationId,
  getApplicationsStore,
  json,
} from "./_shared.mjs";

const REQUIRED_FIELDS = [
  "real_name",
  "real_dob",
  "real_age",
  "character_name",
  "character_dob",
  "character_age",
  "character_origin",
  "character_language",
  "character_story",
  "character_positives",
  "character_negatives",
  "roleplay_experience",
  "join_reason",
  "house_scenario",
  "delivery_scenario",
  "vehicle_scenario",
  "race_scenario",
];

function validateAnswers(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    throw new Error("بيانات الطلب غير صحيحة.");
  }

  const answers = {};

  for (const key of REQUIRED_FIELDS) {
    const value = cleanText(rawAnswers[key], key === "character_story" ? 12000 : 5000);

    if (!value) {
      throw new Error(`الحقل المطلوب غير مكتمل: ${key}`);
    }

    answers[key] = value;
  }

  const age = Number(answers.real_age);
  if (!Number.isFinite(age) || age < 18 || age > 100) {
    throw new Error("العمر الحقيقي غير مسموح.");
  }

  return answers;
}

async function sendToDiscord(application) {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const channelId = process.env.DISCORD_CHANNEL_ID?.trim();
  const reviewerRoleId = process.env.DISCORD_REVIEWER_ROLE_ID?.trim();

  if (!botToken || !channelId) {
    throw new Error("إعدادات بوت الديسكورد غير مكتملة في Netlify.");
  }

  const content = reviewerRoleId
    ? `<@&${reviewerRoleId}> طلب تفعيل جديد وصل للمراجعة.`
    : "طلب تفعيل جديد وصل للمراجعة.";

  const payload = {
    content,
    allowed_mentions: reviewerRoleId
      ? { roles: [reviewerRoleId] }
      : { parse: [] },
    embeds: [buildReviewEmbed(application)],
    components: buildReviewComponents(application.id),
  };

  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));

  const textFile = new Blob([buildApplicationText(application)], {
    type: "text/plain;charset=utf-8",
  });

  form.append(
    "files[0]",
    textFile,
    `${application.id}-whitelist.txt`,
  );

  const response = await fetch(
    `${DISCORD_API}/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      body: form,
    },
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.id) {
    console.error("Discord create message failed:", result);
    throw new Error("تعذر إرسال الطلب إلى روم الديسكورد.");
  }

  return result;
}

export default async (request, context) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  }

  const sessionUser = await getSessionUser(context);

  if (!sessionUser) {
    return json(
      {
        error: "يجب تسجيل الدخول بحساب الديسكورد قبل تقديم الطلب.",
        loginRequired: true,
      },
      401,
    );
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 100_000) {
    return json({ error: "حجم الطلب أكبر من المسموح." }, 413);
  }

  try {
    const payload = await request.json();
    const answers = validateAnswers(payload.answers);

    const application = {
      id: createApplicationId(),
      applicantToken: createApplicantToken(),
      status: "pending",
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      discordMessageId: null,
      discordChannelId: process.env.DISCORD_CHANNEL_ID?.trim() || null,
      discordUser: publicDiscordUser(sessionUser),
      answers,
    };

    const store = getApplicationsStore();

    await store.setJSON(application.id, application, {
      onlyIfNew: true,
    });

    try {
      const discordMessage = await sendToDiscord(application);
      application.discordMessageId = discordMessage.id;
      await store.setJSON(application.id, application);
    } catch (error) {
      await store.delete(application.id);
      throw error;
    }

    return json(
      {
        ok: true,
        id: application.id,
        token: application.applicantToken,
        status: application.status,
        submittedAt: application.submittedAt,
      },
      201,
    );
  } catch (error) {
    console.error("submit-whitelist error:", error);
    return json(
      {
        error: error?.message || "حدث خطأ أثناء إرسال الطلب.",
      },
      400,
    );
  }
};
