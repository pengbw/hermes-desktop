const Database = require('better-sqlite3');
const db = new Database('C:/Users/bowell/AppData/Local/hermes-desktop/hermes.db');

const project = db.prepare("SELECT id, name FROM projects WHERE name LIKE '%小红薯%'").get();
if (!project) { console.log("Project not found"); process.exit(0); }
console.log("Project:", JSON.stringify(project));

console.log("\n=== Tasks ===");
const tasks = db.prepare("SELECT id, title, status, assignee FROM project_tasks WHERE project_id = ?").all(project.id);
tasks.forEach(t => console.log(`  [${t.status}] ${t.title} (assignee: ${t.assignee})`));

console.log("\n=== Artifacts ===");
const artifacts = db.prepare("SELECT id, title, status, role_id, artifact_type FROM project_artifacts WHERE project_id = ? ORDER BY role_id, created_at").all(project.id);
artifacts.forEach(a => console.log(`  [${a.status}] ${a.title} (role: ${a.role_id}, type: ${a.artifact_type})`));

console.log("\n=== Members ===");
const members = db.prepare("SELECT pm.role_id, r.name FROM project_members pm LEFT JOIN roles r ON pm.role_id = r.id WHERE pm.project_id = ?").all(project.id);
members.forEach(m => console.log(`  ${m.name} (${m.role_id})`));

console.log("\n=== Workflow Runs ===");
const runs = db.prepare("SELECT id, status, current_step, task_id FROM workflow_runs WHERE project_id = ?").all(project.id);
runs.forEach(r => {
  console.log(`  Run ${r.id}: status=${r.status}, step=${r.current_step}, task=${r.task_id}`);
  const steps = db.prepare("SELECT step_index, role_id, action, status FROM workflow_run_steps WHERE run_id = ? ORDER BY step_index").all(r.id);
  steps.forEach(s => console.log(`    Step ${s.step_index}: role=${s.role_id}, action=${s.action}, status=${s.status}`));
});

db.close();
