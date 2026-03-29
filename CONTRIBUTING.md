# Contributing to Emma

Thanks for your interest in contributing! This guide covers the development workflow and code conventions.

---

## Getting Started

```bash
git clone <repo-url>
cd emma
npm install
npm run dev
```

---

## Development Workflow

1. **Branch from `main`** — use descriptive branch names: `feat/voice-mode`, `fix/agent-screenshot`, `refactor/chat-input`.
2. **Keep PRs focused** — one feature or fix per pull request.
3. **Test before pushing** — run `npm run build` and `npm run test` locally.
4. **Write meaningful commits** — use conventional commit format:
   ```
   feat: add screenshot refresh button to agent panel
   fix: resolve closed port error in computer-use agent
   refactor: remove VNC streaming logic
   docs: update README setup instructions
   ```

---

## Code Style

### TypeScript

- Strict mode enabled — no `any` unless absolutely necessary (cast with a comment explaining why).
- Prefer `const` over `let`. Never use `var`.
- Use named exports for components, default exports for pages.
- Destructure props in function signatures.

### React

- **Functional components only** — no class components.
- **Custom hooks** go in `src/hooks/` prefixed with `use` (e.g., `useAuth.tsx`).
- **Keep components small** — if a file exceeds ~250 lines, extract sub-components.
- **Avoid inline styles** — use Tailwind classes or CSS variables from the design system.

### Tailwind & Design System

- **Use semantic tokens** from `src/index.css` — never hardcode colors like `text-white` or `bg-black`.
- Reference design tokens: `text-foreground`, `bg-background`, `bg-primary`, `text-muted-foreground`, etc.
- All colors in the design system must be HSL values.
- Responsive design: mobile-first, use Tailwind breakpoints (`sm:`, `md:`, `lg:`).

### File Structure

```
src/
├── components/       # Reusable UI components
│   └── ui/           # shadcn/ui primitives
├── hooks/            # Custom React hooks
├── pages/            # Route-level page components
├── lib/              # Utilities and API clients
├── integrations/     # Auto-generated (do NOT edit)
│   └── supabase/     # client.ts and types.ts (read-only)
└── assets/           # Static images and fonts

supabase/
├── functions/        # Edge functions (Deno runtime)
│   └── _shared/      # Shared utilities across functions
├── migrations/       # Database migrations (read-only)
└── config.toml       # Project config (auto-generated)
```

### Edge Functions

- Written in TypeScript for **Deno** runtime.
- Always handle CORS with the `OPTIONS` preflight pattern.
- Return proper HTTP status codes and JSON error bodies.
- Use `crypto.subtle` for hashing — no external crypto libraries.

---

## Do NOT Edit

These files are auto-generated and will be overwritten:

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `.env`
- `supabase/migrations/`

---

## Testing

```bash
npm run test          # Run unit tests (Vitest)
npm run build         # Type-check + production build
npm run lint          # ESLint
```

---

## Reporting Issues

- Use GitHub Issues with a clear title and reproduction steps.
- Include browser, OS, and any console errors.
- Screenshots or screen recordings are appreciated.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE.md).
