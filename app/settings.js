// bugnote/app/settings.js — Local settings: reporters, assignees, tags, statuses
// Depends on: utils.js, state.js, github.js (must be loaded first)

(function () {
  const ns = window.bugnote;

  /* ── Render all settings ── */

  function renderSettings() {
    renderSettingsList(ns.els.reporterSettingsList, "reporters", sortedReporters());
    renderSettingsList(ns.els.assigneeSettingsList, "assignees", sortedAssignees());
    renderSettingsList(ns.els.tagSettingsList, "tags", sortedTagLabels(), true);
    renderSettingsList(
      ns.els.statusSettingsList,
      "statuses",
      sortedValues([...ns.state.settings.statuses, ...ns.state.issues.map((issue) => issue.status).filter(Boolean)])
    );
    if (typeof ns.renderAssigneeMap === "function") ns.renderAssigneeMap();
    if (typeof ns.renderStatusMap === "function") ns.renderStatusMap();
    if (typeof ns.renderGithubSettings === "function") ns.renderGithubSettings();
  }

  function renderSettingsList(container, type, values, useChips) {
    useChips = !!useChips;
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
        colorInput.title = "Change " + value + " color";
        colorInput.addEventListener("change", function () { updateTagColor(value, colorInput.value); });
        row.append(label, colorInput);
      } else {
        row.appendChild(label);
      }
      const button = document.createElement("button");
      button.className = "quiet-button";
      button.type = "button";
      button.textContent = "Remove";
      const isProtected = isProtectedSetting(type, value);
      const isUsedTag = type === "tags" && isTagInUse(value);
      button.dataset.protected = String(isProtected);
      button.dataset.used = String(isUsedTag);
      button.disabled = isProtected;
      if (isUsedTag) button.title = "This tag is used by an issue.";
      button.addEventListener("click", function () { removeSettingItem(type, value); });
      row.appendChild(button);
      container.appendChild(row);
    });
  }

  /* ── Add / remove settings items ── */

  async function addSettingItem(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.settingForm;
    const input = event.currentTarget.querySelector("input");
    const value = normalizeName(input.value);
    if (!value) return;
    if (type === "tags") {
      ns.state.settings.tags = sortedTagObjects([
        ...ns.state.settings.tags.filter((tag) => tag.label.toLowerCase() !== value.toLowerCase()),
        { label: value, color: ns.els.newTagColor.value || "#0f8b8d" },
      ]);
    } else {
      ns.state.settings[type] = sortedValues([...(ns.state.settings[type] || []), value]);
    }
    input.value = "";
    await saveSettings();
  }

  async function removeSettingItem(type, value) {
    if (type === "tags" && isTagInUse(value)) {
      showSettingsMessage('"' + value + '" is used by an issue. Remove it from those issues before deleting the tag.', false);
      return;
    }
    if (type === "tags") {
      ns.state.settings.tags = ns.state.settings.tags.filter((tag) => tag.label !== value);
    } else {
      ns.state.settings[type] = (ns.state.settings[type] || []).filter((item) => item !== value);
    }
    await saveSettings();
  }

  async function updateTagColor(label, color) {
    ns.state.settings.tags = ns.state.settings.tags.map((tag) =>
      tag.label === label ? { ...tag, color: normalizeColor(color) } : tag
    );
    await saveSettings();
  }

  async function saveSettings() {
    try {
      await withBusy("Saving settings...", async () => {
        const result = await apiJson("/api/settings", { method: "POST", body: ns.state.settings });
        ns.state.settings = normalizeSettings(result.settings || ns.state.settings);
        normalizePeopleReferences();
        if (typeof ns.render === "function") ns.render();
      });
    } catch (error) {
      if (ns.els.formError) ns.els.formError.textContent = error.message || "Settings could not be saved.";
    }
  }

  function showSettingsMessage(message, ok) {
    ok = ok !== false;
    ns.els.settingsMessage.hidden = false;
    ns.els.settingsMessage.textContent = message;
    ns.els.settingsMessage.classList.toggle("bad", !ok);
    ns.els.settingsMessage.classList.toggle("ok", !!ok);
  }

  /* ── Load ── */

  async function loadSettings() {
    const data = await apiJson("/api/settings");
    ns.state.settings = normalizeSettings(data);
  }

  /* ── Person normalization ── */

  function normalizePeopleReferences() {
    const reporterNames = sortedValues([...ns.state.settings.reporters, ...ns.state.issues.map((issue) => issue.reporter).filter(Boolean)]);
    const assigneeNames = sortedValues([...ns.state.settings.assignees, ...ns.state.issues.map((issue) => issue.assignedTo).filter(Boolean)]);
    ns.state.settings.reporters = sortedValues([...ns.state.settings.reporters, ...reporterNames]);
    ns.state.settings.assignees = sortedValues([...ns.state.settings.assignees, ...assigneeNames]);
    ns.state.issues = ns.state.issues.map((issue) => ({
      ...issue,
      reporter: canonicalPersonName(issue.reporter, reporterNames),
      assignedTo: canonicalPersonName(issue.assignedTo, assigneeNames),
    }));
  }

  /* ── Tag picker (in issue dialog) ── */

  function renderIssueTagPicker(selectedTags) {
    selectedTags = selectedTags || [];
    const tags = sortedTagLabels();
    ns.els.issueTagPicker.innerHTML = "";
    if (!tags.length) {
      const empty = document.createElement("span");
      empty.className = "tag-picker-empty";
      empty.textContent = "Add tags in Settings.";
      ns.els.issueTagPicker.appendChild(empty);
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
      ns.els.issueTagPicker.appendChild(label);
    });
  }

  function selectedIssueTags() {
    return [...ns.els.issueTagPicker.querySelectorAll("input:checked")].map((input) => input.value);
  }

  ns.renderSettings = renderSettings;
  ns.loadSettings = loadSettings;
  ns.addSettingItem = addSettingItem;
  ns.removeSettingItem = removeSettingItem;
  ns.updateTagColor = updateTagColor;
  ns.saveSettings = saveSettings;
  ns.showSettingsMessage = showSettingsMessage;
  ns.normalizePeopleReferences = normalizePeopleReferences;
  ns.renderIssueTagPicker = renderIssueTagPicker;
  ns.selectedIssueTags = selectedIssueTags;
})();
