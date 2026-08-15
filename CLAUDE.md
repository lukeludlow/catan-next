- Write unit tests. Everything that can be tested should be tested.
- If you encounter a part of the codebase that is not covered by unit tests, you
  should cover it.
- `src/domain/` is pure TypeScript: no React, no DOM, no I/O, no
  `Math.random()`. Anything needing randomness takes an `Rng` as its last
  parameter so every board is reproducible from its seed.
- Board topology is axial coordinates keyed in a `Map`. Never reintroduce
  row/col offset math or a coordinate inverse function.
- Components are `export default function`; everything else is a named export.
  PascalCase for component files, camelCase for modules, kebab-case for
  directories. No barrel files.
- Import through the `@/` alias. Parent-relative imports are lint-banned.
- Open non-trivial modules with a short comment saying why they exist and what
  alternative was rejected.
- Make sure UI/UX design is mobile-friendly and mobile-first, but still looks
  good on desktop.
- Use the files in the @docs/ directory to educate yourself on plans and goals.
- Apply software engineering best practices and SOLID principles.
- Write clean and maintainable code and architecture.
