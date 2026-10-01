import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";

export const onboardingRequestSchema = z.object({
  workflowId: z.string().min(1),
  companyDomain: z.string().min(3),
  ownerEmail: z.string().email(),
  proof: z.object({
    name: z.string().min(1),
    content: z.string().min(1),
    ttl: z.number().int().positive().max(86_400).default(300)
  }),
  asset: z.object({
    assetId: z.string().min(1),
    sourceUri: z.string().url()
  }),
  processingJob: z.object({
    jobId: z.string().min(1),
    profile: z.enum(["clinical-review", "creator-preview"])
  }),
  delivery: z.object({
    creatorId: z.string().min(1)
  })
}).strict();

export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;

export type OnboardingResult = {
  workflowId: string;
  domain: string;
  zoneId: string;
  ownerUserId: string;
  asset: { assetId: string; state: "accepted" };
  processingJob: { jobId: string; profile: OnboardingRequest["processingJob"]["profile"]; state: "queued" };
  delivery: { creatorId: string; state: "ready" };
};

export async function approveMediaOnboarding(
  client: InfraiClient,
  input: OnboardingRequest
): Promise<OnboardingResult> {
  const domain = await client.getDomain(input.companyDomain);
  await client.upsertTxtRecord({
    zone_id: domain.zone_id,
    name: input.proof.name,
    content: input.proof.content,
    ttl: input.proof.ttl,
    metadata: { workflow_id: input.workflowId }
  });
  await client.verifyDomain(input.companyDomain);
  const owner = await client.getUserByEmail(input.ownerEmail);

  return {
    workflowId: input.workflowId,
    domain: input.companyDomain,
    zoneId: domain.zone_id,
    ownerUserId: owner.user_id,
    asset: { assetId: input.asset.assetId, state: "accepted" },
    processingJob: {
      jobId: input.processingJob.jobId,
      profile: input.processingJob.profile,
      state: "queued"
    },
    delivery: { creatorId: input.delivery.creatorId, state: "ready" }
  };
}
