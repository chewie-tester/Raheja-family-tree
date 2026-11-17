// Builds the in-memory index. Read-only: it never changes the rows it is given.
(function (root) {
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

  function buildIndex(people, unions) {
    const idx = {
      people, unions,
      peopleById: new Map(), unionsById: new Map(),
      duplicatePeople: [], duplicateUnions: [],
      unionsOfPerson: new Map(),   // person_id -> unions they are a partner in
      childrenByUnion: new Map(),  // union_id -> people whose parent_union_id is that union
    };
    for (const p of people) {
      if (!p.person_id) continue;
      if (idx.peopleById.has(p.person_id)) idx.duplicatePeople.push(p);
      else idx.peopleById.set(p.person_id, p);
    }
    for (const u of unions) {
      if (!u.union_id) continue;
      if (idx.unionsById.has(u.union_id)) idx.duplicateUnions.push(u);
      else idx.unionsById.set(u.union_id, u);
    }
    for (const u of idx.unionsById.values())
      for (const pid of new Set([u.person1_id, u.person2_id])) if (pid) push(idx.unionsOfPerson, pid, u);
    for (const p of idx.peopleById.values())
      if (p.parent_union_id) push(idx.childrenByUnion, p.parent_union_id, p);

    const get = (id) => idx.peopleById.get(id);
    idx.parentIds = (pid) => {
      const u = idx.unionsById.get((get(pid) || {}).parent_union_id);
      return u ? [u.person1_id, u.person2_id].filter((id) => id && idx.peopleById.has(id)) : [];
    };
    idx.parentsOf = (pid) => idx.parentIds(pid).map(get);
    idx.spousesOf = (pid) =>
      (idx.unionsOfPerson.get(pid) || []).map((u) => (u.person1_id === pid ? u.person2_id : u.person1_id)).filter((id) => idx.peopleById.has(id)).map(get);
    idx.childrenOf = (pid) =>
      (idx.unionsOfPerson.get(pid) || []).flatMap((u) => idx.childrenByUnion.get(u.union_id) || []);
    idx.siblingsOf = (pid) => {
      const p = get(pid);
      return p && p.parent_union_id ? (idx.childrenByUnion.get(p.parent_union_id) || []).filter((s) => s.person_id !== pid) : [];
    };
    idx.descendantsOf = (pid) => {
      const seen = new Set([pid]), out = [], queue = [pid];
      while (queue.length) for (const c of idx.childrenOf(queue.shift())) if (!seen.has(c.person_id)) { seen.add(c.person_id); out.push(c); queue.push(c.person_id); }
      return out;
    };
    idx.ancestorsOf = (pid) => {
      const seen = new Set([pid]), out = [], queue = [pid];
      while (queue.length) for (const id of idx.parentIds(queue.shift())) if (!seen.has(id)) { seen.add(id); out.push(get(id)); queue.push(id); }
      return out;
    };
    return idx;
  }
  root.buildIndex = buildIndex;
})(typeof window !== "undefined" ? window : globalThis);
