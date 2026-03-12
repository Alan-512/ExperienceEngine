# Change Proposal: Normalize Claude Hook Events

## Why

The current Claude Code foundation only preserves raw hook payloads. That is enough for capture, but not enough for durable adapter integration because downstream logic would still need to understand Claude-specific JSON every time.

## What Changes

- Add a Claude hook normalizer that maps raw hook payloads to a stable ExperienceEngine adapter event shape
- Persist normalized Claude events alongside raw captures
- Cover prompt, tool, and session-end style events with defensive field extraction

## Impact

- Claude adapter data becomes replayable and inspectable without re-parsing raw hook JSON
- The next Claude integration step can target normalized adapter events instead of raw host payloads
