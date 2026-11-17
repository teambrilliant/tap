# Gated fixture - Implementation Plan

**Gate:** human — user-visible change, new dependency

## Overview
Fixture for the gate line: a plan that waits for the operator, nothing ticked.

**Gate:** auto

## Phase 1: Create file

**Layer:** State  ·  **Proves:** the file exists

### Phase Checks
- [ ] `test -f notes.txt` → exit 0
- [ ] `grep -q one notes.txt` → exit 0
