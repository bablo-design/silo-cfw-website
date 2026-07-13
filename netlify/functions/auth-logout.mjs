import {
  clearSessionCookie,
} from "./_auth.mjs";

export default async (request, context) => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      {
        status: 405,
        headers: {
          "Allow": "POST",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  clearSessionCookie(context);

  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
