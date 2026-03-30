

## Fix: Auto-recover sandbox when screenshots fail during long runs

### Root Cause
The E2B sandbox is created with `timeout: 300` (5 minutes). After expiration, all commands fail. The `think` action's catch block on line 853 silently swallows the error and returns "Could not capture screenshot" in an infinite loop — never attempting recovery.

### Plan

**1. Add keepalive endpoint in edge function** (`supabase/functions/emma-computer-use/index.ts`)
- Add a `keepalive` case that calls `POST /sandboxes/{sandboxId}/timeout` with `{ timeout: 300 }` to extend the sandbox lifetime by another 5 minutes
- If that fails (sandbox already dead), create a new sandbox, re-kickstart desktop, and return the new session credentials

**2. Add keepalive interval in frontend** (`src/components/ComputerUseAgent.tsx`)
- Start a `setInterval` (every 60 seconds) when the agent loop begins
- Each tick calls `cuApi("keepalive", { sessionId, envdAccessToken })` 
- If the response includes new session credentials (sandbox was recreated), update `sessionId`, `envdToken`, and `sessionRef`
- Clear the interval when the loop ends or session stops

**3. Improve error recovery in `think` action** (edge function)
- When `captureScreenshotData` throws on line 853, attempt `connectSandbox(sandboxId, true)` to refresh the token before giving up
- If that also fails, return `{ errorCode: "sandbox_expired" }` so the frontend knows recovery is needed

### Technical Details
- E2B timeout extension API: `POST https://api.e2b.app/sandboxes/{id}/timeout` with body `{ timeout: 300 }`
- Initial sandbox timeout stays at 300s — the keepalive pings extend it indefinitely
- Frontend keepalive runs at 60s intervals, well before the 300s expiry
- If sandbox is truly dead (404 from E2B), keepalive creates a fresh sandbox and returns new credentials

