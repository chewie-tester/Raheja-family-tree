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
      res = await fetch(url);
    } catch (e) {
      const err = new Error("The sheet could not be reached.");
      err.unreachable = true;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} while reading the sheet.`);
    const text = await res.text();
    if (text.trimStart().startsWith("<"))
      throw new Error('The sheet returned a web page instead of data. It is probably not shared as "Anyone with the link can view".');
    return parseCsv(text);
  }

  // Turns a Google "gviz" JSON table into the same row objects the CSV path produces.
  function tableToRows(table) {
    const cols = (table.cols || []).map((c) => String(c.label || "").trim());
    if (!cols.some(Boolean)) throw new Error("The sheet's header row could not be read.");
    const rows = (table.rows || []).map((r) => {
      const o = {};
      (r.c || []).forEach((cell, i) => {
        if (!cols[i]) return;
        o[cols[i]] = cell && cell.v != null ? String(cell.v) : "";
      });
      for (const c of cols) if (c && !(c in o)) o[c] = "";
      return o;
    });
    return clean(rows.filter((r) => Object.values(r).some((v) => v !== "")));
  }

  // Fallback that loads the data through a <script> tag, which browsers allow across sites
  // (no CORS restriction). Used only if the normal request is blocked.
  function fetchViaScript(sheetId, tab) {
    return new Promise((resolve, reject) => {
      const cb = "__gviz_" + Math.random().toString(36).slice(2);
      const tag = document.createElement("script");
      let done = false;
      const finish = (fn, val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        tag.remove();
        fn(val);
      };
      const timer = setTimeout(() => finish(reject, new Error("The sheet took too long to respond.")), 20000);
      window[cb] = (resp) => {
        if (!resp || resp.status !== "ok") {
          const msg = resp && resp.errors && resp.errors[0] && resp.errors[0].detailed_message;
          return finish(reject, new Error("Google would not return the sheet" + (msg ? ": " + msg : ".")));
        }
        try { finish(resolve, tableToRows(resp.table)); }
        catch (e) { finish(reject, e); }
      };
      tag.onerror = () => finish(reject, new Error("The sheet could not be reached."));
      tag.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json;responseHandler:${cb}&headers=1&sheet=${encodeURIComponent(tab)}`;
      document.head.appendChild(tag);
    });
  }

  // Normal request first; if the browser blocks it, try the script method.
  async function loadTab(sheetId, tab) {
    try {
      return await fetchCsv(CONFIG.csvUrl(sheetId, tab));
    } catch (e) {
      if (!e.unreachable) throw e;
      try {
        return await fetchViaScript(sheetId, tab);
      } catch (e2) {
        throw new Error(
          "The sheet could not be reached. Check the link and that it is a Google Sheet (not an uploaded Excel file) shared as " +
          "\u201CAnyone with the link can view\u201D. If it is, an ad blocker or privacy extension may be blocking the request."
        );
      }
    }
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
      loadTab(id, CONFIG.peopleTab),
      loadTab(id, CONFIG.unionsTab),
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

  root.Loader = { loadFromLink, loadFromFiles, sheetIdFromLink, tableToRows };
})(typeof window !== "undefined" ? window : globalThis);
