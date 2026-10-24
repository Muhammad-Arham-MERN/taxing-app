بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ

# PROJECT_MAP.md — The Project Lobby

> **Single entry point for any agentic run.** Read this file first. It maps every folder, every file and every function in the repository, with references, so a full cross-project scan is not needed before starting work.

**Last verified against source:** 2026-10-24 (Oracle Object Storage for file bytes, schema v8, cloud-migration CI)
**Current feature branch:** `004-cloud-sync`
**Main branch:** `main`

---

## 0. THE LOBBY CONTRACT — READ BEFORE DOING ANYTHING

وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

This file is a living index and it is **mandatory** that it stays in sync with the code.

**For every agent, on every run:**

1. **Read this file first** before scanning the codebase. It is the table of contents for the whole project.
2. **If you create, rename, move or delete** a folder, file, or function — **update this file in the same change**. Do not leave it stale.
3. **If you add or remove a Tauri command** — update §9 (IPC command surface) and §4.2 (`lib.rs` registration list).
4. **If you change the schema** (tables, columns, migrations, `SCHEMA_VERSION`) — update §8 (Data model) and §4.5 (`store/schema.rs`).
5. **If you change a repository interface** (`src/data/repositories.ts`) — update §3.3 and the matching implementation in §3.4/§3.5.
6. **Bump the "Last verified" date** at the top after any edit you make to this file.
7. When in doubt about *behaviour*, the spec is authoritative: `specs/<feature>/spec.md`. This map tells you **where things live and what they do**, not **what the product must do**.

---

## 1. QUICK FACTS

| Item | Value |
|---|---|
| Product | Offline-first desktop app for income/expenditure statements, customer bills/invoices, and clients |
| Shell | Tauri v2 (Rust 2021 backend + React 19 / TypeScript frontend) |
| Store engine | `turso` crate 0.8 (pure-Rust, `sync` feature) — a single `tax-statements.sqlite` file |
| Cloud | Turso Sync (explicit Push / Pull), last-push-wins; secrets in Windows Credential Manager |
| File storage | File **bytes** live in Oracle Cloud (OCI) Object Storage via the AWS SDK for Rust (S3 compatibility); the store keeps only an `object_key`. Offline, bytes sit in a local-only `tax-statements-cache.sqlite` |
| Frontend build | Vite 8, port 1420 (dev) |
| Tests | Vitest 5 + Testing Library (jsdom) |
| Version source of truth | Git tag `app-vX.Y.Z` → CI stamps it into `tauri.conf.json` |
| Release | GitHub Actions on tag → `tauri-apps/tauri-action` → signed updater artifacts |
| Node quirk | This machine has `NODE_ENV=production` in the shell — run installs/tests with `$env:NODE_ENV='development'` or `npm ci --include=dev` |

---

## 2. REPOSITORY TOP-LEVEL LAYOUT

```
tax-input-system/
├── CLAUDE.md                      # Agent rules (SDD workflow, PHR protocol, ADR rules) — references this file
├── RELEASING.md                   # Local release runbook (git tags, signing keys) — gitignored
├── PROJECT_MAP.md                 # ← THIS FILE (the lobby)
├── secrets.txt                    # Minisign / updater keypair (private+public) — gitignored, NEVER dump values
├── latest.json / latest (1).json  # Tauri updater manifests (build artifacts)
├── backedprompt.txt               # Raw prompt log (input for a past /sp.specify)
├── customerbill-columsn.txt       # Sketched invoice column layout (reference)
├── tax-statements.sqlite          # A local store file (data artifact, gitignored)
├── *.jpeg                         # UI/branding reference image
├── .specify/                      # SpecKit Plus scaffolding (constitution, templates, scripts)
├── specs/                         # Feature specs (001–004), each with spec/plan/tasks/contracts/...
├── migrations/                    # CI cloud-database migrations (Node scripts, run on release)
├── history/prompts/               # Prompt History Records (PHRs) per SDD stage
├── .claude/commands/              # 13 `/sp.*` SDD slash-command definitions (mirror of .commandcode)
├── .commandcode/                  # Slash commands + taste profile (auto-managed, DO NOT hand-edit taste)
├── .github/workflows/release.yml  # The only CI: tag → build → sign → publish
├── test-data/                     # Golden store fixture (`tax-statements.sqlite`)
└── tax-statements-analysis/       # THE APPLICATION (frontend + src-tauri backend)
```

---

## 3. THE APPLICATION — FRONTEND (`tax-statements-analysis/src/`)

React 19 + TypeScript. Architecture: **providers → repositories (seam) → domain/lib (pure) → components (UI)**.

### 3.1 Entry & composition

| File | Responsibility | Key exports |
|---|---|---|
| `src/main.tsx` | React bootstrap; mounts `App` in `StrictMode`. | none (side-effect) |
| `src/App.tsx` | Composition root: `ThemeProvider → DataProvider → AppShell`; wires tabs, cloud controller, storage/close dialogs. | `default App()`; internal `AppShell()`, `ViewTab()`, `bumpRefresh()`, const `EMPTY_STATE` |
| `src/vite-env.d.ts` | Vite ambient types. | none |
| `src/index.css` | Tailwind v4 base + theme tokens. | — |

**`App.tsx` internals:** `AppShell` reads `storage/storageState/refreshStorage` from `useRepositories()`, owns `refreshKey` (forces table reloads) and `chooserOpen`; builds `cloud = useCloudSync({ onPulled: bumpRefresh })`; gates rendering on `storageState?.chosen`. `ViewTab` loads statements for a `StatementFilter` via `statements.findByDateRange`, memoises `summarize(rows)`, renders `DateRangeFilter` + `StatementsTable` + `SummaryFooter`.

### 3.2 Providers (`src/components/providers/`)

| File | Responsibility | Key exports |
|---|---|---|
| `DataProvider.tsx` | Supplies the repository set to the whole app; picks Tauri impls in-app, in-memory impls in browser/tests; exposes storage state. | `DataProvider`, `useRepositories()`; internal `DataContextValue`, `DataContext`, `isTauriRuntime()`, `tauriRepositories()` |
| `ThemeProvider.tsx` | Theme state (dark/light/system) persisted to `localStorage` key `tax-statements-theme`; applies the `dark`/`light` class. | `type Theme`, `const THEME_STORAGE_KEY`, `ThemeProvider`, `useTheme()`; internal `readStoredTheme`, `resolveTheme`, `applyTheme` |

`useRepositories()` returns `{ statements, storage, bills, customers, clients, cloud, setup, storageState, refreshStorage }` and throws outside the provider.

### 3.3 The seam — repository interfaces (`src/data/repositories.ts`)

**This is the contract between UI and backend.** Two implementations satisfy it: `in-memory.ts` (tests/browser) and `tauri.ts` (runtime).

**Interfaces:** `StatementRepository`, `StorageRepository`, `BusinessProfileRepository`, `BillRepository`, `CustomerRepository`, `ClientRepository`, `CategoryRepository`, `ClientRecordRepository`, `CloudRepository`, `SetupRepository` (method lists summarized in §3.4/§3.5).

**Error classes** (all `extends Error`, thrown by impls, mapped back from Rust): `ValidationError(fields)`, `DuplicateSubmissionError`, `InvalidRangeError`, `UnknownStatementError`, `AttachmentWriteFailedError`, `AttachmentOpenFailedError`, `StoreWriteFailedError`, `NotAStoreError`, `LocationUnreachableError`, `StoreDamagedError`, `LocationUnwritableError`, `NoStorageLocationError`, `CarryAcrossInterruptedError(copied, remaining)`, `UnknownBillError`, `UnknownClientError`, `UnknownCategoryError`, `UnknownRecordError`, `InvoiceWriteFailedError`, `InvoiceOpenFailedError`, `SecretsStoreUnavailableError`, `ObjectStorageUnavailableError`, `ObjectStorageNotConfiguredError`.

### 3.4 Live implementation (`src/data/tauri.ts`)

Maps every repository method to a Tauri command. **Files travel as raw request bodies (never JSON/base64); metadata rides in headers.** Converts backend errors → seam error classes via `toSeamError(raw)`.

| Class | Methods |
|---|---|
| `TauriStatementRepository` | `create` (raw body when attached), `findByDateRange`, `listAll` (widest range), `update` (raw body on `replace`), `remove(id)`, `openAttachment`, `saveAttachmentCopy` |
| `TauriStorageRepository` | `getState`, `pickDirectory`, `pickStoreFile`, `assess`, `setLocation` |
| `TauriBillRepository` | `create`, `list`, `get`, `update`, `remove`, `openInvoice(bytes,name)`, `saveInvoiceCopy(bytes,name)` |
| `TauriCustomerRepository` | `list`, `update` |
| `TauriClientRepository` | `create`, `update`, `list`, `remove(cnic)` |
| `TauriCategoryRepository` | `list`, `create(input)`, `update(id,input)`, `remove(id)` |
| `TauriClientRecordRepository` | `list(cnic)`, `create` (raw body when attached), `update` (raw body on `replace`), `remove(id)`, `openFile(id)`, `saveFileCopy(id)` |
| `TauriCloudRepository` | `status`, `push`, `pull`, `usage`, `objectUsage` (Oracle bucket bytes + pending uploads), `onPulled(handler)` (subscribes to `cloud://pulled`) |
| `TauriSetupRepository` | `state`, `saveSecrets(text)`, `connect()` |

Internal: `call<T>(command,args?)`, `callRaw<T>(command,bytes,meta,header)`; consts `META_HEADER`, `INVOICE_META_HEADER`, `RECORD_META_HEADER`, `PULLED_EVENT`.

### 3.5 Test implementation (`src/data/in-memory.ts`)

A full in-memory twin of every repository used by tests and by the browser build. Exports: `DEFAULT_BUSINESS_PROFILE`, `interface Repositories`, classes `InMemoryStatementRepository`, `InMemoryStorageRepository`, `InMemoryBusinessProfileRepository`, `InMemoryCustomerRepository`, `InMemoryClientRepository`, `InMemoryCategoryRepository`, `InMemoryClientRecordRepository`, `InMemoryBillRepository`, `InMemoryCloudRepository` (`CloudTwinOptions`, now with `objectUsage`), `InMemorySetupRepository`, and `createInMemoryRepositories()`. Behaviours mirror the Rust store (validation via Zod, invoice numbering, last-write merging, etc.).

### 3.6 Domain — pure types & rules (`src/domain/`)

| File | Responsibility | Key exports |
|---|---|---|
| `types.ts` | The shared domain vocabulary — **every cross-layer type lives here.** | `StatementType`, `Statement`, `NewStatement`, `BusinessProfile`, `StatementFilter`, `StatementSummary`, `AttachmentPayload`, `AttachmentChange`, `StatementUpdate`, `StorageLocation`, `StorageProblem`, `StorageState`, `CarryAcrossChoice`, `LocationRisk`, `LocationAssessment`, `Customer`, `Client` (now carrying `password` + `categoryId`), `Category`, `CategoryInput`, `ClientRecord`, `NewClientRecord`, `ClientRecordUpdate`, `BillItem`, `NewBillItem`, `Bill`, `NewBill`, `BillUpdate`, `BillFilter`, `BillSummary`, `CloudPhase`, `CloudStatus`, `SetupState`, `SecretsPasteResult`, `SetupConnectResult`, `SyncOutcomeKind`, `SyncOutcome`, `SyncResult`, `CloudUsage`, `ObjectUsage` |
| `validation.ts` | Zod schemas + coercion for statements (form & persisted). | `statementTypeSchema`, `statementTypeInputSchema`, `isoDateSchema`, `amountInputSchema`, `amountSchema`, `statementFormSchema`, `newStatementSchema`, `statementFilterSchema`, `StatementFormInput/Output`, `StatementFilterValues`, `toNewStatement()` |
| `billValidation.ts` | Zod schemas + coercion for the bill form. | `billItemInputSchema`, `billFormSchema`, `BillFormInput/Output`, `toNewBill()`, `toBillUpdate()` |
| `identity.ts` | Fixed (non-stored) header/invoice identity constants. | `HEADER_IDENTITY`, `COMPANY_FULL_NAME`, `DEFAULT_ACCOUNT_HOLDER`, `WALLET_PLACEHOLDERS`, `BANK_DETAILS` |
| `summary.ts` | Pure date-range filter + inflow/outflow aggregation. | `isRangeValid()`, `filterByDateRange()`, `summarize()` |
| `summary.test.ts` | Tests for `summary.ts`. | — |
| `validation.test.ts` | Tests for the Zod schemas. | — |

### 3.7 Lib — small pure helpers (`src/lib/`)

| File | Responsibility | Key exports |
|---|---|---|
| `format.ts` | Number/date formatting + ISO date helpers. | `NONE`, `ISO_DATE_PATTERN`, `formatAmount()` (₨), `formatPkr()` (PKR), `formatOptional()`, `toIsoDate()`, `parseIsoDate()`, `isValidIsoDate()`, `todayIso()`, `firstOfCurrentMonthIso()`, `formatDate()` |
| `billInvoice.ts` | On-demand invoice PDF rendering (never stored). | `billFileName()`, `renderBillInvoice(bill)` |
| `amountInWords.ts` | PKR paisa → English short-scale words. | `rupeesToMinor()`, `amountInWordsPkr()` |
| `natures.ts` | Statement nature catalogue + type membership. | `NatureOption`, `INFLOW_NATURE_LABELS`, `OUTFLOW_NATURE_LABELS`, `NATURE_CATALOG`, `naturesForType()`, `isNatureValidForType()` |
| `categoryColors.ts` | The colour palette categories are chosen from, and a safe fallback. | `CategoryColor`, `CATEGORY_PALETTE`, `DEFAULT_CATEGORY_COLOR`, `resolveCategoryColor()` |
| `utils.ts` | `cn` re-export shim. | `cn` |
| `format.test.ts`, `amountInWords.test.ts` | Tests for the above. | — |

### 3.8 Hooks (`src/hooks/`)

| File | Responsibility | Key exports |
|---|---|---|
| `useCloudSync.ts` | Single controller for cloud status/progress/usage, auto-pull subscription, and the close-time "un-pushed changes" safeguard. | `CloudSyncController` interface; `useCloudSync({onPulled})` |
| `useBackupReminder.ts` | Once-a-calendar-month backup reminder, remembered in `localStorage` (this machine only). | `BACKUP_REMINDER_KEY`, `useBackupReminder()` |
| `useToast.ts` | Module-level toast store backing the shadcn toast UI. | `ToastVariant`, `ToastOptions`, `Toast`, `dismissToast()`, `toast()`, `useToasts()` |

`CloudSyncController` exposes `phase`, `outcome`, `status`, `usage`, `objectUsage`, `closeWarningOpen`, and `push/pull/reconnect/refreshStatus/refreshUsage/refreshObjectUsage/pushThenClose/closeAnyway/cancelClose`.

### 3.9 Components (`src/components/`)

#### `ui/` — shadcn/Radix primitives (13 files)
`button.tsx` (`Button`, `buttonVariants`), `calendar.tsx` (`Calendar`, `CalendarDayButton`), `dialog.tsx` (all `Dialog*` parts), `dropdown-menu.tsx` (all `DropdownMenu*` parts), `file-drop-field.tsx` (`FileDropField` — file picker **and** drag-and-drop), `form.tsx` (`Form`, `FormField`, `useFormField`, `FormItem/Label/Control/Description/Message`), `input.tsx` (`Input`), `label.tsx` (`Label`), `popover.tsx` (all `Popover*` parts), `table.tsx` (`Table*` parts), `tabs.tsx` (`Tabs`, `TabsList`, `tabsListVariants`, `TabsTrigger`, `TabsContent`), `textarea.tsx` (`Textarea`), `toast.tsx` (`Toaster`, `toastVariants`, `ToastVariantProps`).

#### `layout/` (4 files)
| File | Responsibility | Key exports |
|---|---|---|
| `RevealHeader.tsx` | Animated app header: brand/location, contacts, storage gauge + reconnect, cloud actions, theme toggle, Storage Directory button. | `RevealHeader` |
| `ModeToggle.tsx` / `.test.tsx` | Theme dropdown (Light/Dark/System) with sun/moon icon. | `ModeToggle` |
| `BackupReminderDialog.tsx` | The once-a-month reminder to back up the database file (remind-only). | `BackupReminderDialog` |

#### `statements/` (10 files)
| File | Responsibility | Key exports |
|---|---|---|
| `CreateStatementForm.tsx` / `.test.tsx` | Create Statements form (type/nature/amount/remarks/file); blocked until valid; in-flight guarded. | `CreateStatementForm` |
| `StatementsTable.tsx` / `.test.tsx` | TanStack-table list with file open/save-copy, pagination, edit dialog. | `StatementsTable`, `STATEMENTS_PAGE_SIZE` |
| `EditStatementDialog.tsx` | Correct a stored statement; explicit keep/remove/replace file outcomes. | `EditStatementDialog` |
| `SummaryFooter.tsx` | Total in-flow / out-flow / balance. | `SummaryFooter` |
| `DateRangeFilter.tsx` | From/To filter with inline invalid-range message. | `createDefaultFilter()`, `DateRangeFilter` |
| `TypeNatureSelect.tsx` | Paired Type + Nature popover selects (nature clears when invalid). | `TypeNatureSelect` |
| `FileAttachmentField.tsx` | Attach/replace/remove file with open-in-system + save-copy. | `FileAttachmentField` |
| `NoiseButton.tsx` | Thematic submit button with SVG-noise overlay + motion. | `NoiseButton` |

#### `bills/` (13 files)
| File | Responsibility | Key exports |
|---|---|---|
| `CreateBillForm.tsx` / `.test.tsx` | Create Bill form; client book autofill; totals + invoice number; blocked until valid. | `CreateBillForm` |
| `ViewBillsTab.tsx` | View Bills tab: combining filters, newest-first list. | `ViewBillsTab` |
| `BillsTable.tsx` / `.test.tsx` | Paginated bill list with open/download invoice, edit, delete. | `BillsTable`, `BILLS_PAGE_SIZE` |
| `EditBillDialog.tsx` | Correct a stored bill (items renumbered, invoice number kept). | `EditBillDialog` |
| `BillFilters.tsx` | Date-range + customer filter row. | `BillFilters` |
| `CustomerFilter.tsx` | Typeable, clearable customer drop-down. | `CustomerFilter` |
| `CustomerDialog.tsx` | Customer detail popup opened from View Bills. | `CustomerDialog` |
| `BillItemsEditor.tsx` | Line-item editor with auto-renumbering. | `BillItemsEditor` |
| `WalletNumbersEditor.tsx` | JazzCash/Easypaisa repeatable number lists. | `WalletNumbersEditor` |
| `BillTextField.tsx` | Shared labelled text field for bill forms. | `BillTextField`, `BillTextFieldName` |
| `BillInvoiceDocument.tsx` | The invoice as a react-pdf `<Document>` (green theme, logo, bank footer). | `BillInvoiceDocument` |

#### `clients/` (11 files)
| File | Responsibility | Key exports |
|---|---|---|
| `CreateClientForm.tsx` | Record a client (CNIC+name required; repeatable contacts; password + category; duplicate CNIC merges). | `CreateClientForm` |
| `ViewClientsTab.tsx` | Client **blocks** grid + all-field search + category dropbox; opens a client's records; confirm-remove. | `ViewClientsTab` |
| `ClientCard.tsx` | One client as a fixed-width block (3 details per row, masked password with an eye, glare/brand hover). | `ClientCard` |
| `ClientFields.tsx` | The client's own fields, shared by the Create tab and the edit dialog. | `ClientDraft`, `emptyClientDraft()`, `draftFromClient()`, `draftToClient()`, `ClientFields` |
| `EditClientDialog.tsx` | Correct a stored client in place (CNIC read-only). | `EditClientDialog` |
| `CategoryFilter.tsx` | The dropbox beside the search: filter + create/rename/recolour/delete categories. | `CategoryFilter` |
| `CategorySelect.tsx` | A single-category picker for the forms. | `CategorySelect` |
| `CategoryChip.tsx` | A category shown as a coloured dot + name. | `CategoryChip` |
| `ClientRecordsView.tsx` | A client's records table: create/edit/delete, search, multi-category + date filters. | `ClientRecordsView` |
| `ClientRecordDialog.tsx` | Create/correct a record (name, date, remarks, category, drag-and-drop file). | `ClientRecordDialog` |
| `ClientCombobox.tsx` | Searchable client-book picker (Popover/Input). | `ClientCombobox` |

#### `cloud/` (5 files)
`CloudActions.tsx` (`CloudActions` — icon-only Push/Sync with spinner + toasts), `SyncProgress.tsx` (`SyncProgress`), `CloudOutcomeMessage.tsx` (`CloudOutcomeMessage`), `StorageGauge.tsx` (`StorageGauge` — Turso Cloud headroom; `ObjectStorageGauge` — Oracle file bytes used + pending uploads), `CloseWarningDialog.tsx` (`CloseWarningDialog` — push-then-close / close-anyway / cancel).

#### `onboarding/` (3 files)
`SetupGate.tsx` (`SetupGate` — gates the app on `storageReady && secretsReady`), `SecretsDialog.tsx` (`SecretsDialog` — env-file picker/drag-drop → store secrets → prove cloud reachable), `SecretsStatus.tsx` (`SecretsStatus` — shows whether secrets are set, never the values).

#### `storage/` (2 files)
`StorageGate.tsx` (`StorageGate` — shown while no usable store exists), `StorageLocationDialog.tsx` (`StorageLocationDialog` — the whole "where do your records live" flow).

#### `test/`
`src/test/setup.ts` — Vitest/jsdom polyfills (`matchMedia`, `ResizeObserver`, pointer-capture, `scrollIntoView`).

---

## 4. THE APPLICATION — BACKEND (`tax-statements-analysis/src-tauri/src/`)

Rust 2021, Tauri v2. Architecture: **lib.rs wiring → commands (IPC handlers) → store (SQL engine) / cloud (sync) / platform (OS)**. All store-touching functions are `async`.

### 4.1 Entry points

| File | Responsibility | Key items |
|---|---|---|
| `main.rs` | Binary entry; hides console on Windows release; calls the lib. | `fn main()` |
| `lib.rs` | Whole app wiring: panic hook, plugins, startup `setup`, cloud sync spawn, command registration, `run()`. | `pub fn run()` |
| `build.rs` | Tauri codegen. | `fn main()` |

**`lib.rs` `run()` registration flow (order matters):** panic hook → startup logging banner → install `rustls` aws-lc-rs provider → `Builder::default()` → Windows `single-instance` (registered FIRST) → desktop `updater` plugin → `dialog` + `opener` plugins → `.setup()` (per-run temp folder via `temp::start_run` + `clear_other_runs`; open the local-only byte cache at `app_local_data_dir/tax-statements-cache.sqlite` via `store::object_cache::ObjectCache::open`; `state::load(&handle, &cache)`; `app.manage(AppState::new(state, run_folder, cache))`; `cloud::schedule::spawn`; background `updater::check_in_background`) → `.invoke_handler(generate_handler![...])` (all 43 commands, listed in §9) → `.run()`. Helper: `local_cache_path(app)`.

### 4.2 Application state — `state.rs`

| Item | Purpose |
|---|---|
| `enum StoreEngine { Synced(turso::sync::Database), Local(turso::Database) }` | The open engine; `connect()` opens the live connection; `synced()` returns the synced handle if present. |
| `struct StoreSession { engine, conn, location }` | One open session; `store_file()`, `handle()`. |
| `struct StoreHandle { conn, synced }` (Clone) | Owned snapshot handed to closures so the lock survives the await. |
| `struct StoreState { session, location, problem }` | What the app currently knows. |
| `struct AppState { inner: Mutex<StoreState>, run_folder, cache: ObjectCache }` | Global managed state; `new()`, **`with_connection(f)`** = the store-access gate (refuses when no store open, maps `StoreError`→`CommandError`), **`object_storage()`** (Oracle config from the credential store). The byte cache sits beside the store mutex (it is never synced). |
| `load(app, cache)` | Reads remembered location, opens it; records failure as a `problem` (never substitutes an empty store). |
| `open_at(path, location, cache)` | Read-only verify → choose engine → connect → `prepare_connection` → live verify → `schema::migrate(conn, path, cache)`. |
| `create_at(path, location)` | Creates a fresh store **through the engine that will be used** (avoids first-pull wipe). |
| `engine_for(path)` | Synced engine if cloud configured, else local. |
| `problem_of(error)` | `StoreError` → `StorageProblem`. |

### 4.3 Configuration memory — `settings.rs`

| Item | Purpose |
|---|---|
| `STORE_FILE_NAME` | `"tax-statements.sqlite"`. |
| `enum LocationKind { Directory, File }` | Store created inside a folder vs. adopting an existing file. |
| `struct StorageLocation { kind, path }` | The remembered location. |
| `enum StorageProblem { Unreachable, NotAStore, Damaged, Unwritable }` | Surfaced problem. |
| `struct StorageState { chosen, location, problem }` | Gate state for the frontend. |
| `read_location`, `write_location`, `store_file_path` | Read/write `settings.json` (app config dir); resolve the store file path. |

### 4.4 Logging & temp & updater

| File | Key items |
|---|---|
| `logging.rs` | **High-verbosity instrumentation** the developer expects. `enum Level`, `is_enabled()`, `emit()`, `banner()`, macros `log_debug!/log_info!/log_warn!/log_error!` (stderr, module-tagged). |
| `temp.rs` | Only non-store FS writes: `start_run()` (per-run `<cache>/attachments/<uuid>`), `clear_other_runs()`, `write_out(folder,name,bytes)`, `sanitise()`. Tolerates Windows lock errors on delete. |
| `files.rs` | The file-bytes pipeline gluing cache + Oracle + store refs. `AttachmentRef { file_name, byte_size, content_type, object_key }`, `enum FileError`, `struct UploadReport`, `new_object_key()`, `store_file(...)` (cache-first, best-effort upload), `fetch_bytes(...)` (cache, else Oracle), `drain_pending(...)`, `remove_object(...)`. |
| `updater.rs` | Desktop release-only. `check_in_background(app)` → `install_if_available()` (signature-verified download+install, then restart). |

### 4.5 Store — the SQL engine (`src-tauri/src/store/`)

| File | Responsibility | Key exports |
|---|---|---|
| `mod.rs` | Only place the engine appears: open/verify/pragmas/identity. | consts `APPLICATION_ID=0x4D4D_5453`, `SCHEMA_VERSION=8`, `REQUIRED_TABLES_*` (…`_V8`); `enum StoreError` (+ `UnknownClient`/`UnknownCategory`/`UnknownRecord`/`FileMissing`), `type StoreResult`, `enum Verification`, `enum StoreProblem`; `build_local()`, `prepare_connection()`, `verify_read_only()`, `is_readable_database()`, `verify_connection()`, `pragma_i64()`, `table_exists()`, `app_meta_value()`, `count()`, `as_integer()` |
| `schema.rs` | Schema creation, additive migration, identity/version stamp. | `OWNERSHIP_KEY/VALUE`, `VERSION_KEY`, DDL consts (`DDL`, `DDL_V2`, `DDL_V4`, `DDL_V6`, `DDL_V7`); `apply()`, `migrate(conn, store_file, cache)` (→v8), `column_exists()`, `now_iso()`; private `ensure_client_password_column()`, `migrate_attachments_in()`, **`move_attachments_to_objects()` / `move_record_files_to_objects()` (v7→v8, BLOB → cache + object reference)**, `civil_from_days()` |
| `statements.rs` | Statement reads/writes; one transaction per write; range queries never touch a file's bytes; amounts as integer paisa. | structs `Statement`, `NewStatement`, `enum AttachmentAction` (a `Replace` carries an `AttachmentRef`), `StatementUpdate`; `to_minor()`, `from_minor()`, `create()`, `list_range()`, `get()`, `update()`, `delete()` |
| `bills.rs` | Bills: unique never-reused invoice numbers; totals summed in SQL. | structs `BillItem`, `Bill`, `NewBillItem`, `NewBill`, `BillUpdate`, `BillSummary`; `create()`, `get()`, `list()`, `update()`, `delete()`; private `allocate_invoice_no()`, `insert_items()`, `insert_wallets()`, `load_wallets()`, `load_items()`, `total_of()` |
| `clients.rs` | Client contact book keyed by CNIC; contacts in their own rows; carries the client's password and category. | struct `Client`; `upsert_within()` (merge), `update_within()` (replace), `list()`, `get()`, `delete()`; private `contact_lists()`, `insert_contacts()` |
| `categories.rs` | The one global, named, coloured category list shared by clients and their records. | struct `Category`; `list()`, `create()`, `update()`, `delete()` (clears the tag from clients/records) |
| `client_records.rs` | A client's own records, each with an optional file held as an **object reference** (v8) on a separate table. | structs `Record`, `NewRecord`, `enum RecordAttachmentAction`, `RecordUpdate`; `list()`, `create()`, `update()`, `get()`, `delete()`, `reference()`, `reference_opt()`; private `insert_file_within()` |
| `customers.rs` | Remember billed customers by name (NOCASE); never deleted. | struct `Customer`; `upsert_within()`, `list()`, `get()` |
| `attachments.rs` | Attachment records: one file per statement held as an **object reference** — `file_name`, `byte_size`, `content_type`, `object_key` (v8; no bytes). | `insert_within()`, `remove_within()`, `reference()`, `reference_opt()` |
| `object_cache.rs` | The **local-only** byte cache (a second database, never synced): bytes awaiting upload and bytes fetched from Oracle, keyed by `object_key`. | `enum Scope`, `struct CachedObject`, `struct ObjectCache`; `open()`, `put()`, `get()`, `mark_uploaded()`, `pending()`, `count_pending()`, `remove()` |
| `carry.rs` | Carry records between stores; one transaction per record; idempotent/resumable. | struct `CarryReport`; `carry_from()`, `statement_count()`, `remaining()`; private `carry_customers/clients/bills()`, `copy_bill/items/wallets()`, `copy_statement()`, `advance_invoice_counter()` |

### 4.6 Commands — the IPC surface (`src-tauri/src/commands/`)

*Every command logs an outcome via `commands::mod::log_outcome`.*

| File | Responsibility |
|---|---|
| `mod.rs` | Submodule declarations + `log_outcome()`. |
| `error.rs` | `enum ErrorKind`, `struct CommandError` + constructors (`new`, `io`, `no_storage_location`, `validation`, `validation_for`, `carry_interrupted`, `secrets_store_unavailable`, `from_storage_problem`, `From<StoreError>`). |
| `storage.rs` | Choose/judge/commit the storage location + carry-across. Commands: `get_storage_state`, `pick_directory`, `pick_store_file`, `assess_location`, `set_storage_location`. |
| `statements.rs` | Record/list/correct/delete statements; attachment bytes cross IPC as raw body + `x-statement-meta` header. Commands: `create_statement`, `list_statements`, `update_statement`, `delete_statement`. |
| `bills.rs` | Compose/read/correct/delete bills + customers; invoice PDFs to the OS. `INVOICE_META_HEADER`. Commands: `create_bill`, `list_bills`, `get_bill`, `update_bill`, `delete_bill`, `list_customers`, `update_customer`, `open_bill_invoice`, `save_bill_invoice_copy`. |
| `clients.rs` | Client book command surface. Commands: `create_client` (merges by CNIC), `update_client` (replaces), `list_clients`, `delete_client`. |
| `categories.rs` | The shared category list. Commands: `list_categories`, `create_category`, `update_category`, `delete_category` (name-uniqueness checked at the boundary). |
| `client_records.rs` | A client's own records + their files (bytes via `files::store_file`/`fetch_bytes`). Commands: `list_client_records`, `create_client_record` / `update_client_record` (raw body + `x-record-meta` header when a file is present), `delete_client_record`, `open_client_record_file`, `save_client_record_file_copy`. |
| `attachments.rs` | Open/save statement attachment copies via the OS; bytes read through `files::fetch_bytes` (cache, else Oracle). Commands: `open_attachment`, `save_attachment_copy`. |
| `cloud.rs` | Cloud surface; ordinary sync failures returned as data, not errors. Push drains pending file uploads **before** publishing. Commands: `cloud_status`, `cloud_push`, `cloud_pull`, `cloud_usage`, `cloud_object_usage`. |
| `onboarding.rs` | Setup gate: what's missing, store env-file secrets, prove cloud round trip, clear secrets. Commands: `get_setup_state`, `save_secrets`, `setup_connect`, `clear_secrets`. |

### 4.7 Cloud (`src-tauri/src/cloud/`)

| File | Responsibility | Key exports |
|---|---|---|
| `mod.rs` | All network-facing sync logic; opens the synced DB. | `open_synced()` (bootstrap_if_empty(false)), `push()`, `pull()`, `checkpoint()`, `stats()` |
| `config.rs` | Cloud config read on demand from Credential Manager. | `ALLOWANCE_BYTES` (5 GB, Turso), `OBJECT_ALLOWANCE_BYTES` (10 GB, Oracle), `Config` (incl. `object_storage: Option<ObjectStoreConfig>`), `From<secrets::Secrets>`, `load()`, `is_configured()` |
| `object_store.rs` | The **object store**: the AWS SDK (S3 compatibility) client for OCI Object Storage. | `KEY_PREFIX`, `ObjectStoreConfig` (+ `client()`), `ObjectStoreError`, `put()`, `get()`, `delete()`, `bucket_usage()` (ListObjectsV2 sum) |
| `secrets.rs` | Strict env-file parsing; secrets stored in **Windows Credential Manager**. | `REQUIRED_KEYS`, `OPTIONAL_KEYS`, `STORAGE_KEYS` (the five `OCI_S3_*`), `Secrets` (incl. `object_storage`), `ParsedEnv`, `parse()`, `read()`, `store()`, `clear()`, `SecretsError`; Windows `platform` submodule |
| `schedule.rs` | Automatic sync: startup pull + ~hourly pulls; emits event on change. Also drains pending file uploads. | `PULLED_EVENT = "cloud://pulled"`, `spawn()`, private `pull_once()` (interval 60 min), `drain_pending_quietly()` |
| `sync_state.rs` | Local un-pushed marker in `sync-state.json` (never synced). | `SyncState { dirty, last_pushed_at }`, `read()`, `mark_dirty()`, `clear_dirty()` |
| `usage.rs` | Turso Usage API client for the storage gauge. | `CloudUsage`, `fetch()` (GET `/v1/organizations/{org}/databases/{database}/usage`) |
| `outcome.rs` | Classify a sync attempt into exactly one plain-language outcome. | `SyncOutcomeKind`, `SyncOutcome` (+ constructors), `classify(error)` |

### 4.8 Platform (`src-tauri/src/platform/`)

| File | Responsibility | Key exports |
|---|---|---|
| `mod.rs` | Windows-specific behaviour in one place. | re-exports `classify`, `LocationRisk` |
| `location.rs` | Heuristic classification of a store folder as risky (cloud-synced / network / removable). | `enum LocationRisk`, `classify()`, private `is_inside_synced_folder()`, `drive_type()` |

---

## 5. APPLICATION CONFIG

| File | Purpose |
|---|---|
| `tax-statements-analysis/package.json` | name `tax-statements-analysis`, ESM. Scripts: `dev`, `build` (tsc && vite build), `preview`, `tauri`, `test`, `test:watch`. |
| `tax-statements-analysis/vite.config.ts` | Vite + Vitest: react + tailwindcss plugins, `@`→`./src`, dev port 1420 (HMR 1421), ignores `src-tauri/**`, jsdom + `src/test/setup.ts`. |
| `tax-statements-analysis/tsconfig.json` | ES2020, bundler resolution, `react-jsx`, `@/*` alias, strict + noUnusedLocals/Parameters. |
| `tax-statements-analysis/components.json` | shadcn config (`radix-nova`, CSS vars, aliases). |
| `src-tauri/Cargo.toml` | crate v0.1.1, edition 2021, lib `tax_statements_analysis_lib`. Deps: tauri 2, plugins (opener/dialog/updater/single-instance), serde/serde_json, uuid, turso 0.8 (`sync`), tokio, reqwest (rustls), rustls 0.23, **`aws-sdk-s3` (the OCI S3-compatibility object store)**, windows-sys. Release: LTO/strip/panic=abort. |
| `migrations/package.json` | The CI cloud-migration tooling (`@libsql/client`, `@aws-sdk/client-s3`) — separate from the app; see §7. |
| `src-tauri/tauri.conf.json` | productName, identifier `com.har.tax-statements-analysis`, dev/build commands, window 800×600 with `dragDropEnabled: false` (so the page, not the webview, receives file drops), updater plugin (pubkey + GitHub releases endpoint, passive install). Version is **stamped by CI from the tag**. |
| `src-tauri/capabilities/default.json` | Main-window permissions: `core:default`, `opener:default`, `core:window:allow-destroy`. |
| `tax-statements-analysis/src-tauri/sync-poc/` | **Throwaway POC crate** (Turso engine-parity spike). NOT linked into the app. Do not put production code here. |

---

## 6. SPECS & SDD GOVERNANCE

### `specs/` — one dir per feature (identical file set)
Each feature dir has: `spec.md` (requirements/user stories/FR-###), `plan.md` (architecture), `tasks.md` (phased T001…), `research.md`, `data-model.md`, `quickstart.md`, `contracts/tauri-commands.md`, `contracts/<*-repository>.md`, `checklists/requirements.md`.

| Feature | Delivers |
|---|---|
| `001-statements-entry-view` | Module 1: Create + View statement screens (in-memory), date-range review + totals, header identity. |
| `002-statements-persistence` | Module 2: SQLite store, user-chosen location, carry-across, statement edit, attachments as BLOBs, temp-folder open/save, single-instance, risky-location warning, damaged-store refusal. |
| `003-bills-invoice` | Module 3: Create/View Bills, customers, line items, `INV-nnnn` numbering, auto total + amount-in-words, green PDF invoice, bill edit/delete, filters, wallets, schema v1→v2. |
| `004-cloud-sync` | Module 4: local-first Turso store + explicit Push/Sync, auto-pull, last-push-wins, un-pushed close warning, usage gauge, env-file onboarding, secrets in Credential Manager. |

### `.specify/`
| Path | Purpose |
|---|---|
| `memory/constitution.md` | **Project constitution v1.0.0.** Principle I: every file opens with the basmala `بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ`, marks critical code with `وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ`, closes with `وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ`. II: quality. III: supervised collaboration. IV: constructive objection. |
| `templates/` | `spec-template.md`, `plan-template.md`, `tasks-template.md`, `checklist-template.md`, `adr-template.md`, `agent-file-template.md`, `phr-template.prompt.md`. |
| `scripts/powershell/` | `common.ps1`, `create-new-feature.ps1`, `setup-plan.ps1`, `check-prerequisites.ps1`, `update-agent-context.ps1`. |

### `history/prompts/`
`<route>/NNN-<slug>.<stage>.prompt.md`. Routes: `constitution/`, `<feature-name>/`, `general/`. **Every user prompt must be recorded as a PHR** (see `CLAUDE.md`).

### `.claude/` & `.commandcode/`
`.claude/commands/` and `.commandcode/commands/` hold the same 13 `/sp.*` SDD commands: `constitution, specify, clarify, plan, tasks, analyze, checklist, adr, implement, phr, git.commit_pr, taskstoissues, reverse-engineer`. `.commandcode/taste/` holds the auto-managed taste profile — **read-only, never hand-edit.**

---

## 7. CI/CD & RELEASE

| File | Purpose |
|---|---|
| `.github/workflows/release.yml` | Triggered by an `app-v*` tag. Two jobs: **`migrate`** (ubuntu — runs `migrations/object-storage/migrate.mjs` against the cloud DB, idempotent) then **`publish`** (windows-latest — setup Node LTS + Rust, `npm ci`, derive version from tag, stamp into `tauri.conf.json`, `tauri-apps/tauri-action@action-v0.6.2` builds/signs and publishes a release with `updaterJsonPreferNsis: true`). `publish` `needs: migrate`. |
| `RELEASING.md` | Local runbook — exact git/tag/release commands; the developer works from this file. |

New repository secrets for the migration job: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OCI_S3_ENDPOINT`, `OCI_S3_REGION`, `OCI_S3_BUCKET`, `OCI_S3_ACCESS_KEY_ID`, `OCI_S3_SECRET_ACCESS_KEY`.

Release flow: push tag `app-vX.Y.Z` → Actions builds, signs, publishes → installed apps auto-update via the Tauri updater.

---

## 8. DATA MODEL (store schema, `SCHEMA_VERSION = 8`)

Tables (all in the single `tax-statements.sqlite`):
- `statements` — id, date, type, nature, amount (integer paisa), remarks, file_name, file_ref, created_at.
- `attachments` — statement_id → file_name + byte_size + content_type + **`object_key`** (v8; the bytes live in Oracle, only the reference syncs).
- `customers` — name (NOCASE key), address, contact_person, contact_number, email, ntn, password.
- `clients` (+ client contact rows) — cnic (key), name, company, **password**, **category_id** (v7), phones[], whatsapps[], emails[].
- `bills` — id, invoice_no, invoice_seq, date, customer_name, account_holder, created_at.
- `bill_items` — bill_id, id, position, details, amount.
- `bill_wallets` — bill_id, kind (jazzcash/easypaisa), position, number.
- `categories` (v7) — id, name (NOCASE unique), color, created_at, updated_at. One global list shared by clients and records.
- `client_records` (v7) — id, cnic (FK → clients, cascade), name, date, remarks, category_id, created_at, updated_at; index `(cnic, date DESC, created_at DESC)`.
- `client_record_files` — record_id (FK → client_records, cascade) → file_name + byte_size + content_type + **`object_key`** (v8; names only in list queries).
- `app_meta` — ownership marker (`tax-statements-analysis`), `schema_version`, `created_at`, `creator_version`, and the monotonic `next_invoice_no` counter.

**File bytes** live in the Oracle Cloud (OCI) Object Storage bucket as `objects/<uuid>`; the synced store keeps only the `object_key` reference (v8). Two tables changed shape from v7: `attachments` and `client_record_files` dropped their `data` BLOB and gained `content_type` + `object_key`.

Identity invariants: `PRAGMA application_id = 0x4D4D_5453`; `user_version` = schema version; ownership row in `app_meta`. A file failing these checks is refused byte-for-byte (never repaired, never replaced).

`sync-state.json` (beside `settings.json`, never synced): `{ dirty: bool, last_pushed_at: string|null }`.

### The local-only byte cache (a second database)

`tax-statements-cache.sqlite` in `app_local_data_dir` — opened with the plain **local** engine and **never** given a remote URL, so nothing in it ever syncs:
- `object_cache` — object_key (PK), scope (`statement`|`record`), file_name, content_type, byte_size, `data` BLOB, `uploaded` (0/1), created_at.

A file is written here the instant it is attached (so a save never needs the network) and uploaded to Oracle by `files::drain_pending` (at startup, after connecting, and before every Push). Reading tries this cache first and only falls back to Oracle when the file was attached on another computer.

---

## 9. IPC COMMAND SURFACE (Tauri commands)

43 `#[tauri::command]` handlers. Frontend wrapper: `src/data/tauri.ts` (§3.4).

| Group | Commands |
|---|---|
| storage (5) | `get_storage_state`, `pick_directory`, `pick_store_file`, `assess_location`, `set_storage_location` |
| statements (4) | `create_statement`, `list_statements`, `update_statement`, `delete_statement` |
| bills (9) | `create_bill`, `list_bills`, `get_bill`, `update_bill`, `delete_bill`, `list_customers`, `update_customer`, `open_bill_invoice`, `save_bill_invoice_copy` |
| clients (4) | `create_client`, `update_client`, `list_clients`, `delete_client` |
| categories (4) | `list_categories`, `create_category`, `update_category`, `delete_category` |
| client records (6) | `list_client_records`, `create_client_record`, `update_client_record`, `delete_client_record`, `open_client_record_file`, `save_client_record_file_copy` |
| attachments (2) | `open_attachment`, `save_attachment_copy` |
| cloud (5) | `cloud_status`, `cloud_push`, `cloud_pull`, `cloud_usage`, `cloud_object_usage` |
| onboarding (4) | `get_setup_state`, `save_secrets`, `setup_connect`, `clear_secrets` |

Events: `cloud://pulled` (emitted after an automatic pull that changed something).

---

## 10. MAINTENANCE PROTOCOL — what to update in THIS file when you change X

| You changed… | Update these sections |
|---|---|
| Any frontend component/function | §3.9 (and §3.1–3.8 if entry/domain/lib/hook) |
| A repository interface or impl | §3.3, §3.4, §3.5 |
| Any Tauri command | §4.6, §9, §4.1 (`lib.rs` handler list) |
| A store module or the schema | §4.5, §8 |
| A cloud module | §4.7 |
| File storage / bytes (`files.rs`, `object_cache`, `object_store`) | §4.4, §4.5, §4.7, §8 |
| The CI cloud migration | §2, §7 |
| State / settings / logging / temp / updater | §4.2, §4.3, §4.4 |
| Build/config files | §5 |
| A spec or the constitution | §6 |
| CI/release process | §7 |
| Folder added/moved/removed | §2 and the relevant section above |
| **Any edit at all** | Bump the "Last verified" date in the header |

---

وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
