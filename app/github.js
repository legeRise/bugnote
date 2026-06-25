// bugnote/app/github.js — GitHub settings, repos, assignee/status mapping, test connection
// Depends on: utils.js, state.js (must be loaded first)

(function () {
  const ns = window.bugnote;

  /* ── Render GitHub settings ── */

  function renderGithubSettings() {
    const els = ns.els;
    const settings = ns.state.githubSettings;
    els.githubEnabled.checked = !!settings.enabled;
    els.githubEnabled.disabled = isBusy();
    els.githubToken.placeholder = settings.tokenSaved ? "Token saved. Paste a new token to replace." : "Paste a GitHub token";

    const statusClassName = settings.lastTestOk ? "ok" : settings.lastMessage ? "bad" : "";
    els.githubStatus.className = "github-status " + statusClassName;
    els.githubStatus.textContent = githubStatusText();

    renderReposList();
  }

  function githubStatusText() {
    const settings = ns.state.githubSettings;
    if (settings.lastMessage) return settings.lastMessage;
    if (settings.tokenSaved) return "Token saved. Add repos and enable sync.";
    return "Not connected.";
  }

  /* ── Repos list ── */

  function renderReposList() {
    const els = ns.els;
    if (!els.reposList) return;
    const repos = Array.isArray(ns.state.githubSettings.repos) ? ns.state.githubSettings.repos : [];
    els.reposList.innerHTML = "";
    if (!repos.length) {
      const empty = document.createElement("div");
      empty.className = "settings-empty";
      empty.textContent = "No repositories configured. Add repos below to sync issues to multiple GitHub repos.";
      els.reposList.appendChild(empty);
      return;
    }

    repos.forEach((repo, index) => {
      const row = document.createElement("div");
      row.className = "repo-row";
      row.dataset.repoIndex = index;

      const isActive = index === ns.state.githubSettings.activeRepoIndex;

      const info = document.createElement("div");
      info.className = "repo-info";
      info.innerHTML = "<strong>" + escHtml(repo.name || repo.repo) + "</strong><span class=\"repo-url-text\">" + escHtml(repo.repoUrl || "") + "</span>";

      const toggle = document.createElement("label");
      toggle.className = "repo-toggle";
      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.checked = isActive;
      toggleInput.addEventListener("change", () => {
        if (toggleInput.checked) setActiveRepo(index);
        else setActiveRepo(-1);
      });
      const toggleSpan = document.createElement("span");
      toggleSpan.textContent = "Default";
      toggle.append(toggleInput, toggleSpan);

      const actions = document.createElement("div");
      actions.className = "repo-actions";
      const removeBtn = document.createElement("button");
      removeBtn.className = "quiet-button";
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removeRepo(index));
      actions.append(removeBtn);

      row.append(info, toggle, actions);
      els.reposList.appendChild(row);
    });
  }

  async function addRepo(event) {
    event.preventDefault();
    const els = ns.els;
    const repoUrl = els.repoUrl?.value.trim() || "";
    if (!repoUrl) return;
    const name = els.repoName?.value.trim() || "";

    const repos = Array.isArray(ns.state.githubSettings.repos) ? [...ns.state.githubSettings.repos] : [];
    repos.push({ name, repoUrl, enabled: false, assigneeMapping: {} });
    ns.state.githubSettings.repos = repos;
    els.repoName.value = "";
    els.repoUrl.value = "";
    if (repos.length === 1) {
      ns.state.githubSettings.activeRepoIndex = 0;
    }
    await saveRepos();
    renderReposList();
  }

  async function removeRepo(index) {
    const repos = Array.isArray(ns.state.githubSettings.repos) ? [...ns.state.githubSettings.repos] : [];
    repos.splice(index, 1);
    ns.state.githubSettings.repos = repos;
    if (ns.state.githubSettings.activeRepoIndex >= repos.length) {
      ns.state.githubSettings.activeRepoIndex = repos.length - 1;
    }
    await saveRepos();
  }

  async function setActiveRepo(index) {
    const repos = ns.state.githubSettings.repos || [];
    ns.state.githubSettings.activeRepoIndex = (typeof index === "number" && index >= 0 && index < repos.length) ? index : -1;
    await saveRepos();
    renderReposList();
  }

  async function saveRepos() {
    try {
      const payload = {
        enabled: ns.state.githubSettings.enabled,
        repos: ns.state.githubSettings.repos,
        activeRepoIndex: ns.state.githubSettings.activeRepoIndex,
        assigneeMapping: readAssigneeMapping(),
        statusMapping: readStatusMapping(),
      };
      const result = await apiJson("/api/github-settings", { method: "POST", body: payload });
      ns.state.githubSettings = normalizeGithubSettings(result.settings);
      renderGithubSettings();
    } catch (error) {
      showGithubMessage(error.message || "Could not save repos.", false);
    }
  }

  /* ── Assignee map ── */

  function renderAssigneeMap() {
    const els = ns.els;
    const assignees = sortedAssignees();
    els.assigneeMapTable.innerHTML = "";
    if (!assignees.length) {
      const empty = document.createElement("div");
      empty.className = "settings-empty";
      empty.textContent = "Add assignees, then map them to GitHub usernames.";
      els.assigneeMapTable.appendChild(empty);
      return;
    }

    const header = document.createElement("div");
    header.className = "map-row map-header";
    header.innerHTML = "<span>BugNote name</span><span>GitHub username</span>";
    els.assigneeMapTable.appendChild(header);

    assignees.forEach((name) => {
      const row = document.createElement("div");
      row.className = "map-row";
      const label = document.createElement("span");
      label.textContent = name;
      const input = document.createElement("input");
      input.type = "text";
      input.value = ns.state.githubSettings.assigneeMapping?.[name] || "";
      input.placeholder = slugifyName(name) + "-github";
      input.autocomplete = "off";
      input.dataset.assigneeName = name;
      input.addEventListener("change", () => {
        ns.state.githubSettings.assigneeMapping = readAssigneeMapping();
        renderGithubSettings();
      });
      row.append(label, input);
      els.assigneeMapTable.appendChild(row);
    });
  }

  function readAssigneeMapping() {
    const els = ns.els;
    const mapping = {};
    els.assigneeMapTable.querySelectorAll("[data-assignee-name]").forEach((input) => {
      const username = normalizeGithubUsername(input.value);
      if (username) mapping[input.dataset.assigneeName] = username;
    });
    return mapping;
  }

  /* ── Status map ── */

  function renderStatusMap() {
    const els = ns.els;
    if (!els.statusMapTable) return;
    const state = ns.state;
    const statuses = sortedValues([...state.settings.statuses, ...state.issues.map((issue) => issue.status).filter(Boolean)]);
    els.statusMapTable.innerHTML = "";
    if (!statuses.length) {
      const empty = document.createElement("div");
      empty.className = "settings-empty";
      empty.textContent = "Add statuses in the Statuses panel, then map them to GitHub state reasons.";
      els.statusMapTable.appendChild(empty);
      return;
    }

    const header = document.createElement("div");
    header.className = "map-row map-header";
    header.innerHTML = "<span>BugNote status</span><span>GitHub state reason</span>";
    els.statusMapTable.appendChild(header);

    statuses.forEach((status) => {
      const row = document.createElement("div");
      row.className = "map-row";
      const label = document.createElement("span");
      label.textContent = status;
      const select = document.createElement("select");
      const currentValue = ns.state.githubSettings.statusMapping?.[status] || "";
      ["", "open", "not_planned", "completed"].forEach((reason) => {
        const option = document.createElement("option");
        option.value = reason;
        option.textContent = reason === "" ? "⚠️ No action (stays open)" : reason === "open" ? "Keep open" : reason === "not_planned" ? "Close — won't fix" : "Close — completed";
        if (option.value === currentValue) option.selected = true;
        select.appendChild(option);
      });
      select.dataset.statusName = status;
      select.addEventListener("change", () => {
        ns.state.githubSettings.statusMapping = readStatusMapping();
        saveGithubSettingsStatusOnly();
      });
      row.append(label, select);
      els.statusMapTable.appendChild(row);
    });
  }

  function readStatusMapping() {
    const els = ns.els;
    const mapping = {};
    if (!els.statusMapTable) return mapping;
    els.statusMapTable.querySelectorAll("[data-status-name]").forEach((select) => {
      const value = select.value;
      if (value) mapping[select.dataset.statusName] = value;
    });
    return mapping;
  }

  async function saveGithubSettingsStatusOnly() {
    try {
      const result = await apiJson("/api/github-settings", {
        method: "POST",
        body: { statusMapping: readStatusMapping() },
      });
      ns.state.githubSettings = normalizeGithubSettings(result.settings);
      renderGithubSettings();
    } catch {
      // silently fail for status mapping saves
    }
  }

  /* ── Settings form ── */

  function githubSettingsPayload() {
    const els = ns.els;
    const state = ns.state;
    const payload = {
      enabled: els.githubEnabled.checked,
      assigneeMapping: readAssigneeMapping(),
      statusMapping: readStatusMapping(),
      repos: state.githubSettings.repos || [],
      activeRepoIndex: state.githubSettings.activeRepoIndex,
    };
    const token = els.githubToken.value.trim();
    if (token) payload.token = token;
    return payload;
  }

  async function saveGithubSettings(event) {
    if (event) event.preventDefault();
    const payload = githubSettingsPayload();
    const wantsEnable = payload.enabled;
    try {
      if (wantsEnable) {
        const reason = githubEnableBlocker(payload);
        if (reason) throw new Error(reason);
        if (needsGithubRetest(payload)) {
          await withBusy("Testing GitHub connection...", async () => {
            const result = await apiJson("/api/github-test", { method: "POST", body: { ...payload, enabled: false } });
            ns.state.githubSettings = normalizeGithubSettings(result.settings);
            ns.els.githubToken.value = "";
          });
        }
        payload.enabled = true;
      }
      await withBusy("Saving GitHub settings...", async () => {
        const result = await apiJson("/api/github-settings", { method: "POST", body: payload });
        ns.state.githubSettings = normalizeGithubSettings(result.settings);
        ns.els.githubToken.value = "";
      });
      renderGithubSettings();
    } catch (error) {
      if (wantsEnable) {
        ns.els.githubEnabled.checked = false;
        ns.state.githubSettings.enabled = false;
      }
      showGithubMessage(error.message || "GitHub settings could not be saved.", false);
    }
  }

  function githubEnableBlocker(payload) {
    const state = ns.state;
    if (!payload.token && !state.githubSettings.tokenSaved) return "Paste and save a GitHub token first.";
    const repos = payload.repos || [];
    if (!repos.length) return "Add at least one repository first.";
    if (!repos.some((r) => r.tokenSaved || payload.token)) return "Each repo needs a token to sync.";
    const missing = missingMappedAssignees(payload.assigneeMapping);
    if (missing.length) return "Map GitHub usernames for: " + missing.join(", ") + ".";
    return "";
  }

  function needsGithubRetest(payload) {
    const state = ns.state;
    return (
      !!payload.token ||
      JSON.stringify(payload.repos || []) !== JSON.stringify(state.githubSettings.repos || []) ||
      JSON.stringify(payload.assigneeMapping || {}) !== JSON.stringify(state.githubSettings.assigneeMapping || {}) ||
      !state.githubSettings.lastTestOk
    );
  }

  async function testGithubConnection() {
    const payload = githubSettingsPayload();
    payload.enabled = false;
    try {
      await withBusy("Testing GitHub connection...", async () => {
        const result = await apiJson("/api/github-test", { method: "POST", body: payload });
        ns.state.githubSettings = normalizeGithubSettings(result.settings);
        ns.els.githubToken.value = "";
      });
      renderGithubSettings();
    } catch (error) {
      await loadGithubSettings().catch(function () {});
      showGithubMessage(error.message || "GitHub connection failed.", false);
      renderGithubSettings();
    }
  }

  function showGithubMessage(message, ok) {
    ns.state.githubSettings.lastMessage = message;
    ns.state.githubSettings.lastTestOk = !!ok;
    renderGithubSettings();
  }

  /* ── Helpers ── */

  function missingMappedAssignees(mapping) {
    mapping = mapping || ns.state.githubSettings.assigneeMapping;
    return sortedAssignees().filter((name) => !normalizeGithubUsername(mapping[name] || ""));
  }

  /* ── Load ── */

  async function loadGithubSettings() {
    const data = await apiJson("/api/github-settings");
    ns.state.githubSettings = normalizeGithubSettings(data);
  }

  /* ── Issue repo selector ── */

  function populateIssueRepoSelector() {
    const els = ns.els;
    const repos = Array.isArray(ns.state.githubSettings.repos) ? ns.state.githubSettings.repos : [];
    const select = els.issueRepoSelect;
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Use default repository";
    select.appendChild(defaultOption);
    repos.forEach((repo, index) => {
      const option = document.createElement("option");
      const displayName = repo.name || (repo.owner + "/" + repo.repo);
      const repoKey = repo.owner && repo.repo ? repo.owner + "/" + repo.repo : "";
      option.value = repoKey;
      const isDefault = index === ns.state.githubSettings.activeRepoIndex;
      option.textContent = isDefault ? displayName + " (default)" : displayName;
      select.appendChild(option);
    });
    if ([...select.options].some((opt) => opt.value === currentValue)) {
      select.value = currentValue;
    }
  }

  ns.renderGithubSettings = renderGithubSettings;
  ns.renderAssigneeMap = renderAssigneeMap;
  ns.renderStatusMap = renderStatusMap;
  ns.readStatusMapping = readStatusMapping;
  ns.saveGithubSettingsStatusOnly = saveGithubSettingsStatusOnly;
  ns.renderReposList = renderReposList;
  ns.addRepo = addRepo;
  ns.removeRepo = removeRepo;
  ns.setActiveRepo = setActiveRepo;
  ns.saveRepos = saveRepos;
  ns.saveGithubSettings = saveGithubSettings;
  ns.testGithubConnection = testGithubConnection;
  ns.loadGithubSettings = loadGithubSettings;
  ns.populateIssueRepoSelector = populateIssueRepoSelector;
  ns.githubSettingsPayload = githubSettingsPayload;
  ns.githubEnableBlocker = githubEnableBlocker;
})();
