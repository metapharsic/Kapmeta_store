# Orchestrator Agent Specification

**Role:** Master System Coordinator & Lifecycle Conductor  
**Domain:** Cross-Service Orchestration, Startup/Shutdown, Gate Transitions  

---

## 1. Responsibilities

- Supervise startup and shutdown of backend (`http://localhost:4001`) and frontend (`http://localhost:4444`).
- Validate port availability before launching services.
- Update and audit milestone progress in `checkpoints/CURRENT_STATE.json`.
- Distribute operational tasks to domain agents via `agents/task-board.json`.

---

## 2. Key Tools & Scripts

- `scripts/startup.ps1` / `Start_PetPooja.bat`
- `scripts/shutdown.ps1` / `Stop_PetPooja.bat`
- `scripts/status.ts` / `Status_PetPooja.bat`
- `scripts/checkpoint-manager.ts`
