export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.textContent.trim();
}

export function descriptionToHtml(text) {
  return String(text || "")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  div.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  div.querySelectorAll("p, div, li").forEach((node) => node.append("\n"));
  return div.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function formatDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}

export function statusClass(status) {
  return `status-${String(status || "open").toLowerCase().replace(/\s+/g, "-")}`;
}

export function parseQuery(value) {
  const tokens = String(value || "").match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const scoped = {};
  const text = [];
  tokens.forEach((token) => {
    const clean = token.replace(/^"|"$/g, "");
    const match = clean.match(/^([a-z]+):(.+)$/i);
    if (match) scoped[match[1].toLowerCase()] = match[2].toLowerCase();
    else text.push(clean.toLowerCase());
  });
  return { scoped, text: text.join(" ") };
}

export function issueMatches(issue, query) {
  const tags = (issue.tags || []).join(" ").toLowerCase();
  const haystack = [
    issue.number,
    issue.title,
    issue.reporter,
    issue.assignedTo,
    issue.status,
    tags,
    stripHtml(issue.descriptionHtml),
    issue.createdAt,
    issue.updatedAt
  ].join(" ").toLowerCase();
  if (query.text && !haystack.includes(query.text)) return false;
  const checks = {
    reporter: issue.reporter,
    assignee: issue.assignedTo,
    status: issue.status,
    is: issue.status,
    tag: tags,
    created: issue.createdAt,
    updated: issue.updatedAt
  };
  return Object.entries(query.scoped).every(([key, needle]) => String(checks[key] || "").toLowerCase().includes(needle));
}

export function normalizeIssue(issue) {
  return {
    id: Number(issue?.id || 0),
    number: String(issue?.number || "").padStart(4, "0"),
    title: normalizeName(issue?.title || "Untitled issue"),
    reporter: normalizeName(issue?.reporter || ""),
    assignedTo: normalizeName(issue?.assignedTo || ""),
    status: normalizeName(issue?.status || "Open"),
    tags: Array.isArray(issue?.tags) ? issue.tags.filter(Boolean) : [],
    descriptionHtml: String(issue?.descriptionHtml || ""),
    media: Array.isArray(issue?.media) ? issue.media : [],
    github: issue?.github || {},
    githubError: String(issue?.githubError || ""),
    createdAt: issue?.createdAt || "",
    updatedAt: issue?.updatedAt || issue?.createdAt || ""
  };
}

export function normalizeSettings(settings) {
  return {
    reporters: uniq(["Habib", ...(settings?.reporters || [])]),
    assignees: uniq(settings?.assignees || []),
    statuses: uniq(["Open", "Fixed", "Not Doing", ...(settings?.statuses || [])]),
    tags: Array.isArray(settings?.tags) ? settings.tags.map((tag) => typeof tag === "string" ? { label: tag, color: "#0f8b8d" } : tag) : []
  };
}

export function uniq(values) {
  return [...new Map(values.map((value) => [String(value).toLowerCase(), String(value)])).values()].filter(Boolean).sort((a, b) => a.localeCompare(b));
}
