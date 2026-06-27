<p align="center">
  <img src="icons/icon128.png" alt="Airtime icon" width="128" height="128">
</p>

# Airtime

A lightweight Chrome extension to **practice the pace of your speech**. Airtime adds a small, draggable widget to any page with a microphone button, a live transcript, and a real‑time **words‑per‑minute (WPM)** meter that turns green when you're in your ideal range and red when you're too fast or too slow.

## Features

- 🎙️ **One‑click recording** — click the mic to start, click again to end.
- ⏸️ **Pause / Resume** — the same button adapts to the current state.
- 📝 **Live transcript** — powered by the browser's Web Speech API.
- 📊 **Live WPM meter** — green inside your ideal range, red outside it, with a helpful coaching hint.
- 💾 **5‑recording history** — the most recent five sessions are kept; the oldest is replaced automatically.
- ▶️ **Inline replay** — play any saved recording without downloading it.
- ⬇️ **Downloads** — export the audio (`.webm`) and transcript (`.txt`), named `Airtime_<length>_<WPM>wpm` (e.g. `Airtime_2m30s_130wpm`).
- ⚙️ **Settings** — set your ideal WPM range, enable **Download on discard**, and toggle **Dark mode**.
- 🔁 **Persistence** — recordings and settings are stored locally via `chrome.storage` and survive new tabs, closing the widget, and restarting Chrome.

## Installation (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top‑right).
3. Click **Load unpacked** and select this `Airtime` folder.
4. Open a normal `https://` page and click the Airtime toolbar icon. Click again to toggle the widget.

> Airtime cannot run on restricted pages such as `chrome://` pages, the New Tab page, the Chrome Web Store, or the PDF viewer. Use it on a regular website.

## Usage

1. Click the **mic** to start recording. Grant microphone access when prompted.
2. Speak naturally and watch the **WPM** meter and **live transcript**.
3. Use **Pause / Resume** as needed.
4. Click the **mic** again to end. The session is saved to **Recordings**.
5. **Play**, **download audio**, or **download transcript** from the Recordings list.

Open **Settings** (the gear icon) to:
- Set your **ideal WPM range** (only inside this range is green). Default: 110–160.
- Enable **Download on discard** — the oldest recording is auto‑downloaded right before it's replaced.
- Toggle **Dark mode**.

## Permissions

| Permission | Why it's used |
| --- | --- |
| `activeTab` + `scripting` | Inject the widget into the current tab **only when you click the toolbar icon**. |
| `storage` + `unlimitedStorage` | Save recordings, transcripts, and settings locally on your device. |
| Microphone (runtime) | Capture audio and generate the live transcript. Requested by the browser when you first record. |

Airtime requests **no broad host permissions** — it does not read or modify the pages you visit.

## Privacy

Recordings and transcripts are stored **locally on your device** and are never sent to the developer. The **live transcript** uses the browser's Web Speech API, which streams microphone audio to the browser vendor's speech service (e.g. Google) for transcription. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details.

## Language support

- **Audio recording** works for any language.
- **Live transcript** follows your browser locale (`navigator.language`) and supports the many languages offered by Chrome's Web Speech API.
- **WPM** is counted by whitespace, so it is most accurate for space‑separated languages. For languages without spaces (e.g. Chinese, Japanese, Thai) the count reflects segments rather than words.

## Known limitations

- The live transcript requires Chrome/Edge with an internet connection (Web Speech API). Audio recording still works without it.
- Microphone access is granted **per website**, because the widget runs in the page's context.
- Open widgets in two tabs do not live‑sync; each reloads the latest data when re‑opened.

## Project structure

```
Airtime/
├─ manifest.json       # MV3 manifest
├─ background.js       # Service worker — injects the widget on icon click
├─ content.js          # Widget UI and all recording/transcript/WPM logic
├─ content.css         # Light + dark theme styling
├─ icons/              # Extension icons (16/48/128)
├─ README.md
├─ PRIVACY_POLICY.md
└─ LICENSE
```

## License

Released under the [MIT License](LICENSE).
