# CBLE Rote Memory Trainer

A hostable static web app for rote memorization of the U.S. Customs Broker License Exam (CBLE),
built from official CBP past exams and their official answer keys.

Live at https://exit328.github.io/cble-trainer/

## Custom domain (cble.poundsit.com) — how to switch back

The custom domain is temporarily off because the DNS record was never added in Squarespace.
To restore it:

1. In Squarespace DNS for `poundsit.com`, add a CNAME record: host `cble`, value `exit328.github.io`.
2. Re-add the custom domain to GitHub Pages:
   ```
   gh api -X PUT repos/exit328/cble-trainer/pages -f cname=cble.poundsit.com
   ```
   (or restore a `CNAME` file containing `cble.poundsit.com` to the root of `main`).
3. Once DNS propagates, enable "Enforce HTTPS" in the repo's Pages settings.

## Host it locally

```
python3 -m http.server 8080
```

Then open http://localhost:8080. It is pure static files, so it also drops straight onto
GitHub Pages, S3, Netlify, or any static host with no build step.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup |
| `app.js` | All behavior, plain JS, no framework |
| `styles.css` | Styling, phone friendly |
| `questions.json` | The question bank, canonical fixed order |

## Hard invariants

These are deliberate and must not be changed.

1. `questions.json` holds ONE canonical order: exam date ascending, then question number
   ascending. Each question also carries an explicit `index` from 1 to 556. The app renders
   the array exactly as loaded and never sorts it.
2. Each question keeps the ORIGINAL choice letters and the ORIGINAL choice sequence from the
   exam paper. April 2023 uses A through E; the other six exams use A through D. The app never
   re-letters and never re-orders choices.
3. Groups are fixed sequential slices of that same order. With size 20, group 1 is items 1-20,
   group 2 is items 21-40, and so on.
4. Grading always maps back to the original letter from the official CBP answer key.

There is no shuffle call anywhere in the codebase, by design.

## Features

- Group size selector: 10, 20, 40, or custom.
- Sequential group picker showing your best percent per group.
- One question at a time, with Prev and Next, and an unanswered counter.
- End-of-group score as x/N and percent, against the real 75% passing mark.
- Review of every missed question showing the correct letter and its text, plus what you chose.
- Retake any group. The order and the letters are identical on every attempt.
- Attempts and best score tracked per group.

## Storage

- **Cookies** (`document.cookie`): `cble_group_size` and `cble_group_number`, so reopening the
  page lands on the last group size and group number you used. One year expiry, `SameSite=Lax`.
- **localStorage**: `cble_group_stats_v1`, holding attempts and best score per group.

## Question bank

556 questions from 7 official CBP exams. Four questions were skipped because their answer
choices are images in the source PDF (form facsimiles and classification tables), so there is
no choice text to extract. Nothing was fabricated to fill those gaps.

| Exam | Date | On paper | Parsed | Skipped | Reason skipped |
|---|---|---|---|---|---|
| April 2023 | 2023-04-26 | 80 | 80 | 0 | none |
| October 2023 | 2023-10-25 | 80 | 79 | 1 | Q11 choices are images |
| May 2024 | 2024-05-01 | 80 | 80 | 0 | none |
| October 2024 | 2024-10-23 | 80 | 80 | 0 | none |
| April 2025 | 2025-04-23 | 80 | 79 | 1 | Q19 choices are images (CBP Form 7501 facsimiles) |
| October 2025 | 2025-10-22 | 80 | 79 | 1 | Q64 choices are images |
| April 2026 | 2026-04-22 | 80 | 79 | 1 | Q20 choices are images |
| **Total** | | **560** | **556** | **4** | |

Eight questions have more than one correct letter because CBP accepted multiple answers or
granted credit to all examinees. Those carry a `note` field and grade any accepted letter as
correct.

## Verification performed

- All 556 questions cross-checked against the official CBP answer keys: 0 mismatches.
- Every correct letter confirmed to exist among that question's choices.
- `index` confirmed contiguous 1 to 556 and in canonical sort order.
- Two consecutive loads produce identical order and identical choice letters.
- Group slicing at sizes 10, 20, 40 and 25 confirmed to cover items 1..N exactly once, in order.
- Served over `python3 -m http.server` and rendered in a real browser: the group picker and the
  question view both load, and A-E letters render in original order on the April 2023 questions.

## Sources

Official CBP index page for past exams and answer keys:

- https://www.cbp.gov/document/publications/past-customs-broker-license-examinations-answer-keys

Per-exam PDFs used are recorded in the `exams` array inside `questions.json`, each with its
`examUrl` and `keyUrl`.
