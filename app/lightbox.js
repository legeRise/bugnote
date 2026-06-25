// bugnote/app/lightbox.js — PhotoSwipe-based lightbox for media preview
// Depends on: PhotoSwipe UMD (app/vendor/photoswipe.umd.min.js), utils.js, state.js

(function () {
  const ns = window.bugnote;

  // Pre-load an image to get its natural dimensions
  function loadImageInfo(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = function () {
        resolve({ width: 800, height: 600 }); // fallback
      };
      img.src = src;
    });
  }

  async function openLightbox(items, startIndex) {
    if (!items || !items.length) return;

    if (typeof PhotoSwipe === "undefined") {
      openFallbackPreview(items, startIndex || 0);
      return;
    }

    // Close the issue dialog while lightbox is open (dialog showModal top-layer conflict)
    var dialog = ns.els && ns.els.issueDialog;
    var wasDialogOpen = dialog && dialog.open;
    if (wasDialogOpen) dialog.close();

    // Build dataSource with proper dimensions
    var dataSource = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var isVideo = item.type && item.type.startsWith("video/");
      if (isVideo) {
        var videoSrc = escAttr(item.src);
        var videoType = escAttr(item.type);
        dataSource.push({
          html:
            '<video controls playsinline autoplay style="max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain">' +
            '<source src="' + videoSrc + '" type="' + videoType + '">' +
            "</video>",
        });
      } else {
        var info = await loadImageInfo(item.src);
        dataSource.push({
          src: item.src,
          width: info.width,
          height: info.height,
          alt: item.name || "media",
        });
      }
    }

    var pswp = new PhotoSwipe({
      dataSource: dataSource,
      index: Math.max(0, Math.min(startIndex, dataSource.length - 1)),
      bgOpacity: 0.92,
      showHideAnimationType: "zoom",
      loop: true,
      pinchToClose: true,
      closeOnVerticalDrag: true,
      spacing: 0.12,
      allowPanToNext: true,
    });

    // Reopen dialog when PhotoSwipe closes
    if (wasDialogOpen) {
      pswp.on('close', function () {
        setTimeout(function () {
          if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
            dialog.showModal();
          }
        }, 50);
      });
    }

    pswp.init();
  }

  function openFallbackPreview(items, startIndex) {
    var index = Math.max(0, Math.min(startIndex, items.length - 1));
    var overlay = document.createElement("div");
    overlay.className = "media-preview-overlay";
    overlay.innerHTML =
      '<button class="media-preview-close" type="button" aria-label="Close preview">×</button>' +
      '<button class="media-preview-nav media-preview-prev" type="button" aria-label="Previous media">‹</button>' +
      '<div class="media-preview-stage"></div>' +
      '<button class="media-preview-nav media-preview-next" type="button" aria-label="Next media">›</button>' +
      '<div class="media-preview-caption"></div>';

    var stage = overlay.querySelector(".media-preview-stage");
    var caption = overlay.querySelector(".media-preview-caption");
    var previous = overlay.querySelector(".media-preview-prev");
    var next = overlay.querySelector(".media-preview-next");

    function render() {
      var item = items[index];
      var isVideo = item.type && item.type.startsWith("video/");
      stage.innerHTML = "";
      var media = document.createElement(isVideo ? "video" : "img");
      if (isVideo) {
        media.controls = true;
        media.playsInline = true;
        media.autoplay = true;
        var source = document.createElement("source");
        source.src = item.src;
        source.type = item.type || "";
        media.appendChild(source);
      } else {
        media.src = item.src;
        media.alt = item.name || "media";
      }
      stage.appendChild(media);
      caption.textContent = item.name || "";
      previous.hidden = items.length < 2;
      next.hidden = items.length < 2;
    }

    function close() {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      var dialog = ns.els && ns.els.issueDialog;
      if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
    }

    function move(step) {
      index = (index + step + items.length) % items.length;
      render();
    }

    function onKeydown(event) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }

    var dialog = ns.els && ns.els.issueDialog;
    if (dialog && dialog.open) dialog.close();
    overlay.querySelector(".media-preview-close").addEventListener("click", close);
    previous.addEventListener("click", function () { move(-1); });
    next.addEventListener("click", function () { move(1); });
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(overlay);
    render();
  }

  function escAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  ns.openLightbox = openLightbox;
})();
