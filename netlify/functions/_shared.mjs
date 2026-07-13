import { getStore } from "@netlify/blobs";

export const DISCORD_API = "https://discord.com/api/v10";
export const STORE_NAME = "silo-whitelist-applications";


export class DiscordApiError extends Error {
  constructor(message, status, code = null, responseData = null) {
    super(message);
    this.name = "DiscordApiError";
    this.status = status;
    this.code = code;
    this.responseData = responseData;
  }
}

export function getDiscordRoleConfig() {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const acceptedRoleId = process.env.DISCORD_ACCEPTED_ROLE_ID?.trim();
  const rejectedRoleId = process.env.DISCORD_REJECTED_ROLE_ID?.trim();

  if (!guildId || !acceptedRoleId || !rejectedRoleId) {
    throw new Error(
      "إعدادات رتب التفعيل غير مكتملة في Netlify. تأكد من DISCORD_GUILD_ID وDISCORD_ACCEPTED_ROLE_ID وDISCORD_REJECTED_ROLE_ID.",
    );
  }

  if (acceptedRoleId === rejectedRoleId) {
    throw new Error("رول القبول ورول الرفض لا يمكن أن يكونا نفس الرول.");
  }

  return {
    guildId,
    acceptedRoleId,
    rejectedRoleId,
  };
}

export async function discordBotRequest(
  path,
  {
    method = "GET",
    reason = null,
    body = undefined,
    headers: customHeaders = {},
  } = {},
) {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();

  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN غير موجود داخل متغيرات Netlify.");
  }

  const headers = {
    Authorization: `Bot ${botToken}`,
    ...customHeaders,
  };

  if (reason) {
    headers["X-Audit-Log-Reason"] = encodeURIComponent(reason).slice(0, 512);
  }

  const response = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers,
    body,
  });

  if (response.status === 204) {
    return {
      status: response.status,
      data: null,
    };
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new DiscordApiError(
      data?.message || `Discord API error (${response.status})`,
      response.status,
      data?.code ?? null,
      data,
    );
  }

  return {
    status: response.status,
    data,
  };
}

export function discordRoleErrorMessage(error) {
  if (error instanceof DiscordApiError) {
    if (error.code === 10007 || error.status === 404) {
      return "المتقدم مو موجود داخل سيرفر الديسكورد. لازم يدخل السيرفر أولاً.";
    }

    if (error.code === 10011) {
      return "آيدي رول القبول أو الرفض غير صحيح.";
    }

    if (
      error.code === 50013 ||
      error.code === 50001 ||
      error.status === 403
    ) {
      return "البوت ما عنده صلاحية Manage Roles، أو رتبة البوت مو أعلى من رول القبول والرفض.";
    }
  }

  return error?.message || "تعذر تحديث رول المتقدم داخل الديسكورد.";
}

export function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function getApplicationsStore() {
  return getStore({
    name: STORE_NAME,
    consistency: "strong",
  });
}

export function cleanText(value, maxLength = 5000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

export function createApplicationId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `SILO-${time}-${random}`;
}

export function createApplicantToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`.replaceAll("-", "");
}

export function buildApplicationText(application) {
  const a = application.answers ?? {};

  return [
    "طلب تفعيل SILO CFW",
    `رقم الطلب: ${application.id}`,
    `تاريخ التقديم: ${application.submittedAt}`,
    "",
    "01 - المعلومات الحقيقية",
    `الاسم: ${a.real_name ?? ""}`,
    `حساب الديسكورد: ${application.discordUser?.displayName ?? ""}`,
    `Discord Username: ${application.discordUser?.username ?? ""}`,
    `Discord ID: ${application.discordUser?.id ?? ""}`,
    `تاريخ الميلاد: ${a.real_dob ?? ""}`,
    `العمر: ${a.real_age ?? ""}`,
    "",
    "02 - معلومات الشخصية",
    `الاسم: ${a.character_name ?? ""}`,
    `تاريخ الميلاد: ${a.character_dob ?? ""}`,
    `العمر: ${a.character_age ?? ""}`,
    `المنشأ: ${a.character_origin ?? ""}`,
    `اللغة أو اللهجة: ${a.character_language ?? ""}`,
    "",
    "03 - قصة الشخصية",
    a.character_story ?? "",
    "",
    "04 - إيجابيات وسلبيات الشخصية",
    `الإيجابيات: ${a.character_positives ?? ""}`,
    `السلبيات: ${a.character_negatives ?? ""}`,
    "",
    "05 - الخبرة السابقة",
    a.roleplay_experience ?? "",
    "",
    "06 - سبب دخول المدينة",
    a.join_reason ?? "",
    "",
    "07 - سيناريو رهن البيت",
    a.house_scenario ?? "",
    "",
    "08 - سيناريو موظف التوصيل",
    a.delivery_scenario ?? "",
    "",
    "09 - سيناريو بيع المركبة",
    a.vehicle_scenario ?? "",
    "",
    "10 - سيناريو السباق غير القانوني",
    a.race_scenario ?? "",
  ].join("\n");
}

export function buildReviewEmbed(application, status = "pending", reviewer = null) {
  const a = application.answers ?? {};

  const colors = {
    pending: 0xd4af37,
    accepted: 0x42ca78,
    rejected: 0xff695c,
  };

  const titles = {
    pending: "طلب تفعيل جديد — قيد المراجعة",
    accepted: "تم قبول طلب التفعيل",
    rejected: "تم رفض طلب التفعيل",
  };

  const fields = [
    {
      name: "رقم الطلب",
      value: cleanText(application.id, 100) || "غير متوفر",
      inline: true,
    },
    {
      name: "الاسم الحقيقي",
      value: cleanText(a.real_name, 200) || "غير متوفر",
      inline: true,
    },
    {
      name: "حساب الديسكورد المرتبط",
      value: application.discordUser?.id
        ? `<@${application.discordUser.id}>\n${cleanText(application.discordUser.displayName, 100)}\nID: ${cleanText(application.discordUser.id, 30)}`
        : "غير متوفر",
      inline: true,
    },
    {
      name: "اسم الشخصية",
      value: cleanText(a.character_name, 200) || "غير متوفر",
      inline: true,
    },
    {
      name: "العمر الحقيقي",
      value: cleanText(a.real_age, 30) || "غير متوفر",
      inline: true,
    },
    {
      name: "حالة الطلب",
      value:
        status === "accepted"
          ? "✅ مقبول"
          : status === "rejected"
            ? "❌ مرفوض"
            : "⌛ قيد المراجعة",
      inline: true,
    },
  ];

  if (application.roleUpdate?.assignedRoleId) {
    fields.push({
      name: "الرول المضاف",
      value: `<@&${cleanText(application.roleUpdate.assignedRoleId, 30)}>`,
      inline: true,
    });
  }

  if (application.roleUpdate?.removedRoleId) {
    fields.push({
      name: "الرول المحذوف",
      value: `<@&${cleanText(application.roleUpdate.removedRoleId, 30)}>`,
      inline: true,
    });
  }

  if (reviewer) {
    fields.push({
      name: "تمت المراجعة بواسطة",
      value: cleanText(reviewer, 200),
      inline: false,
    });
  }

  return {
    title: titles[status] ?? titles.pending,
    color: colors[status] ?? colors.pending,
    description:
      status === "pending"
        ? "التفاصيل الكاملة موجودة في الملف المرفق. استخدم أزرار القبول أو الرفض أدناه."
        : "تم إغلاق هذا الطلب وتحديث حالته.",
    fields,
    timestamp: application.reviewedAt ?? application.submittedAt,
    footer: {
      text: "SILO CFW Whitelist System",
    },
  };
}

export function buildReviewComponents(applicationId, disabled = false) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "قبول الطلب",
          emoji: { name: "✅" },
          custom_id: `wl_accept:${applicationId}`,
          disabled,
        },
        {
          type: 2,
          style: 4,
          label: "رفض الطلب",
          emoji: { name: "❌" },
          custom_id: `wl_reject:${applicationId}`,
          disabled,
        },
      ],
    },
  ];
}

export function reviewerDisplay(interaction) {
  const member = interaction.member;
  const user = member?.user ?? interaction.user;
  if (!user) return "مشرف غير معروف";

  const displayName = member?.nick || user.global_name || user.username;
  return `${displayName} (${user.id})`;
}

export function reviewerIsAllowed(interaction) {
  const requiredRole = process.env.DISCORD_REVIEWER_ROLE_ID?.trim();
  const memberRoles = interaction.member?.roles ?? [];

  if (requiredRole) {
    return memberRoles.includes(requiredRole);
  }

  const permissions = BigInt(interaction.member?.permissions ?? "0");
  const ADMINISTRATOR = 1n << 3n;
  const MANAGE_GUILD = 1n << 5n;

  return (
    (permissions & ADMINISTRATOR) === ADMINISTRATOR ||
    (permissions & MANAGE_GUILD) === MANAGE_GUILD
  );
}
