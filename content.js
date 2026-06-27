/* Airtime - floating speech pace practice widget.
 * Injected into the active tab. Handles audio recording (MediaRecorder),
 * live transcript (Web Speech API), live WPM, and a 5-item download history.
 */

(function () {
  // If already injected, just toggle visibility instead of rebuilding.
  if (window.__airtimeLoaded) {
    const existing = document.getElementById("airtime-root");
    if (existing) existing.classList.toggle("airtime-hidden");
    return;
  }
  window.__airtimeLoaded = true;

  // ---- i18n: localized strings are auto-selected by chrome.i18n based on
  // the browser's UI locale (the _locales method). No manual selection needed. ----
  function t(key, subs) {
    try {
      const msg = chrome.i18n.getMessage(key, subs);
      return msg || key;
    } catch (_) {
      return key;
    }
  }

  // ---- WPM thresholds (words per minute), user-configurable ----
  let wpmLow = 110; // below this = too slow
  let wpmHigh = 160; // above this = too fast
  let downloadOnDiscard = false; // auto-download recordings before they're dropped
  let darkMode = false; // dark theme toggle
  const MAX_HISTORY = 5;

  // ---- State ----
  let state = "idle"; // "idle" | "recording" | "paused"
  let mediaStream = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let recognition = null;
  let finalTranscript = "";
  let interimTranscript = "";
  let recognitionShouldRun = false;

  let elapsedMs = 0; // active (non-paused) recording time
  let lastTick = 0;
  let timerId = null;

  let history = []; // [{ name, time, audioData, text, wpm }]
  let currentAudio = null; // <audio> element for inline playback
  let playingIdx = -1; // index of the item currently playing, or -1

  // ---- Build UI ----
  const root = document.createElement("div");
  root.id = "airtime-root";
  root.innerHTML = `
    <div class="airtime-header" id="airtime-drag">
      <div class="airtime-title">
        <span class="airtime-dot" id="airtime-dot"></span>
        <span>Airtime</span>
      </div>
      <div class="airtime-header-actions">
        <button class="airtime-gear" id="airtime-gear" title="${t("settings")}">${gearSvg()}</button>
        <button class="airtime-close" id="airtime-close" title="${t("close")}">&times;</button>
      </div>
    </div>
    <div class="airtime-body">
      <div class="airtime-settings airtime-collapsed" id="airtime-settings">
        <div class="airtime-settings-title">${t("idealWpmRange")}</div>
        <div class="airtime-settings-row">
          <label class="airtime-field">${t("low")}
            <input type="number" id="airtime-low" min="40" max="400" step="1">
          </label>
          <label class="airtime-field">${t("high")}
            <input type="number" id="airtime-high" min="40" max="400" step="1">
          </label>
        </div>
        <label class="airtime-toggle">
          <input type="checkbox" id="airtime-dod">
          <span>${t("downloadOnDiscard")}</span>
          <span class="airtime-info" tabindex="0" title="${t("downloadOnDiscardInfo")}">i</span>
        </label>
        <label class="airtime-toggle">
          <input type="checkbox" id="airtime-dark">
          <span>${t("darkMode")}</span>
        </label>
        <button class="airtime-save" id="airtime-save">${t("saveRange")}</button>
        <div class="airtime-settings-msg" id="airtime-settings-msg"></div>
      </div>

      <div class="airtime-controls">
        <button class="airtime-mic" id="airtime-mic" title="${t("startRecording")}">
          ${micSvg()}
        </button>
        <button class="airtime-secondary" id="airtime-pause" disabled>${t("pause")}</button>
        <div class="airtime-note" id="airtime-note">${t("clickMicToStart")}</div>
      </div>

      <div class="airtime-wpm">
        <span class="airtime-wpm-value" id="airtime-wpm">--</span>
        <span class="airtime-wpm-label">${t("wpm")}</span>
      </div>
      <div class="airtime-wpm-hint" id="airtime-wpm-hint"></div>

      <div class="airtime-collapsible">
        <button class="airtime-collapse-head" data-target="airtime-transcript-body">
          <span>${t("liveTranscript")}</span>
          ${chevronSvg()}
        </button>
        <div class="airtime-collapse-body airtime-collapsed" id="airtime-transcript-body">
          <div class="airtime-transcript" id="airtime-transcript"></div>
        </div>
      </div>

      <div class="airtime-error" id="airtime-error"></div>

      <div class="airtime-collapsible">
        <button class="airtime-collapse-head" data-target="airtime-history-body">
          <span>${t("recordings")}</span>
          ${chevronSvg()}
        </button>
        <div class="airtime-collapse-body airtime-collapsed" id="airtime-history-body">
          <div class="airtime-history-tools">
            <button class="airtime-clear" id="airtime-clear" disabled>${t("clearAll")}</button>
          </div>
          <div class="airtime-history" id="airtime-history">
            <div class="airtime-history-empty">${t("noRecordings")}</div>
          </div>
          <div class="airtime-share">
            <a href="https://chromewebstore.google.com/detail/pnfhhjbliopikajmkpichdkjdcgmdjjb" target="_blank" rel="noopener noreferrer">${t("shareLink")}</a> ${t("shareSuffix")}
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ---- Element refs ----
  const els = {
    dot: root.querySelector("#airtime-dot"),
    mic: root.querySelector("#airtime-mic"),
    pause: root.querySelector("#airtime-pause"),
    note: root.querySelector("#airtime-note"),
    wpm: root.querySelector("#airtime-wpm"),
    wpmHint: root.querySelector("#airtime-wpm-hint"),
    transcript: root.querySelector("#airtime-transcript"),
    error: root.querySelector("#airtime-error"),
    history: root.querySelector("#airtime-history"),
    clear: root.querySelector("#airtime-clear"),
    close: root.querySelector("#airtime-close"),
    drag: root.querySelector("#airtime-drag"),
    gear: root.querySelector("#airtime-gear"),
    settings: root.querySelector("#airtime-settings"),
    low: root.querySelector("#airtime-low"),
    high: root.querySelector("#airtime-high"),
    save: root.querySelector("#airtime-save"),
    settingsMsg: root.querySelector("#airtime-settings-msg"),
    dod: root.querySelector("#airtime-dod"),
    dark: root.querySelector("#airtime-dark")
  };

  // ---- Events ----
  els.mic.addEventListener("click", onMicClick);
  els.pause.addEventListener("click", onPauseClick);
  els.clear.addEventListener("click", clearHistory);
  els.close.addEventListener("click", () => root.classList.add("airtime-hidden"));
  els.gear.addEventListener("click", () => els.settings.classList.toggle("airtime-collapsed"));
  els.save.addEventListener("click", saveSettings);
  els.dod.addEventListener("change", () => {
    downloadOnDiscard = els.dod.checked;
    persistSettings();
  });
  els.dark.addEventListener("change", () => {
    darkMode = els.dark.checked;
    applyTheme();
    persistSettings();
  });
  root.querySelectorAll(".airtime-collapse-head").forEach((head) => {
    head.addEventListener("click", () => {
      const body = root.querySelector("#" + head.dataset.target);
      if (body) body.classList.toggle("airtime-collapsed");
      head.classList.toggle("airtime-open");
    });
  });
  makeDraggable(root, els.drag);

  // Restore any previously saved recordings and settings.
  loadHistory();
  loadSettings();

  // ---- Mic (start / stop) ----
  async function onMicClick() {
    if (state === "idle") {
      await startRecording();
    } else {
      stopRecording();
    }
  }

  async function startRecording() {
    clearError();
    stopPlayback();
    renderHistory();
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      showError(t("micBlocked"));
      return;
    }

    // Reset session data
    audioChunks = [];
    finalTranscript = "";
    interimTranscript = "";
    elapsedMs = 0;
    renderTranscript();

    // MediaRecorder
    try {
      mediaRecorder = new MediaRecorder(mediaStream);
    } catch (err) {
      showError(t("recordingNotSupported"));
      stopStream();
      return;
    }
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = handleRecorderStop;
    mediaRecorder.start();

    startRecognition();
    startTimer();

    setState("recording");
  }

  function stopRecording() {
    setState("idle");
    stopTimer();
    stopRecognition();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop(); // triggers handleRecorderStop -> saves to history
    } else {
      stopStream();
    }
  }

  // ---- Pause / Resume ----
  function onPauseClick() {
    if (state === "recording") {
      setState("paused");
      stopTimer();
      stopRecognition();
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.pause();
      }
    } else if (state === "paused") {
      setState("recording");
      startTimer();
      startRecognition();
      if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
      }
    }
  }

  // ---- Recorder stop -> save to history ----
  function handleRecorderStop() {
    stopStream();
    const blob = new Blob(audioChunks, {
      type: mediaRecorder && mediaRecorder.mimeType ? mediaRecorder.mimeType : "audio/webm"
    });
    audioChunks = [];

    const text = (finalTranscript + interimTranscript).trim();
    if (blob.size === 0 && !text) return; // nothing captured


    const now = new Date();
    const wpm = computeWpm();
    const stamp = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const lengthStr = formatDuration(elapsedMs);

    // Convert audio to a data URL so it can be persisted across reloads.
    const reader = new FileReader();
    reader.onloadend = () => {
      const item = {
        name: `Airtime ${stamp}`,
        fileName: `Airtime_${lengthStr}_${wpm}wpm`,
        audioData: reader.result || "",
        text: text || t("noTranscriptCaptured"),
        wpm: wpm,
        ext: extFromMime(blob.type)
      };

      history.unshift(item);
      if (history.length > MAX_HISTORY) {
        const discarded = history.pop();
        if (downloadOnDiscard && discarded) downloadItem(discarded);
      }
      renderHistory();
      saveHistory();
    };
    reader.readAsDataURL(blob);
  }

  // ---- Speech recognition ----
  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      els.wpmHint.textContent = t("transcriptUnavailable");
      return;
    }
    recognitionShouldRun = true;
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Match the auto-selected UI locale so the transcript recognizes that language.
    recognition.lang = t("speechLang") || navigator.language || "en-US";

    recognition.onresult = (event) => {
      interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript += res[0].transcript;
        } else {
          interimTranscript += res[0].transcript;
        }
      }
      renderTranscript();
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        showError(t("speechBlocked"));
        recognitionShouldRun = false;
      }
    };

    recognition.onend = () => {
      // Auto-restart while we are actively recording (Chrome stops periodically).
      if (recognitionShouldRun && state === "recording") {
        try { recognition.start(); } catch (_) { /* ignore */ }
      }
    };

    try { recognition.start(); } catch (_) { /* already started */ }
  }

  function stopRecognition() {
    recognitionShouldRun = false;
    if (recognition) {
      try { recognition.stop(); } catch (_) { /* ignore */ }
    }
  }

  // ---- Timer & WPM ----
  function startTimer() {
    lastTick = Date.now();
    timerId = setInterval(() => {
      const now = Date.now();
      elapsedMs += now - lastTick;
      lastTick = now;
      renderWpm();
    }, 500);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function countWords(str) {
    const t = str.trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }

  function computeWpm() {
    const minutes = elapsedMs / 60000;
    if (minutes <= 0) return 0;
    const words = countWords(finalTranscript + interimTranscript);
    return Math.round(words / minutes);
  }

  function renderWpm() {
    const minutes = elapsedMs / 60000;
    if (minutes < 0.05) {
      els.wpm.textContent = "--";
      els.wpm.className = "airtime-wpm-value";
      els.wpmHint.textContent = t("keepSpeaking");
      return;
    }
    const wpm = computeWpm();
    els.wpm.textContent = String(wpm);
    if (wpm < wpmLow) {
      els.wpm.className = "airtime-wpm-value airtime-bad";
      els.wpmHint.textContent = t("paceSlow");
    } else if (wpm > wpmHigh) {
      els.wpm.className = "airtime-wpm-value airtime-bad";
      els.wpmHint.textContent = t("paceFast");
    } else {
      els.wpm.className = "airtime-wpm-value airtime-good";
      els.wpmHint.textContent = t("paceGood");
    }
  }

  // ---- Rendering ----
  function renderTranscript() {
    els.transcript.innerHTML =
      escapeHtml(finalTranscript) +
      `<span class="airtime-interim">${escapeHtml(interimTranscript)}</span>`;
    els.transcript.scrollTop = els.transcript.scrollHeight;
  }

  function renderHistory() {
    els.clear.disabled = history.length === 0;
    if (history.length === 0) {
      els.history.innerHTML = `<div class="airtime-history-empty">${t("noRecordings")}</div>`;
      return;
    }
    els.history.innerHTML = "";
    history.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "airtime-item";
      card.innerHTML = `
        <div class="airtime-item-head">
          <span class="airtime-item-name">${escapeHtml(item.name)}</span>
          <span class="airtime-item-meta">${item.wpm} ${t("wpm")}</span>
        </div>
        <div class="airtime-item-actions">
          <button class="airtime-play" data-idx="${idx}" title="${t("playRecording")}">
            ${playingIdx === idx ? pauseSvg() : playSvg()}
          </button>
          <button class="airtime-dl" data-type="audio" data-idx="${idx}">${t("audio")}</button>
          <button class="airtime-dl" data-type="text" data-idx="${idx}">${t("transcript")}</button>
        </div>
      `;
      els.history.appendChild(card);
    });

    els.history.querySelectorAll(".airtime-play").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        togglePlay(idx);
      });
    });

    els.history.querySelectorAll(".airtime-dl").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const item = history[idx];
        if (!item) return;
        if (btn.dataset.type === "audio") {
          downloadAudio(item);
        } else {
          downloadTranscript(item);
        }
      });
    });
  }

  function downloadAudio(item) {
    if (item && item.audioData) downloadUrl(item.audioData, `${item.fileName}.${item.ext}`);
  }

  function downloadTranscript(item) {
    if (!item) return;
    const blob = new Blob([item.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `${item.fileName}.txt`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function downloadItem(item) {
    downloadAudio(item);
    downloadTranscript(item);
  }

  function clearHistory() {
    stopPlayback();
    history = [];
    renderHistory();
    saveHistory();
  }

  // ---- Inline playback ----
  function togglePlay(idx) {
    const item = history[idx];
    if (!item || !item.audioData) return;

    // Clicking the item that's already playing pauses it.
    if (playingIdx === idx && currentAudio) {
      stopPlayback();
      renderHistory();
      return;
    }

    stopPlayback();
    currentAudio = new Audio(item.audioData);
    playingIdx = idx;
    currentAudio.onended = () => {
      stopPlayback();
      renderHistory();
    };
    currentAudio.onerror = () => {
      stopPlayback();
      renderHistory();
    };
    currentAudio.play().catch(() => {
      stopPlayback();
      renderHistory();
    });
    renderHistory();
  }

  function stopPlayback() {
    if (currentAudio) {
      try { currentAudio.pause(); } catch (_) { /* ignore */ }
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio = null;
    }
    playingIdx = -1;
  }

  // ---- Persistence (chrome.storage.local) ----
  function saveHistory() {
    try {
      chrome.storage.local.set({ airtimeHistory: history });
    } catch (_) { /* storage unavailable */ }
  }

  function loadHistory() {
    try {
      chrome.storage.local.get("airtimeHistory", (data) => {
        if (data && Array.isArray(data.airtimeHistory)) {
          history = data.airtimeHistory.slice(0, MAX_HISTORY);
          renderHistory();
        }
      });
    } catch (_) { /* storage unavailable */ }
  }

  // ---- Settings (ideal WPM range) ----
  function applyTheme() {
    root.classList.toggle("airtime-dark", darkMode);
  }

  function applySettingsToInputs() {
    els.low.value = wpmLow;
    els.high.value = wpmHigh;
    els.dod.checked = downloadOnDiscard;
    els.dark.checked = darkMode;
  }

  function persistSettings() {
    try {
      chrome.storage.local.set({
        airtimeSettings: { low: wpmLow, high: wpmHigh, downloadOnDiscard: downloadOnDiscard, darkMode: darkMode }
      });
    } catch (_) { /* storage unavailable */ }
  }

  function saveSettings() {
    const low = parseInt(els.low.value, 10);
    const high = parseInt(els.high.value, 10);
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      els.settingsMsg.textContent = t("enterBothValues");
      return;
    }
    if (low < 1 || high < 1) {
      els.settingsMsg.textContent = t("valuesMustBePositive");
      return;
    }
    if (low >= high) {
      els.settingsMsg.textContent = t("lowMustBeLessThanHigh");
      return;
    }
    wpmLow = low;
    wpmHigh = high;
    els.settingsMsg.textContent = t("savedRange", [String(low), String(high)]);
    persistSettings();
    if (state !== "idle") renderWpm();
  }

  function loadSettings() {
    try {
      chrome.storage.local.get("airtimeSettings", (data) => {
        if (data && data.airtimeSettings) {
          const s = data.airtimeSettings;
          if (Number.isFinite(s.low) && Number.isFinite(s.high) && s.low < s.high) {
            wpmLow = s.low;
            wpmHigh = s.high;
          }
          downloadOnDiscard = !!s.downloadOnDiscard;
          darkMode = !!s.darkMode;
        }
        applyTheme();
        applySettingsToInputs();
      });
    } catch (_) {
      applyTheme();
      applySettingsToInputs();
    }
  }

  // ---- State machine UI ----
  function setState(next) {
    state = next;
    if (next === "recording") {
      els.mic.classList.add("airtime-recording");
      els.mic.title = t("stopRecording");
      els.dot.classList.add("airtime-live");
      els.pause.disabled = false;
      els.pause.textContent = t("pause");
      els.note.textContent = t("clickMicToEnd");
    } else if (next === "paused") {
      els.mic.classList.add("airtime-recording");
      els.mic.title = t("stopRecording");
      els.dot.classList.remove("airtime-live");
      els.pause.disabled = false;
      els.pause.textContent = t("resume");
      els.note.textContent = t("pausedClickMicToEnd");
    } else {
      // idle
      els.mic.classList.remove("airtime-recording");
      els.mic.title = t("startRecording");
      els.dot.classList.remove("airtime-live");
      els.pause.disabled = true;
      els.pause.textContent = t("pause");
      els.note.textContent = t("clickMicToStart");
      els.wpm.textContent = "--";
      els.wpm.className = "airtime-wpm-value";
      els.wpmHint.textContent = "";
    }
  }

  // ---- Helpers ----
  function stopStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  function downloadUrl(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function showError(msg) {
    els.error.textContent = msg;
  }
  function clearError() {
    els.error.textContent = "";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m${pad(seconds)}s` : `${seconds}s`;
  }

  function extFromMime(mime) {
    if (!mime) return "webm";
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4") || mime.includes("mpeg")) return "mp4";
    if (mime.includes("wav")) return "wav";
    return "webm";
  }

  function micSvg() {
    return `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z"/>
        <path d="M17 11a1 1 0 1 0-2 0 3 3 0 0 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V19H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.1A5 5 0 0 0 17 11z"/>
      </svg>`;
  }

  function playSvg() {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
  }

  function pauseSvg() {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;
  }

  function gearSvg() {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.29 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.24.1.47 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>`;
  }

  function chevronSvg() {
    return `<svg class="airtime-chevron" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.12 9.29 12 13.17l3.88-3.88a1 1 0 0 1 1.41 1.42l-4.59 4.58a1 1 0 0 1-1.41 0L6.7 10.71a1 1 0 1 1 1.42-1.42z"/></svg>`;
  }

  // ---- Dragging ----
  function makeDraggable(panel, handle) {
    let dragging = false;
    let startX = 0, startY = 0, originLeft = 0, originTop = 0;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest(".airtime-close")) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      // Switch to left/top positioning for free movement.
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.right = "auto";
      originLeft = rect.left;
      originTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      let newLeft = originLeft + (e.clientX - startX);
      let newTop = originTop + (e.clientY - startY);
      const maxLeft = window.innerWidth - panel.offsetWidth;
      const maxTop = window.innerHeight - panel.offsetHeight;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      panel.style.left = newLeft + "px";
      panel.style.top = newTop + "px";
    });

    document.addEventListener("mouseup", () => {
      dragging = false;
    });
  }
})();
