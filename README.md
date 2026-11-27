# Family Tree Viewer

A small web page that shows a family tree from a spreadsheet. You choose the file each time you open it; the page itself contains no family data.

## How to use

1. Open the page. It always starts on **Choose your family tree file**.
2. Pick one of two options:
   - **Excel file on this computer:** an `.xlsx` file with `People` and `Unions` tabs.
   - **Google Sheet:** paste the sheet's link. The sheet must be shared as **Anyone with the link can view**.
3. The tree opens centered on one person. Select any card to center the tree on that person (parents above, siblings and partners beside, children below).
4. Select the centered person again to open a side panel with their person ID, birth date, death date, marriage date(s) and notes. Click anywhere else, or press Esc, to close it.
5. Use **Find a person** to jump to anyone by name.
6. Use **Choose a different file** to go back to the start screen.

## Privacy

- The page and this repository contain **no family data**.
- The file you choose is read **in your own browser**. It is not uploaded, sent to a server, saved or remembered. Closing or reloading the page forgets it.
- A Google Sheet link only works if the sheet is shared with "Anyone with the link". Anyone who has that link can open the sheet itself, so for sensitive data share the Excel file instead.
- The app only reads. It never changes your file or sheet.
- Sex and source text columns are never shown.

## What the file needs

Two tabs named exactly `People` and `Unions`.

**People** columns used:

`person_id, generation, first_name, last_name, maiden_name, dob, dod, tree_role, parent_union_id, notes`

- `person_id` is a permanent ID such as P001.
- `tree_role` is `lineage` (the line of descent) or `spouse` (married in).
- `parent_union_id` links a lineage person to their parents' row in Unions.
- `dob` and `dod` are text: `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, or `--MM-DD` when only month and day are known. Blank means unknown.

**Unions** columns used:

`union_id, person1_id, person2_id, marriage_date`

- `person1_id` is the lineage partner and `person2_id` is the married-in spouse.

Other columns in the file are ignored.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page, including the start screen |
| `tree.js` | Tree drawing, search, navigation, detail panel |
| `tree.css` | Styles |
| `config.js` | Tab names and the Google Sheet address builder |
| `loader.js` | Reads the chosen Excel file or Google Sheet link |
| `indexer.js` | Builds the people and union lookups |
| `validate.js` | Date parsing helper used by the indexer |

No build step. Two libraries load from cdnjs when the page opens: PapaParse (CSV) and SheetJS (Excel). Fonts load from Google Fonts.

## Publishing on GitHub Pages

1. Create a repository and upload the files above. Upload `tree.html` as **`index.html`**.
2. Do **not** upload any spreadsheet or other data file.
3. In the repository, go to **Settings, Pages**, choose **Deploy from a branch**, select the `main` branch and the root folder, then save.
4. After a minute or two the site is live at `https://<username>.github.io/<repository-name>/`.

## Trying it on your own computer

Open `index.html` in a browser. If your browser blocks the Google Sheet option from a local file, run a tiny local server from the folder instead (for example `python3 -m http.server`) and open `http://localhost:8000`.

## Planned

- Pick two people and show visually how they are related.
- Sign in with Google to open sheets shared with you by name.
