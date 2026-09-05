# Design notes

The decisions behind the parts of the app you can _see_ - layout, colour, icons, categories,
budgets, export. The architectural calls are summarised in the
[README](../README.md#key-design-decisions); this is the reasoning behind the surface.

Back to the [README](../README.md).

---

## Ink on paper, not default Chakra

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

## Icons come from a library now

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

## One chart, one colour

Spending-by-category is a question about **magnitude**: bar length carries the whole message
and the category name is already on the axis. Colouring each bar differently would decorate a
single series — more visual load, no extra information, and a legend that repeats the axis.

---

## One layout, two shapes

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

## Renaming and removing a category, and the one that cannot be

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

## Budgets per category

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

## CSV export, and the injection that comes with it

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
