// Validation pass. Levels: error (broken), warning (probably wrong), gap (info missing, kept as a gap), info.
(function (root) {
  // Dates: YYYY-MM-DD, YYYY-MM, YYYY, --MM-DD (month/day only), or blank.
  function parseDate(s) {
    if (!s) return { kind: "none" };
    let m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return ok("full", +m[1], +m[2], +m[3]);
    if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return ok("ym", +m[1], +m[2]);
    if ((m = /^(\d{4})$/.exec(s))) return { kind: "y", y: +m[1] };
    if ((m = /^--(\d{2})-(\d{2})$/.exec(s))) return ok("md", null, +m[1], +m[2]);
    return { kind: "invalid" };
  }
  function ok(kind, y, mo, d) {
    if (mo < 1 || mo > 12) return { kind: "invalid" };
    if (d != null && (d < 1 || d > new Date(y || 2000, mo, 0).getDate())) return { kind: "invalid" };
    return { kind, y, m: mo, d };
  }
  const genNum = (g) => { const n = parseInt(String(g || "").replace(/^D/i, ""), 10); return Number.isNaN(n) ? null : n; };
  const nameOf = (p) => (p && (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" "))) || "(unnamed)";

  function validate(idx) {
    const F = [];
    const add = (level, code, ref, name, message) => F.push({ level, code, ref, name, message });
    const P = idx.peopleById, U = idx.unionsById;
    const roleCount = { lineage: 0, spouse: 0, other: 0 };

    // --- IDs ---
    for (const p of idx.people) if (!p.person_id) add("error", "missing-person-id", "(row)", nameOf(p), "Person row has no person_id.");
    for (const u of idx.unions) if (!u.union_id) add("error", "missing-union-id", "(row)", u.person1_name || "", "Union row has no union_id.");
    for (const p of idx.duplicatePeople) add("error", "duplicate-person-id", p.person_id, nameOf(p), "person_id appears more than once (first row is used).");
    for (const u of idx.duplicateUnions) add("error", "duplicate-union-id", u.union_id, u.person1_name || "", "union_id appears more than once (first row is used).");

    // --- People ---
    const roots = [];
    const minGen = Math.min(...[...P.values()].map((p) => genNum(p.generation)).filter((n) => n != null));
    for (const p of P.values()) {
      const nm = nameOf(p), id = p.person_id, role = p.tree_role;
      if (role === "lineage") roleCount.lineage++; else if (role === "spouse") roleCount.spouse++; else roleCount.other++;
      if (role !== "lineage" && role !== "spouse") add("warning", "bad-tree-role", id, nm, `tree_role is "${role || "blank"}" (expected lineage or spouse).`);
      if (genNum(p.generation) == null) add("warning", "bad-generation", id, nm, `generation is "${p.generation || "blank"}" (expected like D7).`);
      if (p.parent_union_id && !U.has(p.parent_union_id)) add("error", "orphan-parent-union", id, nm, `parent_union_id ${p.parent_union_id} does not exist in Unions.`);
      if (role === "spouse" && p.parent_union_id) add("warning", "spouse-has-parents", id, nm, "Married-in spouse has a parent_union_id (spouses should not show parentage).");
      if (role === "lineage" && !p.parent_union_id) {
        roots.push(p);
        if (genNum(p.generation) !== minGen) add("warning", "unexpected-root", id, nm, `Lineage person with no parent_union_id, but not in the earliest generation (${p.generation}).`);
      }
      if (role === "spouse" && !(idx.unionsOfPerson.get(id) || []).length) add("warning", "spouse-without-union", id, nm, "Spouse is not a partner in any union.");
      if ((idx.unionsOfPerson.get(id) || []).length > 1) add("info", "multiple-unions", id, nm, `Partner in ${idx.unionsOfPerson.get(id).length} unions.`);

      // gaps
      if (!p.first_name) add("gap", "unnamed", id, nm, "No first name recorded.");
      if (!p.last_name) add("gap", "missing-last-name", id, nm, "No last name recorded.");
      const dob = parseDate(p.dob), dod = parseDate(p.dod);
      if (dob.kind === "none") add("gap", "missing-dob", id, nm, "No birth date recorded.");
      for (const [label, d, raw] of [["dob", dob, p.dob], ["dod", dod, p.dod]]) {
        if (d.kind === "invalid") add("warning", "invalid-date", id, nm, `${label} "${raw}" is not a valid date (YYYY-MM-DD, YYYY-MM, YYYY or --MM-DD).`);
        if (d.kind === "md") add("gap", "partial-date", id, nm, `${label} has month and day but no year (${raw}).`);
      }
      if (dob.y && dod.y && (dod.y < dob.y || (dod.y === dob.y && dod.m && dob.m && dod.m < dob.m)))
        add("warning", "dod-before-dob", id, nm, `Death (${p.dod}) is before birth (${p.dob}).`);
    }

    // --- Unions ---
    for (const u of U.values()) {
      const id = u.union_id, label = [u.person1_name, u.person2_name].filter(Boolean).join(" & ") || "(no names)";
      const a = P.get(u.person1_id), b = P.get(u.person2_id);
      if (!u.person1_id) add("error", "union-missing-partner", id, label, "Union has no person1_id.");
      else if (!a) add("error", "union-unknown-person", id, label, `person1_id ${u.person1_id} does not exist in People.`);
      if (!u.person2_id) add("gap", "missing-spouse", id, label, "Union has no second partner" + (u.notes ? ` (${u.notes})` : "") + ".");
      else if (!b) add("error", "union-unknown-person", id, label, `person2_id ${u.person2_id} does not exist in People.`);
      if (u.person1_id && u.person1_id === u.person2_id) add("error", "union-same-person", id, label, "Both partners are the same person.");
      if (a && a.tree_role !== "lineage") add("warning", "union-role", id, label, `person1 (${u.person1_id}) is not tree_role=lineage.`);
      if (b && b.tree_role !== "spouse") add("warning", "union-role", id, label, `person2 (${u.person2_id}) is not tree_role=spouse.`);
      if (a && b && genNum(a.generation) !== genNum(b.generation)) add("warning", "union-generation", id, label, `Partners are in different generations (${a.generation} vs ${b.generation}).`);
      if (u.marriage_date && parseDate(u.marriage_date).kind === "invalid") add("warning", "invalid-date", id, label, `marriage_date "${u.marriage_date}" is not a valid date.`);
      const kids = idx.childrenByUnion.get(id) || [];
      if (u.children !== "" && u.children != null && +u.children !== kids.length)
        add("warning", "children-count", id, label, `Unions says ${u.children} children, but ${kids.length} people point to this union.`);
      if (a) for (const k of kids) {
        const g = genNum(a.generation), kg = genNum(k.generation);
        if (g != null && kg != null && kg !== g + 1) add("warning", "child-generation", k.person_id, nameOf(k), `Generation ${k.generation} but parents (${id}) are ${a.generation}.`);
      }
    }

    // --- Own ancestor (cycle) check ---
    const state = new Map();
    const visit = (id) => {
      state.set(id, 1);
      for (const par of idx.parentIds(id)) {
        if (state.get(par) === 1) add("error", "own-ancestor", par, nameOf(P.get(par)), `Is their own ancestor (loop through ${id}).`);
        else if (!state.has(par)) visit(par);
      }
      state.set(id, 2);
    };
    for (const id of P.keys()) if (!state.has(id)) visit(id);

    for (const r of roots) add("info", "root", r.person_id, nameOf(r), `Start of a lineage (${r.generation}).`);

    const order = { error: 0, warning: 1, gap: 2, info: 3 };
    F.sort((x, y) => order[x.level] - order[y.level] || x.code.localeCompare(y.code) || x.ref.localeCompare(y.ref));
    const gens = {};
    for (const p of P.values()) gens[p.generation || "?"] = (gens[p.generation || "?"] || 0) + 1;
    const counts = { error: 0, warning: 0, gap: 0, info: 0 };
    for (const f of F) counts[f.level]++;
    return {
      findings: F, counts, roots, gens,
      stats: { people: P.size, unions: U.size, ...roleCount, roots: roots.length },
    };
  }
  root.parseDate = parseDate;
  root.validate = validate;
})(typeof window !== "undefined" ? window : globalThis);
