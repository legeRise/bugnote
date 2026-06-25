// bugnote/app/editor.js — Rich text editor: selection, sanitization, cursor operations
// Depends on: utils.js, state.js (must be loaded first)

(function () {
  const ns = window.bugnote;

  function saveSelection() {
    const els = ns.els;
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (els.issueDescription.contains(range.commonAncestorContainer)) {
      ns.state.savedRange = range.cloneRange();
    }
  }

  function restoreSelection() {
    const els = ns.els;
    els.issueDescription.focus();
    const range = ns.state.savedRange;
    if (!range) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function saveSelectionFromPoint(x, y) {
    const els = ns.els;
    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
    }
    if (range && els.issueDescription.contains(range.commonAncestorContainer)) {
      ns.state.savedRange = range;
    }
  }

  function insertNodeAtCursor(node) {
    restoreSelection();
    const els = ns.els;
    const selection = window.getSelection();
    const range = selection.rangeCount ? selection.getRangeAt(0) : document.createRange();
    if (!selection.rangeCount) {
      range.selectNodeContents(els.issueDescription);
      range.collapse(false);
    }
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    ns.state.savedRange = range.cloneRange();
  }

  function sanitizeEditorHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    template.content.querySelectorAll("script, style, iframe, object, embed").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attr) => {
        const allowed = ["src", "type", "alt", "title", "controls", "playsinline", "preload", "loading", "draggable", "data-src", "data-name", "data-type", "data-path", "class", "contenteditable", "role", "tabindex", "aria-label"];
        if (attr.name.startsWith("on") || !allowed.includes(attr.name)) node.removeAttribute(attr.name);
      });
    });
    return template.innerHTML.trim();
  }

  function repairMediaHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    template.content.querySelectorAll(".media-embed").forEach((embed) => {
      const media = embed.querySelector("img, video");
      const source = media?.querySelector("source");
      const src = embed.dataset.src || media?.getAttribute("src") || source?.getAttribute("src") || "";
      const type = embed.dataset.type || media?.dataset.type || source?.getAttribute("type") || normalizeMediaType("", embed.dataset.name || media?.dataset.name || "");
      const name = embed.dataset.name || media?.dataset.name || media?.getAttribute("alt") || "media";
      const path = embed.dataset.path || media?.dataset.path || "";
      if (src) embed.dataset.src = src;
      embed.dataset.type = type;
      embed.dataset.name = name;
      embed.dataset.path = path;
      embed.contentEditable = "false";
    });
    template.content.querySelectorAll("video").forEach((video) => {
      const source = video.querySelector("source");
      const src = source?.getAttribute("src") || video.getAttribute("src");
      if (!src) return;
      video.removeAttribute("src");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      if (!source) {
        const nextSource = document.createElement("source");
        nextSource.src = src;
        nextSource.type = video.dataset.type || normalizeMediaType("", video.dataset.name || "");
        video.appendChild(nextSource);
      }
    });
    return template.innerHTML;
  }

  ns.saveSelection = saveSelection;
  ns.restoreSelection = restoreSelection;
  ns.saveSelectionFromPoint = saveSelectionFromPoint;
  ns.insertNodeAtCursor = insertNodeAtCursor;
  ns.sanitizeEditorHtml = sanitizeEditorHtml;
  ns.repairMediaHtml = repairMediaHtml;
})();
