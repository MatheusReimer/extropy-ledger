# The AI features

How categorisation and receipt reading actually work, why the fallbacks are shaped the way they
are, and what only showed up when the live APIs were called.

Back to the [README](../README.md).

---

## Categorising a description

The centre of this submission is `POST /ai/categorize`, and the design has exactly two paths:
**either the user picks the category, or the model suggests one.**

```
description ──▶ ① Gemini ──────────valid───▶ { category, confidence, source: "model" }
                      │ 429 / 503 / timeout
                      ▼
                ② OpenRouter ──────valid───▶ { category, confidence, source: "model" }
                      │ still nothing, or the 8s chain budget expired
                      ▼
                ③ fallback ────────────────▶ { category: "Other", confidence: 0, source: "fallback" }
```

Measured on real descriptions, with both keys set:

```
  771ms  model     Other       40%  "Zorblatt Industries consulting retainer"
  657ms  model     Shopping    90%  "Replacement charger for the laptop"
  332ms  model     Health      95%  "Osteopath appointment"
  489ms  model     Travel      95%  "Airbnb Lisbon three nights"
```

Note the 40% on the deliberately vague one against 90% on the clear one — the confidence
instruction is doing real work, and the UI uses it: a low-confidence answer is offered rather
than preselected.

### The keyword pre-pass I removed

There used to be a `①` in front of Gemini: 122 merchant keywords across the ten predefined
categories, so "Starbucks" resolved to Dining by table lookup without a provider call. Measured
across a realistic month it answered about 80% of entries for free and in microseconds, and it
made the app work end to end with no API key at all.

It came out anyway, and the reasoning is worth recording because it is not a performance
argument:

- **It was a third path in a two-path product.** The feature people understand is "type it
  yourself, or let the AI suggest." A hidden keyword table that sometimes answers first is a
  behaviour neither of those explains — and the source badge showing "matched a known merchant"
  was explaining an implementation detail to someone who did not ask.
- **It could never be complete**, so it always needed the model behind it. It optimised the
  common case at the cost of a second code path, a normalizer, an ordering rule
  (phrases-before-words, because `"uber eats"` contains `"uber"`) and a maintenance burden that
  grows with every merchant that changes its name.
- **Simplicity has a value that does not show up in a benchmark.** `categorize.ts` is 24 lines
  now, and there is one sentence that explains it.

What was genuinely lost: provider calls that used to cost nothing now cost a call and ~400 ms,
the free-tier quota is consumed faster, and with no key configured the suggestion feature is
inert rather than partially working. Per-user rate limiting moved up the "what I'd do next"
list because of it, and a per-user cache of confirmed description-to-category pairs would buy
most of the saving back without a hand-written list.

**① and ②, the providers**, answer everything now.

**③ The fallback** guarantees the feature can never block someone from recording an expense.
The AI is an adviser, not a dependency: no provider ever rethrows.

## Why two providers

Not redundancy for its own sake — a measurement. Benchmarking Gemini's free tier on ten real
descriptions, **roughly a third of calls returned 503 or 504** under load, with latency ranging
from 634 ms to 19 s. A retry against the same provider just queues behind the same congestion,
so the second attempt is a different provider on independent infrastructure.

Live, that is exactly what happens:

```
    0ms  rule      Dining      95%  "Starbucks downtown"          ← never left the process
  754ms  model     Other       40%  "Zorblatt Industries consulting retainer"
 4580ms  model     Housing     95%  "Deposit for the beach house in December"   ← Gemini stalled, the second rung answered
 4516ms  model     Shopping    95%  "New winter coat from the outlet"           ← same
  826ms  model     Other       30%  "Monthly payment to Vandelay Industries"
```

**Two budgets, and the second one took a live test to find.** The first version used a single
8-second deadline shared by the chain. It looked right and was not: when Gemini stalled it
consumed the whole budget, the chain logged `budgetExpired: true`, and the second provider was
never called at all. _A fallback the primary can starve is not a fallback._ Each attempt now gets its own
4-second slice bounded by whatever remains of the 8-second total, so a hung provider costs its
slice and nothing more — which is why those two rows above are 4.5-second successes rather
than 8-second failures. Two unit tests pin the behaviour down.

It stays sequential rather than racing both, because racing would spend two free-tier quotas
on every single categorisation to save time on the minority that fail. The second provider is
insurance, and insurance you claim on every trip is just a bill.

### One vendor, arrived at by deleting the other

The second rung was Groq for categorising and OpenRouter for reading receipts: two SDKs, two
keys, two catalogues to track. OpenRouter is itself a router, so a single key reaches many
models on infrastructure independent of Google — which is the only property the second vendor
was ever bought for. Collapsing to one was worth checking rather than assuming, so it was
measured on twelve long-tail descriptions:

| Second rung                                         | Valid | p50        | p90    | max     |
| --------------------------------------------------- | ----- | ---------- | ------ | ------- |
| OpenRouter `nvidia/nemotron-3-super-120b-a12b:free` | 12/12 | **332 ms** | 548 ms | 550 ms  |
| Groq `openai/gpt-oss-120b`                          | 12/12 | 520 ms     | 644 ms | 1144 ms |

Simpler _and_ faster, so there was no trade to weigh. Two honest caveats, because a single good
run is not a latency guarantee:

- **Free-tier latency has a long tail on both vendors.** Individual OpenRouter calls were
  observed at 5.6 s and once past 15 s, against a 332 ms median. That tail is exactly what the
  per-provider 4-second slice below exists to cut off — the request is abandoned, the rule
  fallback answers, and the user is told there was no confident match rather than made to wait.
- **One vendor now backs both features**, so a single outage or exhausted quota takes out both
  fallbacks rather than one. Gemini remains first on both paths, and a failed suggestion never blocks
  anyone — the category dropdown is always there — so the floor is unchanged; the middle rung is
  simply less redundant than it was.

Model choice was measured too, not assumed. Of the four free models advertising structured
output, `nemotron-3-super-120b` answered 8/8 schema-valid and agreed with the expected category
7/8; `minimax-m3` managed 6/8 at a 1362 ms median and was rate-limited twice; `glm-5.2` and
`lfm-2.5-2.6b` were unusable for this. The one disagreement is arguable rather than wrong — it
filed a coffee-bean subscription under Food rather than Dining.

Each provider is a module implementing one `AskModel` type, and `categorize.ts` takes the
composed chain as an injected dependency. Adding, reordering or removing a provider touches
`ai/providers/` and nothing else — the cascade, cache, fallback and every test are
provider-agnostic.

## Prompt design

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

## Cost and latency — when is it worth calling?

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

## The cache I removed, and why

An earlier version memoised results in a per-container `Map`, on the usual reasoning:
descriptions repeat, the answer depends only on the text and the category list, and a provider
call costs 700 ms at best. It survived review until someone asked how often a description would
actually repeat between two requests. It does not hold up.

**It stored the entries least likely to repeat.** At the time there was also a keyword pre-pass
in front of it, so the cache could only ever hold descriptions that missed all 122 keywords —
the long tail, which is by definition the set least likely to come back. (The pre-pass has since
been removed too, for different reasons; a cache is worth revisiting now that every description
reaches a provider, but it would need to be per-user and keyed on the amount as well.)

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

## Why these providers

The brief leaves the choice open ("Claude, OpenAI, or equivalent — the choice is yours").
Both were picked for the same three reasons: a free API key with no card, latency low enough
for a synchronous call inside a form, and schema-constrained JSON output that expresses "one
of exactly these categories" as a decoding constraint rather than a prompt instruction.

One honest caveat: free tiers generally permit the provider to use submitted data to improve
their models. That is fine for demo data and would not be acceptable for real financial
records — a production deployment belongs on a paid tier.

## Running without an API key

Both keys are optional, **independently**. With neither, the whole app still runs — you just
type the category yourself, which is the normal path anyway. The suggestion is an assistant, not
a requirement, so its absence costs a dropdown selection and nothing else. With one key you get
that provider; with both you get the chain. You can review the app end to end without signing up
for anything, though you will want at least one key to see the AI features do their job.

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

## Try it without finding a receipt

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

## Why there is no PDF parser here

Gemini reads the file directly as `inlineData`. No `pdf-parse`, no OCR step, no separate
branch for "scanned image" versus "text PDF" — the same code path handles a generated invoice
and a crumpled photograph, because both are just bytes to a multimodal model. That deletes an
entire dependency and its whole class of failure modes.

## Where the file goes

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

## Saving says what it saved

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

## It fills the form; it never saves

The upload populates the fields and stops. Nothing reaches the database until the user presses
the button. On a financial record that is the correct trade — a wrong extraction costs a
correction rather than a bad row — and it is why `confidence` is surfaced in the UI rather than
kept in the logs. Below 0.5 the badge says so.

Each field is only overwritten when the document actually yielded one, so a partial read tops
up the form instead of blanking it. If the receipt is in a currency the app does not display,
the amount is copied across **as printed** and the mismatch is flagged — converting it would
mean inventing an exchange rate.

## The honest asymmetry

The two AI features share a vendor but not a shape, and the difference is real rather than an
oversight. **Reading an image fails for different reasons than classifying a string**, so the
receipt ladder tries a second Gemini _model_ before it tries a second vendor — a congested model
is the common failure, and a different model is a different queue.

That is also why `ReadReceipt` is a separate type from `AskModel`. A failed classification is
simply "no suggestion"; a failed read has to distinguish _"I read it and could not make sense of
it"_ from _"I never reached a model"_, because only the first should ask the user for a clearer
photo. Keeping them as separate types puts that distinction in the type system instead of
leaving it to surface as a runtime surprise.

## Two rungs, answering two different failures

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
model was **checked against OpenRouter's live model list, not assumed** - only some free models
support `response_format`, and structured output is what keeps the parser from guessing.
`minimax/minimax-m3:free` is the default (`OPENROUTER_RECEIPT_MODEL`): it read the sample
correctly on every attempt, and it is the only tested candidate with no Google in it, which is
the entire point of this rung. `google/gemma-4-31b-it:free` was rate-limited upstream on the
first call and `dots-studio/dots-3-note-preview:free` returned a malformed amount.

The whole call is a hand-written `fetch` against the OpenAI-compatible shape. A second SDK to
hold thirty lines is not a trade worth making.

**A PDF is not an image, and that was a silent hole.** Every upload was sent to OpenRouter as
`image_url`, which a vision model answers with a 400 for a PDF. It was invisible because Gemini
reads PDFs natively and goes first — so the fallback rung covered images only, which is exactly
the half of the problem a fallback exists for when the primary is down. PDFs now go as a `file`
part with OpenRouter's `file-parser` plugin; images still go as `image_url`. Two tests assert on
the request body rather than a live answer, because the thing worth pinning is the shape we send.

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

## A second model, before the second vendor

Before the receipt path leaves Google at all, it tries a second Gemini **model**, and on the
free tier that is not a token gesture: while benchmarking, one model returned 503 in the same
minute another answered in a second. Google pools capacity per model, so a different model is
a different queue — and it is a cheaper rung than a different vendor, so it comes first.

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

## The failure was latency, not availability

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

## Two failures, because they ask different things of the user

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
