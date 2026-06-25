// bugnote/app/main.js — Entry point: DOM references, event binding, initialization
// Depends on: all other app/ modules (must be loaded last)

(function () {
  const ns = window.bugnote;

  /* ── DOM element references ── */
  ns.els = {
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
    settingsMessage: document.querySelector("#settingsMessage"),
    issueRepoSelect: document.querySelector("#issueRepoSelect"),
    advancedRepoSection: document.querySelector("#advancedRepoSection"),
    githubForm: document.querySelector("#githubForm"),
    githubToken: document.querySelector("#githubToken"),
    githubEnabled: document.querySelector("#githubEnabled"),
    githubStatus: document.querySelector("#githubStatus"),
    testGithub: document.querySelector("#testGithub"),
    assigneeMapTable: document.querySelector("#assigneeMapTable"),
    statusMapTable: document.querySelector("#statusMapTable"),
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
    viewGithubIssue: document.querySelector("#viewGithubIssue"),
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
    reposList: document.querySelector("#reposList"),
    repoForm: document.querySelector("#repoForm"),
    repoName: document.querySelector("#repoName"),
    repoUrl: document.querySelector("#repoUrl"),
    repoTokens: document.querySelector("#repoTokens"),
    repoEnabled: document.querySelector("#repoEnabled"),
    repoAssignees: document.querySelector("#repoAssignees"),
    settingsSubtabs: document.querySelectorAll("[data-settings-tab]"),
    settingsTabPanels: document.querySelectorAll("[data-settings-tab-panel]"),
  };

  /* ── Render orchestrator ── */
  function render() {
    if (typeof ns.syncOptions === "function") ns.syncOptions();
    if (typeof ns.renderIssues === "function") ns.renderIssues();
    if (typeof ns.renderSettings === "function") ns.renderSettings();
    syncBusyUi();
  }

  /* ── Event binding ── */
  function bindEvents() {
    const els = ns.els;

    els.navItems.forEach((button) => {
      button.addEventListener("click", function () {
        if (typeof ns.switchView === "function") ns.switchView(button.dataset.view, { push: true });
      });
    });
    window.addEventListener("popstate", function () {
      if (typeof ns.syncViewFromRoute === "function") ns.syncViewFromRoute(false);
    });
    els.searchInput.addEventListener("input", function () {
      if (typeof ns.renderIssues === "function") ns.renderIssues();
    });
    els.openCreateIssue.addEventListener("click", function () {
      if (typeof ns.openIssueDialog === "function") ns.openIssueDialog();
    });
    els.settingForms.forEach(function (form) {
      form.addEventListener("submit", function (event) {
        if (typeof ns.addSettingItem === "function") ns.addSettingItem(event);
      });
    });
    els.githubForm.addEventListener("submit", function (event) {
      if (typeof ns.saveGithubSettings === "function") ns.saveGithubSettings(event);
    });
    els.testGithub.addEventListener("click", function () {
      if (typeof ns.testGithubConnection === "function") ns.testGithubConnection();
    });
    els.githubEnabled.addEventListener("change", function () {
      if (typeof ns.saveGithubSettings === "function") ns.saveGithubSettings();
    });
    if (els.repoForm) {
      els.repoForm.addEventListener("submit", function (event) {
        if (typeof ns.addRepo === "function") ns.addRepo(event);
      });
    }
    if (els.repoEnabled) {
      els.repoEnabled.addEventListener("change", function () {
        if (typeof ns.saveRepos === "function") ns.saveRepos();
      });
    }
    els.closeDialog.addEventListener("click", function () {
      if (typeof ns.closeIssueDialog === "function") ns.closeIssueDialog();
    });
    els.cancelIssue.addEventListener("click", function () {
      if (typeof ns.closeIssueDialog === "function") ns.closeIssueDialog();
    });
    els.issueForm.addEventListener("submit", function (event) {
      if (typeof ns.saveIssue === "function") ns.saveIssue(event);
    });
    els.deleteIssue.addEventListener("click", function () {
      if (typeof ns.deleteCurrentIssue === "function") ns.deleteCurrentIssue();
    });
    els.reporterName.addEventListener("change", function () {
      if (typeof ns.toggleNewReporter === "function") ns.toggleNewReporter();
    });
    els.mediaUpload.addEventListener("change", function (event) {
      if (typeof ns.handleUpload === "function") ns.handleUpload(event);
    });
    els.issueDescription.addEventListener("keyup", function () {
      if (typeof ns.saveSelection === "function") ns.saveSelection();
    });
    els.issueDescription.addEventListener("mouseup", function () {
      if (typeof ns.saveSelection === "function") ns.saveSelection();
    });
    els.issueDescription.addEventListener("focus", function () {
      if (typeof ns.saveSelection === "function") ns.saveSelection();
    });
    els.issueDescription.addEventListener("paste", function (event) {
      if (typeof ns.handlePaste === "function") ns.handlePaste(event);
    });
    els.issueDescription.addEventListener("drop", function (event) {
      if (typeof ns.handleDrop === "function") ns.handleDrop(event);
    });
    els.issueDescription.addEventListener("dragover", function (event) { event.preventDefault(); });
    els.openCamera.addEventListener("click", function () {
      if (typeof ns.openCameraDialog === "function") ns.openCameraDialog();
    });
    els.closeCamera.addEventListener("click", function () {
      if (typeof ns.closeCameraDialog === "function") ns.closeCameraDialog();
    });
    els.switchCamera.addEventListener("click", function () {
      if (typeof ns.switchCamera === "function") ns.switchCamera();
    });
    els.capturePhoto.addEventListener("click", function () {
      if (typeof ns.capturePhoto === "function") ns.capturePhoto();
    });
    els.recordVideo.addEventListener("click", function () {
      if (typeof ns.toggleRecording === "function") ns.toggleRecording();
    });
    els.pauseVideo.addEventListener("click", function () {
      if (typeof ns.togglePauseRecording === "function") ns.togglePauseRecording();
    });

    document.querySelectorAll("[data-command]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (typeof ns.restoreSelection === "function") ns.restoreSelection();
        document.execCommand(button.dataset.command, false);
        els.issueDescription.focus();
        if (typeof ns.saveSelection === "function") ns.saveSelection();
      });
    });

    els.settingsSubtabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        if (typeof ns.switchSettingsTab === "function") ns.switchSettingsTab(tab.dataset.settingsTab);
      });
    });
  }

  /* ── Init ── */
  async function init() {
    await Promise.all([
      typeof ns.loadIssues === "function" ? ns.loadIssues() : Promise.resolve(),
      typeof ns.loadSettings === "function" ? ns.loadSettings() : Promise.resolve(),
      typeof ns.loadGithubSettings === "function" ? ns.loadGithubSettings() : Promise.resolve(),
    ]);
    if (typeof ns.normalizePeopleReferences === "function") ns.normalizePeopleReferences();
    bindEvents();
    render();
    if (typeof ns.syncViewFromRoute === "function") ns.syncViewFromRoute(true);
  }

  ns.render = render;
  init();
})();
