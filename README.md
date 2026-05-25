# RoomSense AI Private

Local-first room sensor dashboard for an Android phone browser or a desktop browser.

The app uses the camera and microphone only after the user starts monitoring and grants browser permissions. By default, summaries and vision checks use local fallback rules. No Google API is required.

## Run Locally On Windows

1. Install Node.js 20+.
2. Double-click `run-local.cmd`.
3. Open the URL printed by the launcher:
   - Desktop: `http://localhost:3000/?access_key=...`
   - Phone on the same Wi-Fi: `https://YOUR-PC-IP:3443/?access_key=...`

Android Chrome requires HTTPS for camera and microphone access on LAN addresses. The launcher starts both HTTP for desktop testing and HTTPS for the phone. The HTTPS certificate is generated locally for development, so the phone may show a warning once.

The launcher creates a local `ROOMSENSE_ACCESS_KEY` in `.env.local` and prints a phone URL that already contains the key. The real key is intentionally not committed to GitHub. Hebrew setup instructions are in `MOBILE_INSTALL_HE.md`.

## Optional AI Provider

Copy `.env.example` to `.env.local` and fill an OpenAI-compatible endpoint only if you want external or local-model AI analysis.

Example for a local OpenAI-compatible server:

```env
AI_API_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=llava:latest
AI_PROVIDER_LABEL=Local Ollama
```

After configuring it, enable External AI in Settings. The dashboard tracks request count, estimated tokens, provider tokens when returned, and bytes in/out.

## Current Privacy Notes

- Camera/microphone are browser permission-gated.
- App fonts are local system fonts; no Google Fonts request.
- Snapshots are stored in memory on the local Node server.
- Event logs and settings are currently in memory and reset when the server restarts.
