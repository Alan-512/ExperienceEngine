## ADDED Requirements

### Requirement: LLM-first distillation is the primary path for formal experience expression
ExperienceEngine SHALL use an extractor-model distillation step as the default path for producing final experience wording once a candidate passes rule-based filtering.

#### Scenario: Rules gate but do not author final experience text
- **WHEN** a candidate passes the rule-based pre-filter
- **THEN** ExperienceEngine sends it through the configured distillation model to produce the final compact hint and related structured fields
- **AND** rule heuristics do not directly serve as the final experience wording in the primary path

#### Scenario: Distillation uses a model profile independent from the host's main execution loop
- **WHEN** ExperienceEngine performs candidate distillation
- **THEN** it selects a configured extractor profile suitable for distillation work
- **AND** that profile remains conceptually separate from the host agent's main execution model

## REMOVED Requirements

### Requirement: User-authored experience is a first-class capability
**Reason**: v3 当前阶段要求先验证自动捕获、异步提炼和治理闭环，手工补写经验不再属于当前核心主线。
**Migration**: Remove `ee remember` and MCP manual remember from the current product surface; if manual authoring is reintroduced later, define it through a dedicated future change.
