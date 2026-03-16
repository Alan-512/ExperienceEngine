## MODIFIED Requirements

### Requirement: LLM-first distillation is the primary path for formal experience expression
ExperienceEngine SHALL use an extractor-model distillation step as the default path for producing final experience wording once a candidate passes rule-based filtering, and the distillation prompt SHALL use OPD-style hindsight framing with structured outputs.

#### Scenario: Rules gate but do not author final experience text
- **WHEN** a candidate passes the rule-based pre-filter
- **THEN** ExperienceEngine sends it through the configured distillation model to produce the final compact hint and related structured fields
- **AND** rule heuristics do not directly serve as the final experience wording in the primary path

#### Scenario: Distillation uses OPD-style hindsight guidance with structured outputs
- **WHEN** ExperienceEngine performs candidate distillation
- **THEN** the prompt asks what the agent would do differently if it knew one key fact upfront
- **AND** the distillation output includes `compact_hint`, `trigger_conditions`, `success_criteria`, and `risk_level`

#### Scenario: Distillation uses a model profile independent from the host's main execution loop
- **WHEN** ExperienceEngine performs candidate distillation
- **THEN** it selects a configured extractor profile suitable for distillation work
- **AND** that profile remains conceptually separate from the host agent's main execution model
