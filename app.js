const defaultStatuses = ["open", "fixed", "closed but not fixed", "not doing"];
const defaultReporters = ["Habib"];

const els = {
  totalCount: document.querySelector("#totalCount"),
  openCount: document.querySelector("#openCount"),
  fixedCount: document.querySelector("#fixedCount"),
  closedCount: document.querySelector("#closedCount"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  reporterFilter: document.querySelector("#reporterFilter"),
  resetFilters: document.querySelector("#resetFilters"),
  issuesTable: document.querySelector("#issuesTable"),
  emptyState: document.querySelector("#emptyState"),
  openCreateIssue: document.querySelector("#openCreateIssue"),
  issueDialog: document.querySelector("#issueDialog"),
  issueForm: document.querySelector("#issueForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  issueTitle: document.querySelector("#issueTitle"),
  reporterName: document.querySelector("#reporterName"),
  newReporterField: document.querySelector("#newReporterField"),
  newReporterName: document.querySelector("#newReporterName"),
  issueStatus: document.querySelector("#issueStatus"),
  issueDescription: document.querySelector("#issueDescription"),
  storageHint: document.querySelector("#storageHint"),
  mediaUpload: document.querySelector("#mediaUpload"),
  closeDialog: document.querySelector("#closeDialog"),
  cancelIssue: document.querySelector("#cancelIssue"),
  saveIssue: document.querySelector("#saveIssue"),
  deleteIssue: document.querySelector("#deleteIssue"),
  formError: document.querySelector("#formError"),
  openCamera: document.querySelector("#openCamera"),
  cameraDialog: document.querySelector("#cameraDialog"),
  closeCamera: document.querySelector("#closeCamera"),
  cameraPreview: document.querySelector("#cameraPreview"),
  switchCamera: document.querySelector("#switchCamera"),
  capturePhoto: document.querySelector("#capturePhoto"),
  pauseVideo: document.querySelector("#pauseVideo"),
  recordVideo: document.querySelector("#recordVideo"),
  recordingStatus: document.querySelector("#recordingStatus"),
  recordingLabel: document.querySelector("#recordingLabel"),
  recordingTimer: document.querySelector("#recordingTimer"),
};

let issues = [];
let editingId = null;
let draftIssueId = null;
let savedRange = null;
let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let shouldSaveRecording = false;
let recordingStartedAt = 0;
let pausedDurationMs = 0;
let pauseStartedAt = 0;
let timerId = null;
let preferredFacingMode = "environment";
let selectedVideoDeviceId = "";
let videoInputDevices = [];

init();

async function init() {
  await loadIssues();
  bindEvents();
  render();
}

function bindEvents() {
  els.searchInput.addEventListener("input", renderIssues);
  els.statusFilter.addEventListener("change", renderIssues);
  els.reporterFilter.addEventListener("change", renderIssues);
  els.resetFilters.addEventListener("click", resetFilters);
  els.openCreateIssue.addEventListener("click", () => openIssueDialog());
  els.closeDialog.addEventListener("click", closeIssueDialog);
  els.cancelIssue.addEventListener("click", closeIssueDialog);
  els.issueForm.addEventListener("submit", saveIssue);
  els.deleteIssue.addEventListener("click", deleteCurrentIssue);
  els.reporterName.addEventListener("change", toggleNewReporter);
  els.mediaUpload.addEventListener("change", handleUpload);
  els.issueDescription.addEventListener("keyup", saveSelection);
  els.issueDescription.addEventListener("mouseup", saveSelection);
  els.issueDescription.addEventListener("focus", saveSelection);
  els.issueDescription.addEventListener("paste", handlePaste);
  els.issueDescription.addEventListener("drop", handleDrop);
  els.issueDescription.addEventListener("dragover", (event) => event.preventDefault());
  els.openCamera.addEventListener("click", openCameraDialog);
  els.closeCamera.addEventListener("click", closeCameraDialog);
  els.switchCamera.addEventListener("click", switchCamera);
  els.capturePhoto.addEventListener("click", capturePhoto);
  els.recordVideo.addEventListener("click", toggleRecording);
  els.pauseVideo.addEventListener("click", togglePauseRecording);
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      restoreSelection();
      document.execCommand(button.dataset.command, false);
      els.issueDescription.focus();
      saveSelection();
    });
  });
}

async function loadIssues() {
  const data = await apiJson("/api/issues");
  issues = Array.isArray(data.issues) ? data.issues : [];
}

function render() {
  syncOptions();
  renderStats();
  renderIssues();
}

function renderStats() {
  els.totalCount.textContent = issues.length;
  els.openCount.textContent = countStatus("open");
  els.fixedCount.textContent = countStatus("fixed");
  els.closedCount.textContent = issues.filter((issue) => issue.status.startsWith("closed")).length;
}

function countStatus(status) {
  return issues.filter((issue) => issue.status === status).length;
}

function renderIssues() {
  const query = els.searchInput.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  const reporter = els.reporterFilter.value;
  const filtered = issues.filter((issue) => {
    const text = [issue.id, issue.title, issue.reporter, stripHtml(issue.descriptionHtml)].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (!status || issue.status === status) && (!reporter || issue.reporter === reporter);
  });

  els.issuesTable.innerHTML = "";
  filtered.forEach((issue) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="#">${issue.number || String(issue.id).padStart(4, "0")}</td>
      <td data-label="Title" class="title-cell"></td>
      <td data-label="Description" class="desc-cell"></td>
      <td data-label="Status"><span class="status-pill ${statusClass(issue.status)}"></span></td>
      <td data-label="Reporter"></td>
      <td data-label="Created">${formatDate(issue.createdAt)}</td>
      <td data-label="Updated">${formatDate(issue.updatedAt)}</td>
      <td data-label="Details"><button class="secondary-button" type="button" data-edit="${issue.id}">View</button></td>
    `;
    row.children[1].textContent = issue.title;
    row.children[2].textContent = previewText(issue.descriptionHtml, issue.media);
    row.children[3].querySelector("span").textContent = titleCase(issue.status);
    row.children[4].textContent = issue.reporter || "-";
    els.issuesTable.appendChild(row);
  });

  els.emptyState.hidden = filtered.length > 0;
  els.issuesTable.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openIssueDialog(Number(button.dataset.edit)));
  });
}

function syncOptions() {
  const statuses = [...new Set([...defaultStatuses, ...issues.map((issue) => issue.status).filter(Boolean)])];
  const reporters = sortedReporters();
  fillSelect(els.statusFilter, [["", "All statuses"], ...statuses.map((status) => [status, titleCase(status)])], els.statusFilter.value);
  fillSelect(els.issueStatus, statuses.map((status) => [status, titleCase(status)]), els.issueStatus.value || "open");
  fillSelect(els.reporterFilter, [["", "All names"], ...reporters.map((name) => [name, name])], els.reporterFilter.value);
  fillSelect(els.reporterName, [...reporters.map((name) => [name, name]), ["__new__", "New reporter"]], els.reporterName.value);
}

function fillSelect(select, options, currentValue) {
  select.innerHTML = "";
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  if (options.some(([value]) => value === currentValue)) select.value = currentValue;
}

function resetFilters() {
  els.searchInput.value = "";
  els.statusFilter.value = "";
  els.reporterFilter.value = "";
  renderIssues();
}

async function openIssueDialog(id = null) {
  editingId = id;
  const issue = issues.find((item) => item.id === editingId);
  if (issue) {
    draftIssueId = issue.id;
  } else {
    const data = await apiJson("/api/issues/next-id");
    draftIssueId = data.id;
  }

  els.dialogTitle.textContent = issue ? `Issue #${issue.number || issue.id}` : `Create Issue #${String(draftIssueId).padStart(4, "0")}`;
  els.issueTitle.value = issue?.title || "";
  syncOptions();
  els.reporterName.value = issue?.reporter || defaultReporters[0];
  els.newReporterName.value = "";
  els.issueStatus.value = issue?.status || "open";
  els.issueDescription.innerHTML = repairMediaHtml(issue?.descriptionHtml || "");
  els.deleteIssue.hidden = !issue;
  els.formError.textContent = "";
  els.storageHint.textContent = `Images and videos will be written to media/issue-${String(draftIssueId).padStart(4, "0")}/`;
  toggleNewReporter();
  els.issueDialog.showModal();
  setTimeout(() => els.issueTitle.focus(), 0);
}

function closeIssueDialog() {
  els.issueDialog.close();
  editingId = null;
  draftIssueId = null;
  savedRange = null;
}

async function saveIssue(event) {
  event.preventDefault();
  const title = els.issueTitle.value.trim();
  const reporter = resolveReporter();
  const status = els.issueStatus.value;
  const descriptionHtml = sanitizeEditorHtml(els.issueDescription.innerHTML);
  const media = collectMedia();

  if (!title) return showError("Title is required.");
  if (!reporter) return showError("Reporter is required.");
  if (!stripHtml(descriptionHtml) && !media.length) return showError("Description or media is required.");

  const payload = { id: draftIssueId || editingId, title, reporter, status, descriptionHtml, media };
  const result = await apiJson("/api/issues", { method: "POST", body: payload });
  const saved = result.issue;
  const existingIndex = issues.findIndex((issue) => issue.id === saved.id);
  if (existingIndex >= 0) {
    issues[existingIndex] = saved;
  } else {
    issues.unshift(saved);
  }
  closeIssueDialog();
  render();
}

async function deleteCurrentIssue() {
  if (!editingId) return;
  if (!confirm(`Delete issue #${String(editingId).padStart(4, "0")} and its media folder?`)) return;
  await apiJson(`/api/issues/${editingId}`, { method: "DELETE" });
  issues = issues.filter((issue) => issue.id !== editingId);
  closeIssueDialog();
  render();
}

function showError(message) {
  els.formError.textContent = message;
}

function resolveReporter() {
  return els.reporterName.value === "__new__" ? normalizeName(els.newReporterName.value) : els.reporterName.value;
}

function toggleNewReporter() {
  const isNew = els.reporterName.value === "__new__";
  els.newReporterField.hidden = !isNew;
  if (isNew) els.newReporterName.focus();
}

function sortedReporters() {
  return [...new Set([...defaultReporters, ...issues.map((issue) => issue.reporter).filter(Boolean)])].sort((a, b) =>
    a.localeCompare(b),
  );
}

async function handleUpload(event) {
  await insertFiles([...event.target.files]);
  event.target.value = "";
}

async function handlePaste(event) {
  const files = [...event.clipboardData.files].filter(isSupportedMedia);
  if (!files.length) return;
  event.preventDefault();
  await insertFiles(files);
}

async function handleDrop(event) {
  const files = [...event.dataTransfer.files].filter(isSupportedMedia);
  if (!files.length) return;
  event.preventDefault();
  saveSelectionFromPoint(event.clientX, event.clientY);
  await insertFiles(files);
}

async function insertFiles(files) {
  const mediaFiles = files.filter(isSupportedMedia);
  if (!mediaFiles.length) return;
  restoreSelection();
  for (const file of mediaFiles) {
    const asset = await uploadMedia(file, file.name, normalizeMediaType(file.type, file.name));
    insertMedia(asset.url, asset.type, asset.name, asset.path);
  }
  saveSelection();
}

async function uploadMedia(blob, name, type) {
  if (!draftIssueId && !editingId) throw new Error("Open an issue before adding media.");
  const form = new FormData();
  form.append("issueId", String(draftIssueId || editingId));
  form.append("name", name);
  form.append("type", type);
  form.append("file", blob, name);
  return apiJson("/api/media", { method: "POST", body: form, isForm: true });
}

function insertMedia(src, mimeType, name = "media", path = "") {
  restoreSelection();
  const safeType = normalizeMediaType(mimeType, name);
  const wrapper = document.createElement("figure");
  wrapper.className = "media-embed";
  wrapper.contentEditable = "false";
  const node = safeType.startsWith("video/") ? document.createElement("video") : document.createElement("img");
  node.dataset.name = name;
  node.dataset.type = safeType;
  node.dataset.path = path;
  if (node.tagName === "VIDEO") {
    node.controls = true;
    node.playsInline = true;
    node.preload = "metadata";
    const source = document.createElement("source");
    source.src = src;
    source.type = safeType;
    node.appendChild(source);
  } else {
    node.src = src;
    node.alt = name;
  }
  wrapper.appendChild(node);
  insertNodeAtCursor(wrapper);
  insertNodeAtCursor(document.createElement("br"));
}

function collectMedia() {
  return [...els.issueDescription.querySelectorAll("img, video")].map((node) => {
    const source = node.querySelector("source");
    return {
      name: node.dataset.name || node.getAttribute("alt") || "media",
      type: node.dataset.type || source?.type || "",
      path: node.dataset.path || "",
      url: source?.src || node.src || "",
    };
  });
}

function insertNodeAtCursor(node) {
  restoreSelection();
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
  savedRange = range.cloneRange();
}

function saveSelection() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (els.issueDescription.contains(range.commonAncestorContainer)) savedRange = range.cloneRange();
}

function restoreSelection() {
  els.issueDescription.focus();
  if (!savedRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
}

function saveSelectionFromPoint(x, y) {
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
  }
  if (range && els.issueDescription.contains(range.commonAncestorContainer)) savedRange = range;
}

async function openCameraDialog() {
  saveSelection();
  if (!navigator.mediaDevices?.getUserMedia) {
    showError("Camera access is unavailable in this browser. Use upload or paste instead.");
    return;
  }
  try {
    resetRecordingUi();
    els.cameraDialog.showModal();
    await startCameraStream();
    resetRecordingUi();
  } catch {
    if (els.cameraDialog.open) els.cameraDialog.close();
    showError("Camera access is unavailable. Use upload or paste instead.");
  }
}

function closeCameraDialog() {
  stopRecording(false);
  stopCameraStream();
  els.cameraPreview.srcObject = null;
  resetRecordingUi();
  els.cameraDialog.close();
}

async function startCameraStream() {
  stopCameraStream();
  const constraints = cameraConstraints();
  cameraStream = await navigator.mediaDevices.getUserMedia(constraints).catch((error) => {
    if (!constraints.audio) throw error;
    return navigator.mediaDevices.getUserMedia({ ...constraints, audio: false });
  });
  els.cameraPreview.srcObject = cameraStream;
  await els.cameraPreview.play();
  await refreshVideoInputs();
  syncCameraSwitchUi();
}

function stopCameraStream() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
}

function cameraConstraints() {
  const video = selectedVideoDeviceId
    ? { deviceId: { exact: selectedVideoDeviceId } }
    : { facingMode: { ideal: preferredFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } };
  return { video, audio: { echoCancellation: true, noiseSuppression: true } };
}

async function refreshVideoInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  videoInputDevices = devices.filter((device) => device.kind === "videoinput");
  const activeTrack = cameraStream?.getVideoTracks()[0];
  const activeDeviceId = activeTrack?.getSettings?.().deviceId;
  if (activeDeviceId) selectedVideoDeviceId = activeDeviceId;
}

async function switchCamera() {
  if (!cameraStream || mediaRecorder) return;
  const activeTrack = cameraStream.getVideoTracks()[0];
  const activeDeviceId = activeTrack?.getSettings?.().deviceId || selectedVideoDeviceId;

  if (videoInputDevices.length > 1 && activeDeviceId) {
    const activeIndex = videoInputDevices.findIndex((device) => device.deviceId === activeDeviceId);
    const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % videoInputDevices.length : 0;
    selectedVideoDeviceId = videoInputDevices[nextIndex].deviceId;
  } else {
    selectedVideoDeviceId = "";
    preferredFacingMode = preferredFacingMode === "environment" ? "user" : "environment";
  }

  els.switchCamera.disabled = true;
  try {
    await startCameraStream();
  } catch {
    selectedVideoDeviceId = "";
    preferredFacingMode = preferredFacingMode === "environment" ? "user" : "environment";
    await startCameraStream();
  } finally {
    syncCameraSwitchUi();
  }
}

function syncCameraSwitchUi() {
  const canSwitch = videoInputDevices.length > 1 || !selectedVideoDeviceId;
  els.switchCamera.disabled = !canSwitch || !!mediaRecorder;
  const facingLabel = preferredFacingMode === "environment" ? "Front Camera" : "Back Camera";
  els.switchCamera.textContent = videoInputDevices.length > 1 ? "Switch Camera" : `Use ${facingLabel}`;
}

function capturePhoto() {
  if (!cameraStream) return;
  const canvas = document.createElement("canvas");
  const video = els.cameraPreview;
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const name = timestampedName("photo", "png");
    const asset = await uploadMedia(blob, name, "image/png");
    insertMedia(asset.url, asset.type, asset.name, asset.path);
    closeCameraDialog();
  }, "image/png");
}

function toggleRecording() {
  if (mediaRecorder?.state === "recording" || mediaRecorder?.state === "paused") {
    stopRecording(true);
    return;
  }
  if (!cameraStream) return;
  recordedChunks = [];
  shouldSaveRecording = true;
  const mimeType = supportedRecorderType();
  mediaRecorder = new MediaRecorder(cameraStream, mimeType ? { mimeType } : undefined);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", async () => {
    if (!shouldSaveRecording || !recordedChunks.length) return;
    const blobType = normalizeMediaType(mediaRecorder.mimeType || recordedChunks[0].type || "video/webm", "camera-video.webm");
    const blob = new Blob(recordedChunks, { type: blobType });
    const name = timestampedName("video", "webm");
    const asset = await uploadMedia(blob, name, blobType);
    insertMedia(asset.url, asset.type, asset.name, asset.path);
    closeCameraDialog();
  });
  mediaRecorder.start();
  recordingStartedAt = Date.now();
  pausedDurationMs = 0;
  pauseStartedAt = 0;
  applyRecordingUi("recording");
}

function stopRecording(shouldSave) {
  if (mediaRecorder?.state === "recording" || mediaRecorder?.state === "paused") {
    shouldSaveRecording = shouldSave;
    mediaRecorder.stop();
  }
  if (!shouldSave) resetRecordingUi();
}

function togglePauseRecording() {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    pauseStartedAt = Date.now();
    applyRecordingUi("paused");
  } else if (mediaRecorder.state === "paused") {
    pausedDurationMs += Date.now() - pauseStartedAt;
    pauseStartedAt = 0;
    mediaRecorder.resume();
    applyRecordingUi("recording");
  }
}

function applyRecordingUi(state) {
  clearInterval(timerId);
  els.recordingStatus.classList.toggle("active", state === "recording");
  els.recordingLabel.textContent = state === "paused" ? "Paused" : "Recording";
  els.recordVideo.textContent = state === "paused" ? "Finish Video" : "Stop and Insert Video";
  els.pauseVideo.textContent = state === "paused" ? "Resume" : "Pause";
  els.pauseVideo.disabled = false;
  els.capturePhoto.disabled = true;
  els.switchCamera.disabled = true;
  updateTimer();
  timerId = setInterval(updateTimer, 500);
}

function resetRecordingUi() {
  clearInterval(timerId);
  timerId = null;
  mediaRecorder = null;
  recordedChunks = [];
  shouldSaveRecording = false;
  recordingStartedAt = 0;
  pausedDurationMs = 0;
  pauseStartedAt = 0;
  els.recordingStatus.classList.remove("active");
  els.recordingLabel.textContent = "Ready";
  els.recordingTimer.textContent = "00:00";
  els.recordVideo.textContent = "Record Video";
  els.pauseVideo.textContent = "Pause";
  els.pauseVideo.disabled = true;
  els.capturePhoto.disabled = false;
  syncCameraSwitchUi();
}

function updateTimer() {
  if (!recordingStartedAt) {
    els.recordingTimer.textContent = "00:00";
    return;
  }
  const pausedNow = pauseStartedAt ? Date.now() - pauseStartedAt : 0;
  const elapsed = Date.now() - recordingStartedAt - pausedDurationMs - pausedNow;
  els.recordingTimer.textContent = formatDuration(Math.max(0, elapsed));
}

function supportedRecorderType() {
  const types = ["video/webm", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function isSupportedMedia(file) {
  return file?.type?.startsWith("image/") || file?.type?.startsWith("video/");
}

function sanitizeEditorHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style, iframe, object, embed").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const allowed = ["src", "type", "alt", "controls", "playsinline", "preload", "data-name", "data-type", "data-path", "class", "contenteditable"];
      if (attr.name.startsWith("on") || !allowed.includes(attr.name)) node.removeAttribute(attr.name);
    });
  });
  return template.innerHTML.trim();
}

function repairMediaHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
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

async function apiJson(path, options = {}) {
  const init = { method: options.method || "GET" };
  if (options.body) {
    if (options.isForm) {
      init.body = options.body;
    } else {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(options.body);
    }
  }
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.textContent.trim();
}

function previewText(html, media = []) {
  const text = stripHtml(html);
  if (text) return text.slice(0, 180) + (text.length > 180 ? "..." : "");
  return media.length ? `${media.length} media file${media.length === 1 ? "" : "s"}` : "No description";
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function statusClass(status) {
  return `status-${String(status || "open").replace(/\s+/g, "-")}`;
}

function formatDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function normalizeMediaType(type = "", name = "") {
  const cleanType = type.toLowerCase().split(";")[0].trim();
  if (cleanType.startsWith("video/") || cleanType.startsWith("image/")) return cleanType;
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".mp4")) return "video/mp4";
  if (lowerName.endsWith(".mov")) return "video/quicktime";
  if (lowerName.endsWith(".webm")) return "video/webm";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function timestampedName(prefix, extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.${extension}`;
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
