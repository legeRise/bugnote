import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import Webcam from "@uppy/webcam";
import { MarkerArea } from "markerjs2";
import {
  AlertCircle,
  Bug,
  Camera,
  CircleDot,
  Edit3,
  Github,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  Save,
  Search,
  Settings,
  UploadCloud,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "./lib/api";
import {
  formatDate,
  issueMatches,
  normalizeIssue,
  normalizeName,
  normalizeSettings,
  parseQuery,
  statusClass,
  stripHtml,
  titleCase,
  uniq
} from "./lib/utils";
import { Badge, Button, Dialog, Field, IconButton, Input, Select } from "./components/ui";

const blankGithub = {
  enabled: false,
  tokenSaved: false,
  repos: [],
  activeRepoIndex: -1,
  assigneeMapping: {},
  statusMapping: {},
  lastMessage: "",
  lastTestOk: false
};

export default function App() {
  const [view, setView] = useState(location.pathname === "/settings" ? "settings" : "issues");
  const [issues, setIssues] = useState([]);
  const [settings, setSettings] = useState(normalizeSettings({}));
  const [github, setGithub] = useState(blankGithub);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editorIssue, setEditorIssue] = useState(null);
  const [settingsTab, setSettingsTab] = useState("github");

  const filteredIssues = useMemo(() => {
    const parsed = parseQuery(query);
    return issues.filter((issue) => issueMatches(issue, parsed));
  }, [issues, query]);

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    const path = view === "settings" ? "/settings" : "/";
    if (location.pathname !== path) history.pushState({}, "", path);
  }, [view]);

  async function withBusy(label, task) {
    setBusy(label);
    setError("");
    try {
      return await task();
    } catch (err) {
      setError(err.message || "Something went wrong.");
      throw err;
    } finally {
      setBusy("");
    }
  }

  async function refreshAll() {
    await withBusy("Loading BugNote...", async () => {
      const [issueData, settingsData, githubData] = await Promise.all([
        apiJson("/api/issues"),
        apiJson("/api/settings"),
        apiJson("/api/github-settings")
      ]);
      setIssues((issueData.issues || []).map(normalizeIssue));
      setSettings(normalizeSettings(settingsData));
      setGithub({ ...blankGithub, ...githubData });
    });
  }

  async function openEditor(issue) {
    if (issue) {
      setEditorIssue({ ...issue, descriptionHtml: issue.descriptionHtml || "", media: [...(issue.media || [])] });
      return;
    }
    const next = await apiJson("/api/issues/next-id");
    setEditorIssue({
      id: next.id,
      number: next.number,
      title: "",
      reporter: settings.reporters[0] || "Habib",
      assignedTo: "",
      status: "Open",
      tags: [],
      descriptionHtml: "",
      media: [],
      github: {}
    });
  }

  async function saveIssue(issue) {
    await withBusy("Saving issue...", async () => {
      const payload = {
        id: issue.id,
        title: normalizeName(issue.title),
        reporter: normalizeName(issue.reporter),
        assignedTo: normalizeName(issue.assignedTo),
        status: normalizeName(issue.status || "Open"),
        tags: issue.tags || [],
        descriptionHtml: issue.descriptionHtml || "",
        media: issue.media || [],
        githubRepoOwner: issue.githubRepoOwner || "",
        githubRepo: issue.githubRepo || ""
      };
      if (!payload.title) throw new Error("Title is required.");
      if (!payload.reporter) throw new Error("Reporter is required.");
      if (!stripHtml(payload.descriptionHtml) && !payload.media.length) throw new Error("Add a description or at least one media item.");
      const result = await apiJson("/api/issues", { method: "POST", body: payload });
      const saved = normalizeIssue(result.issue);
      setIssues((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current];
      });
      if (!settings.reporters.some((name) => name.toLowerCase() === payload.reporter.toLowerCase())) {
        await saveSettings({ ...settings, reporters: uniq([...settings.reporters, payload.reporter]) });
      }
      setEditorIssue(null);
    });
  }

  async function deleteIssue(issue) {
    if (!confirm(`Delete issue #${issue.number || String(issue.id).padStart(4, "0")} and its media folder?`)) return;
    await withBusy("Deleting issue...", async () => {
      await apiJson(`/api/issues/${issue.id}`, { method: "DELETE" });
      setIssues((current) => current.filter((item) => item.id !== issue.id));
      setEditorIssue(null);
    });
  }

  async function saveSettings(nextSettings) {
    const result = await apiJson("/api/settings", { method: "POST", body: nextSettings });
    setSettings(normalizeSettings(result.settings || nextSettings));
  }

  async function saveGithub(nextGithub, token = "") {
    const payload = {
      enabled: !!nextGithub.enabled,
      token: token || undefined,
      repos: nextGithub.repos || [],
      activeRepoIndex: Number(nextGithub.activeRepoIndex ?? -1),
      assigneeMapping: nextGithub.assigneeMapping || {},
      statusMapping: nextGithub.statusMapping || {}
    };
    const result = await apiJson("/api/github-settings", { method: "POST", body: payload });
    setGithub({ ...blankGithub, ...result.settings });
  }

  const counts = {
    total: filteredIssues.length,
    open: filteredIssues.filter((issue) => issue.status.toLowerCase() === "open").length,
    fixed: filteredIssues.filter((issue) => issue.status.toLowerCase() === "fixed").length,
    closed: filteredIssues.filter((issue) => issue.status.toLowerCase().startsWith("closed")).length
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Bug size={19} /></span>
          <span>BugNote</span>
        </div>
        <nav className="nav-list">
          <button className={view === "issues" ? "active" : ""} onClick={() => setView("issues")}><CircleDot size={18} />Issues</button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings size={18} />Settings</button>
        </nav>
      </aside>

      <main className="main">
        {busy && <div className="busy"><Loader2 size={16} className="spin" />{busy}</div>}
        {error && <div className="alert"><AlertCircle size={16} />{error}</div>}
        {view === "issues" ? (
          <IssuesView
            issues={filteredIssues}
            counts={counts}
            query={query}
            setQuery={setQuery}
            openEditor={openEditor}
            settings={settings}
          />
        ) : (
          <SettingsView
            settings={settings}
            saveSettings={(next) => withBusy("Saving settings...", () => saveSettings(next))}
            github={github}
            setGithub={setGithub}
            saveGithub={(next, token) => withBusy("Saving GitHub settings...", () => saveGithub(next, token))}
            settingsTab={settingsTab}
            setSettingsTab={setSettingsTab}
          />
        )}
      </main>

      <IssueDialog
        issue={editorIssue}
        setIssue={setEditorIssue}
        settings={settings}
        github={github}
        saving={busy === "Saving issue..."}
        onSave={saveIssue}
        onDelete={deleteIssue}
      />
    </div>
  );
}

function IssuesView({ issues, counts, query, setQuery, openEditor, settings }) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>Project Issues</h1>
          <p>File-backed reports with rich capture, upload, and annotation.</p>
        </div>
        <Button onClick={() => openEditor(null)}><Plus size={17} />Create Issue</Button>
      </header>

      <section className="stats-grid">
        <Stat label="Total" value={counts.total} />
        <Stat label="Open" value={counts.open} />
        <Stat label="Fixed" value={counts.fixed} />
        <Stat label="Closed" value={counts.closed} />
      </section>

      <section className="toolbar">
        <Search size={18} />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search or filter: reporter:habib assignee:husnain tag:bug status:open" />
      </section>

      <section className="issues-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Description</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Tags</th>
                <th>Reporter</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td>#{issue.number}</td>
                  <td className="title-cell">{issue.title}</td>
                  <td className="desc-cell">{stripHtml(issue.descriptionHtml) || `${issue.media.length} media item${issue.media.length === 1 ? "" : "s"}`}</td>
                  <td><Badge className={statusClass(issue.status)}>{titleCase(issue.status)}</Badge></td>
                  <td>{issue.assignedTo || "Unassigned"}</td>
                  <td><TagList tags={issue.tags} settings={settings} /></td>
                  <td>{issue.reporter || "None"}</td>
                  <td>{formatDate(issue.updatedAt)}</td>
                  <td><Button variant="outline" size="sm" onClick={() => openEditor(issue)}><Edit3 size={15} />View</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!issues.length && <div className="empty-state"><strong>No issues found</strong><span>Create a report or adjust the filters.</span></div>}
      </section>
    </>
  );
}

function Stat({ label, value }) {
  return <article className="stat"><span>{label}</span><strong>{value}</strong></article>;
}

function IssueDialog({ issue, setIssue, settings, github, saving, onSave, onDelete }) {
  const editorRef = useRef(null);
  const selectionRef = useRef(null);
  const [inlineStatus, setInlineStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  if (!issue) return null;
  const tags = settings.tags || [];
  const repos = github.repos || [];
  const repoValue = issue.githubRepoOwner && issue.githubRepo ? `${issue.githubRepoOwner}/${issue.githubRepo}` : "";

  function patch(fields) {
    setIssue((current) => ({ ...current, ...fields }));
  }

  function toggleTag(label) {
    const hasTag = (issue.tags || []).includes(label);
    patch({ tags: hasTag ? issue.tags.filter((tag) => tag !== label) : [...(issue.tags || []), label] });
  }

  function saveEditorSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  }

  function syncEditorHtml() {
    const editor = editorRef.current;
    if (!editor) return;
    patch({ descriptionHtml: editor.innerHTML });
    saveEditorSelection();
  }

  async function uploadInlineFile(file, annotateImage = false) {
    try {
      let nextFile = file;
      if (annotateImage && file.type.startsWith("image/")) {
        setInlineStatus("Opening annotator...");
        nextFile = await annotateImageFile(file);
      }
      setUploadProgress(0);
      setInlineStatus(`Uploading ${nextFile.name || "media"}...`);
      const asset = await uploadMediaAsset(issue.id, nextFile, (progress) => {
        setUploadProgress(progress);
        setInlineStatus(`Uploading ${nextFile.name || "media"}... ${progress}%`);
      });
      insertAssetIntoEditor(asset, editorRef, selectionRef);
      setIssue((current) => ({
        ...current,
        descriptionHtml: editorRef.current?.innerHTML || current.descriptionHtml,
        media: appendUniqueMedia(current.media || [], asset)
      }));
      setInlineStatus("Media inserted at cursor.");
      return asset;
    } catch (error) {
      setInlineStatus(error.message || "Media could not be inserted.");
      throw error;
    } finally {
      setUploadProgress(null);
    }
  }

  async function uploadInlineFiles(files, annotateImages = false) {
    const mediaFiles = [...files].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (!mediaFiles.length) return;
    for (const file of mediaFiles) {
      await uploadInlineFile(file, annotateImages && file.type.startsWith("image/"));
    }
  }

  function removeMedia(asset) {
    removeMediaFromEditor(asset, editorRef);
    setIssue((current) => ({
      ...current,
      descriptionHtml: editorRef.current?.innerHTML || current.descriptionHtml,
      media: (current.media || []).filter((item) => mediaKey(item) !== mediaKey(asset))
    }));
  }

  function placeCursorAtEditorEnd() {
    const editor = editorRef.current;
    if (!editor) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selectionRef.current = range.cloneRange();
  }

  return (
    <Dialog open>
      <section className="issue-dialog" aria-busy={saving}>
        {saving && (
          <div className="issue-saving-overlay" role="status" aria-live="polite">
            <Loader2 size={30} className="spin" />
            <strong>Saving issue…</strong>
            <span>Please keep this window open.</span>
          </div>
        )}
        <div className="dialog-head">
          <div>
            <h2>{issue.title ? `Issue #${issue.number}` : `Create Issue #${issue.number}`}</h2>
            <p>Use Uppy for upload, paste, drag-drop, and camera; annotate images before inserting.</p>
          </div>
          <IconButton label="Close" onClick={() => setIssue(null)}><X size={18} /></IconButton>
        </div>

        <div className="form-grid issue-meta-grid">
          <Field label="Title" className="title-field"><Input value={issue.title} onChange={(event) => patch({ title: event.target.value })} placeholder="Short, clear issue title" /></Field>
          <Field label="Reporter"><Input value={issue.reporter} onChange={(event) => patch({ reporter: event.target.value })} list="reporters" /></Field>
          <Field label="Assigned to"><Select value={issue.assignedTo} onChange={(event) => patch({ assignedTo: event.target.value })}><option value="">Unassigned</option>{settings.assignees.map((name) => <option key={name}>{name}</option>)}</Select></Field>
          <Field label="Status"><Select value={issue.status} onChange={(event) => patch({ status: event.target.value })}>{settings.statuses.map((status) => <option key={status}>{status}</option>)}</Select></Field>
          <datalist id="reporters">{settings.reporters.map((name) => <option key={name} value={name} />)}</datalist>
        </div>

        {!!repos.length && (
          <Field label="Sync repository">
            <Select
              value={repoValue}
              onChange={(event) => {
                const [owner = "", repo = ""] = event.target.value.split("/");
                patch({ githubRepoOwner: owner, githubRepo: repo });
              }}
            >
              <option value="">Use default repository</option>
              {repos.map((repo) => <option key={`${repo.owner}/${repo.repo}`} value={`${repo.owner}/${repo.repo}`}>{repo.name || `${repo.owner}/${repo.repo}`}</option>)}
            </Select>
          </Field>
        )}

        <div className="tag-picker">
          {tags.length ? tags.map((tag) => (
            <button key={tag.label} type="button" className={(issue.tags || []).includes(tag.label) ? "selected" : ""} onClick={() => toggleTag(tag.label)}>
              <span style={{ background: tag.color }} />{tag.label}
            </button>
          )) : <span className="muted">Add tags in Settings.</span>}
        </div>

        <RichDescriptionEditor
          editorRef={editorRef}
          html={issue.descriptionHtml}
          inlineStatus={inlineStatus}
          uploadProgress={uploadProgress}
          onInput={syncEditorHtml}
          onSaveSelection={saveEditorSelection}
          onFiles={uploadInlineFiles}
        />

        <MediaStudio
          onUploadFile={uploadInlineFile}
          onCameraOpen={placeCursorAtEditorEnd}
        />

        <div className="dialog-actions">
          <div className="dialog-left-actions">
            {issue.createdAt && (
              <details className="issue-more-menu">
                <summary><MoreHorizontal size={17} />More</summary>
                <div className="issue-more-popover">
                  <button type="button" onClick={() => onDelete(issue)}><Trash2 size={16} />Delete issue</button>
                </div>
              </details>
            )}
            {issue.github?.url && <Button as="a" variant="outline" type="button" onClick={() => window.open(issue.github.url, "_blank", "noopener")}><Github size={16} />GitHub #{issue.github.number}</Button>}
          </div>
          <Button variant="outline" disabled={saving} onClick={() => setIssue(null)}>Cancel</Button>
          <Button disabled={saving} onClick={() => onSave(issue)}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? "Saving…" : "Save Issue"}
          </Button>
        </div>
      </section>
    </Dialog>
  );
}

function RichDescriptionEditor({ editorRef, html, inlineStatus, uploadProgress, onInput, onSaveSelection, onFiles }) {
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== (html || "")) editor.innerHTML = html || "";
  }, [editorRef, html]);

  async function handlePaste(event) {
    const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (!files.length) return;
    event.preventDefault();
    onSaveSelection();
    await onFiles(files, true);
  }

  async function handleDrop(event) {
    const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (!files.length) return;
    event.preventDefault();
    saveSelectionFromPoint(event.clientX, event.clientY, editorRef);
    onSaveSelection();
    await onFiles(files, true);
  }

  return (
    <section className="rich-editor-shell">
      <div className="rich-editor-head">
        <label>Description</label>
        {inlineStatus && (
          <span className="inline-upload-status">
            {uploadProgress !== null && <Loader2 size={15} className="spin" />}
            {inlineStatus}
          </span>
        )}
      </div>
      {uploadProgress !== null && (
        <div className="inline-upload-track" role="progressbar" aria-label="Media upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}>
          <span style={{ width: `${uploadProgress}%` }} />
        </div>
      )}
      <div
        ref={editorRef}
        className="rich-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder="Describe the issue. Paste, drop, upload, or record media and it will land at the cursor."
        onInput={onInput}
        onKeyUp={onSaveSelection}
        onMouseUp={onSaveSelection}
        onFocus={onSaveSelection}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
      />
    </section>
  );
}

function MediaStudio({ onUploadFile, onCameraOpen }) {
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef(null);
  const processingCameraFiles = useRef(new Set());
  const onUploadFileRef = useRef(onUploadFile);
  const uppy = useMemo(() => new Uppy({
    autoProceed: false,
    restrictions: { allowedFileTypes: ["image/*", "video/*"] }
  }).use(Webcam, {
    modes: ["picture", "video-audio"],
    mirror: false,
    showVideoSourceDropdown: true
  }), []);

  useEffect(() => {
    onUploadFileRef.current = onUploadFile;
  }, [onUploadFile]);

  useEffect(() => {
    async function handleCameraFile(file) {
      if (processingCameraFiles.current.has(file.id)) return;
      processingCameraFiles.current.add(file.id);
      setWorking(true);
      try {
        const shouldAnnotate = String(file.type || "").startsWith("image/");
        const cameraFile = normalizeCameraCapture(file);
        setStatus(shouldAnnotate ? "Opening annotator for captured image..." : "Inserting recorded video...");
        await onUploadFileRef.current(cameraFile, shouldAnnotate);
        setStatus("Inserted at the editor cursor.");
        setCameraOpen(false);
      } catch (error) {
        setStatus(error.message || "Camera media could not be inserted.");
      } finally {
        setWorking(false);
        if (uppy.getFile(file.id)) uppy.removeFile(file.id);
        processingCameraFiles.current.delete(file.id);
      }
    }

    uppy.on("file-added", handleCameraFile);
    uppy.on("restriction-failed", (_file, error) => setStatus(error.message));
    return () => {
      uppy.off("file-added", handleCameraFile);
      uppy.destroy();
    };
  }, [uppy]);

  async function insertFiles(files, annotateImages) {
    const mediaFiles = [...files].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (!mediaFiles.length) return;
    for (const file of mediaFiles) {
      setWorking(true);
      try {
        const shouldAnnotate = annotateImages && file.type.startsWith("image/");
        setStatus(shouldAnnotate ? "Opening annotator..." : "Inserting media...");
        await onUploadFileRef.current(file, shouldAnnotate);
        setStatus("Inserted at the editor cursor.");
      } catch (error) {
        setStatus(error.message || "Media could not be inserted.");
      } finally {
        setWorking(false);
      }
    }
  }

  return (
    <section className="insert-toolbar">
      <div className="insert-toolbar-copy">
        <div>
          <h3>Insert Media</h3>
          <p>Images open in the annotator; videos insert directly at the cursor.</p>
        </div>
      </div>
      <div className="insert-actions">
        <button className="insert-action" type="button" disabled={working} onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={18} />
          <span>Files</span>
        </button>
        <button className="insert-action" type="button" disabled={working} onClick={() => {
          onCameraOpen?.();
          setCameraOpen(true);
        }}>
          <Camera size={18} />
          <span>Camera</span>
        </button>
      </div>
      {status && <p className="media-status">{working && <Loader2 size={16} className="spin" />}{status}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => {
          insertFiles(event.target.files || [], true);
          event.target.value = "";
        }}
      />
      <DashboardModal
        uppy={uppy}
        open={cameraOpen}
        onRequestClose={() => setCameraOpen(false)}
        proudlyDisplayPoweredByUppy={false}
        closeModalOnClickOutside
        disableLocalFiles
        showSelectedFiles={false}
        plugins={["Webcam"]}
        hideUploadButton
        note="Take a photo or record a clip. Captured images open in the annotator before insertion."
      />
    </section>
  );
}

function normalizeCameraCapture(uppyFile) {
  const blob = uppyFile?.data;
  if (!(blob instanceof Blob)) {
    throw new Error("The camera did not return a usable photo or video. Please capture it again.");
  }
  if (blob instanceof File && blob.name) return blob;

  const type = uppyFile.type || blob.type || "application/octet-stream";
  const isImage = String(type).startsWith("image/");
  const extension = uppyFile.extension || extensionForMediaType(type, isImage ? "jpg" : "webm");
  const suppliedName = String(uppyFile.name || "").trim();
  const name = suppliedName || `camera-${isImage ? "photo" : "video"}-${Date.now()}.${extension}`;
  return new File([blob], name, { type, lastModified: Date.now() });
}

function extensionForMediaType(type, fallback) {
  const subtype = String(type || "").split("/", 2)[1]?.split(";", 1)[0]?.toLowerCase();
  if (!subtype) return fallback;
  if (subtype === "jpeg") return "jpg";
  if (subtype === "quicktime") return "mov";
  return subtype.replace(/[^a-z0-9]/g, "") || fallback;
}

async function uploadMediaAsset(issueId, file, onProgress) {
  const form = new FormData();
  form.append("issueId", String(issueId));
  form.append("name", file.name || "media");
  form.append("type", file.type || "application/octet-stream");
  form.append("file", file, file.name || "media");
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/media");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      const data = request.response || {};
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve(data);
      } else {
        reject(new Error(data.error || data.message || `Request failed: ${request.status}`));
      }
    });
    request.addEventListener("error", () => reject(new Error("Media upload failed. Check your connection and try again.")));
    request.addEventListener("abort", () => reject(new Error("Media upload was cancelled.")));
    request.send(form);
  });
}

function mediaKey(asset) {
  return asset?.path || asset?.url || asset?.name || "";
}

function appendUniqueMedia(media, asset) {
  const key = mediaKey(asset);
  if (!key || media.some((item) => mediaKey(item) === key)) return media;
  return [...media, asset];
}

function createMediaEmbed(asset) {
  const wrapper = document.createElement("span");
  wrapper.className = "inline-media-embed";
  wrapper.contentEditable = "false";
  wrapper.dataset.mediaKey = mediaKey(asset);
  wrapper.dataset.src = asset.url || "";
  wrapper.dataset.path = asset.path || "";
  wrapper.dataset.type = asset.type || "";
  wrapper.dataset.name = asset.name || "media";

  const isVideo = String(asset.type || "").startsWith("video/");
  const media = document.createElement(isVideo ? "video" : "img");
  media.dataset.mediaKey = mediaKey(asset);
  if (isVideo) {
    media.controls = true;
    media.playsInline = true;
    media.preload = "metadata";
    media.src = asset.url;
  } else {
    media.src = asset.url;
    media.alt = asset.name || "media";
    media.loading = "lazy";
  }

  const label = document.createElement("span");
  label.className = "inline-media-label";
  label.textContent = asset.name || "media";
  wrapper.append(media, label);
  return wrapper;
}

function insertAssetIntoEditor(asset, editorRef, selectionRef) {
  const editor = editorRef.current;
  if (!editor) return;
  editor.focus();
  const selection = window.getSelection();
  const range = selectionRef.current?.cloneRange() || document.createRange();
  if (!selectionRef.current) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  const embed = createMediaEmbed(asset);
  range.deleteContents();
  range.insertNode(embed);
  const spacer = document.createElement("br");
  embed.after(spacer);
  range.setStartAfter(spacer);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  selectionRef.current = range.cloneRange();
}

function removeMediaFromEditor(asset, editorRef) {
  const editor = editorRef.current;
  if (!editor) return;
  const key = CSS.escape(mediaKey(asset));
  editor.querySelectorAll(`[data-media-key="${key}"]`).forEach((node) => node.remove());
}

function saveSelectionFromPoint(x, y, editorRef, selectionRef) {
  const editor = editorRef.current;
  if (!editor) return;
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
  }
  if (range && editor.contains(range.commonAncestorContainer)) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    if (selectionRef) selectionRef.current = range.cloneRange();
  }
}

async function annotateImageFile(file) {
  const url = URL.createObjectURL(file);
  const host = document.createElement("div");
  host.className = "marker-source-host";
  const image = new Image();
  image.src = url;
  image.className = "marker-source";
  host.appendChild(image);
  document.body.appendChild(host);
  await image.decode();
  return new Promise((resolve, reject) => {
    let settled = false;
    const markerArea = new MarkerArea(image);
    markerArea.targetRoot = document.body;
    markerArea.settings.displayMode = "popup";
    markerArea.settings.popupMargin = 16;
    markerArea.renderAtNaturalSize = true;
    markerArea.renderImageType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    markerArea.uiStyleSettings.zIndex = "20000";
    markerArea.uiStyleSettings.toolbarBackgroundColor = "#111827";
    markerArea.uiStyleSettings.toolbarBackgroundHoverColor = "#273244";
    markerArea.uiStyleSettings.toolbarColor = "#f9fafb";
    markerArea.uiStyleSettings.toolboxColor = "#111827";
    markerArea.uiStyleSettings.toolboxAccentColor = "#1f6f68";
    markerArea.uiStyleSettings.canvasBackgroundColor = "#f8fafc";
    document.body.classList.add("is-annotating");
    markerArea.addEventListener("render", async (event) => {
      // marker.js closes immediately after firing render. Claim the result now so
      // the close event cannot resolve this operation with the original file.
      settled = true;
      try {
        if (!event.dataUrl) throw new Error("The annotator did not return a rendered image.");
        const response = await fetch(event.dataUrl);
        const blob = await response.blob();
        if (!blob.size) throw new Error("The annotated image was empty.");
        const annotated = new File([blob], annotatedName(file.name), { type: blob.type || markerArea.renderImageType });
        cleanup();
        resolve(annotated);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    markerArea.addEventListener("close", () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    });
    markerArea.show();

    function cleanup() {
      URL.revokeObjectURL(url);
      document.body.classList.remove("is-annotating");
      host.remove();
    }
  });
}

function annotatedName(name) {
  const dot = String(name || "image.png").lastIndexOf(".");
  if (dot < 0) return `${name || "image"}-annotated.png`;
  return `${name.slice(0, dot)}-annotated${name.slice(dot)}`;
}

function SettingsView({ settings, saveSettings, github, setGithub, saveGithub, settingsTab, setSettingsTab }) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Manage people, tags, statuses, and GitHub sync mappings.</p>
        </div>
      </header>

      <nav className="tabs">
        {["github", "statuses", "mapping"].map((tab) => <button key={tab} className={settingsTab === tab ? "active" : ""} onClick={() => setSettingsTab(tab)}>{titleCase(tab)}</button>)}
      </nav>

      {settingsTab === "github" && <GithubSettings github={github} setGithub={setGithub} saveGithub={saveGithub} />}
      {settingsTab === "statuses" && <ListSettings settings={settings} saveSettings={saveSettings} />}
      {settingsTab === "mapping" && <MappingSettings settings={settings} saveSettings={saveSettings} github={github} setGithub={setGithub} saveGithub={saveGithub} />}
    </>
  );
}

function GithubSettings({ github, setGithub, saveGithub }) {
  const [token, setToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoName, setRepoName] = useState("");

  function addRepo() {
    if (!repoUrl.trim()) return;
    const repos = [...(github.repos || []), { repoUrl, name: repoName, enabled: true, assigneeMapping: {} }];
    setGithub({ ...github, repos, activeRepoIndex: github.activeRepoIndex >= 0 ? github.activeRepoIndex : 0 });
    setRepoUrl("");
    setRepoName("");
  }

  return (
    <section className="settings-panel">
      <div className="settings-title-row">
        <div>
          <h2>GitHub Sync</h2>
          <p>Save a token, add repositories, then choose one default target.</p>
        </div>
        <label className="switch"><input type="checkbox" checked={!!github.enabled} onChange={(event) => setGithub({ ...github, enabled: event.target.checked })} /><span>Enabled</span></label>
      </div>
      <div className="form-grid">
        <Field label="Token"><Input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={github.tokenSaved ? "Token saved. Paste to replace." : "Paste GitHub token"} /></Field>
        <div className="inline-actions"><Button onClick={() => saveGithub(github, token).then(() => setToken(""))}><Save size={16} />Save</Button></div>
      </div>
      <div className="repos-list">
        {(github.repos || []).map((repo, index) => (
          <div className="repo-row" key={`${repo.owner || repo.repoUrl}-${index}`}>
            <div><strong>{repo.name || repo.repo || repo.repoUrl}</strong><span>{repo.repoUrl}</span></div>
            <label className="switch"><input type="checkbox" checked={github.activeRepoIndex === index} onChange={() => setGithub({ ...github, activeRepoIndex: github.activeRepoIndex === index ? -1 : index })} /><span>Default</span></label>
          </div>
        ))}
      </div>
      <div className="form-grid repo-form">
        <Field label="Repository URL"><Input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repo" /></Field>
        <Field label="Label"><Input value={repoName} onChange={(event) => setRepoName(event.target.value)} placeholder="Optional" /></Field>
        <Button variant="outline" onClick={addRepo}><Plus size={16} />Add</Button>
      </div>
      <p className={github.lastTestOk ? "ok-text" : "muted"}>{github.lastMessage || (github.tokenSaved ? "Token saved." : "Not connected.")}</p>
    </section>
  );
}

function ListSettings({ settings, saveSettings }) {
  return (
    <div className="settings-grid settings-grid-stacked">
      <div className="settings-column">
        <EditableList title="Statuses" values={settings.statuses} onChange={(statuses) => saveSettings({ ...settings, statuses })} />
        <EditableList title="Assignees" values={settings.assignees} onChange={(assignees) => saveSettings({ ...settings, assignees })} />
      </div>
      <div className="settings-column">
        <EditableList title="Reporters" values={settings.reporters} onChange={(reporters) => saveSettings({ ...settings, reporters })} />
        <TagSettings settings={settings} saveSettings={saveSettings} />
      </div>
    </div>
  );
}

function MappingSettings({ settings, github, setGithub, saveGithub }) {
  const statuses = settings.statuses || [];
  const assignees = settings.assignees || [];
  return (
    <section className="settings-grid two">
      <article className="settings-panel">
        <h2>Assignee Mapping</h2>
        {assignees.map((name) => (
          <Field key={name} label={name}>
            <Input value={github.assigneeMapping?.[name] || ""} onChange={(event) => setGithub({ ...github, assigneeMapping: { ...(github.assigneeMapping || {}), [name]: event.target.value } })} placeholder={`${name.toLowerCase()}-github`} />
          </Field>
        ))}
      </article>
      <article className="settings-panel">
        <h2>Status Mapping</h2>
        {statuses.map((status) => (
          <Field key={status} label={status}>
            <Select value={github.statusMapping?.[status] || ""} onChange={(event) => setGithub({ ...github, statusMapping: { ...(github.statusMapping || {}), [status]: event.target.value } })}>
              <option value="">No action</option>
              <option value="open">Keep open</option>
              <option value="completed">Close as completed</option>
              <option value="not_planned">Close as won't fix</option>
            </Select>
          </Field>
        ))}
      </article>
      <div className="settings-save-row"><Button onClick={() => saveGithub(github)}><Save size={16} />Save Mapping</Button></div>
    </section>
  );
}

function EditableList({ title, values, onChange }) {
  const [value, setValue] = useState("");
  return (
    <article className="settings-panel">
      <h2>{title}</h2>
      <div className="add-row">
        <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Add ${title.toLowerCase().slice(0, -1)}`} />
        <Button variant="outline" onClick={() => { if (value.trim()) onChange(uniq([...values, value.trim()])); setValue(""); }}><Plus size={16} />Add</Button>
      </div>
      <div className="settings-list">
        {values.map((item) => <div className="settings-row" key={item}><span>{item}</span><Button variant="ghost" size="sm" onClick={() => onChange(values.filter((value) => value !== item))}>Remove</Button></div>)}
      </div>
    </article>
  );
}

function TagSettings({ settings, saveSettings }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#0f8b8d");
  return (
    <article className="settings-panel">
      <h2>Tags</h2>
      <div className="add-row tag-add-row">
        <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Add tag" />
        <input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        <Button variant="outline" onClick={() => {
          if (!label.trim()) return;
          saveSettings({ ...settings, tags: [...settings.tags.filter((tag) => tag.label.toLowerCase() !== label.trim().toLowerCase()), { label: label.trim(), color }] });
          setLabel("");
        }}><Plus size={16} />Add</Button>
      </div>
      <div className="settings-list">
        {settings.tags.map((tag) => (
          <div className="settings-row" key={tag.label}>
            <Badge style={{ background: tag.color, borderColor: tag.color, color: "#fff" }}>{tag.label}</Badge>
            <Button variant="ghost" size="sm" onClick={() => saveSettings({ ...settings, tags: settings.tags.filter((item) => item.label !== tag.label) })}>Remove</Button>
          </div>
        ))}
      </div>
    </article>
  );
}

function TagList({ tags, settings }) {
  if (!tags?.length) return <span className="muted">None</span>;
  return (
    <div className="chip-wrap">
      {tags.map((tag) => {
        const meta = settings.tags.find((item) => item.label === tag);
        return <Badge key={tag} style={meta ? { background: meta.color, borderColor: meta.color, color: "#fff" } : undefined}>{tag}</Badge>;
      })}
    </div>
  );
}
