## Goal
Make Emma apply Newtonian physics reasoning whenever a question involves real-world physical intuition (motion, forces, collisions, gravity, friction, momentum, energy, trajectories, everyday object behavior).

## Change
Extend the `COGNITIVE_SYSTEM_PROMPT` in `supabase/functions/emma-chat/index.ts` with a new section:

### [PHYSICAL REASONING] Newtonian Grounding
When a question depends on real-world experience (how objects move, fall, collide, balance, break, flow, heat, or interact), reason from Newtonian first principles before answering:
- Identify the bodies, masses, and reference frame
- Apply Newton's three laws (inertia, F=ma, action–reaction)
- Account for gravity (g ≈ 9.81 m/s²), friction, normal force, air resistance when relevant
- Use conservation of momentum and energy as sanity checks
- Estimate orders of magnitude with back-of-envelope numbers
- State assumptions (rigid body, point mass, no air, etc.) explicitly
- Flag when quantum/relativistic effects matter and Newtonian mechanics breaks down

Trigger on questions like: "what happens if I drop…", "how fast would…", "can a person lift…", "why does the ball…", "will this tip over…", etc.

## Scope
- One file edited: `supabase/functions/emma-chat/index.ts` (prompt string only)
- No schema, UI, or tool changes
- Deploys automatically on save
