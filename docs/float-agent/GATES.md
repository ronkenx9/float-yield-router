# Gates: FLOAT liquidity-agent plan and landing copy

OWNS: docs/float-agent/**, landing/src/App.tsx, landing/index.html, landing/README.md

Scope: Deliver an implementation-ready pivot plan and a truthful copy pass on the existing marketing site; no agent implementation or deployment.

- [x] G1: Product plan covers policy, execution, accounting, pricing, roadmap, risks and source-backed resources
  EVIDENCE: PLAN.md sections 1–14 reviewed against user request; includes policy schema, execution state machine, cash-flow accounting, pricing experiments, milestone acceptance criteria, competition and source limitations. Product implementation explicitly out of scope; mainnet and pricing unresolved decisions are identified.

- [x] G2: Landing production bundle compiles
  CHECK: npm run build
  CWD: landing
  EXPECT: built in
  EVIDENCE: automatic-evidence=v1; definition-sha256=80ca09840d32b4def790f9be3a7f47931bba08972f61c33bd3d8b6d93d5d685d; exit=0; EXPECT=matched; output-sha256=5700ed90894aae5442a2e07d1b10e20cd570de22d8052f2f867bbb68e8b9c48b; output-bytes=399; shell=/bin/sh; cwd=/Users/gadgetplug/Documents/vibecoding/float-yield-router/landing; path=cbd866279e88/26 entries

- [x] G3: Rendered desktop and mobile preview preserves layout, working anchors and FAQ, with no live-product or return guarantees
  EVIDENCE: Browser at localhost:5188 inspected at 1280x720 and 375x812; document scrollWidth matched viewport at both sizes; DOM anchor audit returned no broken anchors, loaded-image audit returned no broken images. Preview and closing CTA navigation checked; pricing FAQ aria-expanded changed to true. Mobile goal text truncation fixed and screenshot rechecked. Existing cinematic composition retained.

- [x] G4: Landing copy and metadata describe the new direction, with illustrative traces and accurate CTAs
  EVIDENCE: Rendered page reviewed: personal LP agent, Calm/Balanced/Aggressive, approval-first roadmap, losses and unfixed pricing disclosed. Old USYC/APY/latency claims removed from landing source and metadata. Six examples labeled; primary CTA is a preview anchor, closing CTA uses existing X URL. Social metadata switched from stale slogan artwork to existing Flo mascot; live unfurl and deployment not claimed.

- [ ] G5: First viewport states the user value, mechanism and target chain in language a retail crypto user can understand immediately
  EVIDENCE: pending

- [ ] G6: Full landing-page copy consistently leads with earning trading fees and delegates LP work to Flo while retaining readiness and risk disclosures
  EVIDENCE: pending
