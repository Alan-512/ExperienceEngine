# Product Proposal: Experience Learning Eligibility

## Status

- audience: internal
- horizon: near-term
- scope: learning eligibility and promotion only
- implementation: completed for the intended product scope

## Implementation Status

This proposal has been implemented for its intended near-term scope.

Completed:

- task records, candidate experience, and durable experience are now treated as distinct product layers
- expression-layer and wording-only tasks are recorded but rejected from learning
- learning eligibility is gated by reusable decision value instead of raw task completion
- deterministic vetoes block obvious non-learnable noise classes
- learning decisions are visible through `learning_status` and `learning_reason`
- inspect surfaces explain whether a task was learned, rejected, or kept only as history

This document should now be read as a description of the current product behavior rather than a pending proposal.

## Why This Proposal Exists

ExperienceEngine already records task runs, outcomes, tool events, and reusable nodes.

The current product risk is not "EE fails to remember enough."

The current risk is that EE can sometimes learn the wrong kind of thing:

- task-local wording fixes
- local presentation adjustments
- one-off edits that completed a task but did not create reusable decision guidance

That creates the worst possible memory pattern:

- more stored content
- lower average quality
- weaker future intervention trust

So the next product question is not retrieval quality alone.

The next product question is:

**what has earned the right to become reusable experience at all?**

## Product Decision

ExperienceEngine should become stricter about what counts as learnable experience.

The correct product model is:

1. record broadly
2. promote cautiously
3. reuse only what has decision value

This means the system should keep rich task history without turning every successful task into a candidate experience node.

## First-Principles Definition

Experience is not:

- a completed edit
- a better sentence
- a task summary that sounds insightful

Experience is:

- a reusable decision rule
- tied to a recognizable future situation
- supported by real outcome evidence
- able to change what the agent does earlier next time

The central rule is simple:

**task completion is not the same thing as experience creation.**

## The Three Layers

### Layer 1: Task Record

Every meaningful task can be stored as a task record.

This layer answers:

- what happened
- what tools were used
- what the outcome looked like

Task records are raw material.

They are not yet experience.

### Layer 2: Experience Candidate

A task record should only become a candidate when it produces a reusable lesson.

This layer answers:

- did the run reveal a future decision rule?
- is the lesson more than a task-local change?
- does the lesson have real supporting evidence?

Candidates are possible experience.

They are still not trusted by default.

### Layer 3: Durable Experience

A candidate becomes durable experience only after it proves that it can help again without causing too much harm.

This layer answers:

- has this lesson survived reuse?
- does it still apply cleanly?
- should it keep intervening?

This is the only layer that should normally influence future behavior.

## What Should Be Learnable

EE should preferentially learn:

- failure -> repair -> success paths
- repeated troubleshooting order
- reusable verification loops
- warning patterns that stop repeated bad paths
- expectation corrections that change the solution direction in a reusable way

These all share one property:

they change future agent decisions, not just this task's phrasing.

## What Should Not Be Learnable

EE should not learn:

- local wording changes
- one-off doc edits
- presentation cleanup
- task-local formatting preferences
- changes whose only evidence is "an edit was applied"
- changes whose usefulness depends on the exact current conversation rather than a recurring task shape

These can remain task records.

They should not become reusable experience.

## The Four Eligibility Gates

Before a task can become an experience candidate, it should pass four gates.

### Gate 1: Real Outcome Evidence

The system must ask:

- did something real get validated?

Valid evidence includes:

- a test, probe, or verification step succeeding
- a concrete failure being removed
- an explicit user confirmation
- a behavior-level correction succeeding

Invalid evidence includes:

- an edit tool succeeded
- a file was changed
- a wording pass was completed

Action is not evidence.

### Gate 2: Decision Value

The system must ask:

- did this task reveal a better future decision order?

If the answer is only:

- "the wording is cleaner now"
- "the final text reads better"
- "the local presentation is improved"

then there is no decision value.

If the answer is:

- "next time the agent should check X before changing Y"
- "next time the agent should avoid this repeated dead path"

then the run has decision value.

### Gate 3: Transferability

The system must ask:

- will this lesson still make sense in a future similar task?

A learnable lesson must have:

- a recognizable trigger
- a bounded scope
- a reason to reuse

If the lesson only makes sense in this exact wording pass or this exact local conversation, it fails transferability.

### Gate 4: Risk

The system must ask:

- if this lesson is wrong, how much future damage can it do?

Broad, vague, slogan-like lessons should be blocked or heavily delayed.

High-risk lessons require stronger evidence and narrower scope.

## How LLM Should Be Used

The LLM should not act like a freeform summarizer.

It should act like a structured eligibility judge.

Its job is to answer three questions in order:

1. Is there a reusable lesson here at all?
2. What kind of lesson is it?
3. What is the shortest future-facing rule the agent should remember?

That means the LLM prompt should force judgment, not just synthesis.

It should explicitly distinguish:

- raw task success
- reusable decision value
- local-only refinements

The LLM should only return a candidate when all of the following are true:

- the evidence is real
- the lesson changes future decisions
- the lesson is transferable beyond the exact local edit

## Deterministic Checks Must Still Exist

LLM judgment is necessary, but it should not be the only gate.

After the LLM says "worth capturing," ExperienceEngine should still apply deterministic vetoes for obvious noise classes, such as:

- edit-only tasks
- exploratory-only tasks
- local wording / formatting / presentation-only runs
- tasks with no substantive evidence beyond file mutation

This keeps the system from learning fluent nonsense.

## Expectation Correction Needs Special Treatment

Expectation correction is valuable, but easy to over-capture.

A valid expectation correction is not:

- "the wording changed after discussion"

A valid expectation correction is:

- "the first solution direction was wrong"
- "the correction changed the actual problem-solving direction"
- "the corrected direction then produced better evidence"

That means expectation correction should only be learned when the corrected direction changes the actual action plan, not just the expression layer.

## Promotion Strategy

The system should stay asymmetric:

- capture can be moderately broad
- promotion must be strict

In practice:

- raw task records can be common
- candidates should be fewer
- active nodes should be rare compared with task volume

This is healthy.

An experience system that promotes too much becomes a noise system.

## Product Surfaces

The product should eventually expose why a task was:

- recorded only
- promoted to candidate
- rejected from learning
- promoted into reusable experience

This matters because a governance system is easier to trust when operators can see why something was not learned.

## Recommended Rollout

### Phase 1

Tighten eligibility so edit-only and local wording tasks stay as task records.

### Phase 2

Strengthen expectation-correction rules so only solution-direction corrections are learnable.

### Phase 3

Expose inspect surfaces that explain:

- why something was learned
- why something was rejected
- what evidence was considered sufficient

## Success Criteria

This proposal is successful if:

- EE still learns real troubleshooting and verification experience
- local doc and wording tasks stop producing reusable nodes
- candidate volume drops, but candidate quality rises
- future interventions feel more trustworthy because fewer noisy lessons survive

## Final Recommendation

ExperienceEngine should optimize for learning precision, not learning volume.

The correct long-term posture is:

- remember many tasks
- learn from few
- intervene with fewer, stronger lessons

That is how EE avoids becoming a memory dump and stays a governance system.
