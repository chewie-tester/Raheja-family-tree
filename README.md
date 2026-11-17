# Family Tree

A small static web app that shows a family's lineage from a Google Sheet. The sheet is the single source of truth: the app only reads from it and never writes anything back.

There is no build step, no database, no server, and no AI calls at runtime. It is plain HTML and JavaScript that can be hosted for free on GitHub Pages.

## Status

| Phase | What it adds | Status |
| --- | --- | --- |
| 1 | Load the data, build the index, show a validation report | Built |
| 2 | Tree view with click navigation (up, down, across) and person cards | Next |
| 3 | Refresh button, debug toggle, gap highlighting, mobile layout | Planned |

## Privacy

This is a public app, so the tree view is designed to show only:

- first name, last name, and maiden name
- marriage date, when one is recorded

It does **not** show age, date of birth, or date of death, and gender is never shown.

Two things to be aware of:

- The app loads the sheet's People tab in the visitor's browser. Hiding a column on the cards does not remove it from the data the page downloads. For a site that must not expose dates at all, publish a sheet or export with the date columns removed.
- The Phase 1 data-check page (`index.html` today) can display dates inside some findings. It is intended for the owner's own checking and is not the public view.

The sheet ID is set in `config.js`. If the sheet is shared as "Anyone with the link can view", anyone who finds that ID can open it, so keep that in mind when choosing the repository's visibility.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, buttons, status line, and the validation report |
| `config.js` | Sheet ID and tab names (the only file you normally edit) |
| `loader.js` | Loads People and Unions from the live sheet (CSV) or from files you pick |
| `indexer.js` | Builds the in-memory index: people and unions by ID, parents, spouses, children, siblings, ancestors, descendants |
| `validate.js` | Runs the checks and returns the findings |

Two libraries load from cdnjs: PapaParse 5.4.1 (CSV) and SheetJS 0.18.5 (`.xlsx`).

## How the data is organized

The app reads two tabs, `People` and `Unions`.

- **People:** one row per person, with `person_id`, `generation`, `first_name`, `last_name`, `maiden_name`, `tree_role`, and `parent_union_id`, among other columns.
- **Unions:** one row per couple, with `union_id`, `person1_id`, `person2_id`, `marriage_date`, and a `children` count.

How relationships work:

- A person with `tree_role` = `lineage` has a `parent_union_id` that points to their parents in the Unions tab. Lineage people with no `parent_union_id` are the roots of the tree.
- A person with `tree_role` = `spouse` married into the family. They show no parents, only the couple and any children.
- In each union, `person1_id` is the lineage partner and `person2_id` is the married-in spouse.
- Missing information (for example a missing spouse or an unnamed child) is shown as a gap and never hidden.

## Running it

### Locally

Open `index.html` in a browser. If the live sheet is not reachable, use **Choose file(s)…** and pick either:

- one `.xlsx` file that has `People` and `Unions` tabs, or
- the People and Unions tabs exported as two separate `.csv` files.

### On GitHub Pages

1. Put the files in a repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick your branch (for example `main`) and the folder that holds `index.html`, then save.
4. After a minute or so the site is live at the URL GitHub shows on that page.

### Live sheet access

**Load from Google Sheet** reads the two tabs as CSV, which requires the sheet to be shared as "Anyone with the link can view". If the sheet is private, the page says so and the file picker still works. A private-sheet option (a small serverless proxy with a service account) is a possible later step.

## What the validation report checks

Findings are grouped by check and sorted by severity.

**Errors** (the data is broken)

- Missing or duplicate `person_id` or `union_id`
- A `parent_union_id` that does not exist in Unions
- A union partner that does not exist in People, or a union with no first partner
- A union where both partners are the same person
- A person who is their own ancestor

**Warnings** (probably wrong, worth a look)

- `tree_role` not `lineage` or `spouse`, or an unreadable `generation`
- A spouse who has parents, or a spouse who is in no union
- A lineage root that is not in the earliest generation
- A union whose partners are in the wrong roles or different generations
- A child whose generation is not one more than their parents'
- A `children` count in Unions that does not match the people pointing at that union
- An invalid date, or a death date before a birth date

**Gaps** (information missing in the source; kept as gaps)

- No first name, no last name, or no birth date
- A date with a month and day but no year
- A union with no second partner

**Info**

- The lineage roots, and anyone who is a partner in more than one union

## Notes

- Nothing is stored or sent anywhere. The data is read, indexed in memory, and shown on the page.
- After a successful load, the index and report are available in the browser console as `familyIndex` and `familyReport`, which the tree view will use.
