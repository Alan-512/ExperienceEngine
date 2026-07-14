## ADDED Requirements

### Requirement: Imported distribution and evidence schemas are exhaustive

ExperienceEngine SHALL implement the complete embedded closure manifest, external distribution attestation, actual-download validation sequence, Windows fallback resolution record, live activation evidence, and documentation evidence matrix imported from Sections 4.18–4.20, 13–14, and 17.

#### Scenario: Imported field, validation step, evidence class, or channel binding is omitted

- **WHEN** an artifact manifest, attestation, validator, report, support matrix, or test fixture omits an imported member
- **THEN** the channel SHALL fail exhaustive closure/evidence tests
- **AND** the omission SHALL NOT be satisfied by source-repo files or prose assertions

### Requirement: Embedded and external artifact identities remain separate

ExperienceEngine SHALL keep the embedded closure manifest free of self-reference to the final archive digest and SHALL bind the sealed/downloaded artifact through a separate external distribution attestation.

#### Scenario: Embedded closure manifest is created

- **WHEN** package contents are built before final archive sealing
- **THEN** `closure_manifest_digest` SHALL cover normalized closure content excluding its own digest field
- **AND** it SHALL NOT contain installation-specific package generation identity or the final archive digest

#### Scenario: Published artifact is sealed or downloaded

- **WHEN** final artifact integrity and registry identity are known
- **THEN** the external attestation SHALL bind artifact integrity, size, channel, closure digest, profile registry digest, dependency closure digest, compatibility digest, and registry record identity

### Requirement: Published channels are validated independently

ExperienceEngine SHALL treat npm and ClawHub as separate distribution channels whose actual downloaded artifacts require independent closure and activation evidence.

#### Scenario: npm artifact passes

- **WHEN** the exact published npm artifact passes its closure and live activation gates
- **THEN** npm MAY be reported as validated for the proven version and environment
- **AND** that result SHALL NOT imply ClawHub validation

#### Scenario: ClawHub artifact passes

- **WHEN** the exact downloaded ClawHub artifact passes its closure and live activation gates
- **THEN** ClawHub MAY be reported as validated for the proven version and environment
- **AND** that result SHALL NOT imply npm validation

### Requirement: Actual artifact bytes contain the complete declared runtime closure

ExperienceEngine SHALL inspect the downloaded artifact and verify every required package-local runtime role and asset.

#### Scenario: Complete artifact is inspected

- **WHEN** a published artifact is unpacked in an isolated validation environment
- **THEN** its plugin, supervisor, worker, dependency closure, schema, migrations, profile registry, package metadata, compatibility metadata, and integrity SHALL match the declared closure

#### Scenario: Package metadata declares an omitted entrypoint

- **WHEN** an entrypoint or asset is declared but missing, unresolved, or integrity-mismatched in the downloaded artifact
- **THEN** the channel SHALL fail closure validation
- **AND** no support claim SHALL be published for that channel

#### Scenario: Artifact resolves only because source files are present

- **WHEN** an entrypoint or dependency succeeds in the repository but fails in an isolated downloaded-artifact environment
- **THEN** published closure validation SHALL fail

### Requirement: Runtime closure is the sole OpenClaw packaging authority

ExperienceEngine SHALL package the OpenClaw production runtime from the already-generated embedded runtime closure manifest rather than from a second hard-coded asset list or import traversal.

#### Scenario: OpenClaw staging package is created

- **WHEN** the installer builds an OpenClaw candidate tarball
- **THEN** it SHALL copy every manifest-declared entrypoint, runtime file, schema/migration, the manifest itself, and required package/plugin metadata
- **AND** it SHALL validate the staging root before archive creation
- **AND** it SHALL unpack and validate the final archive before returning it

#### Scenario: Runtime imports an undeclared relative module

- **WHEN** import scanning discovers a package-relative runtime dependency absent from the manifest
- **THEN** packaging SHALL fail as an undeclared runtime dependency
- **AND** the scanner SHALL NOT silently add the file or become an alternative packaging authority

#### Scenario: Distribution tooling exists in the npm package

- **WHEN** npm/ClawHub downloaders, validators, or host-validation runners are shipped for operator/release use
- **THEN** they SHALL NOT be required members of the OpenClaw production runtime closure unless a production entrypoint actually depends on them

### Requirement: Installed-artifact and live-host evidence are distinct

ExperienceEngine SHALL record direct package-local runtime execution separately from real OpenClaw host execution.

#### Scenario: Direct Node runtime smoke passes

- **WHEN** an isolated installed package imports its own entrypoints and completes the deterministic S1-S6 queue/fencing fixture without OpenClaw
- **THEN** it MAY record `installed_artifact` evidence and `artifact_runtime_smoke_passed`
- **AND** it SHALL NOT record `live_host` or complete the real-host validation step

#### Scenario: Real OpenClaw validation passes

- **WHEN** the exact artifact is installed by OpenClaw, a real Gateway starts the plugin service, a real agent turn reaches the plugin, authoritative runtime/queue evidence is observed, restart recovery succeeds, and shutdown is terminalized
- **THEN** the validator MAY record `live_host` evidence for the exact host, Node, channel, artifact, and package generation

### Requirement: Artifact runtime validation and support claims are separate

ExperienceEngine SHALL expose an `artifact_runtime_validated` conclusion independently from `support_claim_allowed`.

#### Scenario: Runtime works but quality publication gate is pending

- **WHEN** closure, install, live-host activation, protected queue work, recovery, and shutdown pass but S8 benchmark/quality or required platform gates remain incomplete
- **THEN** `artifact_runtime_validated` MAY be true
- **AND** `support_claim_allowed` SHALL remain false

### Requirement: Canonical OpenClaw activation does not require global EE CLI installation

ExperienceEngine SHALL launch and control the package-local supervisor and worker from the installed package closure without requiring a globally available `ee` binary.

#### Scenario: Clean environment has no global ee command

- **WHEN** the published artifact is installed through the canonical OpenClaw channel in a clean environment without global `ee` on PATH
- **THEN** package-local runtime bootstrap and activation SHALL still use the artifact's own entrypoints

#### Scenario: Global CLI exists

- **WHEN** a global `ee` CLI is also installed
- **THEN** it MAY serve as an operator fallback
- **AND** it SHALL NOT become an undocumented requirement for canonical activation

### Requirement: Canonical activation does not invoke a global OpenClaw command

ExperienceEngine SHALL use the host plugin service lifecycle and package-local supervisor/worker entrypoints for canonical activation.

#### Scenario: Canonical package-local activation starts

- **WHEN** OpenClaw starts the ExperienceEngine plugin service
- **THEN** activation SHALL invoke package-local entrypoints through the registered lifecycle seam
- **AND** it SHALL NOT resolve or execute a global `openclaw` command

### Requirement: Clean-home validation proves authoritative activation

ExperienceEngine SHALL validate published runtime behavior from a clean canonical home using authoritative database and handshake evidence.

#### Scenario: Clean-home activation succeeds

- **WHEN** the artifact resolves one home, bootstraps schema/config authority, starts the package-local supervisor/worker, and completes the current production handshake
- **THEN** the validation MAY record `learning_runtime_active`
- **AND** it SHALL verify the exact active generation, activation revision, supervisor epoch, worker fence, configuration generation, route set, and schema bindings

#### Scenario: Plugin loads but production handshake is incomplete

- **WHEN** OpenClaw loads the plugin or starts a process but the authoritative production handshake is absent or stale
- **THEN** the validation SHALL report interaction-only or activation-incomplete state
- **AND** it SHALL NOT report full learning support

### Requirement: Published queue validation uses protected-write evidence

ExperienceEngine SHALL validate at least one deterministic production queue claim and completion through the canonical `production_write_authorized` path.

#### Scenario: Deterministic work completes

- **WHEN** the clean-home published runtime submits a deterministic valid learning fixture
- **THEN** the evidence SHALL show one fenced claim and one atomic semantic completion under current activation authority

#### Scenario: Authority is invalidated mid-work

- **WHEN** the validation changes or removes one current activation binding before completion
- **THEN** semantic completion SHALL fail
- **AND** only interruption recovery without content-retry consumption MAY occur

### Requirement: Windows OpenClaw resolution is bounded and explicit

ExperienceEngine SHALL resolve and version-probe OpenClaw on Windows for doctor and repair fallback using supported executable forms rather than relying only on extensionless command lookup.

#### Scenario: OpenClaw is exposed through a Windows command shim

- **WHEN** the supported installation provides a `.cmd`, `.exe`, PowerShell shim, or other declared executable form
- **THEN** repair or doctor fallback SHALL resolve that form through the bounded resolver and record the observed executable/version evidence
- **AND** canonical package-local activation SHALL remain independent from that global command

#### Scenario: No supported executable is found

- **WHEN** bounded resolution cannot find a compatible executable
- **THEN** the doctor/repair fallback sub-gate SHALL report `EE_OPENCLAW_EXECUTABLE_UNRESOLVED` with an exact repair reason
- **AND** it SHALL NOT infer fallback command availability from package files alone or relabel package-local activation as unavailable when its independent lifecycle evidence passes

#### Scenario: Windows batch shim is invoked for repair

- **WHEN** the resolved fallback executable is `.cmd` or `.bat`
- **THEN** ExperienceEngine SHALL invoke the resolved absolute shim through the dedicated Windows argument-quoting routine
- **AND** it SHALL NOT use broad `shell: true` with concatenated user text

### Requirement: Upgrade and rollback preserve package authority

ExperienceEngine SHALL validate published install, repair, upgrade, interrupted upgrade, and rollback behavior against the frozen package-generation and activation contracts.

#### Scenario: New generation activates

- **WHEN** a published upgrade passes package verification, migration, preactivation, identity CAS, and production activation
- **THEN** only the new active generation SHALL authorize production writes

#### Scenario: Upgrade blocks or rolls back

- **WHEN** a required boundary fails
- **THEN** the validated control path SHALL preserve or restore the exact allowed generation identities
- **AND** stale generations SHALL remain fenced from protected writes

### Requirement: Public documentation follows published evidence

ExperienceEngine SHALL update public support, install, upgrade, and activation claims only after the corresponding published artifact and live-host validation passes.

#### Scenario: Source-repo validation exists without published evidence

- **WHEN** source or local-pack tests pass but actual published validation is incomplete
- **THEN** documentation MAY describe development validation explicitly
- **AND** it SHALL NOT describe the canonical published channel as supported

#### Scenario: Channel validation passes

- **WHEN** a published channel's required closure and live-host evidence passes
- **THEN** documentation MAY describe only the proven behavior, version, prerequisites, and limitations
