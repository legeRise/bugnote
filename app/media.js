// bugnote/app/media.js — Media upload, paste, drag-drop handling (no camera)
// Depends on: utils.js, state.js, editor.js, lightbox.js (must be loaded first)

(function () {
  const ns = window.bugnote;

  async function uploadMedia(blob, name, type) {
    const state = ns.state;
    if (!state.draftIssueId && !state.editingId) throw new Error("Open an issue before adding media.");
    const form = new FormData();
    form.append("issueId", String(state.draftIssueId || state.editingId));
    form.append("name", name);
    form.append("type", type);
    form.append("file", blob, name);
    return apiJson("/api/media", { method: "POST", body: form, isForm: true });
  }

  function buildMediaEmbed(src, mimeType, name, path) {
    name = name || "media";
    path = path || "";
    const safeType = normalizeMediaType(mimeType, name);
    const isVideo = safeType.startsWith("video/");

    const wrapper = document.createElement("span");
    wrapper.className = "media-embed";
    wrapper.contentEditable = "false";
    wrapper.dataset.src = src;
    wrapper.dataset.type = safeType;
    wrapper.dataset.name = name;
    wrapper.dataset.path = path;
    wrapper.title = name;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("tabindex", "0");
    wrapper.setAttribute("aria-label", "Preview " + name);
    wrapper.draggable = true;

    const node = document.createElement(isVideo ? "video" : "img");
    node.dataset.name = name;
    node.dataset.type = safeType;
    node.dataset.path = path;

    if (isVideo) {
      node.playsInline = true;
      node.preload = "metadata";
      node.muted = true;
      const source = document.createElement("source");
      source.src = src;
      source.type = safeType;
      node.appendChild(source);
    } else {
      node.src = src;
      node.alt = name;
      node.loading = "lazy";
    }

    wrapper.appendChild(node);

    wrapper.addEventListener("click", function (e) {
      e.stopPropagation();
      const allMedia = collectAllMediaInEditor();
      const currentIndex = allMedia.findIndex(function (m) { return m.src === src; });
      if (typeof ns.openLightbox === "function") {
        ns.openLightbox(allMedia, currentIndex >= 0 ? currentIndex : 0);
      }
    });
    wrapper.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      wrapper.click();
    });
    wrapper.addEventListener("dragstart", function (event) {
      ns.state.draggedMediaEmbed = wrapper;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", name);
      wrapper.classList.add("is-dragging");
    });
    wrapper.addEventListener("dragend", function () {
      wrapper.classList.remove("is-dragging");
      ns.state.draggedMediaEmbed = null;
    });

    return wrapper;
  }

  function insertMedia(src, mimeType, name, path) {
    ns.restoreSelection();
    const wrapper = buildMediaEmbed(src, mimeType, name, path);

    ns.insertNodeAtCursor(wrapper);
    ns.insertNodeAtCursor(document.createElement("br"));
  }

  function collectAllMediaInEditor() {
    return [...ns.els.issueDescription.querySelectorAll(".media-embed")].map(function (el) {
      const media = el.querySelector("img, video");
      const source = media?.querySelector("source");
      const src = el.dataset.src || media?.getAttribute("src") || source?.getAttribute("src") || "";
      const type = el.dataset.type || media?.dataset.type || source?.getAttribute("type") || "";
      const name = el.dataset.name || media?.dataset.name || media?.getAttribute("alt") || "media";
      return { src: src, type: type, name: name, element: el };
    }).filter(function (m) { return m.src; });
  }

  function collectMedia() {
    return collectAllMediaInEditor().map(function (item) {
      return {
        name: item.name,
        type: item.type,
        path: item.element.dataset.path || item.element.querySelector("img, video")?.dataset.path || "",
        url: item.src,
      };
    });
  }

  function hydrateMediaEmbeds() {
    ns.els.issueDescription.querySelectorAll(".media-embed").forEach(function (embed) {
      const media = embed.querySelector("img, video");
      const source = media?.querySelector("source");
      const src = embed.dataset.src || media?.getAttribute("src") || source?.getAttribute("src") || "";
      if (!src) return;
      const type = embed.dataset.type || media?.dataset.type || source?.getAttribute("type") || normalizeMediaType("", embed.dataset.name || media?.dataset.name || "");
      const name = embed.dataset.name || media?.dataset.name || media?.getAttribute("alt") || "media";
      const path = embed.dataset.path || media?.dataset.path || "";
      const replacement = buildMediaEmbed(src, type, name, path);
      embed.replaceWith(replacement);
    });
  }

  function appendStoredMedia(mediaItems) {
    const items = Array.isArray(mediaItems) ? mediaItems : [];
    if (!items.length) return;
    const existing = new Set(collectAllMediaInEditor().map(function (item) { return item.src; }));
    items.forEach(function (item) {
      const src = item.url || item.src || "";
      if (!src || existing.has(src)) return;
      const embed = buildMediaEmbed(src, item.type || "", item.name || "media", item.path || "");
      ns.els.issueDescription.appendChild(embed);
      ns.els.issueDescription.appendChild(document.createElement("br"));
      existing.add(src);
    });
  }

  async function insertFiles(files) {
    const mediaFiles = files.filter(isSupportedMedia);
    if (!mediaFiles.length) return;
    await withBusy(`Uploading ${mediaFiles.length} media file${mediaFiles.length === 1 ? "" : "s"}...`, async () => {
      ns.restoreSelection();
      for (const file of mediaFiles) {
        const asset = await uploadMedia(file, file.name, normalizeMediaType(file.type, file.name));
        insertMedia(asset.url, asset.type, asset.name, asset.path);
      }
      ns.saveSelection();
    });
  }

  async function handleUpload(event) {
    try {
      await insertFiles([...event.target.files]);
    } catch (error) {
      showFormError(error.message || "Media could not be uploaded.");
    } finally {
      event.target.value = "";
    }
  }

  async function handlePaste(event) {
    const files = [...event.clipboardData.files].filter(isSupportedMedia);
    if (!files.length) return;
    event.preventDefault();
    try {
      await insertFiles(files);
    } catch (error) {
      showFormError(error.message || "Pasted media could not be uploaded.");
    }
  }

  async function handleDrop(event) {
    const files = [...event.dataTransfer.files].filter(isSupportedMedia);
    if (!files.length && ns.state.draggedMediaEmbed) {
      event.preventDefault();
      ns.saveSelectionFromPoint(event.clientX, event.clientY);
      ns.insertNodeAtCursor(ns.state.draggedMediaEmbed);
      ns.insertNodeAtCursor(document.createElement("br"));
      return;
    }
    if (!files.length) return;
    event.preventDefault();
    ns.saveSelectionFromPoint(event.clientX, event.clientY);
    try {
      await insertFiles(files);
    } catch (error) {
      showFormError(error.message || "Dropped media could not be uploaded.");
    }
  }

  function showFormError(message) {
    const els = ns.els;
    if (els.formError) els.formError.textContent = message;
  }

  ns.uploadMedia = uploadMedia;
  ns.insertMedia = insertMedia;
  ns.collectMedia = collectMedia;
  ns.hydrateMediaEmbeds = hydrateMediaEmbeds;
  ns.appendStoredMedia = appendStoredMedia;
  ns.insertFiles = insertFiles;
  ns.handleUpload = handleUpload;
  ns.handlePaste = handlePaste;
  ns.handleDrop = handleDrop;
})();
