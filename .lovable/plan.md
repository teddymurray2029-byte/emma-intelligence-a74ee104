

# Plan: Admin Unlimited Messages + Project Management IDE with Source Control

## Summary

Three deliverables: (1) Admin bypasses message limits, (2) Full project management with filesystem/IDE/GitHub integration, (3) ZIP upload extraction and project export.

## Part 1: Admin Unlimited Messages

**`src/pages/Index.tsx`** — Update `checkUsageAndSend`:
- After getting user, check admin status via `dbProxy("check_admin")` (cache result in state)
- If admin, skip all usage tracking and paywall — call `send()` directly

**`src/hooks/useAuth.tsx`** — Add `isAdmin` state:
- On user load, call `dbProxy("check_admin")` and expose `isAdmin` boolean
- Used by Index.tsx to bypass limits

## Part 2: Project Management System

### New database table: `projects`
- `id` (uuid), `user_id` (text), `name` (text), `description` (text), `files` (jsonb — `{path: string, content: string}[]`), `github_repo` (text, nullable), `github_token` (text, nullable), `created_at`, `updated_at`

### New db-proxy actions
Add to `emma-db-proxy/index.ts`:
- `create_project`, `list_projects`, `get_project`, `update_project`, `delete_project` — CRUD on projects table
- `update_project_files` — update the `files` jsonb column

### New edge function: `supabase/functions/emma-github/index.ts`
- Actions: `push`, `pull`, `commit`, `list_repos`, `get_status`
- Uses `GITHUB_TOKEN` secret (already configured)
- Interacts with GitHub API to push/pull files, create commits
- Clerk JWT verification for auth

### New components

**`src/components/ProjectManager.tsx`** — Project list/create UI:
- Create new project (name, description)
- List user's projects with select/delete
- Current active project indicator

**`src/components/FileExplorer.tsx`** — Filesystem tree:
- Tree view of project files (from `files` jsonb)
- Create/rename/delete files and folders
- Click to open in CodeEditor
- Context menu for file operations

**`src/components/GitPanel.tsx`** — Source control panel:
- Connect GitHub repo (repo URL input)
- Push/Pull/Commit buttons with commit message input
- Status display (modified files, ahead/behind)
- Diff viewer for changed files

### Updated components

**`src/components/CodeEditor.tsx`** — Enhanced:
- Accept `projectFiles` prop and `onFilesChange` callback
- File tabs now driven by project filesystem
- Save propagates back to project state

**`src/components/RightPanel.tsx`** — Not currently used on Index but the IDE/project tabs will be integrated into the right panel via a new "Projects" mode

**`src/components/ModeSwitcher.tsx`** — Add "Projects" mode:
- New mode `"projects"` with `FolderKanban` icon

**`src/lib/emma-stream.ts`** — Add `"projects"` to `EmmaMode` type

**`src/pages/Index.tsx`** — Right panel for `"projects"` mode:
- Renders a layout with FileExplorer (left), CodeEditor (center), GitPanel (bottom)
- Project selector in header
- Active project state management

## Part 3: ZIP Handling

### ZIP extraction on upload

**`src/components/FileUpload.tsx`**:
- Accept `.zip` files in the file input
- Use `JSZip` library to extract zip contents client-side
- When a zip is uploaded: extract all files, create a new project (or add to current), populate the filesystem
- For non-zip files, keep existing upload behavior

### ZIP export (download current project)

**`src/components/ProjectManager.tsx`**:
- "Export as ZIP" button on active project
- Use `JSZip` to bundle all project files into a downloadable zip
- Trigger browser download

## Updated File Summary

| File | Action |
|------|--------|
| `src/hooks/useAuth.tsx` | Add `isAdmin` state with cached check |
| `src/pages/Index.tsx` | Admin bypass, projects mode, project state |
| `src/lib/emma-stream.ts` | Add `"projects"` to EmmaMode |
| `src/components/ModeSwitcher.tsx` | Add Projects mode tab |
| `src/components/ProjectManager.tsx` | New — project CRUD + ZIP export |
| `src/components/FileExplorer.tsx` | New — filesystem tree view |
| `src/components/GitPanel.tsx` | New — GitHub push/pull/commit UI |
| `src/components/ProjectIDE.tsx` | New — combined IDE layout (explorer + editor + git) |
| `src/components/CodeEditor.tsx` | Accept project files prop |
| `src/components/FileUpload.tsx` | ZIP extraction support |
| `src/components/ChatInput.tsx` | Accept .zip in attachment |
| `supabase/functions/emma-db-proxy/index.ts` | Project CRUD actions |
| `supabase/functions/emma-github/index.ts` | New — GitHub API integration |
| Database migration | Create `projects` table |

## Dependencies
- `jszip` — for ZIP creation and extraction (client-side)

## Technical Details

- Projects store files as JSONB to avoid needing a separate file storage system — suitable for code projects up to ~5MB
- GitHub integration uses the REST API v3 with the existing `GITHUB_TOKEN` secret
- Admin check is cached per session to avoid repeated API calls
- ZIP extraction runs entirely client-side for speed

