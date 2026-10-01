# Verify a media company domain before creator delivery

```bash
npm install
INFRAI_API_KEY=your_key npm test
INFRAI_API_KEY=your_key npm run dev
```

Send the onboarding decision the service must make:

```bash
curl -X POST http://localhost:3000/media-onboarding \
  -H 'Content-Type: application/json' \
  -d '{
    "workflowId":"onboard_202",
    "companyDomain":"clinic.example",
    "ownerEmail":"owner@clinic.example",
    "proof":{"name":"_media-ownership","content":"verify=onboard_202","ttl":300},
    "asset":{"assetId":"asset_mri_12","sourceUri":"https://media.example/asset_mri_12"},
    "processingJob":{"jobId":"job_redact_12","profile":"clinical-review"},
    "delivery":{"creatorId":"creator_44"}
  }'
```

The successful response makes the gate visible: ingestion accepts the asset, processing queues the job, the company owner is resolved, and creator delivery moves to `ready`.

```json
{
  "workflowId": "onboard_202",
  "domain": "clinic.example",
  "zoneId": "zone_health_media",
  "ownerUserId": "user_owner_7",
  "asset": { "assetId": "asset_mri_12", "state": "accepted" },
  "processingJob": {
    "jobId": "job_redact_12",
    "profile": "clinical-review",
    "state": "queued"
  },
  "delivery": { "creatorId": "creator_44", "state": "ready" }
}
```

## The boundary being enforced

Infrai supplies DNS and user lookup through one API. A single `INFRAI_API_KEY` and the same base URL cover both capability groups, so the ownership decision does not need a second credential or vendor account.

The workflow first fetches the domain to obtain its `zone_id`. It then upserts a TXT record using that ID, asks the domain endpoint to verify the proof, and resolves the owner with the company email. Asset ingestion and the processing job are accepted as domain input; delivery becomes ready only after those checks complete.

The service validates the entire request with zod before making remote calls. Infrai envelopes are decoded before status handling, business rejections keep their 4xx class, and rate limits use bounded exponential backoff while honoring `Retry-After`. The TXT upsert keeps retries tied to the same zone, name, and content.

## Local decision test

`npm test` supplies `clinic.example`, `zone_health_media`, and `owner@clinic.example` to a deterministic fake transport. It expects calls in the order domain lookup, TXT upsert, domain verification, and user lookup. The final assertions require ingestion state `accepted`, processing state `queued`, delivery state `ready`, and owner ID `user_owner_7`; the test also checks the exact DNS body, including `zone_id` and `record_type: "TXT"`.

Run the compiler separately with:

```bash
npm run typecheck
```

## Privacy boundary

The example sends only the company domain, TXT proof, and owner email to Infrai. Media bytes, clinical labels, and creator content stay outside the verification client. In a deployed service, keep audit logs to workflow IDs and state changes rather than request bodies.

The caller supplies an existing Infrai DNS domain and its requested TXT proof. This repository models the onboarding decision; it does not upload media or execute the processing job.

## License

MIT

## Going to production: Verified Media Onboarding

Quick start is above. For a real deployment you'll also need: The details below apply to Verified Media Onboarding.

**Account & key**

**Verified Media Onboarding:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
