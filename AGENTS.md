# Agent Workflow Rules (Project-Level)

## Skill Protocol (Mandatory)

Before every development step (analysis, code changes, refactor, test, review), the agent must:

1. Run a **Skills Check**:
   - List installed skills currently available in this repo/session.
   - Explicitly state which skills will be used for the step, and why.

2. Run a **Gap Check**:
   - Verify whether installed skills are sufficient for the requested task.
   - If coverage is missing or weak, use `find-skills` to discover relevant skills.
   - Propose installing missing skills before implementation when appropriate.

3. Run an **Execution Check** at the end of the step:
   - State which skills were actually applied.
   - Mention any skipped-but-relevant skill and the reason.

## Blocking Rule

If a step starts without a visible **Skills Check** and **Gap Check**, the step is invalid and must be restarted with the protocol.

## Product Contract (Mandatory)

- **Discovery/catalog/search** can use multiple providers (Spotify, Deezer, etc.).
- **Gameplay playback and reveal media must remain YouTube-only** (`youtube` / `ytmusic`).
- Do not introduce non-YouTube playback fallbacks for in-game rounds unless explicitly requested by the user.
- YouTube quota mitigation order:
  1. YouTube Data API keys (single or rotated via `YOUTUBE_API_KEYS`)
  2. YTMusic custom endpoint (`YTMUSIC_SEARCH_URL`) when configured
  3. No-key fallbacks (Invidious instances and YouTube web/oEmbed lookups)
