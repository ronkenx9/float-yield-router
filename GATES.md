# Gates: Arc mainnet ecosystem research and FLOAT strategy

OWNS: GATES.md, docs/arc-mainnet-float-strategy-2026-09.md

Scope: Produce a source-backed Arc ecosystem and competitive-gap report that audits FLOAT and recommends a credible mainnet upgrade path.

- [x] G1: The report distinguishes verified Arc facts, announced plans, and analyst inference, and covers mainnet timing/status plus named ecosystem projects.
  CHECK: node -e "const fs=require('fs');const p='docs/arc-mainnet-float-strategy-2026-09.md';const s=fs.readFileSync(p,'utf8');for(const x of ['Evidence labels','Arc status and launch path','Confirmed or publicly announced Arc ecosystem','Verified fact','Announced plan','Inference'])if(!s.includes(x))throw Error(x);console.log('ARC_ECOSYSTEM_VERIFIED')"
  EXPECT: ARC_ECOSYSTEM_VERIFIED
  EVIDENCE: automatic-evidence=v1; definition-sha256=9f267243604f2f73c6cb63e3ad52b15ed4417fd1747f1a430469b0e60b043886; exit=0; EXPECT=matched; output-sha256=66a2f34ea219bb238516ae94288b0a7d458cdc03930905e12aba27f633021213; output-bytes=23; shell=/bin/sh; cwd=/Users/gadgetplug/Documents/vibecoding/float-yield-router; path=74c3116f42e3/22 entries

- [x] G2: The report includes a sourced comparison of Arc with established chains and identifies decision-relevant gaps rather than a generic feature list.
  CHECK: node -e "const fs=require('fs');const s=fs.readFileSync('docs/arc-mainnet-float-strategy-2026-09.md','utf8');for(const x of ['Competitive benchmark','Ethereum','Solana','BNB Chain','Base','What Arc still lacks','Sources'])if(!s.includes(x))throw Error(x);console.log('CHAIN_GAP_ANALYSIS_VERIFIED')"
  EXPECT: CHAIN_GAP_ANALYSIS_VERIFIED
  EVIDENCE: automatic-evidence=v1; definition-sha256=eb1b751992fc59caf310fd1dd6fd35b78b965bf067f7286cb8346e4be0479778; exit=0; EXPECT=matched; output-sha256=c8fce11d68f1beb0a3050071830fc1db3f834551cfa4a81a64322bb3389c5bdc; output-bytes=28; shell=/bin/sh; cwd=/Users/gadgetplug/Documents/vibecoding/float-yield-router; path=74c3116f42e3/22 entries

- [x] G3: The report audits the existing FLOAT implementation and provides a prioritized, phased mainnet roadmap with risks, kill criteria, and a concrete positioning recommendation.
  CHECK: node -e "const fs=require('fs');const s=fs.readFileSync('docs/arc-mainnet-float-strategy-2026-09.md','utf8');for(const x of ['FLOAT audit','Recommended product thesis','P0','P1','P2','Kill criteria','90-day roadmap','Security and operational risks'])if(!s.includes(x))throw Error(x);console.log('FLOAT_ROADMAP_VERIFIED')"
  EXPECT: FLOAT_ROADMAP_VERIFIED
  EVIDENCE: automatic-evidence=v1; definition-sha256=6ddc0ed3b8040470ae84b9dcffb711a1ca1a47ab690eca66d99f9753d94d6230; exit=0; EXPECT=matched; output-sha256=86d81a158e1cbbf8d14f41e93710c33ec2f4b536d59f4f8d3a3469d44dcf4b4f; output-bytes=23; shell=/bin/sh; cwd=/Users/gadgetplug/Documents/vibecoding/float-yield-router; path=74c3116f42e3/22 entries

- [x] G4: Every external factual claim in the report is supported by direct source links, with primary sources preferred and uncertainty called out where current data is unavailable.
  EVIDENCE: Manually reviewed 15 September 2026. The report contains 57 inline links (38 unique) across official Arc/Circle docs and announcements, official competitor documentation, and dated DeFiLlama market snapshots. Launch candidates are labeled as expected/announced rather than live; Arc mainnet metrics and addresses are explicitly marked unavailable before the 16 September public launch.
