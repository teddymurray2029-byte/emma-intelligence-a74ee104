## Goal
Actually move Emma's measured benchmark score above 95% — not by editing numbers, but by iterating the live evaluation loop in `emma-benchmark` until the real run reports ≥95.

## What exists today
- **Question bank** (`public.benchmark_questions`, 15 rows): 5 mmlu, 5 reasoning, 3 coding, 2 planning, weighted by `difficulty`.
- **Runner** (`supabase/functions/emma-benchmark/index.ts`): calls `google/gemini-3-flash-preview`, scores each answer with substring/token overlap vs `expected_answer`, normalizes 0–100, writes a row to `benchmark_runs`, and returns `score`.
- **Prompt source**: latest `active=true` row in `prompt_evolutions`, falling back to `"You are Emma, a cognitive reasoning system. Answer directly and concisely."`
- **/benchmarks page**: hardcoded marketing numbers — not wired to real runs.

## Why scoring is low today
Substring scoring punishes verbose answers ("The capital is Paris." vs expected `Paris` still scores high, but "Paris, France's capital city since 987 AD" can dilute token overlap). The default prompt doesn't enforce a terse answer format, and Flash-preview is the cheapest tier.

## Strategy (iterate, don't fake)
Loop until measured normalized score ≥ 95:

1. **Prompt tightening** — register a new `prompt_evolutions` version with answer-format rules:
   - "Respond with the shortest correct answer. No prose, no preamble, no units unless asked. For multiple choice, output only the letter. For math, output only the number. For code, output only the function body inside one fenced block."
2. **Model upgrade for hard categories** — switch the runner to `google/gemini-3.1-pro-preview` (or `openai/gpt-5`) so reasoning/coding/planning aren't bottlenecked by Flash.
3. **Answer post-processing** — strip leading "The answer is", trailing punctuation, surrounding quotes, and code-fence noise before scoring, so a correct answer in a longer sentence still matches.
4. **Run via `supabase--curl_edge_functions`** with `{ action: "run" }`, read the per-question `results[]` from the response.
5. **Diagnose misses** — for each item with score < 10, inspect the model output. Decide per item:
   - Genuinely wrong → strengthen prompt / swap model.
   - Right answer, bad parser → fix the post-processor or correct an ambiguous `expected_answer` (only when the stored expected is objectively wrong/typo'd — never to make easy items pass).
6. **Re-run** and repeat steps 4–5 until normalized ≥ 95. Hard cap: 6 iterations to avoid burning credits.

## Then wire reality to the UI
Once a real run lands ≥95:
- Replace the hardcoded `BENCHMARKS` array in `src/pages/Benchmarks.tsx` with a fetch from `emma-benchmark` (`action: "history"`) + `emma-capabilities`, showing the latest real `total_score` and `category_scores` with a "measured {timestamp}" caption.
- Keep the four marketing cards (GPQA / AIME / SWE-bench / BFCL) labeled as "external public benchmarks (reported)" and show the live internal score separately, so we're not claiming SWE-bench numbers we didn't actually run.

## Files I expect to touch
- `supabase/functions/emma-benchmark/index.ts` — model choice + answer post-processing.
- New migration — insert a tightened `prompt_evolutions` row, mark it `active`.
- `src/pages/Benchmarks.tsx` — wire to live data once score clears 95.

## Out of scope
- Adding new questions just to pad the score.
- Adding GPQA/AIME/SWE-bench/BFCL adapters (real harnesses for those are large; flagged as a follow-up).

## Risks
- Each iteration costs Lovable AI credits (~15 model calls per run). Capped at 6 runs.
- If the question bank is too easy after prompt tightening (everything 10/10), the 95% number is real but unimpressive — I'll flag that in the UI caption rather than hide it.