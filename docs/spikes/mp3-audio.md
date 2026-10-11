# Spike: MP3 audio for packs

**Status:** Open
**Owner:** Homer
**Decision needed:** Should audio ship as pre-generated MP3 files inside each pack?

## 1. Why this spike

Audio is the one part of the app that does not work outside the dev server.

- Lessons and tests reference Google Translate TTS URLs (`translate.google.com/translate_tts?...`), see `src/utils/audioProxy.ts`.
- Those URLs are rewritten to `/api/audio-proxy`, a route that exists only in the Vite dev and preview servers (`vite.config.ts`).
- On a deployed static site, audio will not load.
- The Google endpoint is unofficial. Its terms do not clearly allow redistribution in a public open-source project, so it cannot be bundled into packs.

The working idea is to generate MP3 files once, store them in each pack, and play them locally. This works offline, works on phones, and does not depend on a third-party endpoint at play time.

## 2. Questions to answer

1. **Quality:** Is the Japanese speech natural enough for N3 listening practice?
2. **Source and licence:** Can we generate the audio with a tool whose output we are allowed to redistribute?
3. **Size:** How big is a pack with audio? Is it within the free storage limits (Supabase, R2)?
4. **Generation cost and time:** How long does it take to generate one lesson's audio? Is it a one-off or repeated cost?
5. **Playback:** Do the MP3 files play on iPhone Safari and Android Chrome, including the auto-advance flow in `useAudioAutoAdvance.ts`?
6. **Offline:** Does the PWA cache work with MP3 files?

## 3. Candidate approaches

| Id | Approach | Notes |
|----|----------|-------|
| A | Offline TTS engine run once on the desktop (for example VOICEVOX, or a local Piper voice if one suits Japanese) | Free, no account. Check the voice licence before redistributing its output. |
| B | Cloud TTS with a free tier (Google Cloud TTS, Azure, or similar) | Good quality, but check the free quota and the terms for storing and redistributing output. |
| C | Keep the current Google URLs and cache them on first play (Cache API) | Still depends on the unofficial endpoint. Not suitable for shared packs. Keep only as a fallback for personal use. |
| D | Browser speech (Web Speech API) at play time | Nothing to ship. Voice quality and availability vary by device, so it cannot be relied on for listening practice. |

## 4. Demos to run

Run each demo, then fill in the results column.

| Demo | What to do | Pass if | Result |
|------|-----------|---------|--------|
| D1 | Generate audio for 5 N3 sentences with approach A | Sounds natural to a native or fluent listener | _TBD_ |
| D2 | Same 5 sentences with approach B | Quality is equal or better, and terms allow redistribution | _TBD_ |
| D3 | Generate audio for one full lesson, then measure total MP3 size | Under 5 MB per lesson at a speech-appropriate bitrate | _TBD_ |
| D4 | Play the MP3s in the quiz flow on iPhone Safari and Android Chrome | Auto-advance waits for the file to end, no autoplay blocking after the first tap | _TBD_ |
| D5 | Load the app offline with MP3s cached (PWA) | Audio plays with the network off | _TBD_ |

## 5. Risks

- **Voice licence:** The engine's voice model may restrict commercial or redistributed use.
- **Autoplay on iOS:** Playback needs a user tap first. The quiz flow must start audio from a button press.
- **Storage limits:** Large audio packs may need R2 rather than Supabase storage.
- **Quality for listening:** Machine voices may be too flat for N3 listening. A human-recorded fallback may be needed for some content.

## 6. Results

_To be filled after the demos._

## 7. Next actions

_To be written after the decision. Candidates to consider:_

- _Update `src/utils/audioProxy.ts` and the lesson and test data format to point at pack-local MP3 files._
- _Add an audio step to the pack validator (file present, format, size)._
- _Add a PWA cache rule for pack audio._
- _Remove the dev-only audio proxy once no content uses the Google URLs._
