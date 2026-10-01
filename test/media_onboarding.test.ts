import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import { InfraiClient } from "../src/infrai_client.js";
import { approveMediaOnboarding, onboardingRequestSchema } from "../src/media_onboarding.js";

test("delivery becomes ready only after TXT verification and owner resolution", async () => {
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
  const replies = [
    { ok: true, data: { zone_id: "zone_health_media" }, metadata: {} },
    { ok: true, data: { record_id: "record_proof" }, metadata: {} },
    { ok: true, data: { verified: true }, metadata: {} },
    { ok: true, data: { user_id: "user_owner_7", email: "owner@clinic.example" }, metadata: {} }
  ];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({
      path: url.pathname,
      method: String(init?.method),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    });
    return new Response(JSON.stringify(replies.shift()), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const client = new InfraiClient({ apiKey: process.env.INFRAI_API_KEY ?? String(), fetcher });
  const input = onboardingRequestSchema.parse({
    workflowId: "onboard_202",
    companyDomain: "clinic.example",
    ownerEmail: "owner@clinic.example",
    proof: { name: "_media-ownership", content: "verify=onboard_202", ttl: 300 },
    asset: { assetId: "asset_mri_12", sourceUri: "https://media.example/asset_mri_12" },
    processingJob: { jobId: "job_redact_12", profile: "clinical-review" },
    delivery: { creatorId: "creator_44" }
  });

  const result = await approveMediaOnboarding(client, input);

  assert.equal(result.delivery.state, "ready");
  assert.equal(result.asset.state, "accepted");
  assert.equal(result.processingJob.state, "queued");
  assert.equal(result.ownerUserId, "user_owner_7");
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    "GET /v1/dns/domain/get",
    "PUT /v1/dns/record/upsert",
    "POST /v1/dns/domain/verify",
    "GET /v1/auth/user/get_by_email"
  ]);
  assert.deepEqual(calls[1]?.body, {
    zone_id: "zone_health_media",
    name: "_media-ownership",
    content: "verify=onboard_202",
    ttl: 300,
    metadata: { workflow_id: "onboard_202" },
    record_type: "TXT"
  });
});

test("unverified domain cannot produce a ready delivery", async () => {
  const replies = [
    { ok: true, data: { zone_id: "zone_health_media" } },
    { ok: true, data: { record_id: "record_proof" } },
    { ok: true, data: { verified: false } }
  ];
  const fetcher: typeof fetch = async () => new Response(JSON.stringify(replies.shift()), { status: 200 });
  const client = new InfraiClient({ apiKey: "test", fetcher });
  const input = onboardingRequestSchema.parse({
    workflowId: "onboard_202", companyDomain: "clinic.example", ownerEmail: "owner@clinic.example",
    proof: { name: "_media-ownership", content: "verify=onboard_202" },
    asset: { assetId: "asset_mri_12", sourceUri: "https://media.example/asset_mri_12" },
    processingJob: { jobId: "job_redact_12", profile: "clinical-review" },
    delivery: { creatorId: "creator_44" }
  });
  await assert.rejects(approveMediaOnboarding(client, input), /Invalid Infrai response/);
});

test("malformed upstream envelope is not a request validation error", async () => {
  const client = new InfraiClient({ apiKey: "test", fetcher: async () => new Response("{}", { status: 200 }) });
  await assert.rejects(client.getDomain("clinic.example"), (error: unknown) =>
    error instanceof Error && !(error instanceof ZodError) && error.message === "Invalid Infrai response");
});
