# Taste — Command Code agent

## Workflow
- Expects the agent to consult the central `PROJECT_MAP.md` for project understanding before implementing changes in this codebase (explicitly instructs "use the main PROJECT_MAP.md for better project understanding"). Confidence: 0.6
- Expects database migrations to be idempotent and self-guarding: scripts should detect already-applied state and no-op instead of re-running unconditionally on every release/CI run. Confidence: 0.6
- Expects migrations to be additive and data-preserving — asks explicitly whether existing local/cloud data survives, whether the schema upgrade touches only the intended tables, and whether records being dropped are copied before being replaced. Confidence: 0.7
