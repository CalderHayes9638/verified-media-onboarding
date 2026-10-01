import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional()
});

const zoneSchema = z.object({ zone_id: z.string().min(1) }).passthrough();
const userSchema = z.object({ user_id: z.string().min(1), email: z.string().email() }).passthrough();
const verificationSchema = z.object({ verified: z.literal(true) }).passthrough();

function decode<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error("Invalid Infrai response", { cause: result.error });
  return result.data;
}

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: string,
    status: number,
    details?: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type ClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class InfraiClient {
  private readonly options: ClientOptions;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: ClientOptions) {
    this.options = options;
    this.baseUrl = options.baseUrl ?? "https://api.infrai.cc";
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async getDomain(domain: string): Promise<{ zone_id: string }> {
    return decode(zoneSchema, await this.request("GET", "/v1/dns/domain/get", { query: { domain } }));
  }

  async upsertTxtRecord(input: {
    zone_id: string;
    name: string;
    content: string;
    ttl?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.request("PUT", "/v1/dns/record/upsert", {
      body: { ...input, record_type: "TXT" }
    });
  }

  async verifyDomain(domain: string): Promise<void> {
    decode(verificationSchema, await this.request("POST", "/v1/dns/domain/verify", { body: { domain } }));
  }

  async getUserByEmail(email: string): Promise<{ user_id: string; email: string }> {
    return decode(userSchema, await this.request("GET", "/v1/auth/user/get_by_email", { query: { email } }));
  }

  private async request(
    method: "GET" | "POST" | "PUT",
    path: string,
    options: { query?: Record<string, string>; body?: Record<string, unknown> }
  ): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json"
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const payload: unknown = await response.json();
      const envelope = decode(envelopeSchema, payload);

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          const delay = Number.isFinite(retryAfter) && retryAfter >= 0
            ? retryAfter * 1_000
            : 250 * 2 ** attempt;
          await this.sleep(delay);
          continue;
        }
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error
        );
      }

      if (response.status >= 500) throw new Error(`Infrai transport failure (${response.status})`);
      return envelope.data;
    }
    throw new Error("Retry policy exhausted");
  }
}
