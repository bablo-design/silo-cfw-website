import nacl from "tweetnacl";

import {
  buildReviewComponents,
  buildReviewEmbed,
  getApplicationsStore,
  json,
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

    application.status = status;
    application.reviewedAt = new Date().toISOString();
    application.reviewedBy = reviewer;

    await store.setJSON(application.id, application);

    return interactionResponse({
      type: 7,
      data: {
        content:
          status === "accepted"
            ? `✅ تم قبول الطلب بواسطة **${reviewer}**`
            : `❌ تم رفض الطلب بواسطة **${reviewer}**`,
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
      ephemeralMessage("حدث خطأ أثناء تحديث الطلب. حاول مرة أخرى."),
    );
  }
};
