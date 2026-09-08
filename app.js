(function () {
  "use strict";

  var CHUNK = 300;
  var ME_LABEL = "You";
  var REPO_OWNER = "thepacheco";
  var REPO_NAME = "teams";
  var MEDIA_PATH = "data/media";
  var IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|bmp)$/i;
  var VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

  var AVATAR_COLORS = ["#5b5fc7", "#c4314b", "#0078d4", "#498205", "#8764b8", "#ca5010", "#0b6a0b", "#986f0b"];

  var state = {
    convMeta: [],
    cache: {},
    loading: {},
    currentSlug: null,
    windowStart: 0,
    allLoaded: false,
    activeTab: "chats",
    photosLoaded: false,
    photoFiles: [],
    lightboxIndex: -1,
  };

  var els = {
    sidebarList: document.getElementById("conv-list"),
    globalSearch: document.getElementById("global-search"),
    globalClear: document.getElementById("global-search-clear"),
    exportMeta: document.getElementById("export-meta"),
    navTabs: document.querySelectorAll(".nav-tab"),

    views: {
      results: document.getElementById("results-view"),
      thread: document.getElementById("thread-view"),
      photos: document.getElementById("photos-view"),
      empty: document.getElementById("empty-view"),
    },

    resultsCount: document.getElementById("results-count"),
    resultsList: document.getElementById("results-list"),

    threadAvatar: document.getElementById("thread-avatar"),
    threadTitle: document.getElementById("thread-title"),
    threadMeta: document.getElementById("thread-meta"),
    threadSearch: document.getElementById("thread-search"),
    threadScroll: document.getElementById("thread-scroll"),
    threadMessages: document.getElementById("thread-messages"),
    loadOlder: document.getElementById("load-older"),
    monthJump: document.getElementById("month-jump"),

    photosGrid: document.getElementById("photos-grid"),
    photosEmpty: document.getElementById("photos-empty"),

    lightbox: document.getElementById("lightbox"),
    lightboxContent: document.getElementById("lightbox-content"),
    lightboxCaption: document.getElementById("lightbox-caption"),
    lightboxClose: document.getElementById("lightbox-close"),
    lightboxPrev: document.getElementById("lightbox-prev"),
    lightboxNext: document.getElementById("lightbox-next"),
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
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

  function monthKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function monthLabel(key) {
    var parts = key.split("-");
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function initials(name) {
    if (!name) return "?";
    var parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function colorForName(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  function showView(name) {
    Object.keys(els.views).forEach(function (k) {
      els.views[k].classList.toggle("active", k === name);
    });
  }

  // ---------- nav tabs ----------

  els.navTabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      els.navTabs.forEach(function (b) { b.classList.toggle("active", b === btn); });
      state.activeTab = btn.dataset.tab;
      if (state.activeTab === "photos") {
        openPhotos();
      } else if (state.currentSlug) {
        openConv(state.currentSlug);
      } else {
        showView("empty");
      }
    });
  });

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
      var col = colorForName(c.name);
      li.innerHTML =
        '<div class="avatar" style="background:' + col + '">' + escapeHtml(initials(c.name)) + "</div>" +
        '<div class="conv-text">' +
        '<div class="name">' + escapeHtml(c.name) + "</div>" +
        '<div class="meta">' + c.count.toLocaleString() + " msgs \u00b7 " + fmtDate(c.last) + "</div>" +
        "</div>";
      li.addEventListener("click", function () {
        els.navTabs.forEach(function (b) { b.classList.toggle("active", b.dataset.tab === "chats"); });
        state.activeTab = "chats";
        openConv(c.slug);
      });
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
      var name = meta ? meta.name : slug;
      els.threadTitle.textContent = name;
      els.threadAvatar.textContent = initials(name);
      els.threadAvatar.style.background = colorForName(name);
      els.threadMeta.textContent = arr.length.toLocaleString() + " messages \u00b7 " +
        fmtDate(arr[0].ts) + " \u2013 " + fmtDate(arr[arr.length - 1].ts);

      populateMonthJump(arr);

      var targetId = opts.jumpToId;
      var targetIdx = opts.jumpToIndex;
      if (targetId && targetIdx === undefined) {
        targetIdx = arr.findIndex(function (m) { return m.id === targetId; });
      }

      if (targetIdx !== undefined && targetIdx > -1) {
        state.windowStart = Math.max(0, targetIdx - Math.floor(CHUNK / 2));
      } else {
        state.windowStart = Math.max(0, arr.length - CHUNK);
      }

      renderWindow(arr);

      if (targetIdx !== undefined && targetIdx > -1) {
        var jumpId = arr[targetIdx].id;
        setTimeout(function () {
          var el = els.threadMessages.querySelector('[data-id="' + cssEscape(jumpId) + '"]');
          if (el) {
            el.scrollIntoView({ block: "center" });
            el.classList.add("highlighted");
            setTimeout(function () { el.classList.remove("highlighted"); }, 2200);
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

  function populateMonthJump(arr) {
    var seen = {};
    var keys = [];
    arr.forEach(function (m) {
      var k = monthKey(m.ts);
      if (!seen[k]) { seen[k] = true; keys.push(k); }
    });
    keys.sort();
    els.monthJump.innerHTML = '<option value="">Jump to month\u2026</option>';
    keys.forEach(function (k) {
      var opt = document.createElement("option");
      opt.value = k;
      opt.textContent = monthLabel(k);
      els.monthJump.appendChild(opt);
    });
  }

  els.monthJump.addEventListener("change", function () {
    var val = els.monthJump.value;
    if (!val) return;
    var arr = state.cache[state.currentSlug];
    if (!arr) return;
    var idx = arr.findIndex(function (m) { return monthKey(m.ts) === val; });
    if (idx === -1) return;
    els.threadSearch.value = "";
    openConv(state.currentSlug, { jumpToIndex: idx });
  });

  function renderWindow(arr) {
    els.threadMessages.innerHTML = "";
    els.loadOlder.classList.toggle("hidden", state.windowStart <= 0);
    var slice = arr.slice(state.windowStart);
    var lastDay = null;
    var frag = document.createDocumentFragment();
    var currentBlock = null;
    var currentSender = null;

    slice.forEach(function (m) {
      var d = new Date(m.ts);
      if (!lastDay || !sameDay(d, lastDay)) {
        var div = document.createElement("div");
        div.className = "day-divider";
        var span = document.createElement("span");
        span.textContent = fmtDay(m.ts);
        div.appendChild(span);
        frag.appendChild(div);
        lastDay = d;
        currentBlock = null;
        currentSender = null;
      }

      var senderName = m.sender === "me" ? ME_LABEL : m.sender;
      var isMe = m.sender === "me";

      if (senderName !== currentSender || !currentBlock) {
        currentBlock = document.createElement("div");
        currentBlock.className = "msg-block " + (isMe ? "me" : "them");

        var avatarSlot = document.createElement("div");
        avatarSlot.className = "avatar-slot";
        if (!isMe) {
          var av = document.createElement("div");
          av.className = "avatar";
          av.style.background = colorForName(senderName);
          av.textContent = initials(senderName);
          avatarSlot.appendChild(av);
        }
        currentBlock.appendChild(avatarSlot);

        var col = document.createElement("div");
        col.className = "msg-col";
        if (!isMe) {
          var label = document.createElement("div");
          label.className = "block-sender";
          label.textContent = senderName;
          col.appendChild(label);
        }
        currentBlock.appendChild(col);

        frag.appendChild(currentBlock);
        currentSender = senderName;
      }

      var msgCol = currentBlock.querySelector(".msg-col");
      var row = document.createElement("div");
      row.className = "bubble-row";
      row.dataset.id = m.id;

      var bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = m.text;

      var time = document.createElement("div");
      time.className = "msg-time";
      time.textContent = fmtTime(m.ts);

      row.appendChild(bubble);
      row.appendChild(time);
      msgCol.appendChild(row);
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
      var espan = document.createElement("span");
      espan.textContent = "No matches";
      empty.appendChild(espan);
      frag.appendChild(empty);
    }

    var lastDay = null;
    matches.forEach(function (m) {
      var d = new Date(m.ts);
      if (!lastDay || !sameDay(d, lastDay)) {
        var div = document.createElement("div");
        div.className = "day-divider";
        var span = document.createElement("span");
        span.textContent = fmtDay(m.ts);
        div.appendChild(span);
        frag.appendChild(div);
        lastDay = d;
      }
      var senderName = m.sender === "me" ? ME_LABEL : m.sender;
      var isMe = m.sender === "me";

      var block = document.createElement("div");
      block.className = "msg-block " + (isMe ? "me" : "them");

      var avatarSlot = document.createElement("div");
      avatarSlot.className = "avatar-slot";
      if (!isMe) {
        var av = document.createElement("div");
        av.className = "avatar";
        av.style.background = colorForName(senderName);
        av.textContent = initials(senderName);
        avatarSlot.appendChild(av);
      }
      block.appendChild(avatarSlot);

      var col = document.createElement("div");
      col.className = "msg-col";
      if (!isMe) {
        var label = document.createElement("div");
        label.className = "block-sender";
        label.textContent = senderName;
        col.appendChild(label);
      }
      var row = document.createElement("div");
      row.className = "bubble-row";
      var bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = highlight(m.text, q);
      var time = document.createElement("div");
      time.className = "msg-time";
      time.textContent = fmtTime(m.ts);
      row.appendChild(bubble);
      row.appendChild(time);
      col.appendChild(row);
      block.appendChild(col);
      frag.appendChild(block);
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
    if (state.currentSlug) { showView("thread"); } else { showView("empty"); }
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
            results.push({ conv: c, msg: m, idx: i });
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
        openConv(r.conv.slug, { jumpToIndex: r.idx });
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

  // ---------- photos ----------

  function openPhotos() {
    showView("photos");
    if (state.photosLoaded) return;
    fetch("https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + MEDIA_PATH)
      .then(function (r) {
        if (!r.ok) throw new Error("Could not list " + MEDIA_PATH);
        return r.json();
      })
      .then(function (items) {
        var files = items.filter(function (it) {
          return it.type === "file" && (IMAGE_EXT.test(it.name) || VIDEO_EXT.test(it.name));
        });
        state.photoFiles = files;
        state.photosLoaded = true;
        renderPhotos(files);
      })
      .catch(function () {
        state.photosLoaded = true;
        renderPhotos([]);
      });
  }

  function renderPhotos(files) {
    els.photosGrid.innerHTML = "";
    els.photosEmpty.classList.toggle("hidden", files.length > 0);
    var frag = document.createDocumentFragment();
    files.forEach(function (f, i) {
      var tile = document.createElement("div");
      tile.className = "photo-tile";
      var isVideo = VIDEO_EXT.test(f.name);
      if (isVideo) {
        var v = document.createElement("video");
        v.src = f.download_url;
        v.muted = true;
        tile.appendChild(v);
      } else {
        var img = document.createElement("img");
        img.loading = "lazy";
        img.src = f.download_url;
        img.alt = f.name;
        tile.appendChild(img);
      }
      var label = document.createElement("div");
      label.className = "file-label";
      label.textContent = f.name;
      tile.appendChild(label);
      tile.addEventListener("click", function () { openLightbox(i); });
      frag.appendChild(tile);
    });
    els.photosGrid.appendChild(frag);
  }

  function openLightbox(i) {
    state.lightboxIndex = i;
    renderLightbox();
    els.lightbox.classList.add("show");
  }

  function renderLightbox() {
    var f = state.photoFiles[state.lightboxIndex];
    if (!f) return;
    els.lightboxContent.innerHTML = "";
    if (VIDEO_EXT.test(f.name)) {
      var v = document.createElement("video");
      v.src = f.download_url;
      v.controls = true;
      v.autoplay = true;
      els.lightboxContent.appendChild(v);
    } else {
      var img = document.createElement("img");
      img.src = f.download_url;
      img.alt = f.name;
      els.lightboxContent.appendChild(img);
    }
    els.lightboxCaption.textContent = f.name + " \u00b7 " + (state.lightboxIndex + 1) + " / " + state.photoFiles.length;
  }

  function closeLightbox() {
    els.lightbox.classList.remove("show");
    els.lightboxContent.innerHTML = "";
  }

  els.lightboxClose.addEventListener("click", closeLightbox);
  els.lightbox.addEventListener("click", function (e) {
    if (e.target === els.lightbox) closeLightbox();
  });
  els.lightboxPrev.addEventListener("click", function () {
    state.lightboxIndex = (state.lightboxIndex - 1 + state.photoFiles.length) % state.photoFiles.length;
    renderLightbox();
  });
  els.lightboxNext.addEventListener("click", function () {
    state.lightboxIndex = (state.lightboxIndex + 1) % state.photoFiles.length;
    renderLightbox();
  });
  document.addEventListener("keydown", function (e) {
    if (!els.lightbox.classList.contains("show")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") els.lightboxPrev.click();
    if (e.key === "ArrowRight") els.lightboxNext.click();
  });

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
