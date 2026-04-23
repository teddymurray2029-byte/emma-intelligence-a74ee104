

## Plan: Replace favicon and logo with new Emma Intelligence branding

### Steps
1. **Add the new logo image to the project**
   - Copy `user-uploads://ChatGPT_Image_Apr_22_2026_08_35_28_PM.png` to `src/assets/emma-logo.png` (for in-app use)
   - Copy the same image to `public/favicon.png` (for browser tab favicon)
   - Delete the existing `public/favicon.ico` so browsers don't fall back to it

2. **Update `index.html`**
   - Replace the favicon `<link>` to point at `/favicon.png` with `type="image/png"`
   - Update `og:image` and `twitter:image` to use the new logo (via the same `/favicon.png`)

3. **Update `src/components/EmmaAvatar.tsx`**
   - Replace the gradient circle + "E" letter with an `<img>` of the new logo
   - Keep the existing `size` prop ("sm" | "md" | "lg") and the soft pulsing glow halo behind it so it still feels alive
   - Import the logo from `@/assets/emma-logo.png` for proper bundling

### Result
- Browser tab favicon shows the new Emma "E" mark
- Every place that uses `<EmmaAvatar />` (header, chat messages, sign-in, sign-up, login, signup, payment success, voice panel, index page) automatically picks up the new logo — no per-page edits needed
- Social share previews (`og:image`, `twitter:image`) use the new branding

