// Loads People and Unions rows, either from the live sheet (CSV) or from files the user picks.
(function (root) {
  const PEOPLE_COLS = ["person_id", "generation", "tree_role", "parent_union_id"];
  const UNION_COLS = ["union_id", "person1_id", "person2_id"];

  function clean(rows) {
    return rows.map((r) => {
      const o = {};
      for (const k in r) o[String(k).trim()] = r[k] == null ? "" : String(r[k]).trim();
      return o;
    });
  }
  function parseCsv(text) {
    return clean(Papa.parse(text, { header: true, skipEmptyLines: true }).data);
  }
  function require_(rows, cols, label) {
    if (!rows.length) throw new Error(`The ${label} data is empty.`);
    const missing = cols.filter((c) => !(c in rows[0]));
    if (missing.length) throw new Error(`The ${label} data is missing column(s): ${missing.join(", ")}.`);
    return rows;
  }
  async function fetchCsv(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} while reading the sheet.`);
    const text = await res.text();
    if (text.trimStart().startsWith("<"))
      throw new Error('The sheet returned a web page instead of CSV. It is probably not shared as "Anyone with the link can view".');
    return parseCsv(text);
  }
  async function loadFromSheet() {
    const [p, u] = await Promise.all([fetchCsv(CONFIG.csvUrl(CONFIG.peopleTab)), fetchCsv(CONFIG.csvUrl(CONFIG.unionsTab))]);
    return { people: require_(p, PEOPLE_COLS, "People"), unions: require_(u, UNION_COLS, "Unions"), source: "Google Sheet (live)" };
  }
  // Accepts one .xlsx, or People and Unions as separate .csv files (identified by their headers).
  async function loadFromFiles(files) {
    let people = null, unions = null;
    for (const f of files) {
      if (/\.xlsx?$/i.test(f.name)) {
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        const find = (n) => wb.SheetNames.find((s) => s.toLowerCase() === n.toLowerCase());
        const ps = find(CONFIG.peopleTab), us = find(CONFIG.unionsTab);
        const toRows = (s) => clean(XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: "", raw: false }));
        if (ps) people = toRows(ps);
        if (us) unions = toRows(us);
      } else {
        const rows = parseCsv(await f.text());
        if (rows.length && "person_id" in rows[0]) people = rows;
        else if (rows.length && "union_id" in rows[0]) unions = rows;
      }
    }
    if (!people || !unions) throw new Error("Choose one .xlsx file with People and Unions tabs, or both CSV files (People and Unions).");
    return { people: require_(people, PEOPLE_COLS, "People"), unions: require_(unions, UNION_COLS, "Unions"), source: "Local file(s)" };
  }
  root.Loader = { loadFromSheet, loadFromFiles };
})(typeof window !== "undefined" ? window : globalThis);
