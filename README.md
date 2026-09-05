# Expense Tracker

A personal expense tracker with AI-assisted data entry. Upload an invoice or a photo of a
receipt and the form fills itself in; type a description instead and the category is suggested
for you. Log what you spend, organise it by category, and see where the money went.

Built for the Extropy full-stack home challenge: **Option 1 (Personal Expense Tracker)** plus
**AI Option B (AI-Augmented Content & Categorization)**.

|                 |                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository**  | https://github.com/MatheusReimer/extropy-ledger                                                                                                                                                                                                                                                                                 |
| **Live app**    | https://k7dptwm6x7.execute-api.us-east-1.amazonaws.com                                                                                                                                                                                                                                                                          |
| **API**         | https://k7dptwm6x7.execute-api.us-east-1.amazonaws.com/api — same host as the app, on purpose                                                                                                                                                                                                                                   |
| **Deploy note** | Running in the Lambda-served variant, because a new AWS account cannot create CloudFront distributions until AWS verifies it. Same code, one CDK flag — see [DEPLOYMENT.md](DEPLOYMENT.md). The CloudFront branch has never run in an account, so it is pinned by CDK template assertions instead: `infra/tests/stack.test.ts`. |

---

## Quick start

### Prerequisites

|                | Version   | Notes                                                                                                            |
| -------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| Node.js        | **≥ 22**  | The Lambda runtime is `nodejs22.x`; local dev matches it.                                                        |
| pnpm           | **11.x**  | `corepack enable` picks up the pinned version from `package.json`.                                               |
| MongoDB Atlas  | M0 (free) | Any connection string works; a local `mongod` is fine too.                                                       |
| AWS CLI        | v2        | Only needed to deploy. Configured credentials + one `cdk bootstrap`.                                             |
| Gemini API key | —         | **Optional**, free, no card. [aistudio.google.com/apikey](https://aistudio.google.com/apikey)                    |
| Groq API key   | —         | **Optional**, free, no card. Second provider for _categorisation_ — see [why there are two](#why-two-providers). |
| OpenRouter key | —         | **Optional**, free. Second _vendor_ for reading receipts. [openrouter.ai/keys](https://openrouter.ai/keys)       |

### Four commands

```bash
pnpm install
cp .env.example .env       # then fill in MONGODB_URI and JWT_SECRET
pnpm build
pnpm dev
```

`pnpm dev` starts both apps in parallel:

- API on <http://localhost:3000>
- Web on <http://localhost:5173>

Open the web URL, create an account, and add an expense.

### Where the `.env` goes

**One file, at the repository root.** It serves all three packages — the API dev server, Vite,
and the CDK deploy. Every variable is documented inline in
[`.env.example`](.env.example); only two are required:

```bash
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
JWT_SECRET=<48 random bytes, base64url>
```

Generate a secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

If anything required is missing, the API refuses to start and prints **every** missing
variable at once, with a description of each — rather than failing later inside a request.

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
                                        │ Gemini → Groq   │
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
```

### The request path

A request enters through one of two **adapters** — `lambda.ts` (API Gateway) or `local.ts`
(a `node:http` server) — which translate the transport into a plain object and hand it to a
single `dispatch` function. Everything past that point is transport-agnostic:

```
adapter → dispatcher (routing, JSON parsing, error boundary, logging)
        → requireAuth (verifies the token, attaches userId)
        → handler (parses input against a shared Zod schema, queries scoped by userId)
```

The payoff is that **`pnpm dev` runs the same code that ships to production**. There is no
mock API to keep in sync, and the route table, middleware and handlers are all testable
without standing up either transport.

The symmetry extends to the frontend: the Vite dev proxy does exactly what CloudFront does —
take `/api/*`, strip the prefix, forward it to the API. The app therefore talks to a
same-origin `/api` in both environments, so there is no API URL baked into the build, no CORS
in the browser during development, and no "works locally, breaks deployed" gap. `VITE_API_URL`
exists only to point a local UI at an already-deployed API.

---

## The AI feature

The centre of this submission is `POST /ai/categorize`, and specifically **when it decides not
to call the model at all**.

### A three-step cascade

```
description ──▶ ① rule pre-pass ───match───▶ { category, confidence: 0.95, source: "rule" }
                      │ no match
                      ▼
                ② Gemini ──────────valid───▶ { category, confidence, source: "model" }
                      │ 429 / 503 / timeout
                      ▼
                ③ Groq ────────────valid───▶ { category, confidence, source: "model" }
                      │ still nothing, or the 8s chain budget expired
                      ▼
                ④ fallback ────────────────▶ { category: "Other", confidence: 0, source: "fallback" }
```

Measured on real descriptions, with both keys set:

```
    0ms  rule      Dining      95%  "Starbucks downtown"
    0ms  rule      Dining      95%  "Uber Eats dinner"
  771ms  model     Other       40%  "Zorblatt Industries consulting retainer"
    0ms  rule      Dining      95%  "Padaria on the corner, bread and coffee"
    0ms  rule      Transport   95%  "Two tickets, night bus to Curitiba"
  657ms  model     Shopping    90%  "Replacement charger for the laptop"
    0ms  rule      Education   95%  "Tuition instalment for the design course"
```

Five of seven answered in under a millisecond having never left the process. Note
the 40% on the deliberately vague one against 90% on the clear one — the
confidence instruction is doing real work, and the UI uses it.

**① The rule pre-pass** (`ai/rules.ts`) is 122 merchant keywords and phrases across the ten
predefined categories. "Starbucks" is not a natural-language problem — it is a table lookup.
Spending 300 ms and a paid API call to learn that coffee is Dining is using AI where
`Set.has` already answers, so the common case never leaves the process.

Phrases are matched **before** single words, for one concrete reason: `"uber eats"` contains
`"uber"`. Word-first matching would file a dinner under Transport at 95% confidence, and a
_confidently wrong_ answer is worse than no suggestion. There is a test pinning exactly that.

**② and ③, the providers**, are asked only about what is genuinely ambiguous — an unknown
merchant, free text, a description a lookup table will never cover.

**④ The fallback** guarantees the feature can never block someone from recording an expense.
The AI is an adviser, not a dependency: no provider ever rethrows.

### Why two providers

Not redundancy for its own sake — a measurement. Benchmarking Gemini's free tier on ten real
descriptions, **roughly a third of calls returned 503 or 504** under load, with latency ranging
from 634 ms to 19 s. A retry against the same provider just queues behind the same congestion,
so the second attempt is a different provider on independent infrastructure.

Live, that is exactly what happens:

```
    0ms  rule      Dining      95%  "Starbucks downtown"          ← never left the process
  754ms  model     Other       40%  "Zorblatt Industries consulting retainer"
 4580ms  model     Housing     95%  "Deposit for the beach house in December"   ← Gemini stalled, Groq answered
 4516ms  model     Shopping    95%  "New winter coat from the outlet"           ← same
  826ms  model     Other       30%  "Monthly payment to Vandelay Industries"
```

**Two budgets, and the second one took a live test to find.** The first version used a single
8-second deadline shared by the chain. It looked right and was not: when Gemini stalled it
consumed the whole budget, the chain logged `budgetExpired: true`, and Groq was never called
at all. _A fallback the primary can starve is not a fallback._ Each attempt now gets its own
4-second slice bounded by whatever remains of the 8-second total, so a hung provider costs its
slice and nothing more — which is why those two rows above are 4.5-second successes rather
than 8-second failures. Two unit tests pin the behaviour down.

It stays sequential rather than racing both, because racing would spend two free-tier quotas
on every single categorisation to save time on the minority that fail. The second provider is
insurance, and insurance you claim on every trip is just a bill.

Model choice on each side was measured, not assumed. On Groq, `openai/gpt-oss-120b` answered
7 of 8 descriptions at a 729 ms median; `gpt-oss-20b` was faster but failed schema validation
on 4 of 8, and `qwen3.6-27b` failed all 8. Groq validates generated JSON server-side and
returns 400 when the model misses the schema — that is the model falling short rather than a
malformed request, so the provider logs it as routine and the chain absorbs it.

Each provider is a module implementing one `AskModel` type, and `categorize.ts` takes the
composed chain as an injected dependency. Adding, reordering or removing a provider touches
`ai/providers/` and nothing else — the cascade, cache, fallback and every test are
provider-agnostic.

### Prompt design

The prompt is deliberately short, because this call happens while a user is looking at a form
and every extra token is latency they feel.

- **A response schema with a native `enum`, not "please reply in JSON".** Both providers
  constrain decoding to the schema, so `category` cannot come back as a string outside the
  list — the guarantee is enforced while the tokens are produced, rather than requested
  politely in the prompt. That removes the whole genre of fenced code blocks and apologetic
  paragraphs. The two spell schemas differently, so `ai/schema.ts` renders the same contract
  into each dialect from one definition.
- **The enum carries _this user's_ real categories**, custom ones included, which is why the
  schema is built per request rather than being a constant. Someone who created "Pets" can be
  offered "Pets"; nobody can be offered a category that does not exist in their account.
- **Thinking is turned down as far as the model allows** (`thinkingLevel: MINIMAL`). Picking
  one of eleven labels from a merchant name does not need deliberation, and those tokens are
  pure latency on a synchronous call. `temperature: 0` for the same reason — classification
  wants the most likely label, not a creative one.
  → Two things here were found only by running against the live API, and both are in the
  code comments because they are non-obvious: Gemini 3.x **rejects** the older
  `thinkingBudget: 0` outright, and thinking tokens **count against `maxOutputTokens`** — at
  128 the model spent its whole budget reasoning and returned the fragment `"Here"` instead
  of JSON.
- **Two instructions earn their place** because they change behaviour: report confidence
  honestly (so the UI can decide whether to preselect or merely suggest), and classify rather
  than guess. Everything else the schema already specifies.
- **The output is revalidated anyway** (`ai/parse.ts`). The schema _should_ be enough;
  "should" is not a strong enough guarantee for a path that ends in a database write, and a
  response truncated at the output-token limit is still valid UTF-8 and invalid JSON. Any
  parse failure or off-list answer routes to the fallback instead of persisting a category
  that does not exist.

### Cost and latency — when is it worth calling?

| Decision                           | Reasoning                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules first                        | The majority of real expenses are recognisable merchants. Those cost nothing and answer in microseconds.                                          |
| **On blur, not on keystroke**      | Per keystroke, "Starbucks downtown" is ~20 calls. On blur it is one call per expense — and only while the user has not already picked a category. |
| Skip once the user chooses         | If they have decided, there is nothing to suggest.                                                                                                |
| **No result cache**                | There was one, per container. It was removed — see below.                                                                                         |
| Fallbacks are **not** cached       | That failure was in the transport, not the description; the next attempt deserves a fresh chance.                                                 |
| Flash-Lite, minimal thinking       | It is a classification, not an essay.                                                                                                             |
| One 8 s budget for the whole chain | Past that, picking from the dropdown is faster than waiting. Falling back is then the _correct_ behaviour, not a degradation.                     |

The response carries `source` so the **UI can be honest about provenance** — "matched a known
merchant" versus "suggested by Gemini · 82% confident" versus "no confident match". A fallback
preselects nothing: offering "Other" at zero confidence would be faking an answer.

### The cache I removed, and why

An earlier version memoised results in a per-container `Map`, on the usual reasoning:
descriptions repeat, the answer depends only on the text and the category list, and a provider
call costs 700 ms at best. It survived review until someone asked how often a description would
actually repeat between two requests. It does not hold up.

**The rule pre-pass eats every repeat worth having.** Starbucks, Uber, Netflix — the merchants
that recur — are answered by the keyword table and never reach a provider. So the cache could
only ever hold descriptions that missed all 122 keywords: the long tail, which is by definition
the set least likely to repeat. The cache stored exactly the entries with the lowest chance of a
second hit.

**Three more conditions had to hold at once** for a hit: the same warm container, an unchanged
category list, and a repeat that the client had not already absorbed — `ExpenseForm` skips a
request when the description has not changed since the last suggestion, which removes the
common case before it reaches the API.

**And it was quietly wrong.** `buildUserPrompt` sends the amount to the model when one is
present; the cache key was description plus category list only. "Transfer" at 5.00 and
"transfer" at 2,400.00 shared an entry, so the second request could receive an answer computed
for a different amount. Adding the amount to the key would have fixed that and pushed the hit
rate lower still — a cache that gets less useful the more correct you make it is not paying for
itself.

Rules first, model second, fallback last. No memoisation between them.

### Why these providers

The brief leaves the choice open ("Claude, OpenAI, or equivalent — the choice is yours").
Both were picked for the same three reasons: a free API key with no card, latency low enough
for a synchronous call inside a form, and schema-constrained JSON output that expresses "one
of exactly these categories" as a decoding constraint rather than a prompt instruction.

One honest caveat: free tiers generally permit the provider to use submitted data to improve
their models. That is fine for demo data and would not be acceptable for real financial
records — a production deployment belongs on a paid tier.

### Running without an API key

Both keys are optional, **independently**. With neither, the whole app still runs: the model
steps are skipped and categorisation answers from rules and the fallback, reporting the true
`source` either way. With one, you get that provider. With both, you get the chain. You can
review this project end to end without signing up for anything.

---

## Reading a receipt

The second AI feature, and the one that removes the most typing: upload a PDF invoice or a
photo of a paper receipt, and the expense form fills itself in.

```
POST /ai/extract-receipt   { fileName, mimeType, data: <base64> }
  ↓  decode, size-check, sniff the real bytes
  ↓  Gemini reads the document against an enum-constrained schema
  ↓  revalidate every field, drop anything unreadable
  →  { merchant, description, amountCents, currency, date, category, confidence }
```

Measured against the live API:

| Input                      | Time      | Result                                                                       |
| -------------------------- | --------- | ---------------------------------------------------------------------------- |
| Generated PDF invoice      | **2.1 s** | `240.45 BRL` — the total, not the `229.00` subtotal                          |
| Skewed, noisy JPEG "photo" | **6.0 s** | `97.17 BRL` — the post-discount total, not the `102.17` subtotal             |
| The shipped sample         | **4.7 s** | `209.90 BRL` — subtotal `199.00`, **plus** 10% service, **minus** a discount |

### Try it without finding a receipt

A sample receipt ships with the app (`apps/web/public/sample-receipt.jpg`) behind a **Try the
sample** button. A reviewer opening the deployed URL has no receipt to hand, and "upload
something" is a dead end without one.

It goes through the identical code path — fetch, base64, same endpoint — so what you see is the
real feature rather than a canned response. The merchant is fictional on purpose: a real
company's letterhead would be impersonation, not a fixture. It is also deliberately hard,
carrying both a service charge and a discount so the total cannot be found by reading the
largest number on the page.

Both also recovered the merchant, the date and the category. The photo case read `02/09/2026`
as 2 September rather than 9 February, which is right for a São Paulo receipt — and is exactly
the kind of judgement call that justifies the user confirming the draft.

### Why there is no PDF parser here

Gemini reads the file directly as `inlineData`. No `pdf-parse`, no OCR step, no separate
branch for "scanned image" versus "text PDF" — the same code path handles a generated invoice
and a crumpled photograph, because both are just bytes to a multimodal model. That deletes an
entire dependency and its whole class of failure modes.

### Where the file goes

The upload is **kept**, so a saved expense can show the document it came from — that is the
"Receipt" button on each row.

It lives in MongoDB rather than S3. A bucket would mean IAM, a lifecycle policy, presigned URLs
and CORS on a second origin: real work, all of it to hold documents already capped at 4 MB,
comfortably under the 16 MB BSON limit. The honest cost is that a free 512 MB cluster puts a
hard ceiling on how many receipts fit — the right constraint to accept for an MVP and the wrong
one for production, where this belongs in S3 behind presigned URLs.

Two rules keep it from becoming a landfill:

- **Unclaimed uploads expire.** A receipt is stored before the model is asked, so the id exists
  however the read goes. It carries an `expiresAt` 24 hours out and a TTL index sweeps it.
  Saving the expense unsets that field, which takes it out of the index's scope permanently.
  Abandoning a half-filled form is the common case, and without this every abandoned draft
  would leak a megabyte forever.
- **Deleting an expense deletes its receipt.** Keeping an image of somebody's restaurant bill
  after they asked for the record to go is retention nobody agreed to.

Reading one back is scoped by `userId` in the filter, like every other query here — another
account's receipt is a 404, not a 403. It is returned base64 inside JSON rather than as raw
bytes: binary through API Gateway needs binary media types configured on the stage and the
Lambda replying with `isBase64Encoded`, a deployment detail that breaks quietly and differs
between local and deployed. A third more bytes on a 4 MB ceiling is the cheaper trade.

### Saving says what it saved

On success the form is replaced by the entry it just created - description, category, date,
amount - and one **Add another** button that brings the empty form back.

It used to blank itself and say nothing. The only evidence anything had happened was a new row
further down, which on a narrow window is below the fold; and a form that empties itself is the
one outcome indistinguishable from having lost what you typed. The confirmation is dismissed by
a click rather than a timer, because it is only useful if it is still there when the user looks
back up.

Two details fall out of it. Editing does **not** show a confirmation - a correction updates the
row the user is already looking at, so it would be reporting something they can see. And
because the form unmounts while the confirmation is up, the receipt dropzone remounts clean on
"Add another" instead of leaving the previous receipt's thumbnail sitting above an empty form.

### It fills the form; it never saves

The upload populates the fields and stops. Nothing reaches the database until the user presses
the button. On a financial record that is the correct trade — a wrong extraction costs a
correction rather than a bad row — and it is why `confidence` is surfaced in the UI rather than
kept in the logs. Below 0.5 the badge says so.

Each field is only overwritten when the document actually yielded one, so a partial read tops
up the form instead of blanking it. If the receipt is in a currency the app does not display,
the amount is copied across **as printed** and the mismatch is flagged — converting it would
mean inventing an exchange rate.

### The honest asymmetry

There is no rule pre-pass and no second provider on this path, and both absences are real
rather than oversights:

- **No rule pre-pass**, because there is no cheap deterministic shortcut for reading a
  photograph. `Set.has` answers "is Starbucks dining?"; nothing answers "what does this image
  say" without a model. Inventing a first step here would be architecture for its own sake.
- **No second provider**, because Groq's models are text-only and cannot accept an image at
  all. That is why `ReadReceipt` is a separate type from `AskModel` — the asymmetry lives in
  the type system instead of surfacing as a runtime surprise.

### Two rungs, answering two different failures

Reading a receipt goes Gemini first, then a different vendor entirely. The two rungs are not
redundancy for its own sake - they fail for different reasons:

| Rung                          | Survives                                                 | Does not survive                     |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------ |
| **Gemini, two models hedged** | a congested or slow model — the common case by far       | anything that takes the account down |
| **OpenRouter**                | a revoked key, an exhausted daily quota, a Google outage | nothing left after this              |

Hedging two models of the same vendor was never a defence against a bad key or a spent quota:
all of Google's models die together. That is the gap this second vendor closes, and it is worth
stating plainly rather than implying that "two models" meant "two providers".

OpenRouter rather than a named vendor because it is one key across many models, several of them
free and image-capable, so trading the model later is an env var rather than a new adapter. The
model was **checked against OpenRouter's live model list, not assumed** - of the eleven free
vision models it offers, only some support `response_format`, and structured output is what
keeps the parser from guessing. `google/gemma-4-31b-it:free` is the default;
`minimax/minimax-m3:free` is the verified alternative if you want a rung with no Google in it at
all.

The whole call is a hand-written `fetch` against the OpenAI-compatible shape. A second SDK to
hold thirty lines is not a trade worth making.

**Three things only a live call could have told me**, all of which the unit tests were happy to
let through:

1. **`response_format` is advertised, not enforced.** Asked with `json_schema` and
   `strict: true`, the model read the receipt perfectly and answered in _markdown prose_ —
   `- **Merchant:** Harbor & Pine`. OpenRouter passes the field upstream and hopes; Gemini needs
   none of this because its schema constrains decoding. One explicit sentence in the prompt is
   what actually produces JSON, verified across three models: with it, all three complied; without
   it, none did.
2. **The amount came back as a number**, not the string the schema asks for — `"amount": 123.76`,
   and correct. Discarding a right answer over its JSON type is brittleness rather than rigour, so
   `parseExtractedExpense` now takes either and sends both down the same `parseAmountToCents` path.
3. **The first-choice model was rate-limited** on the very first call, and a second returned
   `"amount": ": 123.76"`. `minimax/minimax-m3:free` read it correctly every time — and has no
   Google in it, which is the whole point of this rung.

And one bug this chain reintroduced, caught by running it rather than reasoning about it: with a
single shared deadline, a slow-but-healthy Gemini spent the entire 25-second budget, so the
signal was already aborted when the fallback's turn came and it was never asked. The reader
reported `unavailable` while a working second vendor sat untouched. Gemini now gets a
**15-second slice** — above its hedged worst case of 10.7s — leaving the remainder for the
fallback. It is the same lesson as the categorisation chain, one level up: a fallback the primary
can starve is not a fallback.

Two behaviours worth knowing. `unreadable` deliberately does **not** fall through: if both
Gemini models looked and agreed the document holds no expense, that is an answer about the
document, and a third opinion is latency spent to be told the same thing. And with no
`OPENROUTER_API_KEY` the rung reports `unavailable` immediately, so the app behaves exactly as
it did before - there is a test for precisely that.

### A second model, since there is no second provider

Groq cannot read an image, so the receipt path cannot fail over to another vendor. What it
can do is fail over to another **model**, and on Gemini's free tier that is not a token
gesture: while benchmarking, one model returned 503 in the same minute another answered in a
second. Google pools capacity per model, so a different model is a different queue.

Two models, up to two attempts each, and the two loops answer different questions:

- **Retrying the same model** is only worth it when the failure could genuinely go the other
  way — congestion clears in 700 ms, a 404 will not. So `isTransient` governs the inner loop.
- **Moving to the next model** is worth it for _any_ failure, including a flat "no expense
  here" — because a different model has different vision.

That second point was a bug I had to be argued out of. The first version stopped dead on
`unreadable`, reasoning that re-reading a document a model had already rejected buys nothing
but latency. True of the **same** model; false of a different one — so the one rung that could
actually rescue a marginal photo was precisely the rung being skipped. Whose fault a failure
is and whether repeating the call is worthwhile are two questions, and collapsing them into
one flag is what hid this.

### The failure was latency, not availability

A user reported the 503 firing in normal use, so I measured before changing anything - and ten
reads of the same receipt came back **2.3, 2.6, 3.2, 3.5, 4.0, 4.6, 5.4, 5.6, 14.6 and 27.4
seconds**. Nothing was rate-limited; every call succeeded. The median is under four seconds and
the tail runs past twenty.

Against a 25-second budget, run strictly in sequence, that 27.4s call ate the entire allowance
and the fallback was never asked. A working model, a legible receipt, and the app still said
"the reader is busy". Two 14-second calls would have done the same thing.

So the models are **hedged** rather than merely sequenced: the fallback starts alongside the
primary once the primary has been running for six seconds - above the median on purpose, so the
common case still costs one request and only the slow tail pays for two - and the first usable
read wins. The loser is cancelled, and a cancelled hedge logs as `cancelled`, not as a failure;
a warning on the happy path is how logs stop being worth reading.

`Promise.all` was the wrong tool here and hid the bug it was meant to fix: it waits for the
slowest, so a hanging primary held up an answer the fallback already had. Waiting for the rest
is only needed to tell "nobody could read it" from "nobody could be reached".

Measured against the live API, twelve consecutive reads:

|                      | Before (sequential) | After (hedged) |
| -------------------- | ------------------- | -------------- |
| p50                  | ~4 s                | **3.7 s**      |
| p90                  | —                   | **10.3 s**     |
| Slowest              | **27.4 s**          | **10.7 s**     |
| Over the 25 s budget | yes                 | **none**       |

And the ladder's other guarantees, verified separately:

| Scenario                   | Result                                            | Time   |
| -------------------------- | ------------------------------------------------- | ------ |
| Healthy primary            | read correctly, first model                       | 2.3 s  |
| Primary is a dead model    | **recovered on the fallback**, same values        | 2.3 s  |
| Primary finds no expense   | **second model asked**, both agree → `unreadable` | 5.8 s  |
| Primary hangs indefinitely | **fallback answers**, primary cancelled           | < 12 s |
| Every model unreachable    | `unavailable` → 503                               | 2.4 s  |

### Two failures, because they ask different things of the user

This is the part worth reading. The first version collapsed every failure into one message:
_"Could not read an expense from that file. Try a clearer photo."_ That message is actively
harmful when the real cause is a busy free tier — it sends someone off to re-photograph a
receipt that was never the problem, and no number of retakes will fix a 429.

So `ReadOutcome` distinguishes them, and the distinction is drawn in exactly one place:

```ts
type ReadOutcome =
  | { status: 'ok'; fields: ExtractedFields }
  | { status: 'unreadable' } // the model answered, and found no expense
  | { status: 'unavailable' }; // we never got an answer at all
```

**Only a model that actually answered can call a document unreadable.** Every thrown error
— 429, 503, timeout, and equally a 400 or a 404 from a retired model name — is
`unavailable`, because a request that threw never got as far as looking at the document.

And `unreadable` needs _every_ model to have looked and agreed. If one model gave up while
another was never reached, the answer is `unavailable`, not `unreadable` — the unreached model
might have read it perfectly well, and "your receipt is illegible" is a claim the app should
not make on partial evidence.

That last case was a real bug, caught by testing the ladder against a nonexistent model
rather than assuming it worked: a 404 is not congestion, so an earlier version classified it
as `unreadable` and blamed the user's photo for what was actually our own stale config. The
status code tells you whether _retrying_ is worthwhile; it never tells you whose fault it
was. `tests/reader-ladder.test.ts` pins that down for 400, 401, 403 and 404.

The two outcomes reach the user as two different offers:

| Outcome       | HTTP | What the user is told                           | What they are offered             |
| ------------- | ---- | ----------------------------------------------- | --------------------------------- |
| `unreadable`  | 422  | "Could not find an expense in that file."       | Type it in — retrying cannot help |
| `unavailable` | 503  | "The reader is busy. **It is not your photo.**" | A **Retry** button                |

Retry is cheap because the receipt is already stored server-side before the read is attempted,
so trying again re-reads a file that is already on the server rather than re-uploading it.

**The known imprecision**, stated rather than hidden: a file with a valid JPEG signature but
corrupt contents draws a 400 from Google (`Unable to process input image`) and is therefore
reported as `unavailable` — the user is invited to retry something that will not improve. The
alternative is matching on a vendor's English prose, which breaks the moment they reword it.
Given that magic-byte sniffing already rejects anything that is not really an image, and that
congestion is the overwhelmingly more common cause, erring toward "not your fault" is the
better failure.

Either way the consequence is contained: the form the user was already using still works, and
nothing was saved without them confirming it.

## Money in ten currencies, in three languages

Someone pays for lunch in Brazil on the 3rd and wants to see the month in dollars. That one
sentence forces three decisions, and getting any of them wrong makes a column of numbers that
does not add up.

### 1. Store what was actually spent, and convert on the way out

An expense keeps `amountCents` **and** its `currency`, exactly as it was paid. The conversion
is a view, never the record. Storing only a converted figure would mean a receipt that says
R$247.00 displays as R$246.98 after a round trip, and the original would be gone.

### 2. Convert at the transaction date, and freeze it

The rate that matters is the one on the day the money moved, not today's. So the conversion is
done once, at write time, against the ECB rate for that date, and the result is stored beside
the original as `baseCents` (USD). A historical rate is a **fact that does not change**, which
means it can be cached forever — and it also means last month's report does not quietly
rewrite itself every time the market moves.

Reports sum `baseCents` in the database. Converting per-row at read time would push a network
call into an aggregation, and floating-point drift would accumulate across the sum instead of
being confined to a single row.

Editing an expense recomputes it, because leaving a stale `baseCents` behind would make the
row and its own report disagree — the one bug in this area a user would actually notice.

### 3. When there is no rate, say so — never guess

`getRate` returns `undefined` rather than falling back to 1.0. A silent rate of 1.0 turns
¥15,000 into $15,000 and looks entirely plausible on screen. `baseCents` stays `null`, the
expense still saves, it is left out of the total rather than counted at a made-up rate, and the
overview shows "_n_ expenses could not be converted" above the report. When no rate can be had
at all — the upstream is down and the display currency is not USD — a second line says amounts
are shown as spent.

Rates come from **Frankfurter** (ECB reference rates, no key, no quota — the same "clone it
and it works" reasoning as the optional LLM keys), behind three layers of cache: identity
(`USD→USD` never leaves the process), a per-container memo, then MongoDB with a TTL index on
"latest" and no expiry on historical rates.

### 4. A minor unit is not always a hundredth — and this was a real bug

Amounts are integers in the currency's **own minor units**. USD has a hundred cents to the
dollar; JPY has one yen to the yen. `minorUnitDigits` reads that exponent from
`Intl.NumberFormat().resolvedOptions()` rather than a table of our own, so it always agrees
with the formatter.

`formatMoney` got this right from the start. **Nothing else did**, and the audit that found it
is worth writing down, because the shape of the mistake is more interesting than the fix:

|                                  | before                     | should be       |
| -------------------------------- | -------------------------- | --------------- |
| Typing `15000` with JPY selected | stored `1500000`           | `15000`         |
| Editing that expense             | field showed `150.00`      | `15000`         |
| Converting ¥15,000 to USD        | `baseCents: 94` — 94 cents | `9405` — $94.05 |
| Showing $94.05 in yen            | `¥1,500,240`               | `¥15,002`       |

One function was exponent-aware and three were not, so **the display was right and the stored
number was wrong** — the direction that hides longest, because the number on screen looks fine
until you compare it against the receipt. The parser hardcoded `× 100` for every currency, and
`convertCents` multiplied minor units by a rate quoted in whole units, which is only correct
when both currencies happen to share an exponent. Nine of the ten do.

The fix is to make the currency an argument everywhere it was assumed:
`parseAmountToMinorUnits(input, currency)`, `minorUnitsToDecimalString(amount, currency)`, and
`convertMinorUnits(amount, rate, from, to)` — which rescales by both exponents, so JPY→USD
multiplies by a hundred and BRL→USD does not. The names changed with the signatures: a function
called `parseAmountToCents` invites exactly the assumption that broke it.

The receipt reader had the same latent bug and now reads the currency off the document before
scaling the amount, rather than after.

### Three languages, no i18n library

English, Portuguese and Spanish, as three plain objects. `pt` and `es` are typed as
`Dictionary`, which is `Record<TranslationKey, string>` derived from `en` — so a missing or
misspelled key is a **compile error**, not a blank space discovered in production.

For this many strings, i18next would buy lazy loading and plural rules that are not needed,
in exchange for a runtime, a config file, and a lookup that fails silently at runtime. The
trade would be worth making at ten times the string count; it is not worth making here.

Language and display currency are separate choices on purpose — reading Portuguese does not
imply thinking in reais.

## Key design decisions

### One Lambda with internal routing, not one per route

Ten functions mean ten independent cold starts and ten things to keep warm. One function
concentrates traffic and keeps both the container and the Mongo connection hot. The cost is
granularity — scaling and IAM are per-API rather than per-route — which for ten routes in one
domain is the right trade. It is also what makes the local dev server possible with _exactly_
the same code.

### CloudFront serves the API under the site's own host

The frontend would otherwise need the API Gateway URL at **build** time, and that URL only
exists **after** the deploy. That chicken-and-egg is usually solved with two deploys or a
custom domain; here a `/api/*` behaviour plus a five-line CloudFront Function that strips the
prefix collapses it into one origin, one deploy, and **no CORS in production at all**. (The
CORS module still exists for local dev and for anyone calling API Gateway directly.)

### Money is an integer number of cents

Binary floats cannot represent `0.1`. Summing expenses as decimals accumulates error that
shows up in the month total. Decimal conversion happens only at the edges: form input and
display.

### Dates are `YYYY-MM-DD` strings, not `Date`

An expense happens on a **day**, not at a microsecond. Storing an instant would force a
timezone choice for cutting the month in reports, and that cut would move with the server.
As a bonus, a month range is a plain string comparison (`>= "2026-02-01"`, `<= "2026-02-31"`)
that uses the `{ userId, date }` index directly — no calendar arithmetic and no
month-boundary bug.

### `packages/shared` is the DRY payoff

The Zod schemas are imported by the React forms **and** by the API handlers. "A password is at
least 10 characters" exists once. Client-side validation is a courtesy (instant feedback);
the server runs the same schema again in `parseInput`, which is the actual boundary.

### A handler never opens a collection

Every route handler takes its persistence as an argument. `requireAuth` builds a `Repositories`
bundle bound to the caller's id and attaches it to the request, so a handler says
`request.repos.expenses.list(...)` and cannot express "any user's expenses" — the scope is
closed over before the handler is entered. `findOneAndUpdate({ _id, userId })` lives in one
place per collection rather than at every call site.

The point is testability as much as safety. Handlers are exercised against an in-memory
implementation of the same interface, with no database and no container, in milliseconds — see
[Testing](#testing).

Two things sit outside the user-scoped bundle, deliberately:

- **`AccountRepository`** is unscoped, because sign-up and log-in run before there is a user to
  scope to. It exposes exactly `findByEmail` and `create`; nothing else can reach the `users`
  collection.
- **`RateRepository`** is on the bundle but is not filtered by user, because an exchange rate is
  not personal data — USD→BRL on a given date is the same fact for everyone, and storing a copy
  per account would multiply both the rows and the upstream calls.

`lib/rates.ts` therefore takes a `RateRepository` rather than importing the Mongo client, which
is what makes the "no rate, no guess" behaviour below testable at all.

### scrypt from `node:crypto` for passwords

bcrypt needs a compiled native module (a headache in a Lambda bundle) and bcryptjs is pure JS
and slow. scrypt is a serious KDF, ships with the runtime, and is deliberately expensive in
both CPU and memory. Its parameters are stored inside the hash, so raising the cost factor
later does not invalidate existing passwords.

### No router on the frontend

Two states — authenticated and not — and no deep URL worth sharing. A router would add a
dependency, protected routes and a redirect in order to express an `if`.

### Ink on paper, not default Chakra

The default component palette is fine and looks like default Chakra, which on a money app
reads as unfinished. Three decisions carry the look, and they live in one file
(`apps/web/src/theme.ts`) as semantic tokens rather than scattered through components:

- **The ground is a warm off-white**, not pure white. Pure white beneath near-black text
  glares, and it leaves a white card with nothing to separate it from the page.
- **Separation is hairline borders, not shadows.** Shadows imply floating UI; a ledger should
  sit flat on the page.
- **Two blues, deliberately.** The darker one carries white text, where the lighter would fail
  contrast; the lighter is for chart marks, judged against the surface rather than against
  type. `accent.data` is named for exactly that distinction.

Plus **tabular figures globally** — in a column of money, proportional digits make the decimal
points wander and the eye cannot scan down them.

**The typeface is Manrope**, chosen against three alternatives by rendering the same dashboard
in each and comparing them side by side. It was picked over Inter, which is the safer face and
has the better-tested figures, for a reason that is not typographic: Inter is the default on so
many products that it reads as unchosen, and the warmth of a geometric face with softened
corners is the one that answers this palette rather than sitting on top of it. It runs wider
than Inter, so the nav labels and the table were re-checked at 390 px afterwards - the table
scrolls inside its own container and nothing is clipped.

### Icons come from a library now

Both icon sets - the nine interface glyphs and the eleven category shapes - were hand-drawn
SVG paths, and are now Font Awesome. Worth knowing about the free tier: it is **solid only**,
with no light or thin weight, so the set reads heavier than the strokes it replaced. That is
the trade accepted for a named, complete, externally maintained set where adding an icon is an
import rather than an afternoon with a path editor, and where the weight cannot drift as the
set grows.

Both sets stay behind thin wrappers (`icons.tsx`, `CategoryIcon.tsx`) so every call site still
reads `<ReceiptIcon size={14} />`. Changing library again - or going back to hand-drawn
paths - is a change to those two files and nowhere else.

**The obvious wiring was measured and rejected.** `@fortawesome/react-fontawesome` over
`fontawesome-svg-core` is what the docs recommend, and it cost **+27 KB gzipped** to replace
about 2 KB of hand-drawn paths. Almost none of that was icons: tree-shaking correctly kept only
the 21 definitions actually imported. It was the core runtime - layers, transforms, masking and
a DOM watcher that rewrites `<i>` tags - none of which this app uses.

An icon definition is just `[width, height, ligatures, unicode, path]`, so the path goes
straight into an `<svg>` of our own and both runtime packages come out of `package.json`. Same
artwork, same package, same upstream updates, for **+2.4 KB gzipped** instead of 27 - measured
from the production bundle both ways:

|                                | Bundle (raw) | Bundle (gzip) |
| ------------------------------ | ------------ | ------------- |
| Hand-drawn paths               | 373.4 KB     | 112.6 KB      |
| Font Awesome, with its runtime | 472.7 KB     | 139.8 KB      |
| Font Awesome, paths only       | **379.3 KB** | **115.0 KB**  |

### One chart, one colour

Spending-by-category is a question about **magnitude**: bar length carries the whole message
and the category name is already on the axis. Colouring each bar differently would decorate a
single series — more visual load, no extra information, and a legend that repeats the axis.

---

### One layout, two shapes

The sidebar is the navigation on a desktop and does not exist on a phone: below `md` it is
`display: none` and a sticky top bar takes over, carrying the brand, sign-out, the view tabs,
and the language and currency selects.

That last part was a real bug rather than a styling choice. `Preferences` lived only inside the
sidebar, so on a phone there was **no way to change language or display currency at all** — the
two settings this app is largely about. It now renders in both places from one component, in a
compact two-select form inline and the labelled form in the sidebar.

Everything else is fluid: the stat row scrolls horizontally with snap points instead of
wrapping into a cramped grid, the form/chart pair collapses from two columns to one at `lg`,
and the expense table's wide content scrolls inside its own container so the page body never
does.

---

### Renaming and removing a category, and the one that cannot be

A category people cannot rename is a typo they have to live with, so `PATCH /categories/:id`
exists. Deleting is the harder half, and the answer is a refusal: `DELETE` returns **409 with
the expense count** when anything still points at the category.

The two alternatives are both worse. Cascading the delete destroys expenses the user never
asked to lose. Reassigning them to `Other` silently rewrites history - last month's report
changes because of an edit made today, and nothing in the UI ever said so. Refusing is the only
answer that loses no data, and the count is in the message because "it is in use" leaves the
user with no idea what to do next. The budget row _does_ go with the category, because a limit
on a category that no longer exists is not data, it is a leak.

**`Other` is exempt from both.** It is not just another row: `categorize.ts` falls back to it
when no rule and no model answer fits, and the receipt prompt names it as the value to use when
nothing matches. Renaming or removing it would break those paths quietly - the enum handed to
the model is built from the user's real categories, so the instruction "choose Other" would
simply stop having a referent. The API enforces that with a 403 rather than trusting the UI to
hide the buttons, which is the same reasoning as every other rule in this codebase: the client
is a convenience, not a control.

### Budgets per category

A ceiling is only useful next to the number it constrains, so a budget lives on the same card as
the category's spending, and the card appears even when nothing has been spent yet - "you set
aside $200 for Travel and used none of it" is information, and dropping that row would hide a
budget exactly when it was working.

Three decisions worth stating:

- **Stored in the base currency**, like `baseCents`, because that is the unit the monthly report
  already sums. Keeping both sides of the comparison in one unit means evaluating a budget is
  arithmetic rather than a rate lookup - and so there is no new failure mode where a budget
  cannot be judged because an exchange rate was unavailable. The input is in whatever currency
  the user reads in and converts once each way, in the i18n layer rather than at the call site.
- **Zero is a real budget.** "Spend nothing on this category" is a thing people mean, so an
  unset budget is the absence of the row, never a zero in it. That is also why `setBudgetSchema`
  does not reuse `amountCentsSchema`: an expense must be positive, a budget need not be, and
  sharing the schema would have quietly forbidden a legitimate value.
- **`PUT`, not `POST`.** Setting the same budget twice leaves one row, via an upsert against the
  unique `(userId, categoryId)` index - so two open tabs cannot produce two budgets.

Over-budget is never signalled by colour alone: the bar turns red **and** the label reads
"$38.90 over". Same reasoning as the category glyphs - the state has to survive a colour-blind
reader, a greyscale print, and a screenshot pasted into a chat.

### CSV export, and the injection that comes with it

The file is built in the browser from data already in the cache, so it exports exactly what the
table is showing, filters included. A server route would need the same filters implemented a
second time - and the day the two disagree, the file quietly disagrees with the screen. It would
also need the token in a query string to be reachable by a plain link, which is how tokens end
up in logs.

The part that needed real care is that **a CSV is executable**. Excel, Sheets and LibreOffice
treat a cell starting with `=`, `+`, `-`, `@`, tab or carriage return as a formula, so a
description reading `=HYPERLINK("http://evil","Click")` becomes a live link in whoever opens the
file. It is tempting to wave this away because the author and the reader are the same person -
but that stops being true the moment the file is shared, and descriptions on this app are not
always typed by hand: the receipt reader writes them from whatever the model saw on the page.
`escapeCsvValue` prefixes those cells with an apostrophe so a spreadsheet renders them as text,
quotes every field unconditionally, and doubles embedded quotes. Amounts are exported **as
spent**, with the currency in its own column - a single converted column would bake today's rate
into a file that outlives it.

## Security

Mapped to the OWASP Top 10 items this application actually touches.

| Concern                           | How it is handled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 Broken access control**     | The auth middleware proves _who_, never _what they may touch_. Every query filters on `userId` — `findOneAndUpdate({ _id, userId })`, not `{ _id }` — so another user's expense is a 404, not a silent success. Creating an expense also verifies the `categoryId` belongs to the caller. Verified end to end with a two-user probe.                                                                                                                                                                                                                      |
| **A02 Cryptographic failures**    | scrypt with a per-password salt and `timingSafeEqual`. JWTs signed HS256 via `jose` with the algorithm **pinned** on verify, which closes the `alg: none` / algorithm-confusion door (there is a test that forges one).                                                                                                                                                                                                                                                                                                                                   |
| **A03 Injection**                 | No string-built queries. Every id passes `ObjectId.isValid` before reaching a filter. React escapes on render and `dangerouslySetInnerHTML` appears nowhere.                                                                                                                                                                                                                                                                                                                                                                                              |
| **A04 Insecure design**           | `sanitizeText` normalises stored text; it is explicitly _not_ the XSS defence — escaping belongs to rendering, and escaping here would corrupt the stored description.                                                                                                                                                                                                                                                                                                                                                                                    |
| **A04 File upload**               | The browser's `Content-Type` is a claim, so it is never trusted: `lib/files.ts` sniffs the actual magic bytes, and the _sniffed_ type is what reaches the model, what gets stored, and what a browser is later told to render. Size is checked _before_ decoding, from the base64 length, so a hostile payload is rejected without ever being materialised. A renamed `.exe` is refused — there is a test for exactly that. Stored receipts are served with `X-Content-Type-Options: nosniff` and scoped by `userId`; another account's receipt is a 404. |
| **A05 Security misconfiguration** | Unexpected errors return a generic 500 body; detail goes to the log only. The S3 bucket blocks all public access and is reachable solely through CloudFront OAC. CORS is an explicit allowlist, never `*`.                                                                                                                                                                                                                                                                                                                                                |
| **A07 Auth failures**             | Login answers identically for "unknown email" and "wrong password", and burns a throwaway scrypt on the unknown-email path so the two cannot be told apart by timing. Password minimum is length-based (NIST SP 800-63B) with an upper bound, since scrypt runs inside the Lambda.                                                                                                                                                                                                                                                                        |
| **A09 Logging failures**          | Structured JSON logs, one line per request. **No request body is ever logged** — the auth routes carry a plaintext password, and "we only log the interesting ones" is the rule someone forgets under pressure.                                                                                                                                                                                                                                                                                                                                           |

### Known trade-off: token storage

The JWT lives in `localStorage`. The stronger answer is an httpOnly cookie, which XSS cannot
read. That normally needs `SameSite=None; Secure` and credentialed CORS because the site and
API are on different origins — except here they are not, since CloudFront serves both under
one host. **The cookie is genuinely viable and it is the first item in "what I'd do next."**
The current risk is contained: the only XSS surface would be injected HTML, and nothing in
this app renders user-supplied markup.

### Known trade-off: secrets in the CloudFormation template

The CDK reads secrets from the deploying shell's environment and sets them as Lambda
environment variables. They therefore appear in the synthesised template (inside `cdk.out/`,
which is gitignored) and in the Lambda console to anyone who already has account access.

The next step is SSM Parameter Store `SecureString` read at cold start. Secrets Manager was
rejected deliberately: it is **not** free tier, at $0.40 per secret per month after a 30-day
trial.

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

- **The AI cascade** — that a rule short-circuits _without calling the model_ (that assertion
  is the cost story), that a stalled provider cannot eat the whole budget and starve the next
  one, that an off-list answer is refused, and that a suggestion is never a category the user
  does not have.
- **Auth and crypto** — scrypt round-trip and salting, a tampered signature, an `alg: none`
  forgery, and every rejection path in `requireAuth`.
- **Money** — including an explicit test that cents stay exact where floats drift.
- **Report arithmetic** — totals, ordering, and the empty-month case.
- **Routing and errors** — parameter extraction, that a dynamic segment cannot swallow extra
  path segments, and that an internal error message never reaches the response body.
- **Config** — that every missing variable is reported at once, and that a _blank_ value in
  `.env` counts as absent (the shape `.env.example` actually ships) — and the same rule on the
  frontend, where a blank `VITE_API_URL` must fall back to `/api` rather than to `""`.
- **Uploads** — magic-byte sniffing for all four accepted types, a RIFF container that is _not_
  a WebP, a renamed executable, an oversized payload rejected before decoding, and the
  extraction parser dropping a malformed date, an unparseable amount, or a category the user
  does not have.
- **The reader ladder** — that a healthy model is called exactly once, that a congested one
  reaches the fallback model, that a 400/401/403/404 is reported as `unavailable` rather than
  blamed on the document, that a model finding nothing escalates to a _different_ model but
  never re-asks the same one, that `unreadable` is withheld when a model was never reached,
  and that pointing both model names at one model does not silently halve the ladder.
- **What the user is told when it fails** — `describeFailure` is a pure function precisely so
  this is testable: a 503 must say "not your photo" and must never ask for a clearer one. The
  message someone reads at their worst moment is worth a test.
- **CSV** — that a comma, a quote or a newline cannot invent a column or a row, and that every
  formula prefix (`=`, `+`, `-`, `@`, tab, CR) is defused so a spreadsheet renders it as text.
- **Budgets** — that zero is accepted (it means "spend nothing here") while a negative, a
  fractional cent, a numeric string and a missing value are all refused.
- **Currency arithmetic** — that a round trip stays within one minor unit, that conversion
  rounds once from the original rather than compounding, and that a BRL amount never renders
  with a bare `$`.
- **Minor units** — the regression tests for the bug in
  [section 4 above](#4-a-minor-unit-is-not-always-a-hundredth--and-this-was-a-real-bug): that
  `15000` typed against JPY stores 15,000 rather than 1,500,000, that a fraction of a yen is
  refused, that a JPY→USD conversion rescales by both exponents instead of one, and that the
  decimal round trip holds for a currency with no decimal point.
- **Which rate, and what happens when there is none** — that a missing rate stays `undefined`
  and never becomes a silent 1.0, that identity never leaves the process, that a stored rate is
  reused instead of re-fetched, that a historical rate is frozen with no expiry while `latest`
  carries one, and that two dates for one pair cannot share a cache entry.
- **Sign-up and log-in** — the 409 on a duplicate email, the categories a new account is seeded
  with, that the password never reaches storage in the clear, and that an unknown email and a
  wrong password come back byte-identical.
- **Translation keys** — that every key in `en` is actually reached from the UI. Seven were
  not, and the types could not see it: `Dictionary` proves the three locales agree with each
  other, never that anything renders them.

Route handlers are exercised **directly**, against an in-memory stand-in for the repositories
(`apps/api/tests/helpers/fake-repositories.ts`) — status codes, response shapes, which failure
becomes which HTTP error, and the ordering of writes. None of that is reachable from a pure
function.

That was not possible while a handler opened a MongoDB collection itself, which is the reason
the repository layer exists. Two places still bypassed it and were correspondingly untested:
`routes/auth.ts` reached for `users` and `categories` directly, and `lib/rates.ts` for `rates`.
Both now take their store as an argument — auth an unscoped `AccountRepository`, rates a
`RateRepository` on `request.repos` — and both are covered above.

On top of that sits a manual end-to-end pass against a real MongoDB (28 checks, including the
cross-user access probes above). Wiring it into CI against `mongodb-memory-server` is listed
below — it is out of `pnpm test` on purpose, because it downloads a ~780 MB MongoDB binary on
first run and the brief asks for a repo that is ready with minimal setup.

---

## Deploying

```bash
# once per AWS account + region
cd infra && npx cdk bootstrap

# from the repo root
pnpm deploy:lambda   # what this account can run today - see the deploy note
pnpm deploy          # the CloudFront variant, once AWS clears the account
```

**Which one to run.** `pnpm deploy` builds the intended architecture: S3 + CloudFront in front
of the API. A brand new AWS account cannot create a distribution until AWS verifies it, so
`pnpm deploy:lambda` passes `-c lambdaOnly=true` and serves the site from the Lambda's own
bundle instead. Identical application code; one flag between them.

`pnpm deploy` builds the web bundle, then synthesises and deploys the stack. It reads the same
root `.env`, and **aborts at synth time** with the list of what is missing rather than letting
you discover it from a Lambda 500 ten minutes later.

Outputs printed on success:

- `WebUrl` — the app
- `ApiUrl` — the API, same host, under `/api`
- `ApiGatewayUrl` — the direct API Gateway endpoint (useful for debugging)

Nothing else to configure: `VITE_API_URL` is empty by default, so the bundle uses the
same-origin `/api` path that CloudFront already routes.

`pnpm destroy` tears the stack down, including the S3 bucket.

**The CloudFront branch is asserted, not deployed.** `-c lambdaOnly=true` is what production
runs, which leaves the S3 + CloudFront path as code no environment has exercised — the worst
kind of code to keep, because nothing contradicts it. `infra/tests/stack.test.ts` synthesises
both variants and pins the parts that would fail quietly rather than loudly: that `/api/*` uses
the managed **caching-disabled** policy (a cached authorised `GET` would serve one user's data
to another), that the prefix-stripping function is attached on _viewer-request_, that 403 and
404 rewrite to `/index.html` for the client-side router, and that the bucket blocks all public
access. Synthesising is not deploying — CloudFormation can still reject a valid template — but
the branch is no longer unverified in shape.

The Lambda runs with a **30-second timeout** — API Gateway's own integration ceiling. Receipt
extraction takes 1–6 seconds healthy, but a congested free tier was measured at 17 s, and the
request budget is 25 s.

### Free tier notes

The Lambda, API Gateway and CloudWatch usage sit comfortably inside the always-free tiers, log
retention is capped at one week, and CloudFront's 1 TB/month egress is perpetual. Atlas M0 is
free indefinitely, and the Gemini free tier needs no card. The whole stack runs at zero
marginal cost — the rule pre-pass keeps it well inside the free tier's rate limits too.

### The other new-account restriction: 512 MB of Lambda

On Lambda, **memory is a CPU setting**. vCPU scales with it, and the slowest thing on the
critical path is the scrypt password hash — deliberately expensive and entirely CPU-bound. The
stack asked for 1024 MB for that reason.

This account will not allow it:

```
'MemorySize' value failed to satisfy constraint:
Member must have value less than or equal to 512
```

Same family of new-account restriction as the CloudFront one above, and the same answer: deploy
what the account permits and say so, rather than pin a number that cannot ship. It runs at 512,
and `infra/tests/stack.test.ts` asserts 512 so the template and the account agree.

**What it costs:** a login is ~1.0 s against the deployed API, and scrypt dominates that. The
cost factor is unchanged, so nothing about the hashing is weaker — it simply gets less CPU. If
the quota is lifted, raise the stack and the assertion together.

---

## Troubleshooting

**`pnpm install` warns about ignored build scripts.**
It shouldn't — `pnpm-workspace.yaml` approves esbuild's postinstall. If you see it anyway, run
`pnpm approve-builds` and allow `esbuild`; without its platform binary, the Vite build and CDK
bundling both fail with "esbuild not found".

**The API prints "Invalid environment configuration" and exits.**
Working as intended. It lists every missing variable with a description. Copy `.env.example`
to `.env` at the **repository root** — not inside `apps/api`.

**`querySrv ECONNREFUSED` or `querySrv ENOTFOUND` on an `mongodb+srv://` URI.**
Your machine's DNS resolver cannot answer SRV queries. `mongodb+srv://` needs one, because the
driver discovers the replica set members through DNS rather than listing them.

Diagnose it — if the public resolvers answer and yours does not, the problem is local:

```bash
node -e "const d=require('node:dns');console.log(d.getServers());const r=new d.promises.Resolver();r.setServers(['8.8.8.8']);r.resolveSrv('_mongodb._tcp.<your-cluster>.mongodb.net').then(console.log).catch(console.error)"
```

Fix it at the source by pointing your adapter at `8.8.8.8` / `1.1.1.1`, or sidestep SRV with
the seed-list form of the URI, which needs only ordinary A-record lookups:

```
mongodb://user:pass@host-00:27017,host-01:27017,host-02:27017/?ssl=true&authSource=admin&retryWrites=true&w=majority
```

Atlas offers that string under _Connect → Drivers → older driver versions_. It works
everywhere `mongodb+srv://` does, at the cost of breaking if Atlas ever moves the shard
hostnames — so prefer SRV once the resolver is healthy.

**Port 3000 is already in use.**
Set `PORT` in `.env` to something free and restart; the Vite proxy reads it at startup, so no
frontend change is needed.

**`MongoServerSelectionError: connect ECONNREFUSED`.**
`MONGODB_URI` points somewhere unreachable. For Atlas, check that your current IP is on the
cluster's network access list — that is the usual culprit, and the error looks identical to
"database is down".

**Signup returns 500 on a fresh Atlas cluster.**
Almost always the same network-access list. The API creates its indexes on first use, so the
very first request after a cold start is the one that surfaces a connectivity problem.

**Login feels slow.**
Measured against the deployed stack: **3.6 s cold, ~1.0 s warm.** Three things add up, in
order of size — the Mongo connection (TLS plus replica-set discovery, and the Atlas cluster is
not in the Lambda's region), scrypt (deliberate, and CPU-bound), and Node cold start parsing a
2 MB bundle. Only the middle one is tunable from here, which is why the Lambda is provisioned
at **1024 MB**: on Lambda, CPU scales with memory, and at 512 MB the hash had roughly a third
of a core. The remaining fix is co-locating the cluster with the function; the bundle is a
distant third and not worth splitting for.

**Categorisation always answers `source: "fallback"` for unknown merchants.**
Check that at least one of `GEMINI_API_KEY` / `GROQ_API_KEY` is set. Without either, the model
steps are skipped by design; the API logs `aiEnabled: false` at startup and the dev server
prints a warning. If a key _is_ set, look for `ai provider failed` in the logs — it names the
provider and the status. A 429 or 503 there is free-tier congestion, which is exactly what the
second provider and the fallback exist to absorb.

**`Manually set deadline 5s is too short` from Gemini.**
The current Flash models refuse a server-side deadline under ten seconds. That is why the
Gemini client sets no `httpOptions.timeout` and the chain enforces its budget with an
`AbortSignal` instead. Don't reintroduce the timeout option.

**`'esbuild' is not recognized` during `cdk synth` or `pnpm deploy`.**
CDK bundles the Lambda by shelling out to `pnpm exec esbuild` **from the workspace root**, not
from `infra/`, so esbuild has to be resolvable there. It is a root `devDependency` for exactly
that reason; a pnpm install that only placed it under `infra/` will fail at the bundling step.

**`cdk deploy` fails with "SSM parameter /cdk-bootstrap/... not found".**
The account/region has not been bootstrapped. Run `npx cdk bootstrap` from `infra/`.

**API calls 404 in the browser during development.**
The Vite proxy forwards `/api` to the port in `PORT` (default 3000). If you changed `PORT`,
restart `pnpm dev` — the proxy target is read at startup. Also make sure `VITE_API_URL` is
empty; a stale value there overrides the proxy.

**CloudFront still serves the old bundle.**
The deployment invalidates `/*`, but propagation takes a minute or two. Hard-refresh before
assuming a bug.

---

## What I'd do next

Roughly in the order I would actually pick them up:

1. **Move the token to an httpOnly cookie.** Same-origin already, so the usual CORS friction
   does not apply. This is the one genuine security improvement outstanding.
2. **Integration tests in CI** against `mongodb-memory-server`, promoting the manual end-to-end
   pass into the suite.
3. **Per-user rate limiting on `/ai/categorize`.** The rule pre-pass bounds the cost well in
   normal use — it answers every recurring merchant without a provider call — but a hostile
   authenticated user is a different question, and the free tier's quota is shared across
   every user of the deployment.
4. **Secrets via SSM Parameter Store**, read at cold start, replacing the template-embedded
   environment variables.
5. **Grow the rule table from real data.** Every `source: "model"` hit is a merchant the table
   does not know. Logging the misses turns the cascade into something that gets _cheaper_ the
   more it is used — the most valuable follow-up on this list.
6. **Move receipt storage to S3.** They currently sit in Mongo, which is fine at demo scale and
   wrong at any other — a 512 MB free cluster holds very few 4 MB documents. Presigned PUT and
   GET would lift both the storage ceiling and the 4 MB upload cap, at the cost of a bucket, a
   lifecycle policy and CORS on a second origin.
7. **Pagination on `/expenses`.** The API accepts a `limit` up to 200 and the web app sends
   none, so a list is 100 rows today. Honest, but not a long-term answer.

### Deliberately out of scope

A **conversational assistant** ("what were my top categories last month?") was cut, and that
cut is the point rather than an omission. It would have meant streaming, context injection and
a much larger prompt surface — and for the questions this app actually answers, the report
endpoint gives an exact number instantly, for free, and without a hallucination risk. The
judgement the brief asks for is knowing where an LLM adds value and where it adds latency and
cost on top of a `$group` query. Categorisation is the former; summing a column is the latter.

### No password reset, and that is a decision

There is no "forgot password" flow. The brief asks for sign-up, log-in and JWT authentication,
and this is none of those - but it is the first thing a real deployment would need, so it is
worth being explicit rather than silent.

**A half-built one would be worse than none.** Any reset that does not actually deliver a
secret to an inbox - a form that resets on knowing the email address alone, say - is an account
takeover feature wearing a helpful label. And delivery is the real blocker: Amazon SES starts
every account in a sandbox that only sends to pre-verified addresses, and leaving it takes a
support request, which is the same queue this project is already waiting in for CloudFront.

The flow it would need, since the design is the interesting part:

- A **single-use token**, stored hashed. A leaked database should not yield working reset links,
  for the same reason it does not yield passwords.
- **Short expiry**, fifteen to thirty minutes, and invalidated the moment it is used.
- The response is **identical whether or not the address exists**. Login already works this way
  (see A07 in the security table); a reset endpoint that answered differently would hand back
  the user enumeration that login refuses to give.
- **Rate limited per address and per IP**, or the endpoint is a way to have this service mail
  somebody repeatedly.

And one piece that is specific to what is already built here: **resetting a password has to
invalidate existing sessions**, and this app's JWTs are deliberately stateless with no
revocation list. A stolen token would otherwise keep working after the victim did exactly what
they were told to do. That needs a `tokenVersion` on the user, bumped on reset and checked when
a token is verified - which turns every authenticated request into a database read, and is
precisely the trade the current design avoids. It is a real architectural consequence, not a
missing endpoint.

All three of Option 1's optional enhancements are implemented: **budgets per category**, **CSV
export**, and **spending trends over time**. What remains out of scope is deliberate: recurring
expenses, shared accounts, and receipt storage in S3 rather than Mongo (see the note on the
512 MB ceiling above).
