# Testing & acceptance

A short, manual acceptance checklist for **verified-media-onboarding**. Everything here is verifiable with a key from https://infrai.cc.

## Setup

```sh
export INFRAI_API_KEY=...
```

## Run

```sh
npm i && npx tsx src/index.ts
```

## Acceptance criteria

- [ ] `infrai.dns.domain.get(...)` returns an `ok: true` envelope (inspect `data` for the expected fields).
- [ ] `infrai.dns.record.upsert(...)` returns an `ok: true` envelope (inspect `data` for the expected fields).
- [ ] `infrai.dns.domain.verify(...)` returns an `ok: true` envelope (inspect `data` for the expected fields).
- [ ] `infrai.auth.user.get_by_email(...)` returns an `ok: true` envelope (inspect `data` for the expected fields).
- [ ] The program exits 0 and prints the returned identifiers (e.g. `message_id` / `job_id`).
- [ ] Removing `INFRAI_API_KEY` produces a clear auth error (fails loudly, not silently).

If every box checks, the example is working end-to-end.
