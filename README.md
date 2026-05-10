# TallyQuizBuilder

> Turn any Google Sheet into a scored, multi-page quiz on [Tally](https://c.sherbeeny.com/tally) — with randomized answers, automatic score calculation, and a personalized results page.

---

## ✨ Features

- **Dynamic questions** — Supports any number of questions and options per question (3, 4, 5, etc.)
- **One question per page** — Clean, focused UX with a progress bar
- **Randomized answers** — Options are shuffled for each respondent
- **Automatic scoring** — Conditional logic increments a calculated `Score` field on every correct answer
- **Confirmation page** — "Ready to Submit?" page lets users review before final submission
- **Personalized results** — Thank-you page shows the total score and a list of missed questions with the user's incorrect answer + correct answer
- **Perfect score UX** — Review section is hidden and a congratulations message appears when all answers are correct
- **Fully dynamic** — Reads column headers automatically; no hardcoded option labels

---

## 📋 Prerequisites

1. A [Tally](https://c.sherbeeny.com/tally) account (free plan works)
2. A [Google Workspace](https://workspace.google.com/) account with access to Google Sheets & Apps Script
3. A Tally API key from [tally.so/settings/api](https://c.sherbeeny.com/tally)

---

## 🚀 Quick Start

### 1. Prepare your Google Sheet

Create a sheet with the following format:

| Question | A | B | C | D | Answer |
|---------|---|---|---|---|--------|
| What does "quest" mean? | A short walk | A journey to reach a goal | A game | A mistake | B |
| What does "fierce" mean? | very weak | very strong | very slow | very small | B |
| ... | ... | ... | ... | ... | ... |

**Rules:**
- The first column **must** be named `Question`
- The last column **must** be named `Answer` and contain the correct option label (e.g., `B`)
- All columns between `Question` and `Answer` are treated as options
- Empty option cells are automatically skipped
- You can have any number of option columns (A, B, C, D, E, F...)

### 2. Open Apps Script

In your Google Sheet, go to **Extensions → Apps Script**.

### 3. Add the script

1. Delete any existing code in the editor
2. Paste the entire contents of `tally_quiz_generator.gs` into the script editor
3. Save the project (Ctrl+S / Cmd+S)

### 4. Add your API key

1. Click the **⚙️ Project Settings** (gear icon) on the left
2. Scroll down to **Script Properties**
3. Click **Add script property**
4. Set:
   - **Property:** `TALLY_API_KEY`
   - **Value:** *your key from* [tally.so/settings/api](https://c.sherbeeny.com/tally)
5. Click **Save**

### 5. Run it

1. Select the function `createTallyQuizFromSheet` in the dropdown
2. Click **Run** (▶️)
3. Grant permissions when prompted (click through the authorization flow)
4. Check the **Execution log** for the form URL

Alternatively, reload the Google Sheet and use the custom menu: **Tally Quiz → Create Tally Form**

---

## 🏗️ How it works

```
Page 0:  Quiz Challenge (title)
Page 1:  Q1  ← options randomized
Page 2:  Q2  ← options randomized
...
Page N:  QN  ← options randomized
         ↓
Page N+1: ✅ Ready to Submit?
          ← conditional logic evaluates score & wrong answers
          ← Submit button
         ↓
Thank You: 🏆 Your Results
           You scored {X} out of {N}
           📝 Questions You Missed (hidden if perfect)
           Q1: ❌ Incorrect answer: {user's pick}
               ✅ Correct answer: {correct answer}
```

### Architecture

- **Score tracking:** A `CALCULATED_FIELDS` block named `Score` starts at 0. Each question page has a `CONDITIONAL_LOGIC` block that adds 1 when the correct option is selected.
- **UUID-based comparisons:** Conditional logic compares the selected option's UUID against the correct option's UUID for reliable matching.
- **Cross-page visibility:** All `SHOW_BLOCKS`/`HIDE_BLOCKS` logic lives on the confirmation page but targets blocks on the thank-you page.
- **Mentions:** Score and incorrect answers are displayed using Tally's `safeHTMLSchema` mention system (`@Score`, `@Q1`, `@Q2`, etc.).

---

## 📝 Sheet Format Reference

| Column | Required | Description |
|--------|----------|-------------|
| `Question` | ✅ | The question text |
| `A`, `B`, `C`, `D`, ... | ✅ (at least 1) | Answer options. Labels are read from headers. |
| `Answer` | ✅ | The correct option label (must match one of the option column headers) |

**Example with 3 options:**

| Question | A | B | C | Answer |
|---------|---|---|---|--------|
| What is 2+2? | 3 | 4 | 5 | B |

**Example with 5 options:**

| Question | A | B | C | D | E | Answer |
|---------|---|---|---|---|---|--------|
| Pick a color | Red | Blue | Green | Yellow | Purple | C |

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `TALLY_API_KEY not found` | Add the key in **Project Settings → Script Properties** |
| `Missing required column: Question` | Ensure the first column header is exactly `Question` |
| `answer key not found` | The `Answer` cell must match one of the option column headers (case-insensitive) |
| Score shows `@Score` instead of number | This was a bug in earlier versions. Ensure you're using the latest script with `safeHTMLSchema` mentions. |
| Review list empty | Ensure conditional logic uses UUID comparisons (not text). The latest script handles this automatically. |

---

## 🔗 Built with [Tally](https://c.sherbeeny.com/tally)

This project uses the [Tally API](https://c.sherbeeny.com/tally) to programmatically create forms. If you're not on Tally yet, you can sign up here:

**👉 [c.sherbeeny.com/tally](https://c.sherbeeny.com/tally)**

---

## 📄 License

MIT — feel free to use, modify, and share.

---

## 🙏 Credits

Created by Sherbeeny. Special thanks to the Tally team for their excellent API documentation.
