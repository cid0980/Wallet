---
name: nielsen-heuristics-reviewer
description: Review each task flow against Nielsen's ten usability heuristics before publishing.
---

# UX review

Walk each primary flow (record payment, add expense, update estimate, edit tags, sign in) through all ten:

1. **Status:** syncing, offline, pending and success are visible.
2. **Real-world match:** “received”, “remaining”, “spent” and rupee amounts beat implementation jargon; partial payments must read as normal.
3. **Control:** users can close forms and back out of destructive steps.
4. **Consistency:** repeated controls and terms behave identically.
5. **Prevention:** required fields and mutually linked client/project choices prevent invalid writes.
6. **Recognition:** visible project/client context avoids forcing users to remember ids or prior entries.
7. **Efficiency:** record another installment without re-entering the project context.
8. **Minimalism:** only show information needed for the current choice.
9. **Recovery:** say what failed, why when known, and the next action.
10. **Help:** short, contextual hints rather than a long tutorial.

Raise confusing flow/copy issues before ornamental polish. Reference: https://www.nngroup.com/articles/ten-usability-heuristics/.
