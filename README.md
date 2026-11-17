# Family Tree: data check (Phase 1)

A small static web app that reads a family tree from a Google Sheet, builds an in-memory index of people and couples, and shows a validation report. Phase 1 has no tree view yet; it checks that the data is sound before the tree is drawn.

The Google Sheet is the single source of truth. The app only reads from it and never writes anything back.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page: buttons, status line, summary, and report |
| `config.js` | Sheet ID and tab names (the only file you normally edit) |
| `loader.js` | Loads People and Unions from the live sheet (CSV) or from files you pick |
| `indexer.js` | Builds the index: people and unions by ID, parents, spouses, children, siblings, ancestors, descendants |
| `validate.js` | Runs the checks and returns the findings |

There is no build step, no database, and no server. The page loads two libraries from cdnjs (PapaParse 5.4.1 for CSV, SheetJS 0.18.5 for `.xlsx`).

## Source data

- Google Sheet: `family_tree_v3`
- Sheet ID: `1WwgCoLvI7_CTG4SLa8u6CvSmT0khtD1vJfhqa7C4EWw`
- Tabs used: `People` and `Unions` (the `Review` and `README` tabs are not read)

### People columns used

`person_id`, `generation`, `first_name`, `last_name`, `dob`, `dod`, `tree_role`, `parent_union_id` (plus `full_name` for display)

### Unions columns used

`union_id`, `person1_id`, `person2_id`, `marriage_date`, `children`, `notes` (plus the name columns for display)

### How relationships work

- A person with `tree_role` = `lineage` has a `parent_union_id` that points to their parents in the Unions tab. Lineage people with no `parent_union_id` are the roots of the tree.
- A person with `tree_role` = `spouse` married into the family. They show no parents, only the couple and any children.
- In each union, `person1_id` is the lineage partner and `person2_id` is the married-in spouse.
- Dates are text in one of these forms: `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, or `--MM-DD` (month and day only). Blank means unknown.

## Running it

### Locally

Open `index.html` in a browser. If the live sheet is not reachable, use **Choose file(s)…** and pick either:

- one `.xlsx` file that has `People` and `Unions` tabs, or
- the People and Unions tabs exported as two separate `.csv` files.

### On GitHub Pages

1. Put all five files (and this README) in a repository.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick your branch (for example `main`) and the folder that holds `index.html`, then save.
4. After a minute or so the site is live at the URL GitHub shows on that page.

### Live sheet access

The **Load from Google Sheet** button reads the two tabs as CSV. For that to work, the sheet must be shared as **Anyone with the link can view**. If it is private, the page shows a message saying so and you can use the file picker instead.

If you privately share the repository's site or keep the sheet private, the file picker is the way to load data. A private-sheet option (a small serverless proxy with a service account) is planned for a later phase.

## What the validation report shows

Findings are grouped by check and sorted by severity.

**Errors** (the data is broken)

- Missing or duplicate `person_id` / `union_id`
- A `parent_union_id` that does not exist in Unions
- A union partner that does not exist in People, or a union with no `person1_id`
- A union where both partners are the same person
- A person who is their own ancestor

**Warnings** (probably wrong, worth a look)

- `tree_role` not `lineage` or `spouse`, or an unreadable `generation`
- A spouse who has a `parent_union_id`, or a spouse who is in no union
- A lineage root that is not in the earliest generation
- A union whose partners are in the wrong roles or in different generations
- A child whose generation is not one more than their parents'
- A `children` count in Unions that does not match the number of people pointing at that union
- An invalid date, or a death date before a birth date

**Gaps** (information missing in the source; kept as gaps, never hidden or "fixed")

- No first name, no last name, or no birth date
- A date with a month and day but no year
- A union with no second partner

**Info**

- The lineage roots, and anyone who is a partner in more than one union

## Build phases

1. **Load the CSV, build the index, and show the validation report** (this version)
2. Render the tree with click navigation (up, down, across) and the card fields
3. Add the Refresh button, the debug toggle, gap highlighting, and mobile layout

## Notes

- Nothing is stored in a browser database or sent anywhere. The data is read, indexed in memory, and shown on the page.
- After a successful load, the index and report are available in the browser console as `familyIndex` and `familyReport`, which the tree view in Phase 2 will use.
- Because this site displays real family data (names, birth and death dates), consider whether the GitHub repository and the published site should be public. A published GitHub Pages site is visible to anyone who has the link.
