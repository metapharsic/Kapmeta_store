import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.resolve(__dirname, '../checkpoints/CURRENT_STATE.json');
const LOG_FILE = path.resolve(__dirname, '../checkpoints/CHECKPOINT_LOG.md');

interface CheckpointState {
  activePhase: string;
  version: string;
  lastUpdated: string;
  totalMilestones: number;
  passedMilestones: string[];
  inProgressMilestones: string[];
  pendingMilestones: string[];
  blockers: string[];
  verificationStatus: Record<string, string>;
  milestones: Record<
    string,
    {
      name: string;
      status: 'PASSED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'BLOCKED';
      phase: string | number;
      date?: string;
      signOff?: string;
    }
  >;
}

function loadState(): CheckpointState {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(`State file not found at ${STATE_FILE}`);
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state: CheckpointState) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function displayCheckpointStatus() {
  const state = loadState();
  console.log('\n=======================================================================');
  console.log('       KAPMETA / PETPOOJA POS — CHECKPOINT PROGRESS & GATES            ');
  console.log('=======================================================================\n');
  console.log(`Active Phase : ${state.activePhase}`);
  console.log(`Version      : ${state.version}`);
  console.log(`Last Updated : ${state.lastUpdated}\n`);

  console.log('GATE STATUS:');
  for (const [id, m] of Object.entries(state.milestones)) {
    const icon = m.status === 'PASSED' ? '🟢' : m.status === 'IN_PROGRESS' ? '🟡' : m.status === 'BLOCKED' ? '🔴' : '⚪';
    const statusText = m.status.padEnd(12);
    console.log(`  ${icon} [${id}] ${statusText} | Phase ${String(m.phase).padEnd(4)} | ${m.name}`);
    if (m.signOff) {
      console.log(`      Sign-off: ${m.signOff} ${m.date ? `(${m.date})` : ''}`);
    }
  }

  console.log('\nSYSTEM VERIFICATION:');
  for (const [k, v] of Object.entries(state.verificationStatus)) {
    console.log(`  * ${k.padEnd(16)} : ${v}`);
  }
  console.log('=======================================================================\n');
}

export function updateCheckpoint(gateId: string, status: 'PASSED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'BLOCKED', note?: string) {
  const state = loadState();
  if (!state.milestones[gateId]) {
    console.error(`Error: Gate ID '${gateId}' does not exist.`);
    process.exit(1);
  }

  state.milestones[gateId].status = status;
  if (status === 'PASSED') {
    state.milestones[gateId].date = new Date().toISOString().split('T')[0];
    if (note) state.milestones[gateId].signOff = note;
    if (!state.passedMilestones.includes(gateId)) {
      state.passedMilestones.push(gateId);
    }
    state.inProgressMilestones = state.inProgressMilestones.filter((g) => g !== gateId);
    state.pendingMilestones = state.pendingMilestones.filter((g) => g !== gateId);
  } else if (status === 'IN_PROGRESS') {
    if (!state.inProgressMilestones.includes(gateId)) {
      state.inProgressMilestones.push(gateId);
    }
    state.passedMilestones = state.passedMilestones.filter((g) => g !== gateId);
  }

  saveState(state);
  console.log(`\n[SUCCESS] Checkpoint '${gateId}' successfully updated to '${status}'.`);
  displayCheckpointStatus();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  if (command === 'status') {
    displayCheckpointStatus();
  } else if (command === 'update') {
    const gateId = args[1];
    const status = args[2] as any;
    const note = args.slice(3).join(' ');
    if (!gateId || !status) {
      console.log('Usage: npx ts-node scripts/checkpoint-manager.ts update <GATE_ID> <STATUS> [NOTE]');
      process.exit(1);
    }
    updateCheckpoint(gateId, status, note);
  } else {
    console.log('Unknown command. Available: status, update');
  }
}
