# Design & UI Guidelines

## Avoid these "vibecoded" AI-default patterns

Do not default to these unless the user explicitly asks for them. They are the
visual/textual tells that flag a UI as AI-generated:

1. Purple-to-blue gradient (as a default background/accent)
2. Gradient hero text
3. Emojis in headings
4. Inter font as the default/only typeface
5. Colored border cards (e.g. bright 1px colored borders on every card)
6. Glassmorphism cards (frosted-glass blur effects)
7. Low-contrast dark mode
8. Three icon boxes in a row (generic feature-grid layout)
9. Badge/pill above the headline
10. Lucide icons everywhere as the default icon set
11. Untouched shadcn UI (using shadcn components with zero customization)
12. Fade-in-on-scroll animations as a default
13. Cursor-following beam/glow effects
14. Buttons that fade on hover as the default hover state
15. Inconsistent spacing (not using a consistent spacing scale)
16. Em dashes everywhere in copy
17. Generic buzzword copy ("seamless", "empower", "unlock", "elevate", etc.)
18. Serif italic accents used decoratively
19. Space Grotesk + Instrument Serif font pairing as a default
20. Grain/noise texture overlaid on a gradient

## What to do instead

- Pick a deliberate, specific visual direction for this project (Cambodian
  event-booking platform) rather than reaching for generic AI-app defaults.
- Choose typography, color, and spacing intentionally and stay consistent
  with what's already established in the codebase rather than introducing a
  new pattern per component.
- If unsure what direction to take, ask rather than defaulting to the list
  above.
