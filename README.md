# chatgpt2codex

Import a public ChatGPT share link into a local Codex CLI session.

```bash
npx chatgpt2codex https://chatgpt.com/share/<id>
```

By default the imported Codex session is attached to the current directory. If a
Codex session already exists for that directory, the command exits with an error.

## Usage

```bash
chatgpt2codex <share-url> [options]
```

Options:

- `-C, --cwd <dir>` - project directory for the imported Codex session.
- `--codex-home <dir>` - Codex home directory. Defaults to `$CODEX_HOME` or `~/.codex`.
- `--name <name>` - override the imported session title.
- `--dry-run` - parse the ChatGPT share and print a summary without writing files.
- `--include-archived` - also scan `archived_sessions/` for `cwd` collisions.

## Notes

The tool writes Codex rollout JSONL files under:

```text
~/.codex/sessions/YYYY/MM/DD/
```

It also appends a best-effort title entry to `~/.codex/session_index.jsonl`.

ChatGPT share pages and Codex rollout files are not public import APIs, so the
parser and writer are intentionally small and covered by fixtures.
