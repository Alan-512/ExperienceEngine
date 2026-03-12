## MODIFIED Requirements

### Requirement: Conservative Hint Injection
The system SHALL inject hints only when a similar prior experience exists and the trigger conditions are met.

#### Scenario: Strategy nodes suppress warning piggybacking
- **GIVEN** a task family has both applicable `strategy` and `warning` nodes
- **WHEN** ExperienceEngine selects nodes for injection
- **THEN** it injects only the ranked strategy nodes
- **AND** it does not include warning nodes in the injected node id set

#### Scenario: Warning nodes still inject as fallback
- **GIVEN** a task family has applicable warning nodes but no applicable strategy nodes
- **WHEN** ExperienceEngine selects nodes for injection
- **THEN** it may inject the ranked warning nodes conservatively
