import { getSessionUser } from "./_auth.mjs";

import {
  getApplicationsStore,
  json,
} from "./_shared.mjs";

export default async (request, context) => {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
  }

  const sessionUser = await getSessionUser(context);

  if (!sessionUser) {
    return json(
      {
        error: "يجب تسجيل الدخول بحساب الديسكورد.",
        loginRequired: true,
      },
      401,
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const token = url.searchParams.get("token")?.trim();

  if (!id || !token) {
    return json({ error: "بيانات الطلب ناقصة." }, 400);
  }

  try {
    const store = getApplicationsStore();
    const application = await store.get(id, {
      type: "json",
      consistency: "strong",
    });

    if (
      !application ||
      application.applicantToken !== token ||
      application.discordUser?.id !== sessionUser.id
    ) {
      return json({ error: "الطلب غير موجود لهذا الحساب." }, 404);
    }

    return json({
      id: application.id,
      status: application.status,
      submittedAt: application.submittedAt,
      reviewedAt: application.reviewedAt,
      reviewedBy: application.reviewedBy,
    });
  } catch (error) {
    console.error("whitelist-status error:", error);
    return json({ error: "تعذر قراءة حالة الطلب." }, 500);
  }
};
