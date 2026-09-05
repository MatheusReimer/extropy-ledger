# Money and language

Ten currencies, three languages, and the hundredfold bug that hid behind a correct-looking
screen.

Back to the [README](../README.md).

---

Someone pays for lunch in Brazil on the 3rd and wants to see the month in dollars. That one
sentence forces three decisions, and getting any of them wrong makes a column of numbers that
does not add up.

## 1. Store what was actually spent, and convert on the way out

An expense keeps `amountCents` **and** its `currency`, exactly as it was paid. The conversion
is a view, never the record. Storing only a converted figure would mean a receipt that says
R$247.00 displays as R$246.98 after a round trip, and the original would be gone.

## 2. Convert at the transaction date, and freeze it

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

## 3. When there is no rate, say so — never guess

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

## 4. A minor unit is not always a hundredth — and this was a real bug

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

## Three languages, no i18n library

English, Portuguese and Spanish, as three plain objects. `pt` and `es` are typed as
`Dictionary`, which is `Record<TranslationKey, string>` derived from `en` — so a missing or
misspelled key is a **compile error**, not a blank space discovered in production.

For this many strings, i18next would buy lazy loading and plural rules that are not needed,
in exchange for a runtime, a config file, and a lookup that fails silently at runtime. The
trade would be worth making at ten times the string count; it is not worth making here.

Language and display currency are separate choices on purpose — reading Portuguese does not
imply thinking in reais.
