// bugnote/app/issues.js — Issue CRUD: list, create, edit, delete, search/filter
// Depends on: utils.js, state.js, editor.js, media.js, settings.js, github.js (must be loaded first)

(function () {
  const ns = window.bugnote;

  /* ── Load issues ── */

  async function loadIssues() {
    const data = await apiJson("/api/issues");
    ns.state.issues = Array.isArray(data.issues) ? data.issues.map(normalizeIssue).filter(Boolean) : [];
  }

  /* ── Render issues table ── */

  function renderIssues() {
    const els = ns.els;
    const query = parseIssueQuery(els.searchInput.value);
    const filtered = ns.state.issues.filter((issue) => issueMatchesQuery(issue, query));
    renderStats(filtered);

    els.issuesTable.innerHTML = "";
    filtered.forEach((issue) => {
      const row = document.createElement("tr");
      row.innerHTML = [
        '<td data-label="#">' + (issue.number || String(issue.id).padStart(4, "0")) + '</td>',
        '<td data-label="Title" class="title-cell"></td>',
        '<td data-label="Description" class="desc-cell"></td>',
        '<td data-label="Status"><span class="status-pill ' + statusClass(issue.status) + '"></span></td>',
        '<td data-label="Assigned"></td>',
        '<td data-label="Tags" class="tags-cell"></td>',
        '<td data-label="Reporter"></td>',
        '<td data-label="Created">' + formatDate(issue.createdAt) + '</td>',
        '<td data-label="Updated">' + formatDate(issue.updatedAt) + '</td>',
        '<td data-label="Details"><button class="secondary-button" type="button" data-edit="' + issue.id + '">View</button></td>',
      ].join("");
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
      button.addEventListener("click", function () { openIssueDialog(Number(button.dataset.edit)); });
    });
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

  function renderStats(visibleIssues) {
    const els = ns.els;
    const list = visibleIssues || ns.state.issues;
    els.totalCount.textContent = list.length;
    els.openCount.textContent = countStatus("Open", list);
    els.fixedCount.textContent = countStatus("Fixed", list);
    els.closedCount.textContent = list.filter((issue) => issue.status.toLowerCase().startsWith("closed")).length;
  }

  /* ── Options sync (fill selects in dialog) ── */

  function syncOptions() {
    const els = ns.els;
    const statuses = sortedValues([...ns.state.settings.statuses, ...ns.state.issues.map((issue) => issue.status).filter(Boolean)]);
    const reporters = sortedReporters();
    const assignees = sortedAssignees();
    fillSelect(els.issueStatus, statuses.map(function (s) { return [s, titleCase(s)]; }), els.issueStatus.value || "Open");
    fillSelect(els.reporterName, [].concat(
      reporters.map(function (n) { return [n, n]; }),
      [["__new__", "New reporter"]]
    ), els.reporterName.value);
    fillSelect(els.assignedTo, [].concat(
      [["", "Unassigned"]],
      assignees.map(function (n) { return [n, n]; })
    ), els.assignedTo.value);
    if (typeof ns.populateIssueRepoSelector === "function") ns.populateIssueRepoSelector();
  }

  function fillSelect(select, options, currentValue) {
    select.innerHTML = "";
    options.forEach(function (pair) {
      const option = document.createElement("option");
      option.value = pair[0];
      option.textContent = pair[1];
      select.appendChild(option);
    });
    setSelectValue(select, currentValue);
  }

  function setSelectValue(select, value) {
    const cleanValue = String(value || "");
    const exact = [...select.options].find(function (option) { return option.value === cleanValue; });
    const matched = exact || [...select.options].find(function (option) { return option.value.toLowerCase() === cleanValue.toLowerCase(); });
    if (matched) select.value = matched.value;
  }

  /* ── Issue dialog ── */

  async function openIssueDialog(id) {
    id = id || null;
    const els = ns.els;
    ns.state.editingId = id;
    const issue = ns.state.issues.find(function (item) { return item.id === ns.state.editingId; });
    if (issue) {
      ns.state.draftIssueId = issue.id;
    } else {
      const data = await apiJson("/api/issues/next-id");
      ns.state.draftIssueId = data.id;
    }

    els.dialogTitle.textContent = issue ? "Issue #" + (issue.number || issue.id) : "Create Issue #" + String(ns.state.draftIssueId).padStart(4, "0");
    els.issueTitle.value = issue?.title || "";
    syncOptions();
    setSelectValue(els.reporterName, issue?.reporter || ns.defaultReporters[0]);
    setSelectValue(els.assignedTo, issue?.assignedTo || "");
    els.newReporterName.value = "";
    setSelectValue(els.issueStatus, issue?.status || "Open");
    if (typeof ns.renderIssueTagPicker === "function") ns.renderIssueTagPicker(issue?.tags || []);
    els.issueDescription.innerHTML = (typeof ns.repairMediaHtml === "function" ? ns.repairMediaHtml(issue?.descriptionHtml || "") : (issue?.descriptionHtml || ""));
    if (typeof ns.hydrateMediaEmbeds === "function") ns.hydrateMediaEmbeds();
    if (issue && typeof ns.appendStoredMedia === "function") ns.appendStoredMedia(issue.media);
    els.dangerMenu.hidden = !issue;
    if (els.dangerMenu) els.dangerMenu.open = false;
    els.formError.textContent = "";
    syncGithubIssueLink(issue);
    els.storageHint.textContent = "Images and videos will be written to media/issue-" + String(ns.state.draftIssueId).padStart(4, "0") + "/";
    toggleNewReporter();

    const repos = Array.isArray(ns.state.githubSettings.repos) ? ns.state.githubSettings.repos : [];
    const hasRepos = repos.length > 0;
    if (els.advancedRepoSection) els.advancedRepoSection.hidden = !hasRepos;
    if (hasRepos && els.issueRepoSelect) {
      const issueRepo = issue?.github?.owner && issue?.github?.repo ? issue.github.owner + "/" + issue.github.repo : "";
      els.issueRepoSelect.value = issueRepo || "";
    }

    els.issueDialog.showModal();
    setTimeout(function () { els.issueTitle.focus(); }, 0);
  }

  function closeIssueDialog() {
    if (isBusy() || isRecording()) return;
    ns.els.issueDialog.close();
    ns.state.editingId = null;
    ns.state.draftIssueId = null;
    ns.state.savedRange = null;
  }

  /* ── Save issue ── */

  async function saveIssue(event) {
    event.preventDefault();
    if (isBusy() || isRecording()) return;
    const els = ns.els;
    const title = els.issueTitle.value.trim();
    const reporter = resolveReporter();
    const assignedTo = canonicalPersonName(els.assignedTo.value, sortedAssignees());
    const status = els.issueStatus.value;
    const tags = typeof ns.selectedIssueTags === "function" ? ns.selectedIssueTags() : [];
    const descriptionHtml = (typeof ns.sanitizeEditorHtml === "function" ? ns.sanitizeEditorHtml(els.issueDescription.innerHTML) : els.issueDescription.innerHTML);
    const media = typeof ns.collectMedia === "function" ? ns.collectMedia() : [];

    if (!title) { els.formError.textContent = "Title is required."; return; }
    if (!reporter) { els.formError.textContent = "Reporter is required."; return; }
    if (!stripHtml(descriptionHtml) && !media.length) { els.formError.textContent = "Description or media is required."; return; }

    const repoOverride = els.issueRepoSelect?.value || "";
    let githubRepoOwner = "";
    let githubRepo = "";
    if (repoOverride) {
      const parts = repoOverride.split("/");
      if (parts.length === 2) {
        githubRepoOwner = parts[0];
        githubRepo = parts[1];
      }
    }

    try {
      await withBusy("Saving issue...", async () => {
        const payload = {
          id: ns.state.draftIssueId || ns.state.editingId,
          title: title, reporter: reporter,
          assignedTo: assignedTo, status: status,
          tags: tags, descriptionHtml: descriptionHtml,
          media: media,
          githubRepoOwner: githubRepoOwner,
          githubRepo: githubRepo,
        };
        const result = await apiJson("/api/issues", { method: "POST", body: payload });
        const saved = normalizeIssue(result.issue);
        const existingIndex = ns.state.issues.findIndex(function (issue) { return issue.id === saved.id; });
        if (existingIndex >= 0) {
          ns.state.issues[existingIndex] = saved;
        } else {
          ns.state.issues.unshift(saved);
        }
        if (!hasCaseInsensitive(ns.state.settings.reporters, reporter)) {
          ns.state.settings.reporters = sortedValues([].concat(ns.state.settings.reporters, [reporter]));
          const resultSettings = await apiJson("/api/settings", { method: "POST", body: ns.state.settings });
          ns.state.settings = normalizeSettings(resultSettings.settings || ns.state.settings);
        }
      });
      closeIssueDialog();
      if (typeof ns.render === "function") ns.render();
    } catch (error) {
      els.formError.textContent = error.message || "Issue could not be saved.";
    }
  }

  /* ── Delete issue ── */

  async function deleteCurrentIssue() {
    if (!ns.state.editingId) return;
    if (isBusy() || isRecording()) return;
    const issue = ns.state.issues.find(function (item) { return item.id === ns.state.editingId; });
    const githubNote = issue?.github?.url ? " The GitHub issue will be closed." : "";
    if (!confirm("Delete issue #" + String(ns.state.editingId).padStart(4, "0") + " and its media folder?" + githubNote)) return;
    try {
      await withBusy("Deleting issue...", async () => {
        await apiJson("/api/issues/" + ns.state.editingId, { method: "DELETE" });
        ns.state.issues = ns.state.issues.filter(function (issue) { return issue.id !== ns.state.editingId; });
      });
      closeIssueDialog();
      if (typeof ns.render === "function") ns.render();
    } catch (error) {
      ns.els.formError.textContent = error.message || "Issue could not be deleted.";
    }
  }

  /* ── Helpers ── */

  function syncGithubIssueLink(issue) {
    const els = ns.els;
    const url = issue?.github?.url || "";
    els.viewGithubIssue.hidden = !url;
    els.viewGithubIssue.href = url || "#";
    els.viewGithubIssue.textContent = issue?.github?.number ? "View on GitHub #" + issue.github.number : "View on GitHub";
    if (issue?.githubError && !url) {
      els.formError.textContent = "GitHub sync failed: " + issue.githubError;
    }
  }

  function showError(message) {
    ns.els.formError.textContent = message;
  }

  function resolveReporter() {
    const els = ns.els;
    return els.reporterName.value === "__new__" ? normalizeName(els.newReporterName.value) : els.reporterName.value;
  }

  function toggleNewReporter() {
    const els = ns.els;
    const isNew = els.reporterName.value === "__new__";
    els.newReporterField.hidden = !isNew;
    if (isNew) els.newReporterName.focus();
  }

  ns.loadIssues = loadIssues;
  ns.renderIssues = renderIssues;
  ns.renderStats = renderStats;
  ns.openIssueDialog = openIssueDialog;
  ns.closeIssueDialog = closeIssueDialog;
  ns.saveIssue = saveIssue;
  ns.deleteCurrentIssue = deleteCurrentIssue;
  ns.syncOptions = syncOptions;
  ns.syncGithubIssueLink = syncGithubIssueLink;
  ns.toggleNewReporter = toggleNewReporter;
  ns.showError = showError;
})();
