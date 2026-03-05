import { signRequest } from "@worldcoin/idkit/signing";

const signerPort = Number.parseInt(Bun.env.SIGNER_PORT ?? "8788", 10);
const rpId = Bun.env.WORLD_ID_RP_ID ?? "";
const rpSigningKey = Bun.env.WORLD_ID_RP_SIGNING_KEY ?? "";
const defaultAction = Bun.env.WORLD_ID_ACTION ?? "";
const defaultTtlSeconds = Number.parseInt(
  Bun.env.WORLD_ID_SIGNATURE_TTL_SECONDS ?? "300",
  10,
);

if (!rpId || !rpSigningKey) {
  throw new Error(
    "Missing WORLD_ID_RP_ID or WORLD_ID_RP_SIGNING_KEY in environment.",
  );
}

const baseHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: baseHeaders,
  });

const server = Bun.serve({
  port: signerPort,
  fetch: async (request) => {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: baseHeaders });
    }

    if (pathname === "/healthz") {
      return json({ ok: true, rp_id: rpId });
    }

    if (pathname !== "/api/rp-signature" || request.method !== "POST") {
      return json({ error: "NOT_FOUND" }, 404);
    }

    let payload = {};
    try {
      payload = await request.json();
    } catch {
      // Keep defaults when request body is empty.
    }

    const action =
      typeof payload.action === "string" && payload.action.trim().length > 0
        ? payload.action.trim()
        : defaultAction;
    const ttlSeconds =
      typeof payload.ttlSeconds === "number" &&
      Number.isInteger(payload.ttlSeconds) &&
      payload.ttlSeconds > 0
        ? payload.ttlSeconds
        : defaultTtlSeconds;

    if (!action) {
      return json(
        {
          error: "MISSING_ACTION",
          message:
            "Provide action in request body or set WORLD_ID_ACTION in signer env.",
        },
        400,
      );
    }

    const signature = signRequest(action, rpSigningKey, ttlSeconds);
    return json({
      rp_id: rpId,
      sig: signature.sig,
      nonce: signature.nonce,
      created_at: signature.createdAt,
      expires_at: signature.expiresAt,
    });
  },
});

console.log(`World ID signer listening on http://127.0.0.1:${server.port}`);
