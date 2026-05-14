## 1. Repair Flow

- [x] 1.1 Add a host-aware repair command for OpenClaw
- [x] 1.2 Reuse the existing OpenClaw link/enable/config-set planner for repair

## 2. Doctor Guidance

- [x] 2.1 Add a helper that decides when repair is recommended
- [x] 2.2 Update `ee doctor` to suggest `ee repair openclaw` only when live host drift or errors are present

## 3. Validation

- [x] 3.1 Add unit coverage for repair recommendation and repair execution
- [x] 3.2 Keep the existing install/doctor/plugin suite green
- [x] 3.3 Add regression coverage for stale OpenClaw install directories and missing npm install directories
