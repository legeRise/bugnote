// bugnote/app/utils.js — Pure utility functions, no DOM references or side effects

/* ── Name normalization ── */

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[#,_/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugifyName(name) {
  return normalizeName(String(name || "user"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "user";
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

/* ── GitHub username ── */

function normalizeGithubUsername(name) {
  return String(name || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 39);
}

/* ── Color helpers ── */

function normalizeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : "#0f8b8d";
}

function readableTextColor(hex) {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#10213f" : "#ffffff";
}

/* ── Tag helpers ── */

function normalizeTag(tag) {
  if (typeof tag === "object" && tag) {
    return { label: normalizeName(tag.label || ""), color: normalizeColor(tag.color) };
  }
  return { label: normalizeName(String(tag || "")), color: "#0f8b8d" };
}

function tagMeta(label) {
  const state = window.bugnote.state;
  return state.settings.tags.find((tag) => tag.label === label) || { label, color: "#0f8b8d" };
}

function applyTagColor(element, label) {
  const color = normalizeColor(tagMeta(label).color);
  element.style.setProperty("--tag-bg", color);
  element.style.setProperty("--tag-border", color);
  element.style.setProperty("--tag-text", readableTextColor(color));
}

function issueTagLabel(tag) {
  return normalizeName(typeof tag === "object" && tag ? tag.label || "" : String(tag || ""));
}

function isTagInUse(value) {
  const state = window.bugnote.state;
  const key = normalizeName(value || "").toLowerCase();
  return !!key && state.issues.some((issue) => (issue.tags || []).some((tag) => normalizeName(tag).toLowerCase() === key));
}

function sortedTagObjects(tags) {
  const seen = new Set();
  return tags
    .filter((tag) => tag.label && !seen.has(tag.label.toLowerCase()) && seen.add(tag.label.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function sortedTagLabels() {
  const state = window.bugnote.state;
  return sortedValues([
    ...state.settings.tags.map((tag) => tag.label),
    ...state.issues.flatMap((issue) => (Array.isArray(issue.tags) ? issue.tags : [])),
  ]);
}

/* ── Sorted values ── */

function sortedValues(values) {
  const byKey = new Map();
  values.forEach((value) => {
    const cleanValue = normalizeName(String(value || ""));
    const key = cleanValue.toLowerCase();
    if (cleanValue && !byKey.has(key)) byKey.set(key, cleanValue);
  });
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

function sortedReporters() {
  const state = window.bugnote.state;
  return sortedValues([
    ...state.settings.reporters,
    ...state.issues.map((issue) => issue.reporter).filter(Boolean),
  ]);
}

function sortedAssignees() {
  const state = window.bugnote.state;
  return sortedValues([
    ...state.settings.assignees,
    ...state.issues.map((issue) => issue.assignedTo).filter(Boolean),
  ]);
}

/* ── Status helpers ── */

function statusClass(status) {
  return `status-${String(status || "open").toLowerCase().replace(/\s+/g, "-")}`;
}

function isProtectedSetting(type, value) {
  const state = window.bugnote.state;
  const defaultReporters = window.bugnote.defaultReporters;
  const defaultAssignees = window.bugnote.defaultAssignees;
  const defaultStatuses = window.bugnote.defaultStatuses;
  if (type === "tags") return !state.settings.tags.some((tag) => tag.label === value);
  if (!state.settings[type]?.includes(value)) return true;
  if (type === "reporters") return defaultReporters.includes(value);
  if (type === "assignees") return defaultAssignees.includes(value);
  if (type === "statuses") return defaultStatuses.includes(value);
  return false;
}

/* ── Date / time formatting ── */

function formatDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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

/* ── HTML / text helpers ── */

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.textContent.trim();
}

function escHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function previewText(html, media = []) {
  const text = stripHtml(html);
  if (text) return text.slice(0, 180) + (text.length > 180 ? "..." : "");
  return media.length ? `${media.length} media file${media.length === 1 ? "" : "s"}` : "No description";
}

/* ── Media type helpers ── */

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

function isSupportedMedia(file) {
  return file?.type?.startsWith("image/") || file?.type?.startsWith("video/");
}

function supportedRecorderType() {
  const types = ["video/webm", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function timestampedName(prefix, extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.${extension}`;
}

/* ── Issue normalization ── */

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
    status: normalizeName(issue.status || "Open") || "Open",
    tags: Array.isArray(issue.tags) ? issue.tags.map(issueTagLabel).filter(Boolean) : [],
    descriptionHtml: String(issue.descriptionHtml || ""),
    media: Array.isArray(issue.media) ? issue.media : [],
    github: issue.github && typeof issue.github === "object" ? issue.github : {},
    githubError: String(issue.githubError || ""),
    createdAt: issue.createdAt || "",
    updatedAt: issue.updatedAt || issue.createdAt || "",
  };
}

/* ── Settings normalization ── */

function normalizeSettings(data) {
  const defaultReporters = window.bugnote.defaultReporters;
  const defaultAssignees = window.bugnote.defaultAssignees;
  const defaultTags = window.bugnote.defaultTags;
  const defaultStatuses = window.bugnote.defaultStatuses;
  data = data || {};
  const savedReporters = Array.isArray(data.reporters) ? data.reporters : [];
  const savedAssignees = Array.isArray(data.assignees) ? data.assignees : savedReporters;
  return {
    reporters: sortedValues([...defaultReporters, ...savedReporters]),
    assignees: sortedValues([...defaultAssignees, ...savedAssignees]),
    tags: sortedTagObjects([...(Array.isArray(data.tags) ? data.tags : defaultTags)].map(normalizeTag)),
    statuses: sortedValues([...defaultStatuses, ...(Array.isArray(data.statuses) ? data.statuses : [])]),
  };
}

/* ── GitHub settings normalization ── */

function normalizeGithubSettings(data) {
  data = data || {};
  const repos = Array.isArray(data.repos) ? data.repos.map(normalizeRepo) : [];
  return {
    enabled: !!data.enabled,
    tokenSaved: !!data.tokenSaved,
    assigneeMapping: normalizeAssigneeMapping(data.assigneeMapping),
    statusMapping: normalizeStatusMapping(data.statusMapping),
    repos,
    activeRepoIndex: repos.length ? Math.min(Number(data.activeRepoIndex) || 0, repos.length - 1) : -1,
    lastTestOk: !!data.lastTestOk,
    lastTestedAt: String(data.lastTestedAt || ""),
    lastMessage: String(data.lastMessage || ""),
  };
}

function normalizeRepo(repo) {
  repo = repo || {};
  return {
    name: String(repo.name || repo.repo || ""),
    repoUrl: String(repo.repoUrl || ""),
    owner: String(repo.owner || ""),
    repo: String(repo.repo || ""),
    tokenSaved: !!repo.tokenSaved,
    enabled: !!repo.enabled,
    assigneeMapping: normalizeAssigneeMapping(repo.assigneeMapping),
  };
}

function normalizeAssigneeMapping(mapping) {
  const clean = {};
  Object.entries(mapping || {}).forEach(([name, username]) => {
    const cleanName = normalizeName(String(name || ""));
    const cleanUsername = normalizeGithubUsername(username);
    if (cleanName && cleanUsername) clean[cleanName] = cleanUsername;
  });
  return clean;
}

function normalizeStatusMapping(mapping) {
  const clean = {};
  Object.entries(mapping || {}).forEach(([status, reason]) => {
    const cleanStatus = normalizeName(String(status || ""));
    if (cleanStatus && ["completed", "not_planned", "open"].includes(String(reason || ""))) {
      clean[cleanStatus] = reason;
    }
  });
  return clean;
}

/* ── Issue search / filtering ── */

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

function issueMatchesQuery(issue, query) {
  const searchText = issueSearchText(issue);
  return query.terms.every((term) => searchText.includes(term)) && query.filters.every((filter) => issueMatchesFilter(issue, filter));
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

function countStatus(status, visibleIssues) {
  const key = status.toLowerCase();
  return (visibleIssues || window.bugnote.state.issues).filter((issue) => (issue.status || "").toLowerCase() === key).length;
}

/* ── API helper ── */

async function apiJson(path, options) {
  options = options || {};
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

/* ── Busy / lock state ── */

function withBusy(message, action) {
  const state = window.bugnote.state;
  state.busyCount += 1;
  state.busyMessage = message;
  syncBusyUi();
  return action().finally(() => {
    state.busyCount = Math.max(0, state.busyCount - 1);
    if (!state.busyCount) state.busyMessage = "";
    syncBusyUi();
  });
}

function isBusy() {
  return window.bugnote.state.busyCount > 0;
}

function isRecording() {
  const state = window.bugnote.state;
  return state.recordingStopping || state.mediaRecorder?.state === "recording" || state.mediaRecorder?.state === "paused";
}

function syncBusyUi() {
  const els = window.bugnote.els;
  const state = window.bugnote.state;
  const busy = isBusy();
  const recording = isRecording();
  const locked = busy || recording;
  if (els.uploadStatus) {
    els.uploadStatus.hidden = !locked;
    els.uploadStatus.classList.toggle("uploading", busy);
    els.uploadStatus.classList.toggle("pending", recording && !busy);
    els.uploadStatus.textContent = busy ? state.busyMessage || "Working..." : recording ? "Recording in progress..." : "Ready";
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
  els.githubForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = busy;
  });
  els.githubEnabled.disabled = busy;
  els.assigneeMapTable.querySelectorAll("input").forEach((control) => {
    control.disabled = busy;
  });
  document.querySelectorAll(".settings-row button, .inline-color").forEach((control) => {
    control.disabled = busy || control.dataset.protected === "true";
  });

  els.closeCamera.disabled = busy;
  els.capturePhoto.disabled = busy || !!state.mediaRecorder;
  els.recordVideo.disabled = busy;
  els.pauseVideo.disabled = busy || !state.mediaRecorder;
  if (typeof syncCameraSwitchUi === "function") syncCameraSwitchUi();
}
