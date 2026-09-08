(function () {
  "use strict";

  var CHUNK = 300;
  var ME_LABEL = "You";

  var state = {
    convMeta: [],
    cache: {},        // slug -> full message array (ascending by ts)
    loading: {},       // slug -> promise
    currentSlug: null,
    windowStart: 0,    // index into current conv array from which we render
    allLoaded: false,
  };

  var els = {
    sidebarList: document.getElementById("conv-list"),
    globalSearch: document.getElementById("global-search"),
    globalClear: document.getElementById("global-search-clear"),
    exportMeta: document.getElementById("export-meta"),

    views: {
      results: document.getElementById("results-view"),
      thread: document.getElementById("thread-view"),
      empty: document.getElementById("empty-view"),
    },

    resultsCount: document.getElementById("results-count"),
    resultsList: document.getElementById("results-list"),

    threadTitle: document.getElementById("thread-title"),
    threadMeta: document.getElementById("thread-meta"),
    threadSearch: document.getElementById("thread-search"),
    threadScroll: document.getElementById("thread-scroll"),
    threadMessages: document.getElementById("thread-messages"),
    loadOlder: document.getElementById("load-older"),
  };

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlight(text, query) {
    var safe = escapeHtml(text);
    if (!query) return safe;
    var re = new RegExp(escapeRegex(query), "ig");
    return safe.replace(re, function (m) { return "<mark>" + m + "</mark>"; });
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtDay(ts) {
    var d = new Date(ts);
    var today = new Date();
    var yest = new Date(); yest.setDate(today.getDate() - 1);
    if (sameDay(d, today)) return "Today";
    if (sameDay(d, yest)) return "Yesterday";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function showView(name) {
    Object.keys(els.views).forEach(function (k) {
      els.views[k].classList.toggle("active", k === name);
    });
  }

  // ---------- data loading ----------

  function loadConv(slug) {
    if (state.cache[slug]) return Promise.resolve(state.cache[slug]);
    if (state.loading[slug]) return state.loading[slug];
    var p = fetch("data/" + slug + ".json")
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        state.cache[slug] = arr;
        delete state.loading[slug];
        return arr;
      });
    state.loading[slug] = p;
    return p;
  }

  function loadAllConvs() {
    if (state.allLoaded) return Promise.resolve();
    return Promise.all(state.convMeta.map(function (c) { return loadConv(c.slug); }))
      .then(function () { state.allLoaded = true; });
  }

  // ---------- sidebar ----------

  function renderSidebar() {
    els.sidebarList.innerHTML = "";
    state.convMeta.forEach(function (c) {
      var li = document.createElement("li");
      li.className = "conv-item";
      li.dataset.slug = c.slug;
      li.innerHTML =
        '<div class="name">' + escapeHtml(c.name) + "</div>" +
        '<div class="meta">' + c.count.toLocaleString() + " msgs &middot; " + fmtDate(c.last) + "</div>";
      li.addEventListener("click", function () { openConv(c.slug); });
      els.sidebarList.appendChild(li);
    });
  }

  function setActiveConv(slug) {
    Array.prototype.forEach.call(els.sidebarList.children, function (li) {
      li.classList.toggle("active", li.dataset.slug === slug);
    });
  }

  // ---------- thread rendering ----------

  function openConv(slug, opts) {
    opts = opts || {};
    state.currentSlug = slug;
    setActiveConv(slug);
    els.threadSearch.value = "";
    showView("thread");

    loadConv(slug).then(function (arr) {
      var meta = state.convMeta.filter(function (c) { return c.slug === slug; })[0];
      els.threadTitle.textContent = meta ? meta.name : slug;
      els.threadMeta.textContent = arr.length.toLocaleString() + " messages \u00b7 " +
        fmtDate(arr[0].ts) + " \u2013 " + fmtDate(arr[arr.length - 1].ts);

      var targetId = opts.jumpToId;
      if (targetId) {
        var idx = arr.findIndex(function (m) { return m.id === targetId; });
        state.windowStart = Math.max(0, idx - Math.floor(CHUNK / 2));
      } else {
        state.windowStart = Math.max(0, arr.length - CHUNK);
      }

      renderWindow(arr);

      if (targetId) {
        setTimeout(function () {
          var el = els.threadMessages.querySelector('[data-id="' + cssEscape(targetId) + '"]');
          if (el) {
            el.scrollIntoView({ block: "center" });
            el.querySelector(".bubble").classList.add("highlighted");
            setTimeout(function () {
              var b = el.querySelector(".bubble");
              if (b) b.classList.remove("highlighted");
            }, 2200);
          }
        }, 30);
      } else {
        els.threadScroll.scrollTop = els.threadScroll.scrollHeight;
      }
    });
  }

  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function renderWindow(arr) {
    els.threadMessages.innerHTML = "";
    els.loadOlder.classList.toggle("hidden", state.windowStart <= 0);
    var slice = arr.slice(state.windowStart);
    var lastDay = null;
    var lastSender = null;
    var frag = document.createDocumentFragment();

    slice.forEach(function (m) {
      var d = new Date(m.ts);
      if (!lastDay || !sameDay(d, lastDay)) {
        var div = document.createElement("div");
        div.className = "day-divider";
        div.textContent = fmtDay(m.ts);
        frag.appendChild(div);
        lastDay = d;
        lastSender = null;
      }

      var senderName = m.sender === "me" ? ME_LABEL : m.sender;
      if (senderName !== lastSender) {
        var label = document.createElement("div");
        label.className = "sender-label";
        label.textContent = senderName;
        frag.appendChild(label);
        lastSender = senderName;
      }

      var row = document.createElement("div");
      row.className = "msg-row " + (m.sender === "me" ? "me" : "them");
      row.dataset.id = m.id;

      var bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = m.text;

      var meta = document.createElement("div");
      meta.className = "msg-meta";
      meta.textContent = fmtTime(m.ts);

      var col = document.createElement("div");
      col.appendChild(bubble);
      col.appendChild(meta);
      row.appendChild(col);
      frag.appendChild(row);
    });

    els.threadMessages.appendChild(frag);
  }

  els.loadOlder.addEventListener("click", function () {
    var arr = state.cache[state.currentSlug];
    if (!arr) return;
    var prevHeight = els.threadScroll.scrollHeight;
    state.windowStart = Math.max(0, state.windowStart - CHUNK);
    renderWindow(arr);
    els.threadScroll.scrollTop = els.threadScroll.scrollHeight - prevHeight;
  });

  // ---------- in-thread search ----------

  var threadSearchTimer;
  els.threadSearch.addEventListener("input", function () {
    clearTimeout(threadSearchTimer);
    threadSearchTimer = setTimeout(runThreadSearch, 150);
  });

  function runThreadSearch() {
    var q = els.threadSearch.value.trim();
    var arr = state.cache[state.currentSlug];
    if (!arr) return;

    if (!q) {
      renderWindow(arr);
      els.threadScroll.scrollTop = els.threadScroll.scrollHeight;
      return;
    }

    var qLower = q.toLowerCase();
    var matches = arr.filter(function (m) { return m.text.toLowerCase().indexOf(qLower) !== -1; });

    els.loadOlder.classList.add("hidden");
    els.threadMessages.innerHTML = "";
    var frag = document.createDocumentFragment();

    if (matches.length === 0) {
      var empty = document.createElement("div");
      empty.className = "day-divider";
      empty.textContent = "No matches";
      frag.appendChild(empty);
    }

    var lastDay = null;
    matches.forEach(function (m) {
      var d = new Date(m.ts);
      if (!lastDay || !sameDay(d, lastDay)) {
        var div = document.createElement("div");
        div.className = "day-divider";
        div.textContent = fmtDay(m.ts);
        frag.appendChild(div);
        lastDay = d;
      }
      var senderName = m.sender === "me" ? ME_LABEL : m.sender;
      var label = document.createElement("div");
      label.className = "sender-label";
      label.textContent = senderName;
      frag.appendChild(label);

      var row = document.createElement("div");
      row.className = "msg-row " + (m.sender === "me" ? "me" : "them");
      var bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = highlight(m.text, q);
      var meta = document.createElement("div");
      meta.className = "msg-meta";
      meta.textContent = fmtTime(m.ts);
      var col = document.createElement("div");
      col.appendChild(bubble);
      col.appendChild(meta);
      row.appendChild(col);
      frag.appendChild(row);
    });

    els.threadMessages.appendChild(frag);
    els.threadScroll.scrollTop = 0;
  }

  // ---------- global search ----------

  var globalSearchTimer;
  els.globalSearch.addEventListener("input", function () {
    els.globalClear.classList.toggle("show", !!els.globalSearch.value);
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(runGlobalSearch, 180);
  });

  els.globalClear.addEventListener("click", function () {
    els.globalSearch.value = "";
    els.globalClear.classList.remove("show");
    if (state.currentSlug) {
      showView("thread");
    } else {
      showView("empty");
    }
  });

  function runGlobalSearch() {
    var q = els.globalSearch.value.trim();
    if (!q) {
      if (state.currentSlug) { showView("thread"); } else { showView("empty"); }
      return;
    }

    showView("results");
    els.resultsCount.textContent = "Searching\u2026";
    els.resultsList.innerHTML = "";

    loadAllConvs().then(function () {
      var qLower = q.toLowerCase();
      var results = [];
      state.convMeta.forEach(function (c) {
        var arr = state.cache[c.slug] || [];
        for (var i = 0; i < arr.length; i++) {
          var m = arr[i];
          if (m.text.toLowerCase().indexOf(qLower) !== -1) {
            results.push({ conv: c, msg: m });
          }
        }
      });
      results.sort(function (a, b) { return b.msg.ts - a.msg.ts; });
      renderResults(results, q);
    });
  }

  function snippet(text, query, radius) {
    var lower = text.toLowerCase();
    var idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, radius * 2);
    var start = Math.max(0, idx - radius);
    var end = Math.min(text.length, idx + query.length + radius);
    var out = text.slice(start, end);
    if (start > 0) out = "\u2026" + out;
    if (end < text.length) out = out + "\u2026";
    return out;
  }

  function renderResults(results, q) {
    els.resultsCount.textContent = results.length.toLocaleString() +
      (results.length === 1 ? " match" : " matches") + ' for "' + q + '"';
    els.resultsList.innerHTML = "";

    var MAX_RENDER = 500;
    var frag = document.createDocumentFragment();
    results.slice(0, MAX_RENDER).forEach(function (r) {
      var li = document.createElement("li");
      li.className = "result-item";
      var senderName = r.msg.sender === "me" ? ME_LABEL : r.msg.sender;
      li.innerHTML =
        '<div class="result-conv">' + escapeHtml(r.conv.name) + " \u00b7 " + escapeHtml(senderName) + "</div>" +
        '<div class="result-snippet">' + highlight(snippet(r.msg.text, q, 70), q) + "</div>" +
        '<div class="result-date">' + fmtDate(r.msg.ts) + " " + fmtTime(r.msg.ts) + "</div>";
      li.addEventListener("click", function () {
        els.globalSearch.value = "";
        els.globalClear.classList.remove("show");
        openConv(r.conv.slug, { jumpToId: r.msg.id });
      });
      frag.appendChild(li);
    });
    els.resultsList.appendChild(frag);

    if (results.length > MAX_RENDER) {
      var note = document.createElement("li");
      note.className = "result-item";
      note.style.cursor = "default";
      note.innerHTML = '<div class="result-snippet">Showing first ' + MAX_RENDER +
        " of " + results.length.toLocaleString() + " matches. Narrow your search to see more precisely.</div>";
      els.resultsList.appendChild(note);
    }
  }

  // ---------- boot ----------

  fetch("data/conversations.json")
    .then(function (r) { return r.json(); })
    .then(function (meta) {
      state.convMeta = meta;
      renderSidebar();
      var totalMsgs = meta.reduce(function (a, c) { return a + c.count; }, 0);
      els.exportMeta.textContent = meta.length + " threads \u00b7 " + totalMsgs.toLocaleString() + " messages";
      if (meta.length) {
        openConv(meta[0].slug);
      } else {
        showView("empty");
      }
    })
    .catch(function (err) {
      els.exportMeta.textContent = "Failed to load data.";
      console.error(err);
    });
})();
