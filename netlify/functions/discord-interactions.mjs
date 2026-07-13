import nacl from "tweetnacl";

import {
  buildReviewComponents,
  buildReviewEmbed,
  discordBotRequest,
  discordRoleErrorMessage,
  getApplicationsStore,
  getDiscordRoleConfig,
  reviewerDisplay,
  reviewerIsAllowed,
} from "./_shared.mjs";

function interactionResponse(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function verifyDiscordRequest(rawBody, signature, timestamp, publicKey) {
  if (!signature || !timestamp || !publicKey) return false;

  return nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(publicKey, "hex"),
  );
}

function ephemeralMessage(content) {
  return {
    type: 4,
    data: {
      content,
      flags: 64,
      allowed_mentions: { parse: [] },
    },
  };
}

async function rollbackRoleChanges({
  guildId,
  userId,
  addedRoleId,
  removedRoleId,
  reviewer,
}) {
  const rollbackReason =
    `SILO whitelist rollback after failed review by ${reviewer}`;

  const rollbackOperations = [];

  if (addedRoleId) {
    rollbackOperations.push(
      discordBotRequest(
        `/guilds/${guildId}/members/${userId}/roles/${addedRoleId}`,
        {
          method: "DELETE",
          reason: rollbackReason,
        },
      ),
    );
  }

  if (removedRoleId) {
    rollbackOperations.push(
      discordBotRequest(
        `/guilds/${guildId}/members/${userId}/roles/${removedRoleId}`,
        {
          method: "PUT",
          reason: rollbackReason,
        },
      ),
    );
  }

  const results = await Promise.allSettled(rollbackOperations);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Role rollback failed:", result.reason);
    }
  }
}

async function applyDecisionRoles(application, status, reviewer) {
  const userId = application.discordUser?.id;

  if (!userId) {
    throw new Error("الطلب ما يحتوي Discord ID صالح للمتقدم.");
  }

  const {
    guildId,
    acceptedRoleId,
    rejectedRoleId,
  } = getDiscordRoleConfig();

  const targetRoleId =
    status === "accepted" ? acceptedRoleId : rejectedRoleId;

  const oppositeRoleId =
    status === "accepted" ? rejectedRoleId : acceptedRoleId;

  let member;

  try {
    const memberResult = await discordBotRequest(
      `/guilds/${guildId}/members/${userId}`,
    );

    member = memberResult.data;
  } catch (error) {
    throw new Error(discordRoleErrorMessage(error));
  }

  const currentRoles = new Set(member?.roles ?? []);
  let addedRoleId = null;
  let removedRoleId = null;

  const auditReason =
    `SILO whitelist ${status} by ${reviewer} — application ${application.id}`;

  try {
    // أضف رول القرار الجديد إذا لم يكن موجوداً.
    if (!currentRoles.has(targetRoleId)) {
      await discordBotRequest(
        `/guilds/${guildId}/members/${userId}/roles/${targetRoleId}`,
        {
          method: "PUT",
          reason: auditReason,
        },
      );

      addedRoleId = targetRoleId;
    }

    // احذف رول القرار القديم حتى لا يبقى الشخص مقبولاً ومرفوضاً بنفس الوقت.
    if (currentRoles.has(oppositeRoleId)) {
      await discordBotRequest(
        `/guilds/${guildId}/members/${userId}/roles/${oppositeRoleId}`,
        {
          method: "DELETE",
          reason: auditReason,
        },
      );

      removedRoleId = oppositeRoleId;
    }
  } catch (error) {
    await rollbackRoleChanges({
      guildId,
      userId,
      addedRoleId,
      removedRoleId,
      reviewer,
    });

    throw new Error(discordRoleErrorMessage(error));
  }

  return {
    guildId,
    assignedRoleId: targetRoleId,
    removedRoleId,
    wasAlreadyAssigned: currentRoles.has(targetRoleId),
    completedAt: new Date().toISOString(),
  };
}

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();

  if (!verifyDiscordRequest(rawBody, signature, timestamp, publicKey)) {
    return new Response("Invalid request signature", { status: 401 });
  }

  let interaction;

  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Discord PING
  if (interaction.type === 1) {
    return interactionResponse({ type: 1 });
  }

  // Message component button
  if (interaction.type !== 3) {
    return interactionResponse(
      ephemeralMessage("هذا النوع من التفاعل غير مدعوم."),
    );
  }

  if (!reviewerIsAllowed(interaction)) {
    return interactionResponse(
      ephemeralMessage("ما عندك صلاحية لقبول أو رفض طلبات التفعيل."),
    );
  }

  const customId = interaction.data?.custom_id ?? "";
  const match = customId.match(/^wl_(accept|reject):(.+)$/);

  if (!match) {
    return interactionResponse(
      ephemeralMessage("زر غير معروف."),
    );
  }

  const action = match[1];
  const applicationId = match[2];
  const status = action === "accept" ? "accepted" : "rejected";

  try {
    const store = getApplicationsStore();
    const application = await store.get(applicationId, {
      type: "json",
      consistency: "strong",
    });

    if (!application) {
      return interactionResponse(
        ephemeralMessage("الطلب غير موجود أو تم حذفه."),
      );
    }

    if (application.status !== "pending") {
      return interactionResponse(
        ephemeralMessage(
          application.status === "accepted"
            ? "هذا الطلب مقبول مسبقاً."
            : "هذا الطلب مرفوض مسبقاً.",
        ),
      );
    }

    const reviewer = reviewerDisplay(interaction);

    // لا يتم تغيير حالة الطلب إلا بعد نجاح إضافة الرول.
    const roleUpdate = await applyDecisionRoles(
      application,
      status,
      reviewer,
    );

    application.status = status;
    application.reviewedAt = new Date().toISOString();
    application.reviewedBy = reviewer;
    application.roleUpdate = roleUpdate;

    try {
      await store.setJSON(application.id, application);
    } catch (storeError) {
      // إذا فشل حفظ القرار، نرجع الرتب إلى حالتها السابقة.
      await rollbackRoleChanges({
        guildId: roleUpdate.guildId,
        userId: application.discordUser.id,
        addedRoleId:
          roleUpdate.wasAlreadyAssigned
            ? null
            : roleUpdate.assignedRoleId,
        removedRoleId: roleUpdate.removedRoleId,
        reviewer,
      });

      throw storeError;
    }

    const assignedRoleText = `<@&${roleUpdate.assignedRoleId}>`;

    return interactionResponse({
      type: 7,
      data: {
        content:
          status === "accepted"
            ? `✅ تم قبول الطلب بواسطة **${reviewer}** وإضافة الرول ${assignedRoleText}`
            : `❌ تم رفض الطلب بواسطة **${reviewer}** وإضافة الرول ${assignedRoleText}`,
        allowed_mentions: { parse: [] },
        embeds: [
          buildReviewEmbed(application, status, reviewer),
        ],
        components: buildReviewComponents(application.id, true),
      },
    });
  } catch (error) {
    console.error("discord-interactions error:", error);

    return interactionResponse(
      ephemeralMessage(
        error?.message ||
        "حدث خطأ أثناء تحديث الطلب والرول. حاول مرة أخرى.",
      ),
    );
  }
};
