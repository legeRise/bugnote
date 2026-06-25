// bugnote/app/state.js — Global application state
// Depends on: utils.js (must be loaded first)

(function () {
  const ns = window.bugnote = window.bugnote || {};

  /* ── Defaults ── */
  ns.defaultStatuses = ["Open", "Fixed", "Not Doing"];
  ns.defaultReporters = ["Habib"];
  ns.defaultAssignees = [];
  ns.defaultTags = [];

  /* ── Runtime state ── */
  ns.state = {
    issues: [],
    settings: {
      reporters: [...ns.defaultReporters],
      assignees: [...ns.defaultAssignees],
      tags: [...ns.defaultTags],
      statuses: [...ns.defaultStatuses],
    },
    githubSettings: {
      enabled: false,
      repoUrl: "",
      tokenSaved: false,
      assigneeMapping: {},
      statusMapping: {},
      repos: [],
      activeRepoIndex: -1,
      lastTestOk: false,
      lastMessage: "",
    },
    editingId: null,
    draftIssueId: null,
    savedRange: null,
    cameraStream: null,
    mediaRecorder: null,
    recordedChunks: [],
    shouldSaveRecording: false,
    recordingStopping: false,
    recordingStartedAt: 0,
    pausedDurationMs: 0,
    pauseStartedAt: 0,
    timerId: null,
    preferredFacingMode: "environment",
    selectedVideoDeviceId: "",
    videoInputDevices: [],
    draggedMediaEmbed: null,
    busyCount: 0,
    busyMessage: "",
  };
})();
