const TASKS = [
  'task-prp-bold-easy-cozy-halloween-v1',
  'task-prp-bold-easy-cozy-christmas-v1',
];
const STAGES = ['ready_for_test', 'testing', 'ready_for_acceptance', 'accepted'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function move(taskId, status) {
  const res = await fetch(`http://localhost:5000/api/tasks/${taskId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, force: true }),
  });
  const txt = await res.text();
  console.log(`[${taskId}] -> ${status}  HTTP ${res.status}`);
  if (!res.ok) console.log('  ', txt.slice(0, 300));
  return res.ok;
}

for (const taskId of TASKS) {
  console.log(`\n=== ${taskId} ===`);
  for (const stage of STAGES) {
    const ok = await move(taskId, stage);
    if (!ok) {
      console.log(`  STOP at ${stage}`);
      break;
    }
    await sleep(3000);
  }
}
console.log('\nDone.');
