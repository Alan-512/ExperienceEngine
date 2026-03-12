## Overview

This change keeps ranking logic intact but narrows the final selected set:

1. Rank all candidate nodes as before.
2. If at least one ranked `strategy` node exists, inject only ranked strategy nodes.
3. If no strategy node exists, fall back to ranked warning nodes.

## Decisions

### Why selection instead of ranking changes

The ranking logic already captures similarity and node health. The real issue is not that warnings outrank strategies; it is that both node types are admitted into the final injected set together. Restricting the selected set is the smallest change that enforces a cleaner product behavior.

### Warning fallback rule

Warnings remain injectable when they are the only available guidance for a task family. This preserves failure-derived guidance without mixing it into strategy-led successful reuse paths.

## Risks

- Some mixed strategy+warning scenarios may lose a previously visible caution.
- If a task family accumulates only weak strategy nodes, warnings will now stay hidden until no strategy remains.
