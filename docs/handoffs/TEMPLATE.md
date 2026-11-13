# <Project> — <task>

Updated: <date + timezone when a time matters>
Status: <planning | in-progress | ready-for-transfer | paused | blocked | complete>
Owner: <machine / agent role, or unassigned>
Receiver: <machine / role, or unassigned>
Branch: <branch>
Base / last verified application commit: <full SHA>
Code availability: <included in this commit | pushed earlier | local-only; identify missing paths>
Authorization: <requested scope, stop/resume conditions, actions not approved>

## Objective and completion criteria

<One concrete outcome and evidence needed to call it complete.>

## State and decisions

<What exists; what is partial. Link project plan and ADRs. Do not duplicate full diffs.>

## Changed paths and dependencies

<Repository-relative paths and responsibilities. Required inputs must be tracked or explicitly identified as unavailable. No secret values, machine-specific profile paths or unavailable sibling-repo dependencies.>

## Verification

| Command / check | Code state | OS / architecture | Result | Skips / limitations |
| --- | --- | --- | --- | --- |
| <command> | <commit or dirty tree> | <platform> | <pass/fail/not run> | <scope> |

## Exact next steps

1. <First bounded action; say if explicit resume is required.>
2. <Next validation or review.>

## Risks and blockers

<Failures, missing accounts/permissions, untracked source, assumptions and platform gaps. Distinguish fixture checks from live data.>

## Suggested skills

<Optional skills that fit the task, if available on the receiving machine. No personal skill installation is required to understand this handoff.>

## Transfer

<Sender stops writing and receiver acknowledges ownership via the authorized channel. Put the full pushed commit SHA in the transfer message after commit/push, not a self-referential SHA here.>
