const STORAGE_KEY = "reporter.issues.v1";
const STATUSES_KEY = "reporter.statuses.v1";
const REPORTERS_KEY = "reporter.reporters.v1";
const CLOUD_STORAGE_KEY = "reporter.cloudStorage.v1";
const DRIVE_FOLDERS_KEY = "reporter.driveFolders.v1";
const DB_NAME = "reporter-db";
const DB_VERSION = 1;
const DB_STORE = "state";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const API_BASE = "";

const defaultStatuses = ["open", "fixed", "closed but not fixed", "not doing"];
const defaultReporters = ["Habib"];
const defaultCloudStorage = {
  provider: "local",
  megaEmail: "",
  megaPassword: "",
  megaFolder: "/Reporter Assets",
  driveClientId: "",
  driveFolderId: "",
};
const storage = {
  async loadIssues() {
    try {
      const saved = await idbGet(STORAGE_KEY);
      if (Array.isArray(saved) && saved.length) return saved;
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seedIssues();
    } catch {
      return seedIssues();
    }
  },
  async saveIssues(issues) {
    try {
      await idbSet(STORAGE_KEY, issues);
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
        return true;
      } catch {
        return false;
      }
    }
  },
  loadStatuses() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATUSES_KEY));
      return Array.isArray(saved) && saved.length ? saved : defaultStatuses;
    } catch {
      return defaultStatuses;
    }
  },
  saveStatuses(statuses) {
    localStorage.setItem(STATUSES_KEY, JSON.stringify([...new Set(statuses)]));
  },
  loadReporters() {
    try {
      const saved = JSON.parse(localStorage.getItem(REPORTERS_KEY));
      return Array.isArray(saved) && saved.length ? saved : defaultReporters;
    } catch {
      return defaultReporters;
    }
  },
  saveReporters(reporters) {
    localStorage.setItem(REPORTERS_KEY, JSON.stringify([...new Set(reporters)]));
  },
  loadCloudStorage() {
    try {
      return { ...defaultCloudStorage, ...JSON.parse(localStorage.getItem(CLOUD_STORAGE_KEY)) };
    } catch {
      return { ...defaultCloudStorage };
    }
  },
  saveCloudStorage(config) {
    localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(config));
  },
  loadDriveFolders() {
    try {
      return JSON.parse(localStorage.getItem(DRIVE_FOLDERS_KEY)) || {};
    } catch {
      return {};
    }
  },
  saveDriveFolders(folders) {
    localStorage.setItem(DRIVE_FOLDERS_KEY, JSON.stringify(folders));
  },
};

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
  capturePhoto: document.querySelector("#capturePhoto"),
  pauseVideo: document.querySelector("#pauseVideo"),
  recordVideo: document.querySelector("#recordVideo"),
  recordingStatus: document.querySelector("#recordingStatus"),
  recordingLabel: document.querySelector("#recordingLabel"),
  recordingTimer: document.querySelector("#recordingTimer"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsGateForm: document.querySelector("#settingsGateForm"),
  settingsGate: document.querySelector("#settingsGate"),
  settingsHint: document.querySelector("#settingsHint"),
  settingsPassword: document.querySelector("#settingsPassword"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsSection: document.querySelector("#settingsSection"),
  closeSettingsDialog: document.querySelector("#closeSettingsDialog"),
  closeSettingsPanel: document.querySelector("#closeSettingsPanel"),
  reporterForm: document.querySelector("#reporterForm"),
  settingsReporterName: document.querySelector("#settingsReporterName"),
  settingsReporterList: document.querySelector("#settingsReporterList"),
  statusForm: document.querySelector("#statusForm"),
  newStatus: document.querySelector("#newStatus"),
  statusList: document.querySelector("#statusList"),
  storageForm: document.querySelector("#storageForm"),
  storageProvider: document.querySelector("#storageProvider"),
  megaEmail: document.querySelector("#megaEmail"),
  megaPassword: document.querySelector("#megaPassword"),
  megaFolder: document.querySelector("#megaFolder"),
  driveClientId: document.querySelector("#driveClientId"),
  driveFolderId: document.querySelector("#driveFolderId"),
  connectDrive: document.querySelector("#connectDrive"),
  testDriveUpload: document.querySelector("#testDriveUpload"),
  syncDriveIssues: document.querySelector("#syncDriveIssues"),
  driveStatus: document.querySelector("#driveStatus"),
  driveSyncStatus: document.querySelector("#driveSyncStatus"),
  storageSavedText: document.querySelector("#storageSavedText"),
};

let issues = [];
let statuses = storage.loadStatuses();
let reporters = storage.loadReporters();
let cloudStorage = storage.loadCloudStorage();
let driveFolders = storage.loadDriveFolders();
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
let driveToken = "";
let driveTokenExpiresAt = 0;
let driveTokenClient = null;
let driveTokenRequest = null;

function seedIssues() {
  const now = new Date().toISOString();
  return [
    {
      id: 1,
      title: "Example: image stays beside the related step",
      reporter: "Habib",
      status: "open",
      description:
        "<ol><li>Open the page.</li><li>Click the create button.</li><li>Paste screenshots directly under the step they prove.</li></ol>",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function init() {
  issues = await storage.loadIssues();
  await hydrateFromServer();
  syncStatusOptions();
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
  document.querySelector('[data-view="settings"]').addEventListener("click", openSettingsDialog);
  els.closeSettingsDialog.addEventListener("click", () => els.settingsDialog.close());
  els.closeSettingsPanel.addEventListener("click", () => els.settingsDialog.close());
  els.settingsSection.addEventListener("change", renderSettingsSection);
  els.settingsGateForm.addEventListener("submit", unlockSettings);
  els.reporterForm.addEventListener("submit", addReporter);
  els.statusForm.addEventListener("submit", addStatus);
  els.storageProvider.addEventListener("change", toggleStorageFields);
  els.storageForm.addEventListener("submit", saveStorageSettings);
  els.connectDrive.addEventListener("click", connectGoogleDrive);
  els.testDriveUpload.addEventListener("click", testGoogleDriveUpload);
  els.syncDriveIssues.addEventListener("click", syncIssuesFromDrive);
}

function render() {
  syncStatusOptions();
  renderStorageSettings();
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
    const text = [issue.id, issue.title, issue.reporter, stripHtml(issue.description)].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (!status || issue.status === status) && (!reporter || issue.reporter === reporter);
  });

  els.issuesTable.innerHTML = "";
  filtered.forEach((issue) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="#">${issue.id}</td>
      <td data-label="Title" class="title-cell"></td>
      <td data-label="Description" class="desc-cell"></td>
      <td data-label="Status"><span class="status-pill ${statusClass(issue.status)}"></span></td>
      <td data-label="Reporter"></td>
      <td data-label="Created">${formatDate(issue.createdAt)}</td>
      <td data-label="Updated">${formatDate(issue.updatedAt)}</td>
      <td data-label="Details"><button class="secondary-button" type="button" data-edit="${issue.id}">View</button></td>
    `;
    row.children[1].textContent = issue.title;
    row.children[2].textContent = previewText(issue.description);
    row.children[3].querySelector("span").textContent = titleCase(issue.status);
    row.children[4].textContent = issue.reporter || "-";
    els.issuesTable.appendChild(row);
  });

  els.emptyState.hidden = filtered.length > 0;
  els.issuesTable.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openIssueDialog(Number(button.dataset.edit)));
  });
}

function syncStatusOptions() {
  const selectedFilter = els.statusFilter.value;
  const selectedIssue = els.issueStatus.value;
  fillSelect(els.statusFilter, [["", "All statuses"], ...statuses.map((status) => [status, titleCase(status)])], selectedFilter);
  fillSelect(els.issueStatus, statuses.map((status) => [status, titleCase(status)]), selectedIssue || "open");

  const allReporters = sortedReporters();
  fillSelect(els.reporterFilter, [["", "All names"], ...allReporters.map((name) => [name, name])], els.reporterFilter.value);
  fillSelect(els.reporterName, [...allReporters.map((name) => [name, name]), ["__new__", "New reporter"]], els.reporterName.value);
}

function fillSelect(select, options, currentValue) {
  select.innerHTML = "";
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  if (options.some(([value]) => value === currentValue)) {
    select.value = currentValue;
  }
}

function resetFilters() {
  els.searchInput.value = "";
  els.statusFilter.value = "";
  els.reporterFilter.value = "";
  renderIssues();
}

function openIssueDialog(id) {
  editingId = id || null;
  draftIssueId = editingId || nextIssueId();
  const issue = issues.find((item) => item.id === editingId);
  els.dialogTitle.textContent = issue ? `Issue #${issue.id}` : "Create Issue";
  els.issueTitle.value = issue?.title || "";
  ensureReporter(issue?.reporter || reporters[0] || "");
  syncStatusOptions();
  els.reporterName.value = issue?.reporter || reporters[0] || "__new__";
  els.newReporterName.value = "";
  els.issueStatus.value = issue?.status || "open";
  els.issueDescription.innerHTML = repairMediaHtml(issue?.description || "");
  els.deleteIssue.hidden = !issue;
  els.formError.textContent = "";
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
  const description = sanitizeEditorHtml(els.issueDescription.innerHTML);
  const status = els.issueStatus.value;

  if (!title) {
    els.formError.textContent = "Title is required.";
    els.issueTitle.focus();
    return;
  }

  if (!stripHtml(description) && !description.includes("<img") && !description.includes("<video")) {
    els.formError.textContent = "Description or media is required.";
    els.issueDescription.focus();
    return;
  }

  if (!status) {
    els.formError.textContent = "Status is required.";
    return;
  }
  if (!reporter) {
    els.formError.textContent = "Reporter is required.";
    return;
  }
  if (!reporters.includes(reporter)) {
    reporters.push(reporter);
    storage.saveReporters(reporters);
  }

  const now = new Date().toISOString();
  let savedIssue = null;
  if (editingId) {
    issues = issues.map((issue) =>
      issue.id === editingId ? { ...issue, title, reporter, status, description, updatedAt: now } : issue,
    );
    savedIssue = issues.find((issue) => issue.id === editingId);
  } else {
    savedIssue = {
      id: draftIssueId || nextIssueId(),
      title,
      reporter,
      status,
      description,
      createdAt: now,
      updatedAt: now,
    };
    issues.unshift(savedIssue);
  }

  const saved = await storage.saveIssues(issues);
  if (!saved) {
    els.formError.textContent = "Could not save. The browser storage quota may be full.";
    return;
  }
  await saveIssuesToServer();
  syncIssueToDrive(savedIssue);
  closeIssueDialog();
  render();
}

async function deleteCurrentIssue() {
  if (!editingId) return;
  const ok = confirm(`Delete issue #${editingId}?`);
  if (!ok) return;
  issues = issues.filter((issue) => issue.id !== editingId);
  await storage.saveIssues(issues);
  await saveIssuesToServer();
  closeIssueDialog();
  render();
}

function openSettingsDialog() {
  els.settingsPanel.hidden = true;
  els.settingsGate.hidden = false;
  els.settingsHint.hidden = false;
  els.settingsPassword.value = "";
  els.settingsDialog.showModal();
  setTimeout(() => els.settingsPassword.focus(), 0);
}

function unlockSettings(event) {
  event.preventDefault();
  if (els.settingsPassword.value !== "admin") {
    els.settingsHint.textContent = "Wrong password. Prototype password: admin";
    return;
  }
  els.settingsGate.hidden = true;
  els.settingsHint.hidden = true;
  els.settingsPanel.hidden = false;
  renderSettingsLists();
}

function renderSettingsLists() {
  renderSettingsSection();
  renderReporterList();
  renderStatusList();
  renderStorageSettings();
}

function renderSettingsSection() {
  const selected = els.settingsSection.value || "storage";
  document.querySelectorAll("[data-settings-section]").forEach((section) => {
    section.hidden = section.dataset.settingsSection !== selected;
  });
}

function renderStatusList() {
  els.statusList.innerHTML = "";
  statuses.forEach((status) => {
    const used = issues.some((issue) => issue.status === status);
    const row = document.createElement("div");
    row.className = "status-row";
    row.innerHTML = `
      <span class="status-pill ${statusClass(status)}"></span>
      <button class="ghost-button" type="button" ${used ? "disabled" : ""}>Delete</button>
    `;
    row.querySelector("span").textContent = titleCase(status);
    row.querySelector("button").addEventListener("click", () => removeStatus(status));
    els.statusList.appendChild(row);
  });
}

function renderReporterList() {
  els.settingsReporterList.innerHTML = "";
  sortedReporters().forEach((reporter) => {
    const used = issues.some((issue) => issue.reporter === reporter);
    const row = document.createElement("div");
    row.className = "status-row";
    row.innerHTML = `
      <span></span>
      <button class="ghost-button" type="button" ${used ? "disabled" : ""}>Delete</button>
    `;
    row.querySelector("span").textContent = reporter;
    row.querySelector("button").addEventListener("click", () => removeReporter(reporter));
    els.settingsReporterList.appendChild(row);
  });
}

function addReporter(event) {
  event.preventDefault();
  const reporter = normalizeName(els.settingsReporterName.value);
  if (!reporter || reporters.includes(reporter)) {
    els.settingsReporterName.value = "";
    return;
  }
  reporters.push(reporter);
  storage.saveReporters(reporters);
  saveNamedListToServer("reporters", reporters);
  els.settingsReporterName.value = "";
  syncStatusOptions();
  renderReporterList();
}

function addStatus(event) {
  event.preventDefault();
  const status = normalizeStatus(els.newStatus.value);
  if (!status || statuses.includes(status)) {
    els.newStatus.value = "";
    return;
  }
  statuses.push(status);
  storage.saveStatuses(statuses);
  saveNamedListToServer("statuses", statuses);
  els.newStatus.value = "";
  syncStatusOptions();
  renderStatusList();
}

function removeStatus(status) {
  if (issues.some((issue) => issue.status === status)) return;
  statuses = statuses.filter((item) => item !== status);
  storage.saveStatuses(statuses);
  saveNamedListToServer("statuses", statuses);
  syncStatusOptions();
  renderStatusList();
}

function removeReporter(reporter) {
  if (issues.some((issue) => issue.reporter === reporter)) return;
  reporters = reporters.filter((item) => item !== reporter);
  storage.saveReporters(reporters);
  saveNamedListToServer("reporters", reporters);
  syncStatusOptions();
  renderReporterList();
}

function resolveReporter() {
  if (els.reporterName.value === "__new__") {
    return normalizeName(els.newReporterName.value);
  }
  return els.reporterName.value;
}

function toggleNewReporter() {
  const isNew = els.reporterName.value === "__new__";
  els.newReporterField.hidden = !isNew;
  if (isNew) els.newReporterName.focus();
}

function sortedReporters() {
  const fromIssues = issues.map((issue) => issue.reporter).filter(Boolean);
  return [...new Set([...reporters, ...fromIssues])].sort((a, b) => a.localeCompare(b));
}

function ensureReporter(reporter) {
  if (!reporter || reporters.includes(reporter)) return;
  reporters.push(reporter);
  storage.saveReporters(reporters);
}

function renderStorageSettings() {
  els.storageProvider.value = cloudStorage.provider || "local";
  els.megaEmail.value = cloudStorage.megaEmail || "";
  els.megaPassword.value = cloudStorage.megaPassword || "";
  els.megaFolder.value = cloudStorage.megaFolder || "/Reporter Assets";
  els.driveClientId.value = cloudStorage.driveClientId || "";
  els.driveFolderId.value = cloudStorage.driveFolderId || "";
  els.storageHint.textContent = storageHintText();
  updateDriveStatus();
  toggleStorageFields();
}

function toggleStorageFields() {
  const provider = els.storageProvider.value;
  document.querySelectorAll(".mega-field").forEach((field) => {
    field.hidden = provider !== "mega";
  });
  document.querySelectorAll(".gdrive-field").forEach((field) => {
    field.hidden = provider !== "gdrive";
  });
}

function saveStorageSettings(event) {
  event.preventDefault();
  cloudStorage = {
    provider: els.storageProvider.value,
    megaEmail: els.megaEmail.value.trim(),
    megaPassword: els.megaPassword.value,
    megaFolder: els.megaFolder.value.trim() || "/Reporter Assets",
    driveClientId: els.driveClientId.value.trim(),
    driveFolderId: els.driveFolderId.value.trim(),
  };
  storage.saveCloudStorage(cloudStorage);
  saveCloudStorageToServer();
  if (cloudStorage.provider !== "gdrive") {
    driveToken = "";
    driveTokenExpiresAt = 0;
  }
  renderStorageSettings();
  els.storageSavedText.textContent = "Saved";
  setTimeout(() => {
    els.storageSavedText.textContent = "";
  }, 1800);
}

function nextIssueId() {
  return issues.reduce((max, issue) => Math.max(max, issue.id), 0) + 1;
}

function saveSelection() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (els.issueDescription.contains(range.commonAncestorContainer)) {
    savedRange = range.cloneRange();
  }
}

function restoreSelection() {
  els.issueDescription.focus();
  if (!savedRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
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
    const src = await readFileAsDataUrl(file);
    const type = normalizeMediaType(file.type, file.name);
    const node = insertMedia(src, type, file.name, { provider: cloudStorage.provider });
    uploadAssetInBackground(file, file.name, type, node);
  }
  saveSelection();
}

function insertMedia(src, mimeType, name = "media", asset = null) {
  restoreSelection();
  const safeType = normalizeMediaType(mimeType, name);
  const wrapper = document.createElement("figure");
  wrapper.className = "media-embed";
  wrapper.contentEditable = "false";
  const node = safeType.startsWith("video/") ? document.createElement("video") : document.createElement("img");
  const safeSrc = normalizeDataUrlMime(src, safeType);
  node.dataset.name = name;
  node.dataset.type = safeType;
  if (asset?.provider) node.dataset.storageProvider = asset.provider;
  if (asset?.id) node.dataset.driveId = asset.id;
  if (asset?.webViewLink) node.dataset.driveLink = asset.webViewLink;
  if (node.tagName === "VIDEO") {
    node.controls = true;
    node.playsInline = true;
    node.preload = "metadata";
    const source = document.createElement("source");
    source.src = safeSrc;
    source.type = safeType;
    node.appendChild(source);
  } else {
    node.src = safeSrc;
    node.alt = name;
  }
  wrapper.appendChild(node);
  if (cloudStorage.provider === "gdrive") {
    const status = document.createElement("figcaption");
    status.className = "upload-status pending";
    status.textContent = "Waiting to upload to Drive...";
    wrapper.appendChild(status);
  }
  insertNodeAtCursor(wrapper);
  insertNodeAtCursor(document.createElement("br"));
  return wrapper;
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

function saveSelectionFromPoint(x, y) {
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
  }
  if (range && els.issueDescription.contains(range.commonAncestorContainer)) {
    savedRange = range;
  }
}

async function openCameraDialog() {
  saveSelection();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    els.cameraPreview.srcObject = cameraStream;
    await els.cameraPreview.play();
    resetRecordingUi();
    els.cameraDialog.showModal();
  } catch (error) {
    els.formError.textContent = "Camera access is unavailable. Use upload or paste instead.";
  }
}

function closeCameraDialog() {
  stopRecording(false);
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  els.cameraPreview.srcObject = null;
  resetRecordingUi();
  els.cameraDialog.close();
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
    const src = canvas.toDataURL("image/png");
    const node = insertMedia(src, "image/png", name, { provider: cloudStorage.provider });
    uploadAssetInBackground(blob, name, "image/png", node);
    closeCameraDialog();
  }, "image/png");
}

function toggleRecording() {
  if (mediaRecorder?.state === "recording") {
    stopRecording(true);
    return;
  }
  if (mediaRecorder?.state === "paused") {
    stopRecording(true);
    return;
  }
  if (!cameraStream) return;
  recordedChunks = [];
  shouldSaveRecording = true;
  const mimeType = supportedRecorderType();
  const options = mimeType ? { mimeType } : undefined;
  mediaRecorder = new MediaRecorder(cameraStream, options);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", async () => {
    if (!shouldSaveRecording || !recordedChunks.length) return;
    const blobType = normalizeMediaType(mediaRecorder.mimeType || recordedChunks[0].type || "video/webm", "camera-video.webm");
    const blob = new Blob(recordedChunks, { type: blobType });
    const src = await readFileAsDataUrl(blob);
    const name = timestampedName("video", "webm");
    const node = insertMedia(src, blobType, name, { provider: cloudStorage.provider });
    uploadAssetInBackground(blob, name, blobType, node);
    closeCameraDialog();
  });
  mediaRecorder.start();
  recordingStartedAt = Date.now();
  pausedDurationMs = 0;
  pauseStartedAt = 0;
  applyRecordingUi("recording");
}

function stopRecording(shouldSave) {
  if (mediaRecorder?.state === "recording") {
    shouldSaveRecording = shouldSave;
    mediaRecorder.stop();
  } else if (mediaRecorder?.state === "paused") {
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
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
      const allowed = [
        "src",
        "type",
        "alt",
        "controls",
        "playsinline",
        "preload",
        "data-name",
        "data-type",
        "data-storage-provider",
        "data-drive-id",
        "data-drive-link",
        "class",
        "contenteditable",
      ];
      if (attr.name.startsWith("on") || (!allowed.includes(attr.name) && node.tagName !== "A")) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML.trim();
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.textContent.trim();
}

function previewText(html) {
  const text = stripHtml(html);
  return text ? text.slice(0, 180) + (text.length > 180 ? "..." : "") : "Media only";
}

function normalizeStatus(status) {
  return status.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status) {
  return `status-${status.replace(/\s+/g, "-")}`;
}

function formatDate(date) {
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
  if (cleanType.startsWith("video/")) return cleanType;
  if (cleanType.startsWith("image/")) return cleanType;
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".mp4")) return "video/mp4";
  if (lowerName.endsWith(".mov")) return "video/quicktime";
  if (lowerName.endsWith(".webm")) return "video/webm";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function normalizeDataUrlMime(src, type) {
  if (typeof src !== "string" || !src.startsWith("data:")) return src;
  const base64Marker = ";base64,";
  const base64Index = src.indexOf(base64Marker);
  if (base64Index > -1) {
    return `data:${type};base64,${src.slice(base64Index + base64Marker.length)}`;
  }
  const commaIndex = src.indexOf(",");
  if (commaIndex > -1) {
    return `data:${type},${src.slice(commaIndex + 1)}`;
  }
  return src;
}

function repairMediaHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("video").forEach((video) => {
    const source = video.querySelector("source");
    const src = source?.getAttribute("src") || video.getAttribute("src");
    if (!src) return;
    const type = normalizeMediaType(source?.getAttribute("type") || video.dataset.type || "video/webm", video.dataset.name || "");
    video.removeAttribute("src");
    video.dataset.type = type;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    if (!source) {
      const newSource = document.createElement("source");
      newSource.src = normalizeDataUrlMime(src, type);
      newSource.type = type;
      video.appendChild(newSource);
    } else {
      source.src = normalizeDataUrlMime(src, type);
      source.type = type;
    }
  });
  return template.innerHTML;
}

function storageHintText() {
  if (cloudStorage.provider === "mega") {
    return `Media destination: Mega ${cloudStorage.megaFolder || "/Reporter Assets"} (upload connector not active yet).`;
  }
  if (cloudStorage.provider === "gdrive") {
    return driveToken ? "Media destination: Google Drive is connected." : "Media destination: Google Drive. Connect Drive in Settings before uploading.";
  }
  return "Media is stored locally in this browser for now.";
}

async function storeAsset(blob, name, type) {
  return storeAssetForIssue(blob, name, type, draftIssueId || editingId || nextIssueId());
}

async function storeAssetForIssue(blob, name, type, issueId) {
  if (cloudStorage.provider !== "gdrive") {
    return { provider: "local" };
  }
  const serverResult = await storeAssetOnServer(blob, name, type, issueId);
  if (serverResult?.provider === "gdrive") {
    return serverResult;
  }
  if (!cloudStorage.driveClientId) {
    els.formError.textContent = "Google Drive client ID is missing in Settings. Saved locally for now.";
    return { provider: "local" };
  }
  try {
    const token = await ensureDriveToken(false);
    const folderId = await ensureIssueDriveFolder(token, issueId);
    const result = await uploadToGoogleDrive(blob, name, type, token, folderId);
    els.formError.textContent = "";
    return { provider: "gdrive", ...result };
  } catch (error) {
    els.formError.textContent = `Drive upload failed: ${error.message}. Saved locally for now.`;
    return { provider: "local", error: error.message };
  }
}

async function storeAssetOnServer(blob, name, type, issueId) {
  try {
    const form = new FormData();
    form.append("file", blob, name);
    form.append("name", name);
    form.append("type", type);
    form.append("issueId", String(issueId));
    form.append("title", els.issueTitle.value.trim());
    const response = await fetch("/api/drive/upload", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Server upload failed (${response.status})`);
    return data;
  } catch {
    return null;
  }
}

function uploadAssetInBackground(blob, name, type, wrapper) {
  const status = wrapper?.querySelector(".upload-status");
  const media = wrapper?.querySelector("img, video");
  const issueId = draftIssueId || editingId || nextIssueId();
  if (cloudStorage.provider !== "gdrive") {
    if (status) status.remove();
    return;
  }
  setUploadStatus(status, "uploading", `Uploading ${name} to Drive...`);
  storeAssetForIssue(blob, name, type, issueId)
    .then((asset) => {
      if (asset.provider !== "gdrive") {
        setUploadStatus(status, "failed", "Drive upload failed. Kept locally.");
        persistMediaStateForIssue(issueId, wrapper);
        return;
      }
      if (media) {
        media.dataset.storageProvider = "gdrive";
        media.dataset.driveId = asset.id || "";
        media.dataset.driveLink = asset.webViewLink || "";
      }
      setUploadStatus(status, "done", "Uploaded to Drive");
      persistMediaStateForIssue(issueId, wrapper);
    })
    .catch((error) => {
      setUploadStatus(status, "failed", `Upload failed: ${error.message}`);
      persistMediaStateForIssue(issueId, wrapper);
    });
}

function setUploadStatus(status, state, text) {
  if (!status) return;
  status.className = `upload-status ${state}`;
  status.textContent = text;
}

function connectGoogleDrive() {
  cloudStorage = {
    ...cloudStorage,
    provider: els.storageProvider.value,
    driveClientId: els.driveClientId.value.trim(),
    driveFolderId: els.driveFolderId.value.trim(),
  };
  storage.saveCloudStorage(cloudStorage);
  ensureDriveToken(true)
    .then(() => {
      updateDriveStatus("Connected");
      els.storageHint.textContent = storageHintText();
    })
    .catch((error) => updateDriveStatus(error.message));
}

async function testGoogleDriveUpload() {
  try {
    cloudStorage = {
      ...cloudStorage,
      provider: "gdrive",
      driveClientId: els.driveClientId.value.trim(),
      driveFolderId: els.driveFolderId.value.trim(),
    };
    storage.saveCloudStorage(cloudStorage);
    const token = await ensureDriveToken(true);
    const file = new Blob([`Reporter Drive test ${new Date().toISOString()}`], { type: "text/plain" });
    const result = await uploadToGoogleDrive(file, timestampedName("reporter-drive-test", "txt"), "text/plain", token);
    updateDriveStatus(`Uploaded ${result.name}`);
  } catch (error) {
    updateDriveStatus(error.message);
  }
}

function syncIssueToDrive(issue) {
  if (!issue || cloudStorage.provider !== "gdrive") return;
  ensureDriveToken(false)
    .then((token) => saveIssueJsonToDrive(issue, token))
    .then(() => setDriveSyncStatus(`Saved Issue ${issue.id} text to Drive.`))
    .catch((error) => setDriveSyncStatus(`Issue text kept local: ${error.message}`));
}

async function saveIssueJsonToDrive(issue, token) {
  const folderId = await ensureIssueDriveFolder(token, issue.id);
  const payload = {
    schema: "reporter.issue.v1",
    issue,
    savedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const existing = await findDriveFile("issue.json", token, folderId, "application/json");
  if (existing) {
    return updateGoogleDriveFile(existing.id, blob, "application/json", token);
  }
  return uploadToGoogleDrive(blob, "issue.json", "application/json", token, folderId);
}

async function syncIssuesFromDrive() {
  try {
    setDriveSyncStatus("Scanning Drive issue folders...");
    const token = await ensureDriveToken(false);
    const folders = await listDriveIssueFolders(token);
    const imported = [];
    for (const folder of folders) {
      const jsonFile = await findDriveFile("issue.json", token, folder.id, "application/json");
      if (!jsonFile) continue;
      const issue = await downloadIssueJson(jsonFile.id, token);
      if (issue) imported.push(issue);
    }
    if (!imported.length) {
      setDriveSyncStatus("No issue.json files found in Drive issue folders.");
      return;
    }
    mergeImportedIssues(imported);
    await storage.saveIssues(issues);
    syncStatusOptions();
    render();
    setDriveSyncStatus(`Loaded ${imported.length} issue${imported.length === 1 ? "" : "s"} from Drive.`);
  } catch (error) {
    setDriveSyncStatus(`Drive sync failed: ${error.message}`);
  }
}

function mergeImportedIssues(imported) {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  imported.forEach((issue) => {
    byId.set(issue.id, issue);
    ensureReporter(issue.reporter);
    if (issue.status && !statuses.includes(issue.status)) statuses.push(issue.status);
  });
  issues = [...byId.values()].sort((a, b) => b.id - a.id);
  storage.saveStatuses(statuses);
  storage.saveReporters(reporters);
}

async function listDriveIssueFolders(token) {
  const parent = cloudStorage.driveFolderId ? `'${escapeDriveQuery(cloudStorage.driveFolderId)}' in parents and ` : "";
  const query = `${parent}mimeType = 'application/vnd.google-apps.folder' and name contains 'Issue ' and trashed = false`;
  const result = await driveJson(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1000`,
    token,
  );
  return result.files || [];
}

async function findDriveFile(name, token, folderId, mimeType = "") {
  const parts = [
    `'${escapeDriveQuery(folderId)}' in parents`,
    `name = '${escapeDriveQuery(name)}'`,
    "trashed = false",
  ];
  if (mimeType) parts.push(`mimeType = '${escapeDriveQuery(mimeType)}'`);
  const result = await driveJson(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(parts.join(" and "))}&fields=files(id,name,modifiedTime)&pageSize=1`,
    token,
  );
  return result.files?.[0] || null;
}

async function downloadIssueJson(fileId, token) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return normalizeImportedIssue(payload?.issue || payload);
}

function normalizeImportedIssue(issue) {
  if (!issue || !issue.id || !issue.title) return null;
  return {
    id: Number(issue.id),
    title: String(issue.title),
    reporter: issue.reporter ? String(issue.reporter) : "",
    status: issue.status ? String(issue.status) : "open",
    description: issue.description ? String(issue.description) : "",
    createdAt: issue.createdAt || new Date().toISOString(),
    updatedAt: issue.updatedAt || new Date().toISOString(),
  };
}

function setDriveSyncStatus(message) {
  if (els.driveSyncStatus) els.driveSyncStatus.textContent = message;
}

function ensureDriveToken(forcePrompt) {
  const tokenIsFresh = driveToken && Date.now() < driveTokenExpiresAt - 60000;
  if (tokenIsFresh && !forcePrompt) {
    return Promise.resolve(driveToken);
  }
  if (driveTokenRequest && !forcePrompt) {
    return driveTokenRequest;
  }
  if (!forcePrompt && driveToken) {
    driveToken = "";
    driveTokenExpiresAt = 0;
    updateDriveStatus("Reconnect Drive");
    return Promise.reject(new Error("Drive session expired. Reconnect Drive in Settings."));
  }
  if (!forcePrompt && !driveToken) {
    return Promise.reject(new Error("Connect Drive in Settings first."));
  }
  driveTokenRequest = new Promise((resolve, reject) => {
    if (!cloudStorage.driveClientId) {
      driveTokenRequest = null;
      reject(new Error("Add a Google OAuth client ID first."));
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      driveTokenRequest = null;
      reject(new Error("Google sign-in library is still loading. Try again in a moment."));
      return;
    }
    driveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cloudStorage.driveClientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        driveTokenRequest = null;
        if (response?.access_token) {
          driveToken = response.access_token;
          driveTokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
          resolve(driveToken);
        } else {
          reject(new Error(response?.error || "Drive authorization was cancelled."));
        }
      },
    });
    driveTokenClient.requestAccessToken({ prompt: forcePrompt ? "consent" : "" });
  });
  return driveTokenRequest;
}

async function ensureIssueDriveFolder(token, issueId) {
  const title = els.issueTitle.value.trim();
  const cacheKey = `${cloudStorage.driveFolderId || "root"}:${issueId}`;
  if (driveFolders[cacheKey]) return driveFolders[cacheKey];
  const folderName = `Issue ${issueId}${title ? ` - ${safeDriveName(title)}` : ""}`;
  const folder = await createGoogleDriveFolder(folderName, token, cloudStorage.driveFolderId);
  driveFolders[cacheKey] = folder.id;
  storage.saveDriveFolders(driveFolders);
  return folder.id;
}

async function persistMediaStateForIssue(issueId, wrapper) {
  const issue = issues.find((item) => item.id === issueId);
  if (!issue) return;
  const sameOpenIssue = els.issueDialog.open && (draftIssueId === issueId || editingId === issueId);
  const sameClosedDraft = !els.issueDialog.open && els.issueDescription.contains(wrapper);
  if (!sameOpenIssue && !sameClosedDraft) return;
  issue.description = sanitizeEditorHtml(els.issueDescription.innerHTML);
  issue.updatedAt = new Date().toISOString();
  await storage.saveIssues(issues);
  syncIssueToDrive(issue);
  render();
}

async function createGoogleDriveFolder(name, token, parentId = "") {
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];
  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(metadata),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error?.message || `Drive folder failed (${response.status})`);
  }
  return result;
}

async function uploadToGoogleDrive(blob, name, type, token, folderId = "") {
  const boundary = `reporter_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata = { name };
  if (folderId || cloudStorage.driveFolderId) metadata.parents = [folderId || cloudStorage.driveFolderId];
  const body = new Blob(
    [
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(metadata),
      "\r\n",
      `--${boundary}\r\n`,
      `Content-Type: ${type}\r\n\r\n`,
      blob,
      "\r\n",
      `--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error?.message || `Drive upload failed (${response.status})`);
  }
  return result;
}

async function updateGoogleDriveFile(fileId, blob, type, token) {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": type,
    },
    body: blob,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error?.message || `Drive update failed (${response.status})`);
  }
  return result;
}

async function driveJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error?.message || `Drive request failed (${response.status})`);
  }
  return result;
}

function updateDriveStatus(message = "") {
  if (!els.driveStatus) return;
  if (message) {
    els.driveStatus.textContent = message;
    return;
  }
  if (cloudStorage.provider !== "gdrive") {
    els.driveStatus.textContent = "Not connected";
  } else if (driveToken) {
    els.driveStatus.textContent = "Connected";
  } else if (cloudStorage.driveClientId) {
    els.driveStatus.textContent = "Ready to connect";
  } else {
    els.driveStatus.textContent = "Add client ID";
  }
}

function timestampedName(prefix, extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.${extension}`;
}

function safeDriveName(name) {
  return name.replace(/[\\/:*?"<>|#{}%~&]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function hydrateFromServer() {
  try {
    const data = await apiJson("/api/bootstrap");
    if (Array.isArray(data.issues) && data.issues.length) {
      issues = data.issues;
      await storage.saveIssues(issues);
    }
    if (Array.isArray(data.statuses) && data.statuses.length) {
      statuses = data.statuses;
      storage.saveStatuses(statuses);
    }
    if (Array.isArray(data.reporters) && data.reporters.length) {
      reporters = data.reporters;
      storage.saveReporters(reporters);
    }
    if (data.cloudStorage) {
      cloudStorage = { ...cloudStorage, ...data.cloudStorage };
      storage.saveCloudStorage(cloudStorage);
    }
  } catch {
    // Static file mode: keep the browser-only storage path.
  }
}

async function saveIssuesToServer() {
  try {
    await apiJson("/api/issues/bulk", { method: "POST", body: { issues } });
  } catch {
    // Local fallback remains the source when the server is not running.
  }
}

async function saveNamedListToServer(kind, items) {
  try {
    await apiJson(`/api/${kind}`, { method: "POST", body: { items } });
  } catch {
    // Server sync is optional in static mode.
  }
}

async function saveCloudStorageToServer() {
  try {
    await apiJson("/api/settings/cloud-storage", { method: "POST", body: publicCloudStorageForServer(cloudStorage) });
  } catch {
    // Protected server settings require a login; browser fallback already saved locally.
  }
}

async function apiJson(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  };
  if (options.body) init.body = JSON.stringify(options.body);
  const response = await fetch(`${API_BASE}${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function publicCloudStorageForServer(config) {
  const safe = { ...config };
  delete safe.megaPassword;
  return safe;
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

init();
