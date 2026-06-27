# Privacy Policy for Airtime

_Last updated: 2026-06-27_

Airtime ("the extension") is a tool for practicing the pace of your speech. This policy explains what data the extension handles and how.

## Summary

- Airtime does **not** collect, transmit, or sell your personal data to the developer or any third party.
- Your recordings, transcripts, and settings are stored **locally on your device**.
- The **live transcript** feature relies on your browser's built‑in speech recognition, which sends microphone audio to your browser vendor's speech service for processing.

## What data the extension handles

| Data | Purpose | Where it lives |
| --- | --- | --- |
| **Microphone audio** | To record your speech and generate a live transcript. | Captured in your browser. Audio recordings are saved locally via `chrome.storage` on your device. |
| **Transcript text** | To show a live transcript and let you download it. | Stored locally via `chrome.storage` on your device. |
| **Settings** (ideal WPM range, download‑on‑discard, dark mode) | To remember your preferences. | Stored locally via `chrome.storage` on your device. |

Airtime keeps only the **five most recent** recordings; older ones are automatically removed (and optionally downloaded to your device first, if you enable "Download on discard").

## Speech recognition and third parties

The live transcript is produced using the browser's **Web Speech API** (`SpeechRecognition`). In Chrome, this feature streams microphone audio to Google's speech‑recognition servers to convert it to text. This processing is performed by the browser vendor, not by Airtime, and is governed by your browser vendor's privacy policy:

- Google Chrome: https://policies.google.com/privacy

If you do not wish to use speech recognition, you can avoid relying on the live transcript; audio recording itself does not require it.

## What the extension does NOT do

- It does **not** send your audio, transcripts, or settings to the developer.
- It does **not** include analytics, tracking, or advertising.
- It does **not** read, modify, or collect the content of the web pages you visit. The widget is injected only when you click the toolbar icon, using the `activeTab` permission.

## Permissions

- `activeTab` and `scripting`: inject the Airtime widget into the current tab only when you click the toolbar icon.
- `storage` and `unlimitedStorage`: save recordings, transcripts, and settings locally on your device.
- Microphone access: requested by the browser when you first record, used solely to capture audio and generate the transcript.

## Data retention and deletion

- Recordings and settings remain on your device until you remove them.
- Use **Clear all** in the widget to delete saved recordings.
- Uninstalling the extension removes all data it stored via `chrome.storage`.

## Children's privacy

Airtime is a general‑purpose productivity tool and is not directed at children under 13.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised.

## Contact

For questions about this policy, please contact the extension's developer through the distribution channel where you obtained Airtime (e.g. the Chrome Web Store listing or the project repository).
