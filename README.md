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

|               | Version   | Notes                                                                                                                                                 |
| ------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js       | **≥ 22**  | The Lambda runtime is `nodejs22.x`; local dev matches it.                                                                                             |
| pnpm          | **11.x**  | `corepack enable` picks up the pinned version from `package.json`.                                                                                    |
| MongoDB Atlas | M0 (free) | Any connection string works; a local `mongod` is fine too.                                                                                            |
| AWS CLI       | v2        | Only needed to deploy. Configured credentials + one `cdk bootstrap`.                                                                                  |
| LLM API keys  | —         | **All optional**, all free, no card. Without them the app still runs end to end — see [running without a key](docs/ai.md#running-without-an-api-key). |

```bash
pnpm install
cp .env.example .env       # then fill in MONGODB_URI and JWT_SECRET
pnpm build
pnpm dev
```

`pnpm dev` starts both apps: the API on <http://localhost:3000>, the web app on
<http://localhost:5173>. Open the web URL, create an account, add an expense.

### Where the `.env` goes

**One file, at the repository root.** It serves all three packages — the API dev server, Vite,
and the CDK deploy. Every variable is documented inline in [`.env.example`](.env.example); only
two are required:

```bash
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
JWT_SECRET=<48 random bytes, base64url>
```

Generate a secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

If anything required is missing, the API refuses to start and prints **every** missing variable
at once, with a description of each — rather than failing later inside a request.

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
                                                 │  only when a rule can't answer
                                        ┌────────▼────────┐
                                        │ Gemini →        │
                                        │ OpenRouter      │
                                        │ (provider chain)│
                                        └─────────────────┘
```

```
apps/
  api/        Lambda handlers, routing, data access, the AI categorizer
  web/        React 19 + Vite + Chakra UI v3 + TanStack Query
packages/
  shared/     Zod schemas, DTO types, money helpers — imported by BOTH sides
infra/        AWS CDK stack (one stack: API + site)
docs/         The long-form write-ups linked above
```

A request enters through one of two **adapters** — `lambda.ts` (API Gateway) or `local.ts` (a
`node:http` server) — which translate the transport into a plain object and hand it to a single
`dispatch` function. Everything past that point is transport-agnostic:

```
adapter → dispatcher (routing, JSON parsing, error boundary, logging)
        → requireAuth (verifies the token, attaches userId + scoped repositories)
        → handler (parses input against a shared Zod schema)
```

The payoff is that **`pnpm dev` runs the same code that ships to production**. There is no mock
API to keep in sync, and the route table, middleware and handlers are all testable without
standing up either transport.

The symmetry extends to the frontend: the Vite dev proxy does exactly what CloudFront does —
take `/api/*`, strip the prefix, forward it to the API. The app therefore talks to a same-origin
`/api` in both environments, so there is no API URL baked into the build, no CORS in the browser
during development, and no "works locally, breaks deployed" gap.

---

## The AI feature, in short

The centre of this submission is `POST /ai/categorize`, and specifically **when it decides not
to call the model at all**:

```
description ──▶ ① rule pre-pass ───match───▶ { category, confidence: 0.95, source: "rule" }
                      │ no match
                      ▼
                ② Gemini ──────────valid───▶ { category, confidence, source: "model" }
                      │ 429/5xx/invalid
                      ▼
                ③ OpenRouter ──────valid───▶ { category, confidence, source: "model" }
                      │ still nothing
                      ▼
                ④ { category: "Other", confidence: 0, source: "fallback" }
```

A 122-keyword table answers every recurring merchant — Starbucks, Uber, Netflix — for free and
in under a millisecond. The model is for the long tail, and the response always says which rung
answered. A second provider is there because measurement demanded it: Gemini's free tier
returned 503/504 on roughly a third of calls under load, and a retry on the same provider just
queues behind the same congestion.

**One vendor backs both AI features.** That second rung used to be Groq for categorising and
OpenRouter for receipts — two SDKs, two keys, two catalogues to keep track of. OpenRouter is
itself a router, so one key reaches many models on infrastructure independent of Google, which
is the only thing the second vendor was ever buying. Measured on twelve long-tail descriptions,
OpenRouter answered 12/12 valid at a **332 ms median (548 ms p90)** against Groq's 12/12 at
**520 ms (644 ms p90)** — so the simpler arrangement is also the faster one, and there was no
trade to make. The honest cost is that one outage now takes out both fallbacks instead of one;
Gemini still goes first on both paths, and the rule table still answers with no provider at all.

Uploading a receipt goes further — Gemini reads the document directly via `inlineData`, with no
PDF parser and no OCR library, and pre-fills the form for you to confirm. Nothing is auto-saved.

**Prompt design**, in four decisions. The prompt is short on purpose: this call happens while
someone is looking at a form, and every extra token is latency they feel.

1. **A response schema with a native `enum`, not "please reply in JSON".** Both providers
   constrain decoding to the schema, so `category` cannot come back outside the list — enforced
   while the tokens are produced rather than requested politely. That removes the whole genre of
   fenced code blocks and apologetic paragraphs.
2. **The enum carries _this user's_ categories**, custom ones included, so the schema is built
   per request. Nobody can be offered a category that does not exist in their account.
3. **Thinking turned down as far as the model allows**, and `temperature: 0`. Picking one of
   eleven labels from a merchant name needs no deliberation, and those tokens are pure latency.
4. **The output is revalidated anyway.** "Should be enough" is not a strong enough guarantee for
   a path that ends in a database write — a response truncated at the token limit is still valid
   UTF-8 and invalid JSON. Any parse failure or off-list answer routes to the fallback.

**Cost and latency.** Rules first, because most real expenses are recognisable merchants and
those cost nothing. The model is asked **on blur, not per keystroke** — "Starbucks downtown" is
~20 calls per keystroke and one on blur — and skipped entirely once the user picks a category.
The whole chain shares an 8-second budget: past that, choosing from the dropdown is faster than
waiting, so falling back is the _correct_ behaviour rather than a degradation. The response
carries `source` so the UI can be honest about provenance, and a fallback preselects nothing —
offering "Other" at zero confidence would be faking an answer.

**[The full write-up](docs/ai.md)** covers the rest: the cache I removed and why, the two-rung
receipt-reader ladder, and the three bugs only a live API call could have revealed.

---

## Key design decisions

- **One Lambda with internal routing, not one per route.** Ten functions mean ten cold starts
  and ten things to keep warm. One concentrates traffic and keeps both the container and the
  Mongo connection hot. The cost is granularity — scaling and IAM are per-API rather than
  per-route.

- **CloudFront serves the API under the site's own host.** Same-origin means no CORS preflight
  on every request, no API URL in the bundle, and an httpOnly cookie remains available later
  without `SameSite=None`.

- **Money is an integer in the currency's own minor units**, never a float. Floats lose cents on
  a sum. What a "minor unit" is depends on the currency, and getting that wrong caused the worst
  bug in this codebase — [written up in full](docs/money.md).

- **Dates are `YYYY-MM-DD` strings, not `Date`.** An expense happens on a calendar day, not an
  instant. Strings sort correctly, compare correctly as a range, and carry no timezone to shift
  a purchase into the previous day.

- **`packages/shared` is the DRY payoff.** The Zod schemas are imported by the React forms
  **and** by the API handlers. "A password is at least 10 characters" exists once. Client
  validation is a courtesy; the server runs the same schema again at the real boundary.

- **A handler never opens a collection.** `requireAuth` builds a repository bundle bound to the
  caller's id, so a handler says `request.repos.expenses.list(...)` and _cannot_ express "any
  user's expenses" — the scope closes before the handler is entered. It is also what makes
  handlers testable without a database. Two deliberate exceptions: `AccountRepository` is
  unscoped, because sign-up runs before there is a user to scope to; `RateRepository` is not
  filtered by user, because an exchange rate is not personal data.

- **scrypt from `node:crypto` for passwords.** bcrypt needs a compiled native module (a headache
  in a Lambda bundle) and bcryptjs is slow. scrypt ships with the runtime and stores its
  parameters inside the hash, so raising the cost factor later does not invalidate existing
  passwords.

- **No router on the frontend.** Two states — authenticated and not — and no deep URL worth
  sharing. A router would add a dependency, protected routes and a redirect to express an `if`.

Decisions about the parts you can _see_ — the theme, the icons, the single-colour chart, the
category rules, budgets, CSV export — are in [design notes](docs/design-notes.md).

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

Tests target the parts where a bug is silent and expensive:

- **The AI cascade** — that a rule short-circuits _without calling the model_ (that assertion is
  the cost story), that a stalled provider cannot eat the whole budget and starve the next one,
  that an off-list answer is refused, and that a suggestion is never a category the user lacks.
- **Auth and crypto** — scrypt round-trip and salting, a tampered signature, an `alg: none`
  forgery, every rejection path in `requireAuth`, and the handlers themselves: the 409 on a
  duplicate email, the categories a new account is seeded with, and that an unknown email and a
  wrong password come back byte-identical.
- **Money** — that minor units stay exact where floats drift, that conversion rounds once from
  the original rather than compounding, and the regression tests for the minor-unit bug:
  `15000` against JPY stores 15,000 rather than 1,500,000, and a JPY→USD conversion rescales by
  both exponents instead of one.
- **Which rate, and what happens when there is none** — that a missing rate stays `undefined`
  and never becomes a silent 1.0, that identity never leaves the process, that a stored rate is
  reused, and that a historical rate is frozen with no expiry while `latest` carries one.
- **Uploads** — magic-byte sniffing for all four accepted types, a RIFF container that is _not_
  a WebP, a renamed executable, and an oversized payload rejected before decoding.
- **The reader ladder** — that a healthy model is called exactly once, that a congested one
  reaches the fallback, that a 4xx is reported as `unavailable` rather than blamed on the
  document, and that pointing both model names at one model does not silently halve the ladder.
- **What the user is told when it fails** — `describeFailure` is a pure function precisely so
  this is testable: a 503 must say "not your photo" and must never ask for a clearer one.
- **CSV** — that a comma, quote or newline cannot invent a column or row, and that every formula
  prefix (`=`, `+`, `-`, `@`, tab, CR) is defused so a spreadsheet renders it as text.
- **Config** — that every missing variable is reported at once, and that a _blank_ value counts
  as absent (the shape `.env.example` actually ships).
- **Translation keys** — that every key in `en` is reached from the UI. Seven were not, and the
  types could not see it: `Dictionary` proves the locales agree with each other, never that
  anything renders them.

Route handlers are exercised **directly**, against an in-memory stand-in for the repositories
(`apps/api/tests/helpers/fake-repositories.ts`) — status codes, response shapes, which failure
becomes which HTTP error, and the ordering of writes. None of that is reachable from a pure
function, and none of it was possible while a handler opened a MongoDB collection itself.

On top sits a manual end-to-end pass against a real MongoDB (28 checks, including the cross-user
probes). Wiring it into CI against `mongodb-memory-server` is listed below — it is out of
`pnpm test` on purpose, because it downloads a ~780 MB binary on first run and the brief asks
for a repo that is ready with minimal setup.

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

**The API prints "Invalid environment configuration" and exits.**
Working as intended — it lists every missing variable with a description. Copy `.env.example`
to `.env` at the **repository root**, not inside `apps/api`. On Windows, check the file is not
actually `.env.txt`; Notepad appends that silently. `ls -a` or `dir /a` will show it.

**`MongoServerSelectionError: connect ECONNREFUSED`, or signup returns 500 on a fresh cluster.**
Almost always the Atlas **network access list** — add your current IP. The error looks identical
to "database is down", and the API creates its indexes on first use, so the first request after
a cold start is the one that surfaces it.

**`querySrv ECONNREFUSED` / `ENOTFOUND` on a `mongodb+srv://` URI.**
Your DNS resolver cannot answer SRV queries, which that URI form needs before it can connect at
all. Confirm it is local — if a public resolver answers and yours does not, the problem is your
machine:

```bash
node -e "const d=require('node:dns');console.log(d.getServers());const r=new d.promises.Resolver();r.setServers(['8.8.8.8']);r.resolveSrv('_mongodb._tcp.<your-cluster>.mongodb.net').then(console.log).catch(console.error)"
```

Fix it at the source by pointing your adapter at `8.8.8.8` / `1.1.1.1`, or sidestep SRV with the
seed-list URI, which needs only ordinary A-record lookups. Atlas offers it under _Connect →
Drivers → older driver versions_:

```
mongodb://user:pass@host-00:27017,host-01:27017,host-02:27017/?ssl=true&authSource=admin&retryWrites=true&w=majority
```

It works everywhere the SRV form does, at the cost of breaking if Atlas moves the shard
hostnames — so prefer SRV once the resolver is healthy.

**Port 3000 is already in use, or API calls 404 in the browser.**
Set `PORT` in `.env` to something free and restart `pnpm dev` — the Vite proxy reads the target
at startup, so it needs the restart too. Also make sure `VITE_API_URL` is **empty**; a stale
value there overrides the proxy.

**Categorisation always answers `source: "fallback"`.**
Check that at least one of `GEMINI_API_KEY` / `GROQ_API_KEY` is set — without either, the model
steps are skipped by design and the API logs `aiEnabled: false` at startup. If a key _is_ set,
look for `ai provider failed` in the log; it names the provider and the status. A 429 or 503 is
free-tier congestion, which is exactly what the second provider and the fallback absorb.

**A model name returns 404 or `model_not_found`.**
Provider catalogues move, and a retired name fails unhelpfully rather than loudly. This bit the
deployment: `.env` pinned a Groq model the vendor had since removed, overriding a working
default. Because Gemini answers first, the dead rung was invisible until the catalogue was
checked against the live API. Leave the model variables blank unless you have measured a
replacement — the defaults are the measured ones — and if categorisation feels less reliable
than it should, verify them against the provider's current catalogue before debugging anything
else.

**`Manually set deadline 5s is too short` from Gemini.**
The current Flash models refuse a server-side deadline under ten seconds. That is why the Gemini
client sets no `httpOptions.timeout` and the chain enforces its budget with an `AbortSignal`
instead. Don't reintroduce the timeout option.

**`'esbuild' is not recognized` during `cdk synth` or `pnpm deploy`.**
CDK bundles the Lambda by shelling out to `pnpm exec esbuild` **from the workspace root**, not
from `infra/`, so esbuild must be resolvable there — it is a root `devDependency` for exactly
that reason. Relatedly, if `pnpm install` warns about ignored build scripts, run
`pnpm approve-builds` and allow `esbuild`; without its platform binary both the Vite build and
CDK bundling fail.

**`cdk deploy` fails with "SSM parameter /cdk-bootstrap/... not found".**
The account and region have not been bootstrapped. Run `cdk bootstrap` once.

**Login feels slow.**
Measured against the deployed stack: **~3.6 s cold, ~1.0 s warm.** Three things add up, in order
of size — the Mongo connection (TLS plus replica-set discovery, and the Atlas cluster is not in
the Lambda's region), scrypt (deliberate, CPU-bound), and Node cold start parsing a 2 MB bundle.
The scrypt share is the one normally tuned with more memory, which this account will not allow —
see [Deploying](#deploying). The real remaining fix is co-locating the cluster with the function.

**CloudFront still serves the old bundle.**
The deployment invalidates `/*`, but propagation takes a minute or two. Hard-refresh first.

---

## What I'd do next

Roughly in the order I would pick them up:

1. **Move the token to an httpOnly cookie.** Same-origin already, so the usual CORS friction
   does not apply. The one genuine security improvement outstanding.
2. **Integration tests in CI** against `mongodb-memory-server`, promoting the manual end-to-end
   pass into the suite.
3. **Per-user rate limiting on `/ai/categorize`.** The rule pre-pass bounds the cost in normal
   use, but a hostile authenticated user is a different question and the free tier's quota is
   shared across every user of the deployment.
4. **Secrets via SSM Parameter Store**, read at cold start.
5. **Grow the rule table from real data.** Every `source: "model"` hit is a merchant the table
   does not know. Logging the misses turns the cascade into something that gets _cheaper_ the
   more it is used — the most valuable follow-up here.
6. **Move receipt storage to S3.** They sit in Mongo today, which is fine at demo scale and
   wrong at any other — a 512 MB free cluster holds very few 4 MB documents.
7. **Pagination on `/expenses`.** The API accepts a `limit` up to 200 and the web app sends
   none, so a list is 100 rows today. Honest, but not a long-term answer.

### Deliberately out of scope

A **conversational assistant** ("what were my top categories last month?") was cut, and the cut
is the point rather than an omission. It would have meant streaming, context injection and a
much larger prompt surface — and for the questions this app actually answers, the report
endpoint gives an exact number instantly, for free, and with no hallucination risk. The
judgement the brief asks for is knowing where an LLM adds value and where it adds latency and
cost on top of a `$group` query. Categorisation is the former; summing a column is the latter.

**No password reset.** The brief asks for sign-up, log-in and JWT auth, and this is none of
those — but it is the first thing a real deployment would need, so it is worth being explicit
rather than silent. A half-built one would be worse than none: any reset that does not actually
deliver a secret to an inbox is an account-takeover feature wearing a helpful label. Delivery is
the real blocker, since SES starts every account in a sandbox that only sends to pre-verified
addresses. It would need a single-use token stored hashed, a fifteen-to-thirty-minute expiry,
invalidation on use, and every existing session revoked on success.
