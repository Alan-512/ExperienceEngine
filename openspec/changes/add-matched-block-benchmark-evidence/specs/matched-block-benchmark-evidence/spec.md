## ADDED Requirements

### Requirement: Imported benchmark schemas and statistical rules are exhaustive

ExperienceEngine SHALL implement the complete statistical-unit, scorecard, ground-truth, arm, manifest, preflight, formal-attempt, failure, disposition, exclusion, replacement, instrumentation, scoring, and publication contracts imported from Sections 12.1–12.11.

#### Scenario: Imported field, arm, code, disposition, metric, or eligibility rule is omitted

- **WHEN** a manifest, harness, storage row, scorer, report, or test fixture omits an imported member
- **THEN** exhaustive benchmark-contract tests SHALL fail
- **AND** the omitted case SHALL NOT be handled by an unversioned generic category

### Requirement: Benchmark event outcomes use harm-first aggregation

ExperienceEngine SHALL aggregate delivered intervention events so harm takes precedence, help is counted only when no harm condition exists, and every other delivered event is uncertain.

#### Scenario: One delivered event has helped and harmed node evidence

- **WHEN** the frozen harmed condition and helped condition are both present
- **THEN** the intervention event SHALL count as harmed only
- **AND** it SHALL NOT count in both numerator categories

#### Scenario: Net helpful intervention rate is reported

- **WHEN** benchmark results are summarized
- **THEN** the denominator SHALL be delivered intervention events including uncertain events
- **AND** coverage SHALL be reported with the rate

### Requirement: Every efficacy block has exactly three required arms

ExperienceEngine SHALL define the required arm set as `treatment`, `forced_holdout`, and `no_ee`.

#### Scenario: Forced holdout arm runs

- **WHEN** the `forced_holdout` arm executes
- **THEN** the decision pipeline SHALL run and record the would-have-delivered result
- **AND** delivery SHALL be false unconditionally rather than using probabilistic runtime holdout

#### Scenario: No-EE arm runs

- **WHEN** the `no_ee` arm executes
- **THEN** no ExperienceEngine runtime SHALL participate
- **AND** shared metrics SHALL be collected by the same external arm-neutral harness

#### Scenario: Extra or missing efficacy arm is proposed

- **WHEN** the required arm set is not exactly the frozen three-arm set for the initial protocol
- **THEN** the block SHALL be ineligible unless a later independently frozen protocol version defines the change

### Requirement: Matched-block manifests are immutable before formal execution

ExperienceEngine SHALL seal one immutable manifest for each benchmark block before any formal arm attempt starts.

#### Scenario: Block is sealed

- **WHEN** the scenario, fixture, ground truth, task, arms, forced holdout, seed/order, runtime/package/config versions, timeout/resource rules, scoring rubric, and instrumentation contract are complete
- **THEN** the block MAY become sealed and eligible for formal execution

#### Scenario: Sealed manifest is changed

- **WHEN** any efficacy-relevant field would change after sealing
- **THEN** the original block SHALL remain unchanged
- **AND** a new block id SHALL be required

### Requirement: Preflight attempts are separate from formal efficacy attempts

ExperienceEngine SHALL record environment and harness preflight separately and SHALL NOT convert preflight runs into formal arm attempts.

#### Scenario: Preflight retries

- **WHEN** dependency setup, credential validation, host startup, fixture preparation, or harness smoke fails before formal execution
- **THEN** bounded preflight retries MAY occur
- **AND** no `(block_id, arm)` formal attempt SHALL be consumed

#### Scenario: Formal execution starts

- **WHEN** preflight passes and the sealed block is eligible
- **THEN** one atomic row insertion SHALL create attempt number one in `running` state immediately before the harness releases the task input
- **AND** every later retry SHALL require closing and replacing the entire block

### Requirement: Each block and arm has at most one formal attempt

ExperienceEngine SHALL enforce uniqueness for formal attempts by `(block_id, arm)`.

#### Scenario: First formal attempt starts

- **WHEN** no formal attempt exists for the sealed block and arm
- **THEN** one attempt MAY be created

#### Scenario: Formal attempt times out or fails

- **WHEN** the attempt reaches timeout, product failure, infrastructure failure, abort, exclusion, or completion
- **THEN** that result SHALL consume the block/arm formal slot
- **AND** another formal attempt with the same block id and arm SHALL be rejected

#### Scenario: Task reaches its declared task timeout after valid start

- **WHEN** the common harness, host transcript, and scorer complete validly
- **THEN** the attempt SHALL use `execution_status = completed`, `task_timeout = true`, and the appropriate task outcome
- **AND** it SHALL remain efficacy-eligible as a product outcome

#### Scenario: ExperienceEngine runtime fails after valid arm start

- **WHEN** provider, route, queue, activation, retrieval, or delivery behavior of the product under test fails but common benchmark infrastructure completes
- **THEN** the attempt SHALL remain a completed product-runtime outcome with stable product failure codes
- **AND** it SHALL NOT be relabeled benchmark infrastructure failure

### Requirement: Every benchmark block includes a forced holdout arm

ExperienceEngine SHALL include the frozen control/holdout arm required by the benchmark design in every efficacy block.

#### Scenario: Block lacks the holdout arm

- **WHEN** a proposed block omits or disables the required control/holdout arm
- **THEN** the block SHALL be ineligible for formal efficacy execution

### Requirement: Instrumentation is arm-neutral

ExperienceEngine SHALL apply the same observer, logging, timeout, resource limit, fixture reset, result collection, and scoring instrumentation to every arm except for the declared treatment difference.

#### Scenario: One arm receives different instrumentation

- **WHEN** an efficacy-relevant instrumentation difference is not declared as the treatment
- **THEN** the block SHALL be invalid for efficacy
- **AND** the difference SHALL be reported in its disposition

### Requirement: Failure and exclusion dispositions remain visible

ExperienceEngine SHALL classify and retain infrastructure failures, product failures, exclusions, aborts, and valid completions with stable reasons.

#### Scenario: Infrastructure failure occurs

- **WHEN** the host, provider, network, dependency, or harness fails independently of the evaluated product behavior
- **THEN** the formal attempt SHALL remain recorded as infrastructure failure
- **AND** it SHALL contribute to reliability/coverage reporting rather than being silently deleted

#### Scenario: Product failure occurs

- **WHEN** the evaluated arm runs under valid infrastructure but fails the declared task/product contract
- **THEN** the attempt SHALL remain a product outcome under the frozen scoring rules

#### Scenario: Block becomes terminal

- **WHEN** all current arm attempts and validity evidence determine block disposition
- **THEN** disposition SHALL be one of `complete`, `incomplete_infrastructure`, `invalid_contamination`, `invalid_protocol_defect`, `aborted_operator`, or `superseded_by_replacement`
- **AND** reason/evidence/replacement lineage SHALL remain immutable

### Requirement: Efficacy uses complete eligible matched blocks

ExperienceEngine SHALL compute primary arm efficacy comparisons only from blocks whose required arms have complete statistically eligible outcomes.

#### Scenario: All required arms are eligible

- **WHEN** every required arm in a sealed block has an eligible formal outcome
- **THEN** the block MAY enter matched efficacy scoring

#### Scenario: A required arm is ineligible or missing

- **WHEN** one or more required arms lack eligible outcomes
- **THEN** the block SHALL be excluded from primary matched efficacy
- **AND** its attempts and exclusion reason SHALL remain in coverage and reliability reporting

### Requirement: Reruns use replacement blocks without erasing history

ExperienceEngine SHALL rerun invalid or incomplete benchmark material only through a new replacement block id with explicit lineage.

#### Scenario: Replacement is approved

- **WHEN** the frozen rerun policy permits replacement
- **THEN** a new sealed block SHALL reference the original block and replacement reason
- **AND** all original manifests, attempts, and dispositions SHALL remain immutable

#### Scenario: Only one arm is rerun under the original block

- **WHEN** a caller attempts a partial-arm rerun using the original block id
- **THEN** the attempt SHALL be rejected and SHALL NOT enter efficacy scoring

### Requirement: Publication thresholds are declared before results

ExperienceEngine SHALL define minimum repetitions, complete-block coverage, infrastructure reliability, quality/effect metrics, uncertainty reporting, and negative-result disclosure before benchmark results are known.

#### Scenario: Thresholds are met

- **WHEN** the sealed benchmark plan's publication thresholds and evidence-integrity checks pass
- **THEN** an efficacy scorecard MAY be published with coverage and limitations

#### Scenario: Thresholds are not met

- **WHEN** repetitions, coverage, reliability, quality, or integrity thresholds fail
- **THEN** ExperienceEngine SHALL report the incomplete or negative result
- **AND** it SHALL NOT publish a stronger efficacy claim

#### Scenario: Sample-size guidance is applied

- **WHEN** a campaign chooses its repetition target
- **THEN** it SHALL use the predeclared campaign analysis plan, pilot variance, and claim strength
- **AND** the product contract SHALL NOT encode one universal sample size as statistical truth

### Requirement: Benchmark evidence does not change runtime authority

ExperienceEngine SHALL treat benchmark records as assurance evidence and not as package, process, configuration, route, queue, activation, or delivery-state writer authority.

#### Scenario: Benchmark result is positive

- **WHEN** a route/profile/arm achieves positive matched-block evidence
- **THEN** that evidence MAY satisfy the separately defined assurance record contract
- **AND** it SHALL NOT bypass current runtime authority, production handshake, or `custom-shadow-only-v1`
