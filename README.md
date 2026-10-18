# Interview Sim

Practice system design interviews on a drag-and-drop canvas, in two phases like a real interview:

1. **Requirements**: ask the interviewer clarifying questions, then lock in functional and non-functional requirements and estimates.
2. **Design**: draw on a draw.io-style canvas: 30 component shapes in a searchable, grouped palette; containers (group/service boundary, region, AZ, VPC) that you drop shapes into; free text and sticky notes that the interviewer reads; double-click any shape or connection to edit it in place; one-way or two-way connections. Like draw.io, selecting shapes or connections opens a **Format** panel (fill, line colour, dashed/dotted borders, text size, bold/italic; for connections: curved/straight/elbow path, dash, width, colour) and **Arrange** tools (resize, bring to front/send to back, duplicate, lock, align). The canvas has undo/redo, copy/paste/duplicate (Cmd/Ctrl+Z, Shift+Z, C, V, D, A), Shift+drag multi-select, snap to grid, a minimap and PNG export. Formatting is visual only and is never sent to the interviewer. Submit, and the interviewer pins numbered questions on your components and connections. Answer them or fix the design, resubmit, and repeat until time runs out, then get a final assessment.

The interviewer is strict. A design that can't serve a request end to end (no client, no compute, no data store, no entry point, or arrows that never reach the data) is rejected without a model call and counts as a strike. After 3 strikes you're told a real interviewer would likely have ended the session, and the final assessment takes strikes into account.

## Run it

```bash
npm install
cp .env.example .env    # defaults to the free mock provider
npm run dev             # web on http://localhost:5173, API on :8787
```

## Choosing the AI (`LLM_PROVIDER` in `.env`)

| Provider | Cost | Use it for |
|---|---|---|
| `mock` (default) | Free | Building and testing the app. Canned but design-aware questions. |
| `claude-cli` | Your Claude subscription | Real interviews before you buy API credits. Needs the `claude` CLI installed and logged in. |
| `api` | Paid, per token | Later. Refuses to start without `ANTHROPIC_API_KEY`. |

`npm run smoke:cli` makes one small real call through the CLI to check that it works.

**Before your first paid run:**
1. Set `LLM_DRY_RUN=true` with `LLM_PROVIDER=api`. Every prompt and its estimated token count is logged, but answers come from the mock, so nothing is billed.
2. Keep `BUDGET_TOKENS_PER_SESSION` / `BUDGET_TOKENS_PER_DAY`. Calls are refused *before sending* if they could cross a limit.
3. Also set a monthly spend limit in the Anthropic Console as a hard backstop.

## Which model does what (`models.config.json`)

| Task | Tier | When it runs |
|---|---|---|
| `clarify` | quick (Haiku) | You ask a clarifying question in the requirements step |
| `review_round` | default (Sonnet) | You submit a changed design |
| `grade_answers` | quick (Haiku) | Design unchanged, only new answers |
| `final_assessment` | complex (Opus) | Once, when you finish or time runs out |

Change the tiers or models in that file; no code changes needed.

## How tokens are saved
- **Free rule checks** (`src/server/interview/rules.ts`) catch structural issues (unconnected components, a single DB, the client hitting the DB directly, no entry point). They resolve themselves when you fix the design.
- **No call when nothing changed**, and no call for designs with fewer than 2 components.
- **Compact design text**: positions and styles never leave the browser.
- **Only the change since the last review** plus open threads is sent each round, not the whole history.
- **Stable system prompt** per problem, so the API can cache it.
- At most 5 new questions per round, with output caps per task.

## Reliability
- Model output is validated against a schema. Bad output gets one corrective retry, then a clear "Retry" in the UI.
- Duplicate submits (double-clicks or retries) reuse the same request id and are never processed or billed twice.
- A failed call saves nothing, and your canvas and answer drafts are autosaved in the browser.
- Sessions are JSON files in `data/sessions/`, written atomically.

## Develop

```bash
npm test           # unit + contract + failure tests, no network, $0
npm run typecheck
npm run lint
```

`MOCK_FAILURE=bad_json|timeout|rate_limit|refusal` makes the mock fail on purpose, so you can see how the UI recovers.

## Layout

```
src/shared/schemas.ts        Zod schemas: the single source of truth for all data shapes
src/server/llm/              providers (mock, claude-cli, api), routing, budget, validation + retry
src/server/interview/        problems + hidden rubrics, rules, prompts, diffing, session service
src/web/                     React + React Flow UI
tests/                       vitest suites
```
