# CLAUDE.md — Project Guide for AI Assistants

## Project Overview

**Telegram Bot** that acts as a personal AI assistant, integrating **AI chat via Vertex-Key.com** (OpenAI-compatible API), **Google Docs** for saving notes/images, **Google Calendar** for scheduling, and a local **To-Do list**. Built with **TypeScript**, uses the **grammY** framework for Telegram Bot API.

## Tech Stack

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| Runtime      | Node.js + TypeScript (ES2022, CommonJS)       |
| Bot Framework| grammY v1.20                                  |
| AI           | Vertex-Key.com (`openai` SDK) — model `aws/claude-haiku-4-5` via OpenAI-compatible API |
| Google APIs  | `googleapis` (Calendar v3, Drive v3, Docs v1) |
| Auth         | Google Service Account (`service_account.json`) |
| Config       | `dotenv` (`.env` file)                        |
| Dev          | `nodemon` + `ts-node` for hot-reload          |

## Directory Structure

```
bot-forward-docs/
├── .env                        # Secrets — NEVER commit
├── service_account.json        # Google SA key — NEVER commit
├── package.json
├── tsconfig.json
├── nodemon.json
├── data/
│   ├── users.json              # Persisted user profiles & doc aliases
│   └── todos.json              # Persisted to-do items (created at runtime)
├── src/
│   ├── config.ts               # Loads env vars, validates required keys
│   ├── index.ts                # Entry point — bot commands & message handlers
│   ├── services/
│   │   ├── ai.service.ts       # AI chat via Vertex-Key (OpenAI SDK), calendar analysis
│   │   ├── google.service.ts   # Calendar, Drive, Docs API wrappers
│   │   ├── todo.service.ts     # File-based to-do CRUD per user
│   │   └── user.service.ts     # File-based user profile management & doc aliases
│   ├── utils/                  # (empty — reserved for future utilities)
│   ├── test-ai.ts              # Manual test: verify Vertex-Key API connection
│   ├── test-calendar.ts        # Manual test: create calendar event
│   └── test-drive.ts           # Manual test: upload file to Drive
└── dist/                       # Compiled JS output (gitignored)
```

## Commands

```bash
# Install dependencies
npm install

# Development (hot-reload via nodemon + ts-node)
npm run dev

# Build TypeScript → dist/
npm run build

# Production
npm start

# Manual tests
npx ts-node src/test-ai.ts
npx ts-node src/test-calendar.ts
npx ts-node src/test-drive.ts
```

## Environment Variables (`.env`)

| Variable                       | Required | Description                              |
| ------------------------------ | -------- | ---------------------------------------- |
| `TELEGRAM_BOT_TOKEN`          | ✅       | Telegram Bot API token                   |
| `VERTEX_KEY_API_KEY`          | ✅       | API key from vertex-key.com              |
| `VERTEX_KEY_BASE_URL`         | Optional | API base URL (default: `https://vertex-key.com/api/v1`) |
| `AI_MODEL`                    | Optional | Model ID (default: `aws/claude-haiku-4-5`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅    | Path to Service Account JSON file        |
| `GOOGLE_DOC_ID`               | Optional | Default Google Doc ID for saving content |
| `GOOGLE_DRIVE_FOLDER_ID`      | Optional | Drive folder for photo uploads           |

Both `TELEGRAM_BOT_TOKEN` and `VERTEX_KEY_API_KEY` are validated on startup — app exits if missing.

## Architecture & Key Patterns

### Message Flow (index.ts)

All logic is in `bot.on('message:text')` and `bot.on('message:photo')` handlers in `index.ts`. Message routing uses **regex matching + keyword detection** in this priority order:

1. **Doc management**: `Add Doc <alias> <id>`, `Use Doc <alias>`, `Current Doc`
2. **To-do**: `Add Task: <text>`, `List Tasks`, `Complete Task: <index|keyword>`
3. **Calendar**: Messages containing "schedule", "meeting", or "remind" → AI extracts event data → Calendar API
4. **Personalization**: `Call me <name>`, `My name is <name>`, `My job is <job>`, `Remember: <note>`
5. **Save to Docs**: `Save: <content>` command OR forwarded messages → appends text to active Google Doc
6. **Default**: Falls through to AI chat with per-user session

### Photo Handler

Photos are saved to Google Docs when:
- Caption contains "save" keyword, OR
- Message is forwarded from another chat

Reacts with ❤ emoji on success (falls back to text reply if reactions aren't supported).

### Service Layer

- **AIService**: Uses OpenAI SDK (`openai` package) with Vertex-Key.com as base URL. Manages per-user conversation history (messages array) with personalized system instructions. History is in-memory (Map, max 50 messages), not persisted. Post-processes responses to strip markdown formatting (bold, headers) and escape underscores.
- **GoogleService**: Thin wrappers around Google APIs. Uses Service Account auth. Calendar defaults to `Asia/Ho_Chi_Minh` timezone.
- **UserService**: File-based persistence to `data/users.json`. Supports multi-doc aliases (e.g., `work` → `<docId>`). Auto-sets first added doc as active.
- **TodoService**: File-based persistence to `data/todos.json`. Supports completion by index (1-based) or keyword search.

### Data Persistence

All data is stored as JSON files in `data/`. Read on service init, written synchronously on every mutation. **No database.**

> ⚠️ This means concurrent writes from multiple bot instances could corrupt data. Run only one instance.

## Important Conventions

- **Language**: Bot responses mix English and Vietnamese (error messages in Vietnamese in `ai.service.ts`).
- **Markdown handling**: AI responses have `*`, `#`, and `_` stripped/escaped before sending to Telegram (parsed as Markdown mode).
- **No tests**: No automated test suite. Only manual test scripts in `src/test-*.ts`.
- **No `.gitignore` visible**: Ensure `node_modules/`, `dist/`, `.env`, `service_account.json`, and `data/` are gitignored.
- **Type safety**: `strict: true` in tsconfig, but some `@ts-ignore` and `any` casts exist (especially in AI service and Google service).

## Common Tasks

### Adding a new bot command
1. Add handler in `src/index.ts` — place it BEFORE the default AI chat fallback.
2. Use regex matching pattern consistent with existing commands.
3. Update the `/help` command text to document it.

### Adding a new Google API integration
1. Add scope in `GoogleService` constructor's `scopes` array.
2. Add method in `google.service.ts`.
3. Ensure Service Account has permissions on the target resource.

### Changing the AI model
- Model is configured via `AI_MODEL` env var (default: `aws/claude-haiku-4-5`).
- Uses Vertex-Key.com prefix format: `aws/claude-opus-4-7`, `aws/claude-sonnet-4-6`, `aws/qwen3-codex`, etc.
- Change in `.env` — no code changes needed.

### Modifying user profile fields
1. Update `UserProfile` interface in `user.service.ts`.
2. Add detection regex in `index.ts` message handler.
3. Call `aiService.refreshSession(userId)` after profile changes to rebuild system instruction.
