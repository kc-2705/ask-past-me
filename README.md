# Ask Past Me

![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=black)
![Expo](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57?logo=sqlite&logoColor=white)
![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=white)

A voice journal for Android. Talk about your day, and the app writes it down, tags the people, places, moods and to-dos, and lets you ask questions about your own past: "When did I last get a haircut?", "What helped when I was stressed?", "Who did I talk to this week?"

Everything stays on the phone. No account, no cloud, no AI service.

## Features

- **Talk**: tap the mic and speak. Live speech-to-text, a live waveform, and the original recording saved for replay (Android 13+).
- **Auto-tags**: people, places, to-dos, topics and mood are picked out of what you say, and the app learns names you use often.
- **Ask**: questions in plain English, answered from your notes with the source notes shown. Understands dates like "last week", "in September", "on my birthday".
- **Timeline**: every note by month, with full-text search and mood filters.
- **Themes**: Calm Lilac (default), Night Voice and Scrapbook.
- **Daily reminder**, **fingerprint lock**, **JSON backup**, and **sample memories** for demos.

## Tech

React Native 0.86 · Expo SDK 57 · TypeScript · Expo Router (tabs) · expo-sqlite with FTS5 full-text search · expo-speech-recognition · expo-audio · expo-notifications · expo-local-authentication · expo-file-system · expo-sharing

## Project layout

```
src/
  app/              Screens (Expo Router). (tabs)/ = Talk, Ask, Timeline, Me; entry/[id] = note detail
  components/       Shared UI: text, cards, tag chips, mic button, waveform, entry card, audio player
  db/database.ts    SQLite schema, migrations, full-text search, queries
  hooks/useVoice.ts Speech-to-text, auto-restart, recording, volume levels
  lib/askEngine.ts  Understands a question and answers it from the notes
  lib/tagger.ts     Finds people, places, moods, to-dos and topics in text
  lib/dates.ts      Date helpers and "last week" / "in September" parsing
  state/            Settings and theme (saved in SQLite)
  theme/themes.ts   The three themes
```

## Run it

Speech recognition needs native code, so the app does not run in Expo Go. Build an APK in the cloud (free Expo account):

```sh
npm install
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

When the build finishes, open the link on your Android phone, download the APK and install it.

## Checks

```sh
npx tsc --noEmit     # types
npx expo lint        # lint
npx expo-doctor      # dependency health
```
