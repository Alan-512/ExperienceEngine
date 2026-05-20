## ADDED Requirements

### Requirement: Guidance trajectory expectations
ExperienceEngine SHALL compile structured guidance fields into trajectory expectations for attribution.

#### Scenario: Recommended steps create positive expectations
- **WHEN** a delivered node contains `recommended_steps`
- **THEN** ExperienceEngine can derive ordered or partially ordered trajectory expectations from those steps
- **AND** the expectations reference normalized tool families, command families, artifact families, or other bounded execution features rather than raw prose alone

#### Scenario: Avoid steps create non-adoption expectations
- **WHEN** a delivered node contains `avoid_steps`
- **THEN** ExperienceEngine can derive expectations for actions that indicate guidance was not adopted
- **AND** violating an avoid step is not by itself classified as guidance-caused harm

### Requirement: Tool event timeline alignment
ExperienceEngine SHALL compare trajectory expectations with normalized tool event timelines during attribution.

#### Scenario: Command timeline is normalized before matching
- **WHEN** ExperienceEngine builds a tool event timeline from shell, file, or host tool events
- **THEN** it normalizes tool names, executable aliases, subcommands, command families, argument patterns, touched artifact families, exit status, retry patterns, and failure signatures
- **AND** it redacts volatile tokens such as branch names, temporary paths, UUIDs, ports, generated filenames, and absolute local paths before matching
- **AND** matching uses the normalized representation rather than raw command text alone

#### Scenario: Adoption is detected from tool timeline
- **WHEN** the task tool event timeline matches key recommended-step expectations in the expected order or allowed partial order
- **THEN** ExperienceEngine records trajectory evidence indicating `adoption_detected`
- **AND** attribution confidence may increase only within the causal attribution rules

#### Scenario: Non-adoption is detected from tool timeline
- **WHEN** the tool event timeline violates avoid-step expectations or omits required recommended-step evidence
- **THEN** ExperienceEngine records trajectory evidence indicating non-adoption or contra-adoption when supported
- **AND** the result defaults to neutral or unknown unless other evidence establishes causal harm

#### Scenario: Trajectory evidence is unknown
- **WHEN** a task has insufficient tool events, unsupported tool formats, or ambiguous command summaries
- **THEN** ExperienceEngine records trajectory evidence as unknown
- **AND** it does not infer helped or harmed solely from missing trajectory evidence

#### Scenario: Mixed ordered and unordered events can match
- **WHEN** a guidance expectation requires some ordered command events and some unordered artifact-touch evidence
- **THEN** ExperienceEngine can match the ordered command sequence independently from unordered file or artifact evidence
- **AND** it records which expectations were matched, missing, or ambiguous

### Requirement: Causal attribution uses trajectory evidence
ExperienceEngine SHALL use trajectory alignment as one bounded signal in causal attribution.

#### Scenario: Adopted guidance can support helped attribution
- **WHEN** guidance was delivered, trajectory adoption is detected, the task outcome is successful, and the success domain aligns with the guidance domain
- **THEN** ExperienceEngine may record strong or weak helped attribution according to confidence rules
- **AND** the attribution record includes trajectory evidence references

#### Scenario: Adopted guidance can support harmed attribution
- **WHEN** guidance was delivered, trajectory adoption is detected, the task failed, and the failure signature or failed tool event aligns with the adopted guidance path
- **THEN** ExperienceEngine may record weak or strong harmed attribution according to confidence rules
- **AND** the attribution record includes the causal evidence chain

#### Scenario: Avoid-step violation does not automatically harm guidance
- **WHEN** guidance says to avoid an action
- **AND** the tool timeline performs that action
- **THEN** ExperienceEngine treats the action as non-adoption or contra-adoption evidence by default
- **AND** it does not mark the guidance as harmed unless additional evidence shows the guidance itself caused the failure

#### Scenario: Manual feedback remains the lifecycle override
- **WHEN** a user or operator provides explicit manual helped or harmed feedback
- **THEN** ExperienceEngine preserves the manual lifecycle decision according to existing override semantics
- **AND** trajectory evidence remains stored as diagnostics and supporting evidence rather than silently replacing the manual decision

### Requirement: Trajectory attribution remains inspectable
ExperienceEngine SHALL expose trajectory attribution evidence through inspection surfaces.

#### Scenario: Verbose attribution shows trajectory evidence
- **WHEN** an operator inspects an attribution record with trajectory evidence
- **THEN** ExperienceEngine shows the trajectory verdict, matched expectations, violated expectations, relevant tool event references, confidence, and attribution reason
- **AND** non-verbose output remains bounded
