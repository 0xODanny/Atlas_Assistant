# Atlas

Temporary internal working name for a personal calendar, organizer, and AI assistant.

The visible product name lives in `lib/config.ts` as `APP_DISPLAY_NAME`.

V0 is a website, installable PWA, and Telegram Mini App shell. Data is local and mocked. No paid services, bots, or credentials.

## Requirements

- Node 20

## Local development

```bash
cd /Users/Daniel/Code/atlas
npm install
npm run dev
```

Dev server for this workspace: [http://localhost:3002](http://localhost:3002). `npm run dev` defaults to 3000.

## OpenAI (local)

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`. The key stays server-side and is gitignored.

- Key present: `/api/assistant` uses the live model. Failures do not fall back to the local classifier.
- Key absent: Atlas keeps running with the deterministic local path.

Settings shows **OpenAI — Connected** or **OpenAI — Not configured**.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Routes

- `/today`
- `/calendar`
- `/assistant`
- `/brief`
- `/settings`
- `/events/[id]`
- `POST /api/assistant`

## Notes

- Calendar create/edit/delete is local and persisted in `localStorage`.
- The assistant inspects the local calendar context and proposes changes. Apply them in the UI.
- The assistant proposes changes only. Apply them in the UI. Google, iCloud, Telegram bot, weather, auth, and recording are not connected.
