# landing/

**The FLOAT marketing site.**

A Vite + React + TypeScript + Tailwind app, dark editorial aesthetic, italic Instrument Serif + Barlow + Dirtyline. Nine sections, hero with boomerang video, cinematic image still, typographic outro.

```bash
npm install
npm run dev
# → http://localhost:5173
```

---

## What's on the page

The whole site is one scroll, marked by tiny editorial section indices in the top-left of each section (a magazine-spread rhythm):

| #  | Section          | What it does                                                             |
|----|------------------|--------------------------------------------------------------------------|
| —  | Hero             | Boomerang video (Flo orb) + GSAP mouse parallax + fixed nav pill         |
| 01 | Built With       | Photon · Arc · Circle — the closing-credits transition between hero and the content |
| 02 | Capabilities     | 6-card feature grid with mono-font "live system output" traces           |
| 03 | Meet Flo         | 3-up mascot section showing IDLE / EXECUTING / PARKED states             |
| 04 | Idle is the Point | Cinematic image still (lazy section) with asymmetric vignette + floating glass pills |
| 05 | The Numbers      | Three big italic stats: `5.15%` · `<5s` · `$0.01`                        |
| 06 | Questions        | FAQ accordion (5 real FLOAT Q&A), grid-rows expand                       |
| 07 | Start            | Install command pill + `Get the SDK` + `Star on GitHub` CTAs             |
| 08 | Footer           | Video-backdrop typographic outro · giant italic `float` wordmark + utility bar |

---

## Stack

| Layer        | Choice                                                |
|--------------|-------------------------------------------------------|
| Build tool   | Vite 5                                                |
| Framework    | React 18 + TypeScript 5                               |
| Styling      | Tailwind CSS 3 (custom config — full-pill border-radius) |
| Animation    | GSAP (mouse parallax on hero), CSS-only elsewhere     |
| Icons        | `lucide-react` (with one inline Discord SVG)          |
| Fonts        | Instrument Serif (italic display), Barlow (body), Dirtyline (display accent) — all from Google Fonts |

No motion library beyond GSAP. No UI kit. No design system framework. Everything is hand-rolled around the `liquid-glass` / `liquid-glass-strong` CSS utility classes defined in `src/index.css`.

---

## File layout

```
landing/
├── index.html                    ← Vite entry, meta tags
├── tailwind.config.js            ← font family + full-pill border-radius
├── postcss.config.js
├── vite.config.ts                ← port 5173
├── tsconfig.json
├── tsconfig.node.json
├── src/
│   ├── main.tsx                  ← React mount
│   ├── App.tsx                   ← every section is in here, top to bottom
│   ├── index.css                 ← Tailwind directives + liquid-glass utilities + section CSS
│   └── vite-env.d.ts             ← types (includes requestVideoFrameCallback augmentation)
└── public/
    ├── flo-hero.mp4              ← hero boomerang source
    ├── flo-calm.png              ← MeetFlo IDLE state
    ├── flo-focused.png           ← MeetFlo EXECUTING state (optional — falls back to calm)
    ├── flo-happy.png             ← MeetFlo PARKED state (optional — falls back to calm)
    ├── lazy-section.png          ← cinematic still
    └── float-banner.png          ← (unused after footer swap to video backdrop)
```

The whole site is **one file** — `src/App.tsx`. Each section is a top-level function component (`Hero`, `BuiltWith`, `Features`, `MeetFlo`, `LazySection`, `NumbersStrip`, `FAQSection`, `StartCTA`, `Footer`) mounted by the default `App` export at the bottom.

---

## Key implementation details

### Hero boomerang
Captures frames from `/flo-hero.mp4` into offscreen canvases as the video plays through once. After capture, the `<video>` is hidden and a display `<canvas>` plays back the frames in ping-pong order at 30fps. Capped at 240 frames to bound memory.

Uses `requestVideoFrameCallback` where available, falls back to `requestAnimationFrame`.

### GSAP parallax
Mouse position is mapped to an eased `gsap.set` on the hero's video bg div. Strength 20, lerp 0.06. The whole video layer is scaled `1.08` so the edges don't peek out when it drifts.

### Liquid glass
Two CSS utility classes in `index.css` — `.liquid-glass` and `.liquid-glass-strong`. Both use a `:before` pseudo-element with `mask-composite: exclude` to create a sub-pixel inner glow border, plus `backdrop-filter: blur()` for the frosted-glass effect.

### Lazy section
Five stacked overlays over a full-bleed image: uniform black wash (55%), asymmetric radial vignette focused at `58% 42%`, aggressive bottom-up linear fade (floor → void), top fade (for nav readability), warm color grade (`rgba(28,14,4,0.35) * mix-blend-multiply`), hairline grain.

The headline `"While you rest, your capital works."` bleeds across the bottom void.

### FAQ accordion
Uses the modern CSS grid-rows trick (`grid-template-rows: 0fr → 1fr`) for smooth height animation without JS measurement. Plus/minus icon swap, hairline border per item that brightens on `aria-expanded`.

### Footer
Looped video backdrop (`/public/footer.mp4`) behind a four-layer overlay stack pushing focus to a giant italic `float` wordmark. Bookends the hero exactly — same font, same italic, same scale.

---

## Mascot images

The MeetFlo section ships three expressions from the Flo brand sheet in `public/`:

| File                | State     |
|---------------------|-----------|
| `flo-calm.png`      | IDLE      |
| `flo-focused.jpeg`  | EXECUTING |
| `flo-happy.jpeg`    | PARKED    |

If any are missing, `<img onError>` falls back to `flo-calm.png`.

---

## Customizing copy

All section copy is inline in `src/App.tsx` (each section is a function component). The FAQ array is the easiest to extend:

```ts
const FAQS = [
  { q: 'Will my agent miss trades while parked?', a: '…' },
  // add more here
];
```

The 6-card features grid is also data-driven inside `Features()`:

```tsx
<FeatureCard
  index="07"
  title="My new feature"
  body="One-line claim."
  trace={<pre>…mono-font visual…</pre>}
/>
```

---

## Production build

```bash
npm run build
# → dist/
npm run preview
# → http://localhost:4173
```

Current build size: **228 kB JS, 78 kB gzipped**. CSS is **17.7 kB, 4.5 kB gzipped**.

The hero video (~10.7 MB) and the footer video (~12.7 MB) live in `/public/` and are streamed by the browser, not bundled. The lazy-section image (~4 MB) is downloaded lazily.

---

## License

MIT — see the repo root.
