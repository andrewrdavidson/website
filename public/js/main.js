(() => {
  // ns-hugo-imp:D:\source\blog\themes\void\assets\js\modules\theme.js
  var STORAGE_KEY = "theme";
  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }
  function writeStored(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {
    }
  }
  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function currentPref() {
    const v = readStored();
    if (v === "dark" || v === "light") return v;
    return systemPrefersDark() ? "dark" : "light";
  }
  function initTheme() {
    const root = document.documentElement;
    const btn = document.getElementById("theme-toggle");
    const apply = (theme2) => {
      root.classList.toggle("dark", theme2 === "dark");
      if (btn) {
        btn.setAttribute("aria-pressed", theme2 === "dark" ? "true" : "false");
        btn.setAttribute("aria-label", theme2 === "dark" ? "Switch to light mode" : "Switch to dark mode");
      }
    };
    let theme = currentPref();
    apply(theme);
    if (btn) {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        theme = theme === "dark" ? "light" : "dark";
        writeStored(theme);
        apply(theme);
        btn.blur();
      });
    }
    try {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        if (!readStored()) {
          theme = currentPref();
          apply(theme);
        }
      };
      if (media.addEventListener) media.addEventListener("change", handler);
      else if (media.addListener) media.addListener(handler);
    } catch (_) {
    }
  }

  // ns-hugo-imp:D:\source\blog\themes\void\assets\js\modules\footnotes.js
  function initFootnotes() {
    relocateCalloutFootnotes();
    fixFootnoteIds();
  }
  function relocateCalloutFootnotes() {
    const calloutBlocks = Array.from(document.querySelectorAll(".callout .footnotes"));
    if (calloutBlocks.length === 0) return;
    let globalFootnotes = Array.from(document.querySelectorAll(".footnotes")).find(
      (el) => !el.closest(".callout")
    );
    const contentRoot = document.querySelector("article .article-prose") || document.querySelector("article .prose");
    if (!globalFootnotes) {
      globalFootnotes = document.createElement("div");
      globalFootnotes.className = "footnotes";
      globalFootnotes.appendChild(document.createElement("hr"));
      globalFootnotes.appendChild(document.createElement("ol"));
      (contentRoot || document.body).appendChild(globalFootnotes);
    }
    let globalList = globalFootnotes.querySelector("ol");
    if (!globalList) {
      globalList = document.createElement("ol");
      globalFootnotes.appendChild(globalList);
    }
    calloutBlocks.forEach((block) => {
      const list = block.querySelector("ol");
      if (list) {
        Array.from(list.children).forEach((li) => globalList.appendChild(li));
      }
      block.remove();
    });
  }
  function fixFootnoteIds() {
    document.querySelectorAll('sup[id^="fnref"]').forEach((ref) => {
      const link = ref.querySelector("a");
      const href = link && link.getAttribute("href");
      if (!href) return;
      const target = document.getElementById(href.slice(1));
      const backref = target && target.querySelector(".footnote-backref");
      if (backref) backref.setAttribute("href", "#" + ref.id);
    });
  }

  // ns-hugo-imp:D:\source\blog\themes\void\assets\js\modules\clipboard.js
  function copyText(text) {
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.left = "-1000px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
          ta.setSelectionRange(0, ta.value.length);
        } catch (_) {
        }
        const ok = document.execCommand && document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("copy failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  // ns-hugo-imp:D:\source\blog\themes\void\assets\js\modules\share.js
  function initShareWidgets() {
    document.querySelectorAll("[data-share-widget]").forEach((widget) => {
      const button = widget.querySelector("[data-share-copy-summary]");
      const label = widget.querySelector("[data-share-label]");
      if (!button || !label) return;
      const summary = [
        widget.dataset.shareTitle || document.title,
        widget.dataset.shareText || "",
        widget.dataset.shareUrl || window.location.href
      ].filter(Boolean).join("\n");
      const messages = {
        defaultLabel: widget.dataset.shareLabelDefault || "Share",
        successLabel: widget.dataset.shareLabelSuccess || "Copied",
        copyFailed: widget.dataset.shareCopyFailed || "Copy failed."
      };
      let feedbackTimer = null;
      const setState = (message, isError) => {
        label.textContent = message;
        button.classList.toggle("is-error", !!isError);
        button.classList.toggle("is-success", !isError && message === messages.successLabel);
        if (feedbackTimer) window.clearTimeout(feedbackTimer);
        feedbackTimer = window.setTimeout(() => {
          label.textContent = messages.defaultLabel;
          button.classList.remove("is-error", "is-success");
        }, 1600);
      };
      button.addEventListener("click", async () => {
        try {
          await copyText(summary);
          setState(messages.successLabel, false);
          button.blur();
        } catch (_) {
          setState(messages.copyFailed, true);
        }
      });
    });
  }

  // ns-hugo-imp:D:\source\blog\themes\void\assets\js\modules\codeblock.js
  var ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>';
  var ICON_DONE = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>';
  var CODE_SELECTORS = [
    ".code-block-body code[data-lang]",
    ".code-block-body td:last-child code",
    ".code-block-body code:last-of-type"
  ];
  function getCodeText(block) {
    for (const selector of CODE_SELECTORS) {
      const el = block.querySelector(selector);
      const text = el && el.textContent ? el.textContent.replace(/\n$/, "") : "";
      if (text) return text;
    }
    return "";
  }
  function flash(button) {
    button.setAttribute("aria-label", "Copied");
    button.setAttribute("title", "Copied");
    button.innerHTML = ICON_DONE;
    setTimeout(() => {
      button.setAttribute("aria-label", "Copy code");
      button.setAttribute("title", "Copy code");
      button.innerHTML = ICON_COPY;
    }, 1600);
  }
  function initCodeBlocks() {
    document.querySelectorAll("[data-code-block]").forEach((block) => {
      const button = block.querySelector(".copy-button");
      if (!button) return;
      button.addEventListener("click", () => {
        const code = getCodeText(block);
        if (!code) return;
        copyText(code).then(() => flash(button)).catch(() => {
        });
      });
    });
  }

  // ns-hugo-imp:D:\source\blog\themes\void\assets\js\modules\anchors.js
  var currentHighlighted = null;
  var scrollArmTimer = null;
  function removeHandlers() {
    window.removeEventListener("scroll", clearOnce);
    window.removeEventListener("keydown", clearOnce);
    window.removeEventListener("pointerdown", clearOnce);
    window.removeEventListener("touchstart", clearOnce);
  }
  function clearOnce() {
    if (currentHighlighted) {
      currentHighlighted.classList.remove("anchor-highlight");
      currentHighlighted = null;
    }
    removeHandlers();
  }
  function headerHeight() {
    const hd = document.querySelector("body > header");
    return hd ? hd.getBoundingClientRect().height : 0;
  }
  function scrollToTarget(el) {
    if (!el) return;
    const offset = headerHeight() + 8;
    const top = window.pageYOffset + el.getBoundingClientRect().top - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }
  function pickHighlightTarget(el) {
    if (!el) return null;
    if (el.tagName === "IMG") return el;
    if (el.classList && (el.classList.contains("katex-display") || el.classList.contains("katex"))) return el;
    if (el.tagName === "SPAN") {
      return el.querySelector("img") || el.querySelector(".katex-display, .katex") || el;
    }
    return el.closest("h1,h2,h3,h4,h5,h6") || el.closest(".code-block-container") || el.closest(".katex-display") || el.closest("pre,figure,table,blockquote,li") || el;
  }
  function setTocActive(id) {
    const esc = window.CSS && CSS.escape ? CSS.escape : (s) => String(s).replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
    document.querySelectorAll(".toc-nav").forEach((toc) => {
      toc.querySelectorAll("a.toc-active").forEach((a) => a.classList.remove("toc-active"));
      const link = toc.querySelector('a[href="#' + esc(id) + '"]');
      if (link) link.classList.add("toc-active");
    });
  }
  function highlightById(id) {
    if (!id) return;
    try {
      id = decodeURIComponent(id);
    } catch (_) {
    }
    const el = document.getElementById(id);
    if (!el) return;
    const target = pickHighlightTarget(el);
    if (currentHighlighted && currentHighlighted !== target) {
      currentHighlighted.classList.remove("anchor-highlight");
    }
    target.classList.add("anchor-highlight");
    currentHighlighted = target;
    setTocActive(id);
    scrollToTarget(target);
    removeHandlers();
    window.addEventListener("keydown", clearOnce, { once: true });
    window.addEventListener("pointerdown", clearOnce, { once: true });
    window.addEventListener("touchstart", clearOnce, { once: true });
    if (scrollArmTimer) clearTimeout(scrollArmTimer);
    scrollArmTimer = setTimeout(() => {
      window.addEventListener("scroll", clearOnce, { once: true });
    }, 1500);
  }
  function copyPermalink(anchor, id) {
    const url = location.origin + location.pathname + (id ? "#" + id : "");
    const done = () => {
      anchor.classList.add("copied");
      anchor.setAttribute("aria-label", "Copied");
      setTimeout(() => {
        anchor.classList.remove("copied");
        anchor.setAttribute("aria-label", "Copy link to this section");
      }, 1200);
    };
    copyText(url).then(done, done);
    if (id) {
      try {
        if (history.pushState) history.pushState(null, "", "#" + id);
        else location.hash = id;
      } catch (_) {
      }
      highlightById(id);
    }
  }
  function initAnchors() {
    if (location.hash && location.hash.length > 1) {
      setTimeout(() => highlightById(location.hash.slice(1)), 0);
    }
    window.addEventListener("hashchange", () => {
      if (location.hash && location.hash.length > 1) highlightById(location.hash.slice(1));
    });
    window.addEventListener("popstate", () => {
      if (location.hash && location.hash.length > 1) highlightById(location.hash.slice(1));
    });
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest("a.heading-anchor");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const href = btn.getAttribute("href") || "";
        copyPermalink(btn, href.startsWith("#") ? href.slice(1) : "");
      },
      true
    );
    document.addEventListener(
      "click",
      (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a || a.classList && a.classList.contains("heading-anchor")) return;
        const href = a.getAttribute("href");
        if (!href || href === "#" || href.length < 2) return;
        const id = href.slice(1);
        let decoded = id;
        try {
          decoded = decodeURIComponent(id);
        } catch (_) {
        }
        if (!document.getElementById(decoded)) return;
        e.preventDefault();
        if (history.pushState) history.pushState(null, "", "#" + id);
        else location.hash = id;
        highlightById(decoded);
      },
      true
    );
  }

  // ns-hugo-imp:D:\source\blog\themes\void\assets\js\modules\menu.js
  function initMenu() {
    const header = document.querySelector("body > header");
    const button = document.getElementById("menu-toggle");
    const nav = document.getElementById("site-nav");
    if (!header || !button || !nav) return;
    const setOpen = (open) => {
      header.classList.toggle("menu-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
    };
    button.addEventListener("click", () => setOpen(!header.classList.contains("menu-open")));
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("click", (e) => {
      if (header.classList.contains("menu-open") && !header.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && header.classList.contains("menu-open")) {
        setOpen(false);
        button.focus();
      }
    });
  }

  // ns-hugo-imp:D:\source\blog\themes\void\assets\js\modules\scrollspy.js
  function initScrollSpy() {
    const tocs = [...document.querySelectorAll(".toc-nav")];
    if (!tocs.length) return;
    const linksById = /* @__PURE__ */ new Map();
    tocs.forEach((toc) => {
      toc.querySelectorAll('a[href^="#"]').forEach((a) => {
        let id = a.getAttribute("href").slice(1);
        try {
          id = decodeURIComponent(id);
        } catch (_) {
        }
        if (!linksById.has(id)) linksById.set(id, []);
        linksById.get(id).push(a);
      });
    });
    const headings = [...linksById.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    if (!headings.length) return;
    let active = null;
    const setActive = (id) => {
      if (id === active) return;
      active = id;
      tocs.forEach((toc) => toc.querySelectorAll("a.toc-active").forEach((a) => a.classList.remove("toc-active")));
      (linksById.get(id) || []).forEach((a) => {
        a.classList.add("toc-active");
        const side = a.closest(".toc-sidebar");
        if (side) {
          const r = a.getBoundingClientRect();
          const sr = side.getBoundingClientRect();
          if (r.top < sr.top || r.bottom > sr.bottom) a.scrollIntoView({ block: "nearest" });
        }
      });
    };
    const offset = () => (document.querySelector("body > header")?.getBoundingClientRect().height || 0) + 24;
    const update = () => {
      const y = offset();
      let current = headings[0];
      for (const h of headings) {
        if (h.getBoundingClientRect().top - y <= 0) current = h;
        else break;
      }
      setActive(current.id);
    };
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          update();
          ticking = false;
        });
      },
      { passive: true }
    );
    update();
  }

  // <stdin>
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initFootnotes();
    initShareWidgets();
    initCodeBlocks();
    initAnchors();
    initMenu();
    initScrollSpy();
  });
})();
