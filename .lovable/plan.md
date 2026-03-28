

## Problem

The VNC live stream iframe points to `https://6080-{sandboxId}.e2b.app` but **noVNC is never started** in the sandbox. The code only starts `x11vnc` on port 5900 (raw VNC protocol) — there is no websocket proxy on port 6080 to serve the browser-compatible VNC client. The E2B `desktop` template does not ship with noVNC pre-installed.

Meanwhile, **the screenshot-based view is working perfectly** — the uploaded image shows Firefox rendering, the agent thinking/typing/acting correctly. The only broken piece is the iframe.

## Solution

Remove the VNC streaming code entirely and default to the screenshot-based view, which is already proven working. VNC streaming requires installing noVNC into the sandbox at runtime (slow, fragile, may not have `npm`/`pip` available), and adds no value over the screenshot polling that already works.

### Changes

**`supabase/functions/emma-computer-use/index.ts`**
- Remove the entire "Step 4: Start VNC server" block from `kickstartDesktop()` (lines ~272-296)
- Remove `streamUrl` from `SandboxSession` type and all places it's set
- Remove the `vnc=` check from `getDesktopStage()`
- Keep everything else (Xvfb, XFCE, xdpyinfo, xdotool) as-is since those are working

**`src/components/ComputerUseAgent.tsx`**
- Remove `streamUrl` state, `viewMode` toggle, and the iframe rendering branch
- Always show the screenshot view (which is working)
- Remove the "Live/Snap" toggle buttons from the header

### Why not fix VNC instead?
- noVNC requires a Node.js or Python websocket proxy to be installed and started inside the sandbox
- The `desktop` template may not have `npm` or `pip` available for installation
- It adds 10-15 seconds to boot time
- Screenshot polling already provides the same visual feedback with proven reliability

