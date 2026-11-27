/*
 * Tree view.
 *
 * Reads window.familyIndex (only peopleById and unionsById) and draws a
 * classic hierarchy centered on one person. It never writes to the file or
 * sheet. The app holds no family data of its own: everything shown comes from
 * the file the person chose, read in their browser and kept only in memory.
 *
 * Cards show names and marriage date. Selecting a person also fills a detail
 * panel with person_id, DOB, DOD and notes. sex and source_text are never shown.
 * dob is also used to put siblings in birth order.
 *
 * Layout:
 *   row 1  parents (one couple, or a note when they are not on the tree)
 *   row 2  siblings in birth order, with the selected person (and partners)
 *          in their place
 *   row 3  children, grouped by union
 *
 * Clicking a card sets the URL hash to that person_id, which re-centers the
 * tree. Back/forward work within a visit. Nothing is stored between visits.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var M = null;          // lookup model built from the index
  var pending = [];      // connector jobs for the current render
  var focusId = null;

  function $(s) { return document.querySelector(s); }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function vals(m) { return m instanceof Map ? Array.from(m.values()) : Object.values(m || {}); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- model ---------- */

  function buildModel(idx) {
    var people = vals(idx.peopleById);
    var unions = vals(idx.unionsById);
    var m = {
      people: people,
      byId: new Map(),
      uById: new Map(),
      unionsOf: new Map(),   // person_id -> [union] in sheet order
      kids: new Map(),       // union_id -> [person]
      order: new Map()       // person_id -> sheet row order
    };
    people.forEach(function (p, i) {
      var id = str(p.person_id);
      m.byId.set(id, p);
      m.order.set(id, i);
    });
    unions.forEach(function (u) {
      m.uById.set(str(u.union_id), u);
      [u.person1_id, u.person2_id].map(str).filter(Boolean).forEach(function (id) {
        if (!m.unionsOf.has(id)) m.unionsOf.set(id, []);
        m.unionsOf.get(id).push(u);
      });
    });
    people.forEach(function (p) {
      var uid = str(p.parent_union_id);
      if (!uid) return;
      if (!m.kids.has(uid)) m.kids.set(uid, []);
      m.kids.get(uid).push(p);
    });
    return m;
  }

  function otherIn(union, pid) {
    var a = str(union.person1_id), b = str(union.person2_id);
    return a === pid ? b : a;
  }

  // Sheet order by default; birth-year order only when every sibling has a year.
  function orderPeople(list) {
    var rows = list.slice().sort(function (a, b) {
      return M.order.get(str(a.person_id)) - M.order.get(str(b.person_id));
    });
    var years = rows.map(function (p) {
      var m = str(p.dob).match(/^(\d{4})/);
      return m ? +m[1] : null;
    });
    if (rows.length > 1 && years.every(function (y) { return y !== null; })) {
      return rows.map(function (p, i) { return { p: p, y: years[i], i: i }; })
        .sort(function (a, b) { return a.y - b.y || a.i - b.i; })
        .map(function (o) { return o.p; });
    }
    return rows;
  }

  /* ---------- display helpers ---------- */

  function fmtDate(s) {
    s = str(s);
    if (!s) return '';
    var m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)) && MON[+m[2] - 1]) return MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
    if ((m = s.match(/^(\d{4})-(\d{2})$/)) && MON[+m[2] - 1]) return MON[+m[2] - 1] + ' ' + m[1];
    if ((m = s.match(/^(\d{4})$/))) return m[1];
    if ((m = s.match(/^--(\d{2})-(\d{2})$/)) && MON[+m[1] - 1]) return MON[+m[1] - 1] + ' ' + (+m[2]);
    return s;
  }

  function plainName(p) {
    var n = [str(p.first_name), str(p.last_name)].filter(Boolean).join(' ');
    return n || 'Unnamed';
  }

  function marriageText(pid, hint) {
    if (hint) return fmtDate(hint.marriage_date);
    var us = M.unionsOf.get(pid) || [];
    for (var i = 0; i < us.length; i++) {
      var d = fmtDate(us[i].marriage_date);
      if (d) return d;
    }
    return '';
  }

  function makeCard(p, kind, hintUnion) {
    var pid = str(p.person_id);
    var role = str(p.tree_role).toLowerCase() === 'spouse' ? 'spouse' : 'lineage';
    var b = el('button', 'card ' + role + ' ' + kind);
    b.type = 'button';
    b.dataset.pid = pid;
    if (kind === 'focus') b.setAttribute('aria-current', 'true');

    var first = str(p.first_name), last = str(p.last_name), maiden = str(p.maiden_name);
    var name = el('span', 'name');
    if (first) name.appendChild(document.createTextNode(first));
    else name.appendChild(el('span', 'gap', 'Unnamed'));
    if (last) name.appendChild(document.createTextNode(' ' + last));
    b.appendChild(name);

    if (maiden && maiden.toLowerCase() !== last.toLowerCase()) b.appendChild(el('span', 'sub', 'née ' + maiden));
    var m = marriageText(pid, hintUnion);
    if (m) b.appendChild(el('span', 'sub', 'm. ' + m));

    b.setAttribute('aria-label', plainName(p) + (kind === 'focus' ? ' (selected)' : ': show this person\u2019s tree'));
    return b;
  }

  function placeholder(text) { return el('div', 'placeholder', text); }

  function upNote(p) {
    if (str(p.tree_role).toLowerCase() === 'spouse') return 'Family of origin not recorded';
    if (str(p.parent_union_id)) return 'Parents not found in the file';
    return 'Earlier generations not added yet';
  }

  /* ---------- detail panel ---------- */

  function detailRow(label, value) {
    var row = el('div', 'detail-row');
    row.appendChild(el('dt', null, label));
    var dd = el('dd', value ? null : 'none', value || 'Not recorded');
    row.appendChild(dd);
    return row;
  }

  function showDetail(p) {
    var box = $('#detail');
    if (!box) return;
    box.replaceChildren();
    if (!p) { box.hidden = true; return; }
    box.appendChild(el('h2', 'detail-name', plainName(p)));
    var maiden = str(p.maiden_name), last = str(p.last_name);
    if (maiden && maiden.toLowerCase() !== last.toLowerCase()) box.appendChild(el('p', 'detail-sub', 'n\u00E9e ' + maiden));

    var dl = el('dl', 'detail-list');
    dl.appendChild(detailRow('Person ID', str(p.person_id)));
    dl.appendChild(detailRow('Born', fmtDate(p.dob)));
    dl.appendChild(detailRow('Died', fmtDate(p.dod)));
    box.appendChild(dl);

    var notes = str(p.notes);
    var nb = el('div', 'detail-notes');
    nb.appendChild(el('h3', null, 'Notes'));
    nb.appendChild(el('p', notes ? null : 'none', notes || 'Not recorded'));
    box.appendChild(nb);
    box.hidden = false;
  }

  /* ---------- render ---------- */

  function buildFocus(p, down) {
    var pid = str(p.person_id);
    var unions = M.unionsOf.get(pid) || [];
    var right = [], left = [];
    unions.forEach(function (u, i) { (i % 2 === 0 ? right : left).push(u); });
    var seq = left.reverse().concat([null], right);   // null marks the selected person

    var group = el('div', 'focus-group');
    var focusCard = makeCard(p, 'focus');
    var items = [];
    seq.forEach(function (u) {
      if (u === null) { group.appendChild(focusCard); return; }
      var partnerId = otherIn(u, pid);
      var partner = partnerId ? M.byId.get(partnerId) : null;
      var card = null;
      if (partner) { card = makeCard(partner, 'partner', u); group.appendChild(card); }
      items.push({ union: u, partnerCard: card });
    });

    items.forEach(function (it) {
      var ks = orderPeople(M.kids.get(str(it.union.union_id)) || []);
      var cards = ks.map(function (k) { return makeCard(k, 'kid'); });
      pending.push({ anchor: [focusCard, it.partnerCard].filter(Boolean), kids: cards });
      if (cards.length) {
        var g = el('div', 'kidgroup');
        cards.forEach(function (c) { g.appendChild(c); });
        down.appendChild(g);
      }
    });
    if (!down.children.length) {
      down.appendChild(placeholder(unions.length ? 'No children recorded' : 'No partner or children recorded'));
    }
    return { group: group, focusCard: focusCard };
  }

  function render(pid) {
    var stage = $('#stage');
    stage.replaceChildren();
    pending = [];
    var p = M.byId.get(pid);
    if (!p) { stage.appendChild(el('p', 'empty', 'That person is not in the file.')); showDetail(null); return; }
    focusId = pid;
    showDetail(p);
    document.title = plainName(p) + ' \u2013 Family tree';

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'links');
    svg.setAttribute('aria-hidden', 'true');
    var up = el('div', 'row row-up'), mid = el('div', 'row row-mid'), down = el('div', 'row row-down');
    stage.append(svg, up, mid, down);

    // parents
    var pu = M.uById.get(str(p.parent_union_id));
    var parentCards = [];
    if (pu) {
      var couple = el('div', 'couple');
      [pu.person1_id, pu.person2_id].map(str).filter(Boolean).forEach(function (id) {
        var pp = M.byId.get(id);
        if (pp) { var c = makeCard(pp, 'parent', pu); couple.appendChild(c); parentCards.push(c); }
      });
      if (parentCards.length) up.appendChild(couple);
    }
    if (!parentCards.length) up.appendChild(placeholder(upNote(p)));

    // focus row: siblings in order, selected person (with partners) in their place
    var f = buildFocus(p, down);
    var sibCards = [];
    var sibs = pu ? orderPeople(M.kids.get(str(pu.union_id)) || []) : [];
    var placed = false;
    sibs.forEach(function (s) {
      if (str(s.person_id) === pid) { mid.appendChild(f.group); placed = true; }
      else { var c = makeCard(s, 'sib'); mid.appendChild(c); sibCards.push(c); }
    });
    if (!placed) mid.appendChild(f.group);

    if (parentCards.length) {
      pending.push({ anchor: parentCards, kids: sibCards.concat([f.focusCard]) });
    }

    requestAnimationFrame(function () { draw(); centerOn(f.focusCard); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  }

  /* ---------- connectors ---------- */

  function draw() {
    var stage = $('#stage');
    var svg = stage && stage.querySelector('svg.links');
    if (!svg) return;
    var sr = stage.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + sr.width + ' ' + sr.height);

    function box(c) {
      var r = c.getBoundingClientRect();
      var o = { l: r.left - sr.left, r: r.right - sr.left, t: r.top - sr.top, b: r.bottom - sr.top };
      o.cx = (o.l + o.r) / 2; o.cy = (o.t + o.b) / 2;
      return o;
    }

    var d = '';
    pending.forEach(function (job) {
      var A = job.anchor.map(box).sort(function (a, b) { return a.l - b.l; });
      var ax, ay;
      if (A.length > 1) {
        ay = (A[0].cy + A[1].cy) / 2;
        ax = (A[0].r + A[1].l) / 2;
        d += 'M' + A[0].r + ' ' + ay + 'H' + A[1].l;
      } else {
        ax = A[0].cx; ay = A[0].b;
      }
      var K = job.kids.map(box);
      if (!K.length) return;
      var bottom = Math.max.apply(null, A.map(function (a) { return a.b; }));
      var top = Math.min.apply(null, K.map(function (k) { return k.t; }));
      var busY = bottom + (top - bottom) / 2;
      var xs = K.map(function (k) { return k.cx; }).concat([ax]);
      d += 'M' + ax + ' ' + ay + 'V' + busY;
      d += 'M' + Math.min.apply(null, xs) + ' ' + busY + 'H' + Math.max.apply(null, xs);
      K.forEach(function (k) { d += 'M' + k.cx + ' ' + busY + 'V' + k.t; });
    });

    svg.replaceChildren();
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  function centerOn(card) {
    var vp = $('#viewport');
    if (!vp || !card) return;
    var vr = vp.getBoundingClientRect(), cr = card.getBoundingClientRect();
    vp.scrollLeft += (cr.left + cr.width / 2) - (vr.left + vr.width / 2);
  }

  /* ---------- search ---------- */

  function searchLabel(p, counts) {
    var base = plainName(p);
    if (counts[base] < 2) return base;
    var pid = str(p.person_id);
    var pu = M.uById.get(str(p.parent_union_id));
    if (pu) {
      var names = [pu.person1_id, pu.person2_id].map(str).map(function (id) {
        var pp = M.byId.get(id); return pp ? str(pp.first_name) : '';
      }).filter(Boolean);
      if (names.length) return base + ' (child of ' + names.join(' & ') + ')';
    }
    var us = M.unionsOf.get(pid) || [];
    if (us.length) {
      var o = M.byId.get(otherIn(us[0], pid));
      if (o) return base + ' (partner of ' + plainName(o) + ')';
    }
    return base;
  }

  var searchLookup = new Map();
  var searchBound = false;

  function fillSearch() {
    var counts = {};
    M.people.forEach(function (p) { var n = plainName(p); counts[n] = (counts[n] || 0) + 1; });
    var list = $('#people-list');
    searchLookup = new Map();
    list.replaceChildren();
    M.people.forEach(function (p) {
      var label = searchLabel(p, counts);
      if (searchLookup.has(label)) label += ' #' + (searchLookup.size + 1);
      searchLookup.set(label, str(p.person_id));
      var o = document.createElement('option');
      o.value = label;
      list.appendChild(o);
    });
    var input = $('#search');
    input.value = '';
    if (!searchBound) {
      searchBound = true;
      input.addEventListener('change', function () {
        var id = searchLookup.get(input.value);
        if (id) { go(id); input.value = ''; input.blur(); }
      });
    }
  }

  /* ---------- routing and start ---------- */

  function go(pid) {
    if (location.hash.slice(1) === pid) render(pid);
    else location.hash = pid;
  }

  function defaultStart() {
    for (var i = 0; i < M.people.length; i++) {
      var p = M.people[i];
      if (str(p.tree_role).toLowerCase() === 'lineage' && !str(p.parent_union_id) &&
          (M.unionsOf.get(str(p.person_id)) || []).length) return str(p.person_id);
    }
    return M.people.length ? str(M.people[0].person_id) : '';
  }

  function route() {
    if (!M) return;
    var h = decodeURIComponent(location.hash.slice(1));
    render(M.byId.has(h) ? h : defaultStart());
  }

  // Forget everything loaded: used by "Choose a different file".
  function reset() {
    M = null;
    pending = [];
    focusId = null;
    searchLookup = new Map();
    $('#stage').replaceChildren();
    $('#people-list').replaceChildren();
    $('#search').value = '';
    $('#count').textContent = '';
    showDetail(null);
    window.familyIndex = null;
    document.title = 'Family tree';
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  function start(idx) {
    window.familyIndex = idx;
    M = buildModel(idx);
    $('#count').textContent = M.people.length + ' people';
    fillSearch();
    route();
  }

  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 120); });
  window.addEventListener('hashchange', route);
  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('#stage .card');
    if (card) go(card.dataset.pid);
  });

  window.FamilyTree = { start: start, reset: reset, render: render, redraw: draw, get focusId() { return focusId; } };
})();
