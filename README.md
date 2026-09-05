# Expense Tracker

A personal expense tracker with AI-assisted data entry. Upload an invoice or a photo of a
receipt and the form fills itself in; type a description instead and the category is suggested
for you. Log what you spend, organise it by category, and see where the money went.

Built for the Extropy full-stack home challenge: **Option 1 (Personal Expense Tracker)** plus
**AI Option B (AI-Augmented Content & Categorization)**.

|                 |                                                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository**  | https://github.com/MatheusReimer/extropy-ledger                                                                                                                                                                                                                                  |
| **Live app**    | https://k7dptwm6x7.execute-api.us-east-1.amazonaws.com                                                                                                                                                                                                                           |
| **API**         | https://k7dptwm6x7.execute-api.us-east-1.amazonaws.com/api — same host as the app, on purpose                                                                                                                                                                                    |
| **Deploy note** | Running the Lambda-served variant: a new AWS account cannot create CloudFront distributions until AWS verifies it. Same code, one CDK flag — see [DEPLOYMENT.md](DEPLOYMENT.md). The CloudFront branch is pinned by template assertions instead, in `infra/tests/stack.test.ts`. |

**Deeper write-ups**, kept out of this file so it stays readable:
[the AI features](docs/ai.md) · [money and language](docs/money.md) ·
[design notes](docs/design-notes.md)

---

## Quick start

**Prerequisites:** Node **≥ 22** (matches the `nodejs22.x` Lambda runtime) and pnpm **11.x**
(`corepack enable` picks up the pinned version). A MongoDB connection string — Atlas M0 or a
local `mongod`. AWS CLI v2 only if you intend to deploy. LLM API keys are **all optional** and
all free; without them the app still runs — you just type the category yourself.

```bash
pnpm install
cp .env.example .env       # then fill in MONGODB_URI and JWT_SECRET
pnpm build
pnpm dev
```

The API comes up on <http://localhost:3000>, the web app on <http://localhost:5173>. Open the
web URL, create an account, add an expense.

**The `.env` is one file, at the repository root** — it serves the API dev server, Vite and the
CDK deploy. Every variable is documented inline in [`.env.example`](.env.example); only two are
required:

```bash
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
JWT_SECRET=<48 random bytes: node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))">
```

If anything required is missing, the API refuses to start and names **every** missing variable at
once rather than failing later inside a request.

---

## Architecture

```
                    ┌──────────────────────── CloudFront ────────────────────────┐
   browser  ───────▶│  /*        →  S3 (private, OAC)   — the React bundle       │
                    │  /api/*    →  API Gateway (HTTP)  — prefix stripped at edge│
                    └────────────────────────────┬───────────────────────────────┘
                                                 │
                                        ┌────────▼────────┐        ┌──────────────┐
                                        │  One Lambda     │───────▶│ MongoDB Atlas│
                                        │  (Node 22, ESM) │        │  (M0 free)   │
                                        └────────┬────────┘        └──────────────┘
                                                 │  to suggest a category
                                     Gemini → OpenRouter (provider chain)

apps/api      Lambda handlers, routing, data access, the AI categorizer
apps/web      React 19 + Vite + Chakra UI v3 + TanStack Query
packages/shared   Zod schemas, DTO types, money helpers — imported by BOTH sides
infra         AWS CDK stack (one stack: API + site)
docs          The long-form write-ups linked above
```

A request enters through one of two **adapters** — `lambda.ts` (API Gateway) or `local.ts` (a
`node:http` server). Each turns its transport into a plain object and hands it to one `dispatch`
function; everything past that point is transport-agnostic:

```
adapter → dispatcher (routing, JSON parsing, error boundary, logging)
        → requireAuth (verifies the token, attaches userId + scoped repositories)
        → handler (parses input against a shared Zod schema)
```

So **`pnpm dev` runs the same code that ships to production** — no mock API to keep in sync, and
every layer testable without standing up either transport. The frontend mirrors it: the Vite dev
proxy does what CloudFront does, so the app talks to a same-origin `/api` in both environments.
No API URL in the build, no CORS in the browser, no "works locally, breaks deployed" gap.

---

## The AI feature, in short

Categorising an expense has exactly two paths, and that is the whole design: **either you pick
the category yourself, or you let the model suggest one.**

```
description ──▶ Gemini ──────valid───▶ { category, confidence, source: "model" }
                   │ 429 / 5xx / invalid
                   ▼
                OpenRouter ──valid───▶ { category, confidence, source: "model" }
                   │ still nothing
                   ▼
                { category: "Other", confidence: 0, source: "fallback" }
```

`categorize.ts` is 24 lines: ask the model, accept the answer only if it is a category this user
actually has, otherwise fall back. A fallback **preselects nothing** — offering "Other" at zero
confidence would be faking an answer, and the dropdown is right there.

Uploading a receipt goes further — Gemini reads the document via `inlineData`, no PDF parser and
no OCR library, and pre-fills the form for you to confirm. Nothing is auto-saved.

**Prompt engineering, in four decisions.** The prompt is short because this call happens while
someone is looking at a form, and every extra token is latency they feel.

1. **A response schema with a native `enum`**, not "please reply in JSON" — the constraint is
   enforced while tokens are produced, which removes the whole genre of fenced code blocks.
2. **The enum carries _this user's_ categories**, so it is built per request. Nobody is offered
   a category that does not exist in their account.
3. **Thinking turned down as far as the model allows**, `temperature: 0`. Picking one of eleven
   labels needs no deliberation, and those tokens are pure latency.
4. **The output is revalidated anyway** — a response truncated at the token limit is valid UTF-8
   and invalid JSON, and this path ends in a database write.

**Cost and latency.** The model is asked **on blur, not per keystroke**, and skipped entirely
once the user has picked a category — if they have decided, there is nothing to suggest. The
chain shares an 8-second budget with a 4-second slice per provider: past that, the dropdown is
faster than waiting, so falling back is correct rather than a degradation.

**[The full write-up](docs/ai.md)** covers the provider measurements, the cache I removed, the
receipt-reader ladder, and the bugs only a live API call could have revealed.

---

## Key design decisions

- **One Lambda with internal routing, not one per route.** Ten functions mean ten cold starts;
  one concentrates traffic and keeps the Mongo connection hot. The cost is granularity — scaling
  and IAM are per-API rather than per-route.

- **CloudFront serves the API under the site's own host.** Same-origin: no preflight on every
  request, no API URL in the bundle, and an httpOnly cookie stays available later.

- **Money is an integer in the currency's own minor units**, never a float. What a minor unit
  _is_ depends on the currency, and getting that wrong caused the worst bug in this codebase —
  [written up in full](docs/money.md).

- **Dates are `YYYY-MM-DD` strings, not `Date`.** An expense happens on a calendar day, not an
  instant. Strings sort and range-compare correctly and carry no timezone to shift a purchase
  into the previous day.

- **`packages/shared` is the DRY payoff.** The Zod schemas are imported by the React forms
  **and** the API handlers, so "a password is at least 10 characters" exists once. Client
  validation is a courtesy; the server runs the same schema at the real boundary.

- **A handler never opens a collection.** `requireAuth` attaches repositories already bound to
  the caller's id, so a handler _cannot_ express "any user's expenses" — the scope closes before
  it is entered, and that is also what makes handlers testable without a database.

- **scrypt from `node:crypto`.** No native module to bundle, and its parameters live inside the
  hash, so raising the cost factor later does not invalidate existing passwords.

- **No router on the frontend.** Two states, authenticated and not, and no deep URL worth
  sharing. A router would add a dependency and a redirect to express an `if`.

Decisions about the parts you can _see_ — theme, icons, chart, categories, budgets, CSV — are in
[design notes](docs/design-notes.md).

---

## Security

Mapped to the OWASP Top 10 items this application actually touches.

| Concern                           | How it is handled                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 Broken access control**     | The auth middleware proves _who_, never _what they may touch_. Every query filters on `userId` — `findOneAndUpdate({ _id, userId })`, not `{ _id }` — so another user's expense is a 404, not a silent success. Creating an expense also verifies the `categoryId` belongs to the caller. Verified with a two-user probe.                                                                           |
| **A02 Cryptographic failures**    | scrypt with a per-password salt and `timingSafeEqual`. JWTs signed HS256 via `jose` with the algorithm **pinned** on verify, closing the `alg: none` / algorithm-confusion door. There is a test that forges one.                                                                                                                                                                                   |
| **A03 Injection**                 | No string-built queries. Every id passes `ObjectId.isValid` before reaching a filter. React escapes on render and `dangerouslySetInnerHTML` appears nowhere.                                                                                                                                                                                                                                        |
| **A04 Insecure design**           | `sanitizeText` normalises stored text; it is explicitly _not_ the XSS defence — escaping belongs to rendering, and escaping here would corrupt the stored description.                                                                                                                                                                                                                              |
| **A04 File upload**               | The browser's `Content-Type` is a claim, so it is never trusted: `lib/files.ts` sniffs the magic bytes, and the _sniffed_ type is what reaches the model, what gets stored, and what a browser is later told to render. Size is checked _before_ decoding, from the base64 length. A renamed `.exe` is refused. Stored receipts carry `X-Content-Type-Options: nosniff` and are scoped by `userId`. |
| **A05 Security misconfiguration** | Unexpected errors return a generic 500 body; detail goes to the log only. The S3 bucket blocks all public access and is reachable solely through CloudFront OAC. CORS is an explicit allowlist, never `*`.                                                                                                                                                                                          |
| **A07 Auth failures**             | Login answers identically for "unknown email" and "wrong password", and burns a throwaway scrypt on the unknown-email path so the two cannot be told apart by timing. Password minimum is length-based (NIST SP 800-63B) with an upper bound, since scrypt runs inside the Lambda.                                                                                                                  |
| **A09 Logging failures**          | Structured JSON logs, one line per request. **No request body is ever logged** — the auth routes carry a plaintext password, and "we only log the interesting ones" is the rule someone forgets under pressure.                                                                                                                                                                                     |

**Known trade-off — token storage.** The JWT lives in `localStorage`. The stronger answer is an
httpOnly cookie, which XSS cannot read; it is genuinely viable here because the site and API
share a host, and it is the first item in "what I'd do next". The current risk is contained:
the only XSS surface would be injected HTML, and nothing here renders user-supplied markup.

**Known trade-off — secrets in the CloudFormation template.** The CDK reads secrets from the
deploying shell and sets them as Lambda environment variables, so they appear in the synthesised
template (in gitignored `cdk.out/`) and in the Lambda console to anyone with account access. The
next step is SSM Parameter Store `SecureString` at cold start. Secrets Manager was rejected
deliberately: it is **not** free tier, at $0.40 per secret per month.

---

## Testing

```bash
pnpm test          # 226 unit tests
pnpm typecheck     # tsc --noEmit across every package
pnpm lint          # eslint, including react-hooks on apps/web
pnpm format:check  # prettier
pnpm check         # all four
```

Tests go where a bug would be **silent and expensive**: that a stalled provider cannot starve
the next one, that a suggestion is never a category the user does not have, that an `alg: none`
forgery is refused, that an unknown email and a wrong password are byte-identical, that a
missing exchange rate stays `undefined` instead of becoming a silent 1.0, that a renamed `.exe`
is not an image, and that a CSV cell cannot smuggle a spreadsheet formula.

Route handlers are exercised **directly**, against an in-memory stand-in for the repositories
(`apps/api/tests/helpers/fake-repositories.ts`) — real inputs, real assertions, no database, no
container, milliseconds. That is the whole reason the repository layer exists. Each test file
carries a comment explaining what it is protecting and why, which is the fastest way to read
what is covered.

On top sits a manual end-to-end pass against a real MongoDB (28 checks, including cross-user
access probes). Wiring it into CI against `mongodb-memory-server` is listed below — it is out of
`pnpm test` on purpose, because it downloads a ~780 MB binary on first run.

---

## Deploying

```bash
# once per AWS account + region
pnpm --filter @expense/infra exec cdk bootstrap

# from the repo root
pnpm deploy           # CloudFront + S3 + Lambda
pnpm deploy:lambda    # Lambda serves the site too (what is live now)
```

Full walkthrough, including the CloudFront variant and teardown, is in
[DEPLOYMENT.md](DEPLOYMENT.md).

**Free tier.** Lambda, API Gateway and CloudWatch sit inside the always-free tiers, log
retention is capped at one week, and CloudFront's 1 TB/month egress is perpetual. Atlas M0 is
free indefinitely and the Gemini free tier needs no card. The stack runs at zero marginal cost.

**Two new-account restrictions shaped this deployment**, and neither is a code problem:

1. **No CloudFront** until AWS verifies the account, hence the Lambda-served variant.
2. **512 MB of Lambda**, not the 1024 the stack wanted. On Lambda memory is a CPU setting, and
   scrypt is entirely CPU-bound, so more memory buys a faster login. A deploy at 1024 fails with
   `'MemorySize' value failed to satisfy constraint: Member must have value less than or equal
to 512`. It runs at 512 and `infra/tests/stack.test.ts` asserts 512, so the template and the
   account agree. The cost is latency, not correctness: a login is ~1.0 s against the deployed
   API, at an unchanged scrypt cost factor. Raise both together if the quota is lifted.

---

## Troubleshooting

**"Invalid environment configuration" on startup.**
Working as intended — it names every missing variable at once. Copy `.env.example` to `.env` at
the **repository root**, not inside `apps/api`. On Windows, check Notepad did not save it as
`.env.txt`.

**`MongoServerSelectionError`, or signup returns 500 on a fresh cluster.**
Almost always the Atlas **network access list** — add your current IP. The error is
indistinguishable from "database is down", and since indexes are created on first use, the first
request after a cold start is the one that surfaces it.

**`querySrv ECONNREFUSED` on a `mongodb+srv://` URI.**
Your DNS resolver cannot answer SRV queries, which that URI form needs. Point your adapter at
`8.8.8.8`, or use the seed-list URI instead — Atlas offers it under _Connect → Drivers → older
driver versions_, and it needs only ordinary A records.

**Port 3000 in use, or API calls 404 in the browser.**
Change `PORT` in `.env` and restart `pnpm dev`; the Vite proxy reads its target at startup. Make
sure `VITE_API_URL` is **empty** — a stale value there overrides the proxy.

**Categorisation always answers `source: "fallback"`.**
No provider key is set, or both providers are failing. Without a key the feature is simply
inert — you pick the category yourself, which is the normal path anyway. The log
names the provider and status on every failure.

**A model name returns 404 or `model_not_found`.**
Provider catalogues move, and a retired name fails quietly rather than loudly — this bit the
deployment once. Leave the model variables blank unless you have measured a replacement; the
defaults are the measured ones.

**`'esbuild' is not recognized` during deploy.**
CDK shells out to `pnpm exec esbuild` from the **workspace root**, which is why it is a root
`devDependency`. If `pnpm install` warned about ignored build scripts, run `pnpm approve-builds`
and allow `esbuild`.

**Login feels slow.** ~3.6 s cold, ~1.0 s warm. In order of size: the Mongo connection (the
Atlas cluster is not in the Lambda's region), scrypt (deliberate, CPU-bound), and cold start.
See [Deploying](#deploying) for why the CPU share cannot be tuned here.

---

## What I'd do next

Roughly in the order I would pick them up:

1. **Move the token to an httpOnly cookie.** Same-origin already, so the usual CORS friction
   does not apply. The one genuine security improvement outstanding.
2. **Integration tests in CI** against `mongodb-memory-server`, promoting the manual end-to-end
   pass into the suite.
3. **Per-user rate limiting on `/ai/categorize`.** Every categorisation is now a provider call,
   so a hostile authenticated user could burn a quota that is shared across the deployment.
   This moved up the list when the keyword pre-pass came out.
4. **Secrets via SSM Parameter Store**, read at cold start.
5. **Cache repeated descriptions per user.** The same merchant typed twice is the same answer;
   a small per-user store of confirmed description-to-category pairs would cut provider calls
   without the maintenance burden of a hand-written keyword list.
6. **Move receipt storage to S3.** Fine at demo scale, wrong at any other: a 512 MB free cluster
   holds very few 4 MB documents.
7. **Pagination on `/expenses`.** Capped at 100 rows today. Honest, not a long-term answer.

Two things were **deliberately left out** — a conversational assistant and password reset. Both
cuts are reasoned rather than forgotten, and the reasoning is in
[design notes](docs/design-notes.md#what-was-deliberately-left-out).
