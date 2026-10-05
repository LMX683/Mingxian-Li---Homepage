# Session recording and replay

The homepage footer offers **Session recording**. Recording is off until the visitor starts it. It stays in the current tab's `sessionStorage` and can be exported as JSON, stopped or cleared. Closing the tab clears tab storage. No collection endpoint or API key is configured. Respect your own privacy policy when enabling remote collection.

## Replay

1. Start recording from the homepage footer, interact with the page, then stop and export JSON.
2. Open `session-player.html` and import the session.
3. Play, pause, seek, use 1× / 2× / 4×, or enable skip inactivity.
4. The viewer may fetch website CSS, images and fonts from the original public asset hosts. It does not upload the recording.

Imported recordings are untrusted. Replay uses `sandbox="allow-same-origin"` with **no allow-scripts**, an attribute/tag allowlist and a CSP that blocks scripts, connections, forms and unapproved resource hosts. `allow-scripts` without `allow-same-origin` would prevent this DOM-based parent controller accessing `contentDocument`. Never combine both permissions here.

## Server-side / offline insights

```sh
python3 analytics/analyze.py /path/to/session.json --output /path/to/insights.json
```

This extracts observed facts and produces two deterministic annotations without an API call. Import the output into the viewer's Insights section.

For actual AI interpretations, install the Python requirements in a virtual environment and set a server-side API key and a structured-output-compatible model:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r analytics/requirements.txt
export OPENAI_API_KEY='your-server-side-key'
export OPENAI_MODEL='your-supported-model'
python3 analytics/analyze.py /path/to/session.json --ai --output /path/to/insights.json
```

The script uses `OpenAI().responses.parse(..., text_format=Report, store=False)`. Only the feature summary is sent. It validates 2–4 structured insights and distinguishes observed actions from hypotheses. No key belongs in this repository, HTML or client JS. API refusal/incomplete output fails explicitly. The live AI call requires a configured key/model and has not been validated by the offline tests.

## SDK contract

`new SessionTracker({onFlush, endpoint, maxEvents}).start()` records one session per instance. Export with `.export()`, stop with `.stop()`. `onFlush({meta, events})` runs every 50 events or 5 seconds. A heartbeat bounds quiet-session duration. Optional `endpoint` is used only for unload `sendBeacon`; implement normal remote upload in `onFlush` with retries, batching and server-side sequencing. The default homepage does neither. Do not treat beacon acceptance as server receipt.

Events have monotonically ordered `timestamp` milliseconds since recording started, generated from `performance.now() - startTime`. Metadata includes `startedAt` for wall-clock click timestamps. Stable numeric node IDs survive moves. Child mutation records include a following-sibling ID. Text/attribute changes record intermediate values where available; private attribute values are never stored. All form values, password fields and `[data-private]` / `.private` / `.sensitive` subtrees are masked. URL query strings and fragments are removed. Scripts and recorder controls are excluded. Avoid putting sensitive text outside masked regions.

## Limits

This is a DOM-based replay implementation for this static homepage, **not lossless recording of arbitrary websites**. Canvas/video frames, shadow DOM, cross-origin iframe contents, CSSOM changes, transient pseudo states, full SPA navigation and network state are not captured. Styles/images can change or disappear; pin or archive resources privately for reproducible historical replay. Browser crashes can lose up to the last unflushed batch. Session storage can fill. Recording stops at 10,000 events. Viewer accepts up to 8 MB / 20,000 events. Seeking reconstructs from the first snapshot, so very large sessions are slower. Resume recording by creating a new instance/session.

Scroll depth is viewport-bottom/document-height; unknown or non-scrollable documents return null. Same-site CV clicks are key actions, not external links. Four clicks within one second and 30 pixels are **possible** rage clicks, not proof of frustration. Total duration is observed elapsed time; visible time is not proven attention. Referrer may be empty and blocked by the browser. URL/section strings are untrusted data in the LLM prompt. Actual downloads, user identity and departure motives cannot be confirmed from this event stream.

GitHub Pages serves the static viewer but cannot run this Python script or receive session POSTs. Automated multi-visitor collection needs a separately deployed collector, access-controlled storage, retention/deletion policy and server-side analysis. The replay URL is public; it has no session list and no bundled visitor data.

## Verification

```sh
python3 -m unittest discover -s tests -v
npm install
npx playwright install chromium
python3 -m http.server 8765 --bind 127.0.0.1
# In another terminal:
npm run test:browser
# If using an installed Chrome instead of Playwright Chromium:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

Official implementation references:
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- https://developers.openai.com/api/docs/guides/structured-outputs
