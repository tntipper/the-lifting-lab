# How to run Codex on TLL (v2, plain English)

1. **One ticket at a time** from TASK-QUEUE.md, in order. Start a new Codex chat in the project folder.
2. **Paste the prompt below** and change the ticket number. Codex reads AGENTS.md and the HANDOVER note first.
3. **If Codex says it's stuck,** it should tell you the cause and a suggested fix. Answer it, or decide to move on. Don't say "keep going".
4. **Check the result:** read the PR summary and its evidence, and try the acceptance test. Merge it if it passes.
5. **New ideas** go into the queue as new tickets, in the right place, never in the middle of a task.
6. **Approvals:** real supplier orders, paid test orders, live price changes and removing the store password happen only when you say "approved" for that specific action.

## Prompt template
> Work on ticket TNN from docs/TASK-QUEUE.md only. Read AGENTS.md and .agent/HANDOVER.md first. Check git status and use the base branch in the ticket. Reuse existing code in lib/commerce before writing new code. Meet every acceptance test, show the evidence, open one PR and update HANDOVER in 10 lines or fewer. If a step fails twice, diagnose it and report the cause and a proposed fix. Don't change anything outside the ticket.

## Example prompts
- T01: "Ticket T01: draft docs/ops/2026-10-reconcile.md with the decisions and a keep/merge/park list for draft PRs. Don't merge or close anything."
- T02: "Ticket T02: update AGENTS.md and add the three docs; keep the useful existing content."
- T03: "Ticket T03: merge the fix PRs I approved in T01, in chain order, with CI green after each."
- T04: "Ticket T04: produce the approve/hold/exclude sheet for the 59 products / 70 variants, with the compliance column for Lifty."
- T05: "Ticket T05: build the saved mapping on ExactMapping and load the approved rows."
- T06: "Ticket T06: route approved offers to the exact Shopify variant, affiliate only where there's no offer."
- T07: "Ticket T07: show Shopify price and stock on the site from the Storefront API."
- T08: "Ticket T08: harness core and TropShip sync in dry-run, with stale-stock expiry."
- T09: "Ticket T09: manual queue, admin page and alerts."
- T10: "Ticket T10: route paid orders to TropShip with a fresh order read, reservation, and no automatic resubmit."
- T11: "Ticket T11: read-only discovery for Bodypower/PowerBody: identity, terms, feed and coverage."
- T12: "Ticket T12: tracking write-back, then walk me through launch gates A–E. I'll approve the paid test order and remove the password myself."
- T13: "Ticket T13: plan and carry out the move out of iCloud, keeping worktrees and private state. Show me each step."
- T14 / T16: "Ticket T14: build the Bodypower/PowerBody adapter from the template with fixtures."
- T15: "Ticket T15: link Shopify customer accounts to site profiles and add My Stack to the cart."

## Who does what
- **Toby:** decisions, approvals, supplier accounts, merges, and removing the password.
- **Lifty:** product truth and compliance sign-off.
- **Web Dev bot / Codex:** one ticket at a time.
