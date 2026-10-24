# Contract: Data-Access Seam — Cloud Sync (Frontend Repository Interface)

**Feature**: `004-cloud-sync` | **Date**: 2026-10-15
**Location**: `tax-statements-analysis/src/data/repositories.ts`
**Implementations**: `src/data/tauri.ts` (the running application) · `src/data/in-memory.ts` (test fixture only)

---

## Why this contract exists

Modules 1–3 put the UI behind injected repository interfaces so components never import `tauri.ts`. Module 4 follows the same rule for the cloud: the header's Push/Sync actions, the progress indicator, the outcome message, the storage gauge and the close warning all depend on **`CloudRepository`**, injected through `DataProvider`, with an in-memory twin for the Vitest suite. The rule is unchanged and non-negotiable: **a component never imports a concrete repository**.

The cloud seam is deliberately small — the whole sync happens in Rust (Turso), and the frontend only asks for status, triggers a push/pull, reads the gauge, listens for the automatic-pull event, and (at setup) pastes the secrets and reads the setup state.

---

## `CloudRepository`

```ts
import type { CloudStatus, CloudUsage, SyncResult } from "../domain/types";

export interface CloudRepository {
  /** Secrets configured + un-pushed marker. Never touches the network (R4, R8). */
  status(): Promise<CloudStatus>;

  /** Publish this computer's changes to the central copy (FR-006–FR-012). */
  push(): Promise<SyncResult>;

  /** Bring the other computers' changes down (FR-013–FR-020). */
  pull(): Promise<SyncResult>;

  /** Cloud storage headroom for the header gauge, or null when unavailable (FR-029–FR-032). */
  usage(): Promise<CloudUsage | null>;

  /**
   * Subscribe to automatic-pull notifications (R9). Returns an unsubscribe function.
   * The handler is called when a background pull actually changed something.
   */
  onPulled(handler: () => void): () => void;
}
```

### `status()`

- **Output**: `{ configured, hasUnpushed, lastPushedAt, phase }`.
- **Postconditions**: pure local read — must work with no network and must not block.
- **Used by**: the header (enable/disable Push/Sync, show the "un-pushed" hint) and the close-time check (FR-025).

### `push()` / `pull()`

- **Output**: `SyncResult` — `{ outcome, changed }`.
- **Postconditions**: the practitioner is told exactly one plain-language outcome (FR-033); a push success clears the un-pushed marker; neither alters the values of local records it publishes/pulls (FR-008).
- **Errors**: structural problems are rejected (storage gate); ordinary sync failures come back **inside** `outcome`, not as a rejection, so the UI can render one message per attempt.
- **UI obligation**: show the progress indicator for the whole awaited duration and replace it with the outcome (FR-036/FR-037).

### `usage()`

- **Output**: `CloudUsage` or `null`.
- **Postconditions**: `null` means *unavailable* — the gauge must say so rather than show a stale number (FR-031).

### `onPulled(handler)`

- **Purpose**: lets an automatic pull (which the practitioner did not trigger) refresh the lists without polling.
- **Postconditions**: returns a disposer; the handler fires only when a background pull brought changes.

---

## `SetupRepository`

```ts
import type { SecretsPasteResult, SetupState } from "../domain/types";

export interface SetupRepository {
  /** What setup still needs: a usable store and the secrets (FR-005). */
  state(): Promise<SetupState>;

  /** Parse the partner's env file and save the required values to Windows Credential Manager (FR-044–FR-048). */
  saveSecrets(text: string): Promise<SecretsPasteResult>;
}
```

### `state()`

- **Output**: `{ storageReady, secretsReady }`.
- **Postconditions**: pure local read; the application's normal screens are gated on both being true.
- **Used by**: `SetupGate`, alongside the existing storage gate.

### `saveSecrets(text)`

- **Input**: the pasted env-file text.
- **Output**: `{ ok, missing, message }`.
- **Postconditions**: on `ok`, the values are in Windows Credential Manager and `secretsReady` becomes true; on failure, nothing is saved and `message` names what is wrong. The secrets are never returned to the frontend and never logged.

---

## Injection (`DataProvider`)

`DataProvider`'s value grows by two entries:

```ts
{
  statements, storage, bills, customers,   // unchanged
  cloud: CloudRepository,
  setup: SetupRepository,
}
```

The implementation is chosen once, exactly as today: an injected `repositories` prop for tests, else the Tauri implementation in the running application, else the in-memory twin. `useRepositories()` and its "must be inside the provider" guarantee are unchanged.

---

## Contract test cases

Module 2's C-01–C-25 and Module 3's B-01–B-23 remain valid for their interfaces. The cases below cover the cloud seam. Cases marked *(memory)* are worth adding to the Vitest suite because the in-memory twin also changes; the rest are exercised end to end (no automated backend tests, per the developer's direction).

| # | Case | Expected |
|---|------|----------|
| CS-01 | `status()` with the secrets present *(memory)* | `configured: true`; `phase: "idle"`; no network access |
| CS-02 | `status()` with no secrets *(memory)* | `configured: false`; Push/Sync report `secrets-unavailable` |
| CS-03 | `push()` with no un-pushed changes *(memory)* | `outcome.kind = "nothing-new"`; `changed: false`; marker stays clear |
| CS-04 | `push()` success *(memory)* | `outcome.kind = "success"`; the un-pushed marker is cleared |
| CS-05 | `push()` with no internet | `outcome.kind = "no-internet"`; local data unchanged; marker stays set |
| CS-06 | `push()` when the cloud is unreachable | `outcome.kind = "server-unavailable"` |
| CS-07 | `pull()` that brings changes | `changed: true`; `outcome.kind = "success"`; the change is visible and survives a restart |
| CS-08 | `pull()` with nothing new | `changed: false`; `outcome.kind = "nothing-new"` |
| CS-09 | `onPulled` after a background pull that changed something *(memory)* | the handler fires once; the lists refresh |
| CS-10 | `onPulled` after a background pull that changed nothing | the handler does **not** fire |
| CS-11 | `usage()` when retrievable | `{ usedBytes, allowanceBytes, remainingBytes }` with `remaining = allowance - used` |
| CS-12 | `usage()` when the API fails | resolves `null`; the gauge shows *unavailable* (FR-031) |
| CS-13 | close with `hasUnpushed = true` | the warning is offered and the close is held until the practitioner chooses (FR-025/FR-028) |
| CS-14 | close with `hasUnpushed = false` | no warning; the app closes (FR-028) |
| CS-15 | `setup.state()` with no store and no secrets *(memory)* | `{ storageReady: false, secretsReady: false }` — the app shows onboarding, not the tabs |
| CS-16 | `setup.saveSecrets(validEnv)` *(memory)* | `{ ok: true, missing: [] }`; `secretsReady` becomes true; the values are never returned to the frontend |
| CS-17 | `setup.saveSecrets(incompleteEnv)` *(memory)* | `{ ok: false, missing: [...] }`; `message` names the missing keys; nothing is saved |
| CS-18 | `setup.saveSecrets` with the credential store unavailable | an explained failure; `secretsReady` stays false (FR-048) |

**What is *not* covered here**: the engine swap's behaviour (R1's spike), the attachment-bytes migration (data-model §1.4) and the real Turso `push()`/`pull()`. Those are backend paths verified by exercising the application (see [quickstart.md](../quickstart.md)), per the developer's direction.
