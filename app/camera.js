// bugnote/app/camera.js — Camera dialog, photo capture, video recording
// Depends on: utils.js, state.js, editor.js, media.js (must be loaded first)

(function () {
  const ns = window.bugnote;

  /* ── Camera dialog ── */

  async function openCameraDialog() {
    if (isBusy()) return;
    ns.saveSelection();
    if (!navigator.mediaDevices?.getUserMedia) {
      if (ns.els.formError) ns.els.formError.textContent = "Camera access is unavailable in this browser. Use upload or paste instead.";
      return;
    }
    try {
      resetRecordingUi();
      ns.els.cameraDialog.showModal();
      await startCameraStream();
      resetRecordingUi();
    } catch {
      if (ns.els.cameraDialog.open) ns.els.cameraDialog.close();
      if (ns.els.formError) ns.els.formError.textContent = "Camera access is unavailable. Use upload or paste instead.";
    }
  }

  function closeCameraDialog() {
    if (isBusy()) return;
    closeCameraDialogNow();
  }

  function closeCameraDialogNow() {
    stopRecording(false);
    stopCameraStream();
    ns.els.cameraPreview.srcObject = null;
    resetRecordingUi();
    ns.els.cameraDialog.close();
  }

  /* ── Stream management ── */

  async function startCameraStream() {
    stopCameraStream();
    const constraints = cameraConstraints();
    ns.state.cameraStream = await navigator.mediaDevices.getUserMedia(constraints).catch((error) => {
      if (!constraints.audio) throw error;
      return navigator.mediaDevices.getUserMedia({ ...constraints, audio: false });
    });
    ns.els.cameraPreview.srcObject = ns.state.cameraStream;
    await ns.els.cameraPreview.play();
    await refreshVideoInputs();
    syncCameraSwitchUi();
  }

  function stopCameraStream() {
    if (!ns.state.cameraStream) return;
    ns.state.cameraStream.getTracks().forEach((track) => track.stop());
    ns.state.cameraStream = null;
  }

  function cameraConstraints() {
    const state = ns.state;
    const video = state.selectedVideoDeviceId
      ? { deviceId: { exact: state.selectedVideoDeviceId } }
      : { facingMode: { ideal: state.preferredFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } };
    return { video, audio: { echoCancellation: true, noiseSuppression: true } };
  }

  async function refreshVideoInputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    ns.state.videoInputDevices = devices.filter((device) => device.kind === "videoinput");
    const activeTrack = ns.state.cameraStream?.getVideoTracks()[0];
    const activeDeviceId = activeTrack?.getSettings?.().deviceId;
    if (activeDeviceId) ns.state.selectedVideoDeviceId = activeDeviceId;
  }

  async function switchCamera() {
    if (!ns.state.cameraStream || ns.state.mediaRecorder || isBusy()) return;
    const activeTrack = ns.state.cameraStream.getVideoTracks()[0];
    const activeDeviceId = activeTrack?.getSettings?.().deviceId || ns.state.selectedVideoDeviceId;
    const devices = ns.state.videoInputDevices;

    if (devices.length > 1 && activeDeviceId) {
      const activeIndex = devices.findIndex((device) => device.deviceId === activeDeviceId);
      const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % devices.length : 0;
      ns.state.selectedVideoDeviceId = devices[nextIndex].deviceId;
    } else {
      ns.state.selectedVideoDeviceId = "";
      ns.state.preferredFacingMode = ns.state.preferredFacingMode === "environment" ? "user" : "environment";
    }

    ns.els.switchCamera.disabled = true;
    try {
      await startCameraStream();
    } catch {
      ns.state.selectedVideoDeviceId = "";
      ns.state.preferredFacingMode = ns.state.preferredFacingMode === "environment" ? "user" : "environment";
      await startCameraStream();
    } finally {
      syncCameraSwitchUi();
    }
  }

  function syncCameraSwitchUi() {
    const state = ns.state;
    const canSwitch = state.videoInputDevices.length > 1 || !state.selectedVideoDeviceId;
    ns.els.switchCamera.disabled = !canSwitch || !!state.mediaRecorder || isBusy();
    const facingLabel = state.preferredFacingMode === "environment" ? "Front Camera" : "Back Camera";
    ns.els.switchCamera.textContent = state.videoInputDevices.length > 1 ? "Switch Camera" : `Use ${facingLabel}`;
  }

  /* ── Photo capture ── */

  function capturePhoto() {
    if (!ns.state.cameraStream || isBusy()) return;
    const canvas = document.createElement("canvas");
    const video = ns.els.cameraPreview;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      withBusy("Saving photo...", async () => {
        const name = timestampedName("photo", "png");
        const asset = await ns.uploadMedia(blob, name, "image/png");
        ns.insertMedia(asset.url, asset.type, asset.name, asset.path);
        closeCameraDialogNow();
      }).catch((error) => {
        if (ns.els.formError) ns.els.formError.textContent = error.message || "Photo could not be saved.";
      });
    }, "image/png");
  }

  /* ── Video recording ── */

  function toggleRecording() {
    if (isBusy()) return;
    const state = ns.state;
    if (state.mediaRecorder?.state === "recording" || state.mediaRecorder?.state === "paused") {
      stopRecording(true);
      return;
    }
    if (!state.cameraStream) return;
    state.recordedChunks = [];
    state.shouldSaveRecording = true;
    const mimeType = supportedRecorderType();
    state.mediaRecorder = new MediaRecorder(state.cameraStream, mimeType ? { mimeType } : undefined);
    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) state.recordedChunks.push(event.data);
    });
    state.mediaRecorder.addEventListener("stop", () => {
      if (!state.shouldSaveRecording || !state.recordedChunks.length) {
        state.recordingStopping = false;
        syncBusyUi();
        return;
      }
      const stoppedRecorder = state.mediaRecorder;
      withBusy("Saving recorded video...", async () => {
        const blobType = normalizeMediaType(stoppedRecorder.mimeType || state.recordedChunks[0].type || "video/webm", "camera-video.webm");
        const blob = new Blob(state.recordedChunks, { type: blobType });
        const name = timestampedName("video", "webm");
        const asset = await ns.uploadMedia(blob, name, blobType);
        ns.insertMedia(asset.url, asset.type, asset.name, asset.path);
        closeCameraDialogNow();
      }).catch((error) => {
        state.recordingStopping = false;
        resetRecordingUi();
        if (ns.els.formError) ns.els.formError.textContent = error.message || "Recorded video could not be saved.";
      });
    });
    state.mediaRecorder.start();
    state.recordingStartedAt = Date.now();
    state.pausedDurationMs = 0;
    state.pauseStartedAt = 0;
    applyRecordingUi("recording");
  }

  function stopRecording(shouldSave) {
    const state = ns.state;
    if (state.mediaRecorder?.state === "recording" || state.mediaRecorder?.state === "paused") {
      state.shouldSaveRecording = shouldSave;
      state.recordingStopping = shouldSave;
      state.mediaRecorder.stop();
    }
    if (!shouldSave) resetRecordingUi();
    syncBusyUi();
  }

  function togglePauseRecording() {
    const state = ns.state;
    if (!state.mediaRecorder || isBusy()) return;
    if (state.mediaRecorder.state === "recording") {
      state.mediaRecorder.pause();
      state.pauseStartedAt = Date.now();
      applyRecordingUi("paused");
    } else if (state.mediaRecorder.state === "paused") {
      state.pausedDurationMs += Date.now() - state.pauseStartedAt;
      state.pauseStartedAt = 0;
      state.mediaRecorder.resume();
      applyRecordingUi("recording");
    }
  }

  function applyRecordingUi(state) {
    clearInterval(ns.state.timerId);
    const els = ns.els;
    els.recordingStatus.classList.toggle("active", state === "recording");
    els.recordingLabel.textContent = state === "paused" ? "Paused" : "Recording";
    els.recordVideo.textContent = state === "paused" ? "Finish Video" : "Stop and Insert Video";
    els.pauseVideo.textContent = state === "paused" ? "Resume" : "Pause";
    els.pauseVideo.disabled = false;
    els.capturePhoto.disabled = true;
    els.switchCamera.disabled = true;
    updateTimer();
    ns.state.timerId = setInterval(updateTimer, 500);
    syncBusyUi();
  }

  function resetRecordingUi() {
    clearInterval(ns.state.timerId);
    const state = ns.state;
    state.timerId = null;
    state.mediaRecorder = null;
    state.recordedChunks = [];
    state.shouldSaveRecording = false;
    state.recordingStopping = false;
    state.recordingStartedAt = 0;
    state.pausedDurationMs = 0;
    state.pauseStartedAt = 0;
    const els = ns.els;
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
    const state = ns.state;
    if (!state.recordingStartedAt) {
      ns.els.recordingTimer.textContent = "00:00";
      return;
    }
    const pausedNow = state.pauseStartedAt ? Date.now() - state.pauseStartedAt : 0;
    const elapsed = Date.now() - state.recordingStartedAt - state.pausedDurationMs - pausedNow;
    ns.els.recordingTimer.textContent = formatDuration(Math.max(0, elapsed));
  }

  ns.openCameraDialog = openCameraDialog;
  ns.closeCameraDialog = closeCameraDialog;
  ns.closeCameraDialogNow = closeCameraDialogNow;
  ns.switchCamera = switchCamera;
  ns.capturePhoto = capturePhoto;
  ns.toggleRecording = toggleRecording;
  ns.togglePauseRecording = togglePauseRecording;
  ns.syncCameraSwitchUi = syncCameraSwitchUi;
})();
