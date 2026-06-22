const defaultStatuses = ["open", "fixed", "closed but not fixed", "not doing"];
const defaultReporters = ["Habib"];
const defaultAssignees = [];
const defaultTags = [];
const routeByView = {
  issues: "/",
  settings: "/settings",
};
const viewByRoute = {
  "/": "issues",
  "/issues": "issues",
  "/settings": "settings",
};

const els = {
  navItems: document.querySelectorAll("[data-view]"),
  views: document.querySelectorAll("[data-view-panel]"),
  totalCount: document.querySelector("#totalCount"),
  openCount: document.querySelector("#openCount"),
  fixedCount: document.querySelector("#fixedCount"),
  closedCount: document.querySelector("#closedCount"),
  searchInput: document.querySelector("#searchInput"),
  issuesTable: document.querySelector("#issuesTable"),
  emptyState: document.querySelector("#emptyState"),
  openCreateIssue: document.querySelector("#openCreateIssue"),
  reporterSettingsList: document.querySelector("#reporterSettingsList"),
  assigneeSettingsList: document.querySelector("#assigneeSettingsList"),
  tagSettingsList: document.querySelector("#tagSettingsList"),
  statusSettingsList: document.querySelector("#statusSettingsList"),
  settingForms: document.querySelectorAll("[data-setting-form]"),
  newTagColor: document.querySelector("#newTagColor"),
  issueDialog: document.querySelector("#issueDialog"),
  issueForm: document.querySelector("#issueForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  issueTitle: document.querySelector("#issueTitle"),
  reporterName: document.querySelector("#reporterName"),
  assignedTo: document.querySelector("#assignedTo"),
  newReporterField: document.querySelector("#newReporterField"),
  newReporterName: document.querySelector("#newReporterName"),
  issueStatus: document.querySelector("#issueStatus"),
  issueTagPicker: document.querySelector("#issueTagPicker"),
  issueDescription: document.querySelector("#issueDescription"),
  storageHint: document.querySelector("#storageHint"),
  uploadStatus: document.querySelector("#uploadStatus"),
  mediaUpload: document.querySelector("#mediaUpload"),
  closeDialog: document.querySelector("#closeDialog"),
  cancelIssue: document.querySelector("#cancelIssue"),
  saveIssue: document.querySelector("#saveIssue"),
  dangerMenu: document.querySelector("#dangerMenu"),
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
let settings = {
  reporters: [...defaultReporters],
  assignees: [...defaultAssignees],
  tags: [...defaultTags],
  statuses: [...defaultStatuses],
};
let editingId = null;
let draftIssueId = null;
let savedRange = null;
let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let shouldSaveRecording = false;
let recordingStopping = false;
let recordingStartedAt = 0;
let pausedDurationMs = 0;
let pauseStartedAt = 0;
let timerId = null;
let preferredFacingMode = "environment";
let selectedVideoDeviceId = "";
let videoInputDevices = [];
let busyCount = 0;
let busyMessage = "";

init();

async function init() {
  await Promise.all([loadIssues(), loadSettings()]);
  normalizePeopleReferences();
  bindEvents();
  render();
  syncViewFromRoute(true);
}

function bindEvents() {
  els.navItems.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view, { push: true }));
  });
  window.addEventListener("popstate", () => syncViewFromRoute(false));
  els.searchInput.addEventListener("input", renderIssues);
  els.openCreateIssue.addEventListener("click", () => openIssueDialog());
  els.settingForms.forEach((form) => form.addEventListener("submit", addSettingItem));
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
  issues = Array.isArray(data.issues) ? data.issues.map(normalizeIssue).filter(Boolean) : [];
}

async function loadSettings() {
  const data = await apiJson("/api/settings");
  settings = normalizeSettings(data);
}

function render() {
  syncOptions();
  renderIssues();
  renderSettings();
  syncBusyUi();
}

function syncViewFromRoute(replace = false) {
  switchView(viewFromPath(window.location.pathname), { replace });
}

function viewFromPath(path) {
  return viewByRoute[path.replace(/\/+$/, "") || "/"] || "issues";
}

function switchView(view, options = {}) {
  const nextView = routeByView[view] ? view : "issues";
  els.navItems.forEach((button) => button.classList.toggle("active", button.dataset.view === nextView));
  els.views.forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === nextView));
  document.title = nextView === "settings" ? "Settings - BugNote" : "BugNote";
  const nextPath = routeByView[nextView];
  if (options.push && window.location.pathname !== nextPath) {
    history.pushState({ view: nextView }, "", nextPath);
  } else if (options.replace && window.location.pathname !== nextPath) {
    history.replaceState({ view: nextView }, "", nextPath);
  }
}

function renderSettings() {
  renderSettingsList(els.reporterSettingsList, "reporters", sortedReporters());
  renderSettingsList(els.assigneeSettingsList, "assignees", sortedAssignees());
  renderSettingsList(els.tagSettingsList, "tags", sortedTagLabels(), true);
  renderSettingsList(els.statusSettingsList, "statuses", sortedValues([...settings.statuses, ...issues.map((issue) => issue.status).filter(Boolean)]));
}

function renderSettingsList(container, type, values, useChips = false) {
  container.innerHTML = "";
  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "settings-empty";
    empty.textContent = "Nothing added yet.";
    container.appendChild(empty);
    return;
  }

  values.forEach((value) => {
    const row = document.createElement("div");
    row.className = "settings-row";
    if (useChips) row.classList.add("tag-settings-row");
    const label = document.createElement("span");
    label.className = useChips ? "tag-chip" : "";
    label.textContent = value;
    if (useChips) applyTagColor(label, value);
    if (useChips) {
      const colorInput = document.createElement("input");
      colorInput.className = "inline-color";
      colorInput.type = "color";
      colorInput.value = normalizeColor(tagMeta(value).color);
      colorInput.title = `Change ${value} color`;
      colorInput.addEventListener("change", () => updateTagColor(value, colorInput.value));
      row.append(label, colorInput);
    } else {
      row.appendChild(label);
    }
    const button = document.createElement("button");
    button.className = "quiet-button";
    button.type = "button";
    button.textContent = "Remove";
    button.dataset.protected = String(isProtectedSetting(type, value));
    button.disabled = button.dataset.protected === "true";
    button.addEventListener("click", () => removeSettingItem(type, value));
    row.appendChild(button);
    container.appendChild(row);
  });
}

async function addSettingItem(event) {
  event.preventDefault();
  const type = event.currentTarget.dataset.settingForm;
  const input = event.currentTarget.querySelector("input");
  const value = normalizeName(input.value);
  if (!value) return;
  if (type === "tags") {
    settings.tags = sortedTagObjects([
      ...settings.tags.filter((tag) => tag.label.toLowerCase() !== value.toLowerCase()),
      { label: value, color: els.newTagColor.value || "#0f8b8d" },
    ]);
  } else {
    settings[type] = sortedValues([...(settings[type] || []), value]);
  }
  input.value = "";
  await saveSettings();
}

async function removeSettingItem(type, value) {
  if (type === "tags") {
    settings.tags = settings.tags.filter((tag) => tag.label !== value);
  } else {
    settings[type] = (settings[type] || []).filter((item) => item !== value);
  }
  await saveSettings();
}

async function updateTagColor(label, color) {
  settings.tags = settings.tags.map((tag) => (tag.label === label ? { ...tag, color: normalizeColor(color) } : tag));
  await saveSettings();
}

async function saveSettings() {
  try {
    await withBusy("Saving settings...", async () => {
      const result = await apiJson("/api/settings", { method: "POST", body: settings });
      settings = normalizeSettings(result.settings || settings);
      normalizePeopleReferences();
      render();
    });
  } catch (error) {
    showError(error.message || "Settings could not be saved.");
  }
}

function isProtectedSetting(type, value) {
  if (type === "tags") return !settings.tags.some((tag) => tag.label === value);
  if (!settings[type]?.includes(value)) return true;
  if (type === "reporters") return defaultReporters.includes(value);
  if (type === "assignees") return defaultAssignees.includes(value);
  if (type === "statuses") return defaultStatuses.includes(value);
  return false;
}

function renderStats(visibleIssues = issues) {
  els.totalCount.textContent = visibleIssues.length;
  els.openCount.textContent = countStatus("open", visibleIssues);
  els.fixedCount.textContent = countStatus("fixed", visibleIssues);
  els.closedCount.textContent = visibleIssues.filter((issue) => issue.status.startsWith("closed")).length;
}

function countStatus(status, visibleIssues = issues) {
  return visibleIssues.filter((issue) => issue.status === status).length;
}

function normalizeIssue(issue) {
  if (!issue || typeof issue !== "object") return null;
  const id = Number(issue.id || 0);
  const number = String(issue.number || (id ? String(id).padStart(4, "0") : ""));
  if (!id && !number) return null;
  return {
    id,
    number,
    title: normalizeName(issue.title || `Issue #${number || String(id).padStart(4, "0")}`),
    reporter: normalizeName(issue.reporter || ""),
    assignedTo: normalizeName(issue.assignedTo || ""),
    status: normalizeName(issue.status || "open") || "open",
    tags: Array.isArray(issue.tags) ? issue.tags.map(issueTagLabel).filter(Boolean) : [],
    descriptionHtml: String(issue.descriptionHtml || ""),
    media: Array.isArray(issue.media) ? issue.media : [],
    createdAt: issue.createdAt || "",
    updatedAt: issue.updatedAt || issue.createdAt || "",
  };
}

function issueTagLabel(tag) {
  return normalizeName(typeof tag === "object" && tag ? tag.label || "" : String(tag || ""));
}

function renderIssues() {
  const query = parseIssueQuery(els.searchInput.value);
  const filtered = issues.filter((issue) => issueMatchesQuery(issue, query));
  renderStats(filtered);

  els.issuesTable.innerHTML = "";
  filtered.forEach((issue) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="#">${issue.number || String(issue.id).padStart(4, "0")}</td>
      <td data-label="Title" class="title-cell"></td>
      <td data-label="Description" class="desc-cell"></td>
      <td data-label="Status"><span class="status-pill ${statusClass(issue.status)}"></span></td>
      <td data-label="Assigned"></td>
      <td data-label="Tags" class="tags-cell"></td>
      <td data-label="Reporter"></td>
      <td data-label="Created">${formatDate(issue.createdAt)}</td>
      <td data-label="Updated">${formatDate(issue.updatedAt)}</td>
      <td data-label="Details"><button class="secondary-button" type="button" data-edit="${issue.id}">View</button></td>
    `;
    row.children[1].textContent = issue.title;
    row.children[2].textContent = previewText(issue.descriptionHtml, issue.media);
    row.children[3].querySelector("span").textContent = titleCase(issue.status);
    row.children[4].textContent = issue.assignedTo || "None";
    renderChipGroup(row.children[5], issue.tags || []);
    row.children[6].textContent = issue.reporter || "None";
    els.issuesTable.appendChild(row);
  });

  els.emptyState.hidden = filtered.length > 0;
  els.issuesTable.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openIssueDialog(Number(button.dataset.edit)));
  });
}

function parseIssueQuery(value) {
  const tokens = String(value || "").match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const filters = [];
  const terms = [];
  tokens.forEach((token) => {
    const cleanToken = token.replace(/^"|"$/g, "");
    const match = cleanToken.match(/^([a-z]+):(.*)$/i);
    const filterValue = match ? match[2].replace(/^"|"$/g, "") : "";
    if (match && filterValue) {
      filters.push({ key: match[1].toLowerCase(), value: normalizeSearchText(filterValue) });
    } else if (cleanToken) {
      terms.push(normalizeSearchText(cleanToken));
    }
  });
  return { terms: terms.filter(Boolean), filters };
}

function issueMatchesQuery(issue, query) {
  const searchText = issueSearchText(issue);
  return query.terms.every((term) => searchText.includes(term)) && query.filters.every((filter) => issueMatchesFilter(issue, filter));
}

function issueMatchesFilter(issue, filter) {
  const tags = Array.isArray(issue.tags) ? issue.tags : [];
  const fields = {
    reporter: issue.reporter,
    author: issue.reporter,
    assignee: issue.assignedTo,
    assigned: issue.assignedTo,
    assignedto: issue.assignedTo,
    status: issue.status,
    tag: tags.join(" "),
    title: issue.title,
    description: stripHtml(issue.descriptionHtml),
    text: stripHtml(issue.descriptionHtml),
    number: issue.number || String(issue.id).padStart(4, "0"),
    id: String(issue.id),
    created: `${issue.createdAt} ${formatDate(issue.createdAt)} ${compactDateParts(issue.createdAt)}`,
    updated: `${issue.updatedAt} ${formatDate(issue.updatedAt)} ${compactDateParts(issue.updatedAt)}`,
    date: `${issue.createdAt} ${issue.updatedAt} ${formatDate(issue.createdAt)} ${formatDate(issue.updatedAt)} ${compactDateParts(issue.createdAt)} ${compactDateParts(issue.updatedAt)}`,
  };
  if (filter.key === "tag") return tags.some((tag) => normalizeSearchText(tag).includes(filter.value));
  if (filter.key === "is") return normalizeSearchText(issue.status).includes(filter.value);
  const value = fields[filter.key];
  return typeof value === "string" ? normalizeSearchText(value).includes(filter.value) : false;
}

function renderChipGroup(container, tags) {
  const cleanTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
  container.innerHTML = "";
  if (!cleanTags.length) {
    container.textContent = "None";
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "chip-wrap";
  cleanTags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    applyTagColor(chip, tag);
    wrap.appendChild(chip);
  });
  container.appendChild(wrap);
}

function issueSearchText(issue) {
  const issueTags = Array.isArray(issue.tags) ? issue.tags : [];
  return normalizeSearchText(
    [
      issue.id,
      issue.number,
      `#${issue.number || String(issue.id).padStart(4, "0")}`,
      issue.title,
      stripHtml(issue.descriptionHtml),
      issue.reporter,
      issue.assignedTo,
      issue.status,
      titleCase(issue.status),
      issueTags.join(" "),
      issue.createdAt,
      issue.updatedAt,
      formatDate(issue.createdAt),
      formatDate(issue.updatedAt),
      compactDateParts(issue.createdAt),
      compactDateParts(issue.updatedAt),
    ].join(" "),
  );
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[#,_/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDateParts(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = String(parsed.getFullYear());
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const monthName = parsed.toLocaleString(undefined, { month: "short" });
  const longMonthName = parsed.toLocaleString(undefined, { month: "long" });
  return `${year} ${month} ${day} ${year}${month}${day} ${day}${month}${year} ${monthName} ${longMonthName}`;
}

function syncOptions() {
  const statuses = sortedValues([...settings.statuses, ...issues.map((issue) => issue.status).filter(Boolean)]);
  const reporters = sortedReporters();
  const assignees = sortedAssignees();
  fillSelect(els.issueStatus, statuses.map((status) => [status, titleCase(status)]), els.issueStatus.value || "open");
  fillSelect(els.reporterName, [...reporters.map((name) => [name, name]), ["__new__", "New reporter"]], els.reporterName.value);
  fillSelect(els.assignedTo, [["", "Unassigned"], ...assignees.map((name) => [name, name])], els.assignedTo.value);
}

function renderIssueTagPicker(selectedTags = []) {
  const tags = sortedTagLabels();
  els.issueTagPicker.innerHTML = "";
  if (!tags.length) {
    const empty = document.createElement("span");
    empty.className = "tag-picker-empty";
    empty.textContent = "Add tags in Settings.";
    els.issueTagPicker.appendChild(empty);
    return;
  }
  tags.forEach((tag) => {
    const label = document.createElement("label");
    label.className = "tag-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tag;
    input.checked = selectedTags.includes(tag);
    const span = document.createElement("span");
    span.textContent = tag;
    applyTagColor(span, tag);
    label.append(input, span);
    els.issueTagPicker.appendChild(label);
  });
}

function selectedIssueTags() {
  return [...els.issueTagPicker.querySelectorAll("input:checked")].map((input) => input.value);
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
  els.assignedTo.value = issue?.assignedTo || "";
  els.newReporterName.value = "";
  els.issueStatus.value = issue?.status || "open";
  renderIssueTagPicker(issue?.tags || []);
  els.issueDescription.innerHTML = repairMediaHtml(issue?.descriptionHtml || "");
  els.dangerMenu.hidden = !issue;
  els.dangerMenu.open = false;
  els.formError.textContent = "";
  els.storageHint.textContent = `Images and videos will be written to media/issue-${String(draftIssueId).padStart(4, "0")}/`;
  toggleNewReporter();
  els.issueDialog.showModal();
  setTimeout(() => els.issueTitle.focus(), 0);
}

function closeIssueDialog() {
  if (isBusy() || isRecording()) return;
  els.issueDialog.close();
  editingId = null;
  draftIssueId = null;
  savedRange = null;
}

async function saveIssue(event) {
  event.preventDefault();
  if (isBusy() || isRecording()) return;
  const title = els.issueTitle.value.trim();
  const reporter = resolveReporter();
  const assignedTo = canonicalPersonName(els.assignedTo.value, sortedAssignees());
  const status = els.issueStatus.value;
  const tags = selectedIssueTags();
  const descriptionHtml = sanitizeEditorHtml(els.issueDescription.innerHTML);
  const media = collectMedia();

  if (!title) return showError("Title is required.");
  if (!reporter) return showError("Reporter is required.");
  if (!stripHtml(descriptionHtml) && !media.length) return showError("Description or media is required.");

  try {
    await withBusy("Saving issue...", async () => {
      const payload = { id: draftIssueId || editingId, title, reporter, assignedTo, status, tags, descriptionHtml, media };
      const result = await apiJson("/api/issues", { method: "POST", body: payload });
      const saved = normalizeIssue(result.issue);
      const existingIndex = issues.findIndex((issue) => issue.id === saved.id);
      if (existingIndex >= 0) {
        issues[existingIndex] = saved;
      } else {
        issues.unshift(saved);
      }
      if (!hasCaseInsensitive(settings.reporters, reporter)) {
        settings.reporters = sortedValues([...settings.reporters, reporter]);
        const resultSettings = await apiJson("/api/settings", { method: "POST", body: settings });
        settings = normalizeSettings(resultSettings.settings || settings);
      }
    });
    closeIssueDialog();
    render();
  } catch (error) {
    showError(error.message || "Issue could not be saved.");
  }
}

async function deleteCurrentIssue() {
  if (!editingId) return;
  if (isBusy() || isRecording()) return;
  if (!confirm(`Delete issue #${String(editingId).padStart(4, "0")} and its media folder?`)) return;
  try {
    await withBusy("Deleting issue...", async () => {
      await apiJson(`/api/issues/${editingId}`, { method: "DELETE" });
      issues = issues.filter((issue) => issue.id !== editingId);
    });
    closeIssueDialog();
    render();
  } catch (error) {
    showError(error.message || "Issue could not be deleted.");
  }
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
  return sortedValues([
    ...settings.reporters,
    ...issues.map((issue) => issue.reporter).filter(Boolean),
  ]);
}

function sortedAssignees() {
  return sortedValues([
    ...settings.assignees,
    ...issues.map((issue) => issue.assignedTo).filter(Boolean),
  ]);
}

function sortedTagLabels() {
  return sortedValues([
    ...settings.tags.map((tag) => tag.label),
    ...issues.flatMap((issue) => (Array.isArray(issue.tags) ? issue.tags : [])),
  ]);
}

function sortedTagObjects(tags) {
  const seen = new Set();
  return tags
    .filter((tag) => tag.label && !seen.has(tag.label.toLowerCase()) && seen.add(tag.label.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function sortedValues(values) {
  const byKey = new Map();
  values.forEach((value) => {
    const cleanValue = normalizeName(String(value || ""));
    const key = cleanValue.toLowerCase();
    if (cleanValue && !byKey.has(key)) byKey.set(key, cleanValue);
  });
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

function normalizeSettings(data = {}) {
  const savedReporters = Array.isArray(data.reporters) ? data.reporters : [];
  const savedAssignees = Array.isArray(data.assignees) ? data.assignees : savedReporters;
  return {
    reporters: sortedValues([...defaultReporters, ...savedReporters]),
    assignees: sortedValues([...defaultAssignees, ...savedAssignees]),
    tags: sortedTagObjects([...(Array.isArray(data.tags) ? data.tags : defaultTags)].map(normalizeTag)),
    statuses: sortedValues([...defaultStatuses, ...(Array.isArray(data.statuses) ? data.statuses : [])]),
  };
}

function normalizePeopleReferences() {
  const reporterNames = sortedValues([...settings.reporters, ...issues.map((issue) => issue.reporter).filter(Boolean)]);
  const assigneeNames = sortedValues([
    ...settings.assignees,
    ...issues.map((issue) => issue.assignedTo).filter(Boolean),
  ]);
  settings.reporters = sortedValues([...settings.reporters, ...reporterNames]);
  settings.assignees = sortedValues([...settings.assignees, ...assigneeNames]);
  issues = issues.map((issue) => ({
    ...issue,
    reporter: canonicalPersonName(issue.reporter, reporterNames),
    assignedTo: canonicalPersonName(issue.assignedTo, assigneeNames),
  }));
}

function canonicalPersonName(value, names) {
  const cleanValue = normalizeName(value || "");
  if (!cleanValue) return "";
  return names.find((name) => name.toLowerCase() === cleanValue.toLowerCase()) || cleanValue;
}

function hasCaseInsensitive(values, value) {
  const key = normalizeName(value || "").toLowerCase();
  return !!key && values.some((item) => item.toLowerCase() === key);
}

function normalizeTag(tag) {
  if (typeof tag === "object" && tag) {
    return {
      label: normalizeName(tag.label || ""),
      color: normalizeColor(tag.color),
    };
  }
  return {
    label: normalizeName(String(tag || "")),
    color: "#0f8b8d",
  };
}

function tagMeta(label) {
  return settings.tags.find((tag) => tag.label === label) || { label, color: "#0f8b8d" };
}

function applyTagColor(element, label) {
  const color = normalizeColor(tagMeta(label).color);
  element.style.setProperty("--tag-bg", color);
  element.style.setProperty("--tag-border", color);
  element.style.setProperty("--tag-text", readableTextColor(color));
}

function normalizeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : "#0f8b8d";
}

function readableTextColor(hex) {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#10213f" : "#ffffff";
}

async function handleUpload(event) {
  try {
    await insertFiles([...event.target.files]);
  } catch (error) {
    showError(error.message || "Media could not be uploaded.");
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
    showError(error.message || "Pasted media could not be uploaded.");
  }
}

async function handleDrop(event) {
  const files = [...event.dataTransfer.files].filter(isSupportedMedia);
  if (!files.length) return;
  event.preventDefault();
  saveSelectionFromPoint(event.clientX, event.clientY);
  try {
    await insertFiles(files);
  } catch (error) {
    showError(error.message || "Dropped media could not be uploaded.");
  }
}

async function insertFiles(files) {
  const mediaFiles = files.filter(isSupportedMedia);
  if (!mediaFiles.length) return;
  await withBusy(`Uploading ${mediaFiles.length} media file${mediaFiles.length === 1 ? "" : "s"}...`, async () => {
    restoreSelection();
    for (const file of mediaFiles) {
      const asset = await uploadMedia(file, file.name, normalizeMediaType(file.type, file.name));
      insertMedia(asset.url, asset.type, asset.name, asset.path);
    }
    saveSelection();
  });
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
  if (isBusy()) return;
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
  if (isBusy()) return;
  closeCameraDialogNow();
}

function closeCameraDialogNow() {
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
  if (!cameraStream || mediaRecorder || isBusy()) return;
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
  els.switchCamera.disabled = !canSwitch || !!mediaRecorder || isBusy();
  const facingLabel = preferredFacingMode === "environment" ? "Front Camera" : "Back Camera";
  els.switchCamera.textContent = videoInputDevices.length > 1 ? "Switch Camera" : `Use ${facingLabel}`;
}

function capturePhoto() {
  if (!cameraStream || isBusy()) return;
  const canvas = document.createElement("canvas");
  const video = els.cameraPreview;
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    withBusy("Saving photo...", async () => {
      const name = timestampedName("photo", "png");
      const asset = await uploadMedia(blob, name, "image/png");
      insertMedia(asset.url, asset.type, asset.name, asset.path);
      closeCameraDialogNow();
    }).catch((error) => showError(error.message || "Photo could not be saved."));
  }, "image/png");
}

function toggleRecording() {
  if (isBusy()) return;
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
  mediaRecorder.addEventListener("stop", () => {
    if (!shouldSaveRecording || !recordedChunks.length) {
      recordingStopping = false;
      syncBusyUi();
      return;
    }
    const stoppedRecorder = mediaRecorder;
    withBusy("Saving recorded video...", async () => {
      const blobType = normalizeMediaType(stoppedRecorder.mimeType || recordedChunks[0].type || "video/webm", "camera-video.webm");
      const blob = new Blob(recordedChunks, { type: blobType });
      const name = timestampedName("video", "webm");
      const asset = await uploadMedia(blob, name, blobType);
      insertMedia(asset.url, asset.type, asset.name, asset.path);
      closeCameraDialogNow();
    }).catch((error) => {
      recordingStopping = false;
      resetRecordingUi();
      showError(error.message || "Recorded video could not be saved.");
    });
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
    recordingStopping = shouldSave;
    mediaRecorder.stop();
  }
  if (!shouldSave) resetRecordingUi();
  syncBusyUi();
}

function togglePauseRecording() {
  if (!mediaRecorder || isBusy()) return;
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
  syncBusyUi();
}

function resetRecordingUi() {
  clearInterval(timerId);
  timerId = null;
  mediaRecorder = null;
  recordedChunks = [];
  shouldSaveRecording = false;
  recordingStopping = false;
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
  syncBusyUi();
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

async function withBusy(message, action) {
  busyCount += 1;
  busyMessage = message;
  syncBusyUi();
  try {
    return await action();
  } finally {
    busyCount = Math.max(0, busyCount - 1);
    if (!busyCount) busyMessage = "";
    syncBusyUi();
  }
}

function isBusy() {
  return busyCount > 0;
}

function isRecording() {
  return recordingStopping || mediaRecorder?.state === "recording" || mediaRecorder?.state === "paused";
}

function syncBusyUi() {
  const busy = isBusy();
  const recording = isRecording();
  const locked = busy || recording;
  if (els.uploadStatus) {
    els.uploadStatus.hidden = !locked;
    els.uploadStatus.classList.toggle("uploading", busy);
    els.uploadStatus.classList.toggle("pending", recording && !busy);
    els.uploadStatus.textContent = busy ? busyMessage || "Working..." : recording ? "Recording in progress..." : "Ready";
  }

  els.openCreateIssue.disabled = busy;
  els.saveIssue.disabled = locked;
  els.cancelIssue.disabled = locked;
  els.closeDialog.disabled = locked;
  els.deleteIssue.disabled = locked;
  els.mediaUpload.disabled = locked;
  els.openCamera.disabled = locked;
  els.issueTitle.disabled = busy;
  els.reporterName.disabled = busy;
  els.assignedTo.disabled = busy;
  els.newReporterName.disabled = busy;
  els.issueStatus.disabled = busy;
  els.issueDescription.contentEditable = String(!busy);

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.disabled = locked;
  });
  els.issueTagPicker.querySelectorAll("input").forEach((input) => {
    input.disabled = busy;
  });
  els.settingForms.forEach((form) => {
    form.querySelectorAll("input, button").forEach((control) => {
      control.disabled = busy;
    });
  });
  document.querySelectorAll(".settings-row button, .inline-color").forEach((control) => {
    control.disabled = busy || control.dataset.protected === "true";
  });

  els.closeCamera.disabled = busy;
  els.capturePhoto.disabled = busy || !!mediaRecorder;
  els.recordVideo.disabled = busy;
  els.pauseVideo.disabled = busy || !mediaRecorder;
  syncCameraSwitchUi();
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
