# PRD: NeuraGym Demo — Simulation Component

**Author:** Karthick Nambi
**Context:** Technical demo for Product Owner (NeuraGym Platform & Integration) interview at NEURA Robotics
**Interview date:** September 9, 2026
**Scope of this document:** Simulation layer only. Product UI, billing/usage layer, MLflow dashboard, and the natural-language assistant are separate phases and explicitly out of scope here.

---

## 1. Problem / Goal

The interview panel needs to see a concrete, working example of a robot generating real training data and a real training run — the raw material that the rest of the NeuraGym-style platform (UI, billing, monitoring) will be built around. This component must exist and run reliably before any of the product-layer work starts, since everything downstream depends on it producing real run data.

## 2. Non-Goals (explicitly out of scope for this PRD)

- No physical hardware — simulation only
- No frontend/UI of any kind
- No billing, usage metering, or subscription logic
- No MLflow dashboard or run-comparison UI (only the logging *hooks* this component must emit are in scope)
- No natural-language assistant / RAG layer
- No cloud deployment — runs entirely on a local machine

## 3. Users

Just one: Karthick, running this locally to (a) generate training data and (b) produce run logs that a later phase (MLflow, then the frontend) will consume.

## 4. Functional Requirements

### 4.1 Simulated environment
- Use PyBullet (no GUI-only headless dependency should be required, but visual rendering must be available for live demo purposes)
- A single tabletop scene: one simulated robot arm (5–6 DOF), one or more small objects (e.g. cubes), and a target zone/bin
- Task: pick up an object and place it in the target zone ("pick-and-place")

### 4.2 Scripted/programmatic control
- Since there is no physical leader arm for teleoperation, robot motion must be generated programmatically:
  - Option A: hand-scripted waypoint trajectories (reach → grasp → lift → move → release)
  - Option B: simple inverse-kinematics-driven motion toward randomized object positions
- Each run must introduce slight randomization (object start position, object color/size) so successive runs are not identical — this is what makes the resulting dataset meaningful rather than a single hardcoded replay

### 4.3 Dataset generation
- Each completed pick-and-place attempt is recorded as one "episode"
- Each episode must capture, at minimum:
  - Timestamped joint positions/velocities at each simulation step
  - End-effector pose over time
  - Object start position and outcome (success/failure — did the object land in the target zone)
  - A rendered video or image sequence of the episode (for later use in the demo walkthrough)
- Episodes are saved to disk in a clear, versioned directory structure (e.g. `datasets/run_<timestamp>/episode_<n>/`)
- Target: minimum 30–50 episodes per dataset generation run, to have enough data to plausibly train on

### 4.4 Logging hooks (for later MLflow integration)
- The component must expose or emit, per dataset-generation run:
  - A run ID
  - Start/end timestamps
  - Config used (task parameters, randomization seed, number of episodes)
  - Summary stats (success rate, average episode length)
- These do not need to be pushed to MLflow yet — just structured (e.g. a JSON manifest per run) so the next phase can ingest them without rework

### 4.5 A minimal training step (stretch goal, only if time allows)
- Train a simple policy (behavior cloning on the recorded episodes is sufficient — does not need to be state-of-the-art) that attempts the same task
- Save the resulting model checkpoint alongside a basic evaluation (success rate over N test episodes)
- This is explicitly a stretch goal — the dataset-generation pipeline (4.1–4.4) is the hard requirement

## 5. Non-Functional Requirements

- Must run on a standard laptop CPU; GPU optional but not required for the base task
- Must be startable with a single command (e.g. `python generate_dataset.py --episodes 50`)
- Must run reliably enough to be re-run live during the interview without manual debugging
- Code should be simple and readable over clever — this will likely be walked through live or shown as a code snippet, not just its output

## 6. Success Criteria

- [ ] Simulation launches and renders visibly on screen
- [ ] A full pick-and-place episode completes end-to-end without crashing
- [ ] Running the dataset generation script produces 30+ episodes with the structure described in 4.3
- [ ] A run manifest (4.4) is produced and is human-readable
- [ ] (Stretch) A trained policy checkpoint exists and its success rate is reported

## 7. Suggested Tech Stack

- Python 3.10+
- PyBullet for simulation
- NumPy for trajectory/IK math
- (Stretch) PyTorch for the behavior-cloning policy
- Plain JSON/CSV for episode and manifest storage — no database needed at this stage

## 8. Milestones (within the 2-week window)

1. Environment + single hardcoded episode runs and renders
2. Randomization + success/failure detection working
3. Full dataset generation script producing 30–50 episodes with manifest
4. (Stretch) Minimal policy training + evaluation
5. Handoff point: this component's output (episodes + manifests) becomes the input to the MLflow/product-layer phase

## 9. Open Questions / Assumptions

- Assumption: a single-arm, single-object pick-and-place task is sufficiently illustrative for the interview — more complex tasks (multi-object, obstacles) are not needed and would add risk
- Assumption: video/image capture of episodes is acceptable in place of a live camera feed, since this is simulation
- Open: whether the stretch goal (trained policy) is worth attempting depends on how much time steps 1–3 actually take — should not be started until 1–3 are solid
