// Loads People and Unions rows from a file or link the user chooses.
// Two ways in: loadFromFiles (a local .xlsx) and loadFromLink (a shared Google Sheet link).
// Nothing is stored; the rows live in memory until the page is closed or another file is chosen.
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
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (e) {
      throw new Error("The sheet could not be reached. Check the link and your internet connection.");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} while reading the sheet.`);
    const text = await res.text();
    if (text.trimStart().startsWith("<"))
      throw new Error('The sheet returned a web page instead of data. It is probably not shared as "Anyone with the link can view".');
    return parseCsv(text);
  }

  // Pulls the sheet ID out of a Google Sheets address (or accepts a bare ID).
  function sheetIdFromLink(link) {
    const s = String(link || "").trim();
    const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(s);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{25,}$/.test(s)) return s;
    return null;
  }

  async function loadFromLink(link) {
    const id = sheetIdFromLink(link);
    if (!id) throw new Error("That does not look like a Google Sheets link. It should start with https://docs.google.com/spreadsheets/d/");
    const [p, u] = await Promise.all([
      fetchCsv(CONFIG.csvUrl(id, CONFIG.peopleTab)),
      fetchCsv(CONFIG.csvUrl(id, CONFIG.unionsTab)),
    ]);
    return { people: require_(p, PEOPLE_COLS, "People"), unions: require_(u, UNION_COLS, "Unions"), source: "Google Sheet link" };
  }

  // Accepts one Excel (.xlsx) file with People and Unions tabs.
  async function loadFromFiles(files) {
    const f = Array.from(files || []).find((x) => /\.xlsx$/i.test(x.name));
    if (!f) throw new Error("Please choose an Excel (.xlsx) file that has People and Unions tabs.");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const find = (n) => wb.SheetNames.find((s) => s.toLowerCase() === n.toLowerCase());
    const ps = find(CONFIG.peopleTab), us = find(CONFIG.unionsTab);
    if (!ps || !us) throw new Error("That file needs tabs named People and Unions.");
    const toRows = (s) => clean(XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: "", raw: false }));
    return { people: require_(toRows(ps), PEOPLE_COLS, "People"), unions: require_(toRows(us), UNION_COLS, "Unions"), source: "Excel file" };
  }

  root.Loader = { loadFromLink, loadFromFiles, sheetIdFromLink };
})(typeof window !== "undefined" ? window : globalThis);
