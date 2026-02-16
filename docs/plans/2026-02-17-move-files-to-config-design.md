# Design: Move `files` from `comment` to `config`

## Problem

`comment.files` controls which files appear in coverage reports, but it's nested under `comment` config. This means:
- The Job Summary ignores it (only PR comments respect it)
- You can't configure file display without also enabling comments
- The concerns of "reporting style" and "comment toggle" are conflated

## Solution

Add a new top-level `config` key in the YAML config. Move `files` there so it controls file tables in both Job Summary and PR comments.

### Config structure

```yaml
# .github/coverage.yml
coverage:
  status:
    project: ...
    patch: ...
  ignore: [...]
comment: true | false          # pure toggle, no object form
config:
  files: "all" | "changed" | "none"   # default: "all"
```

### Types (`src/types/config.ts`)

- Add `config?: { files?: CommentFilesMode }` to `CodecovConfig`
- Add `config: { files: CommentFilesMode }` to `NormalizedConfig`
- Remove `files` from `comment` in both interfaces
- `comment` becomes `{ enabled: boolean }`

### Config loader (`src/config/config-loader.ts`)

- Parse `config.files` from the new location with default `"all"`
- `normalizeComment` returns only `{ enabled: boolean }`
- No backwards compatibility with `comment.files`

### Index (`src/index.ts`)

- Read `coverageConfig.config.files` instead of `coverageConfig.comment.files`
- Pass `filesMode`/`changedFiles` to both `formatReport()` calls (Job Summary + PR comment)

### Formatter (`src/formatters/report-formatter.ts`)

No changes needed — already accepts `filesMode` via `ReportFormatOptions`.

### Files touched

1. `src/types/config.ts`
2. `src/config/config-loader.ts`
3. `src/index.ts`
4. `src/__tests__/config-loader.test.ts`
5. `src/__tests__/report-formatter.test.ts` (if referencing `comment.files`)
6. `README.md`
7. `dist/index.js` (rebuild)
