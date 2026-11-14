# IDOR automation (backlog)

This document captures **design questions only**. No probe or automation code is specified here; implementation is deferred until product and safety decisions are made.

## Status

Blocked on defining scope, policy, and evidence requirements before writing any active testing code.

## Questions to resolve

1. **Threat model**  
   IDOR testing usually needs **authenticated session state** and may involve **sequential or state-changing** requests. How should that interact with the existing manual login flow, crawl allowlists, and organizational/legal authorization for the target?

2. **Safety rails**  
   What caps are required (QPS, max variants per endpoint, total wall time)? Should hosts be **allowlisted**, default to **read-only** verbs, and require an explicit **unsafe mode** for anything mutating? How should the app store **evidence** (e.g. request/response metadata, hashes) while avoiding secrets in logs?

3. **Planner vs executor**  
   Should an LLM only **suggest** candidate identifier slots and patterns from **already captured** data, while a small **deterministic executor** performs HTTP requests? Prefer keeping execution in first-party code with auditable rules rather than an open-ended model-driven client.

4. **Relation to removed active probes**  
   Earlier active probe code was removed from this project. Reintroducing IDOR-style checks should live in a **small, isolated, feature-flagged** module with clear separation from crawl/extract paths and from optional LLM helpers such as clustering.

## Out of scope until decided

- Automatic identifier swapping or parallel user-context requests  
- Persisted “finding” rows without a reviewed evidence schema  
- Inline LLM calls during live crawl (keep post-run or explicitly triggered jobs)
