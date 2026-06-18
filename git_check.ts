import { execSync } from 'child_process';
try {
  console.log("is_inside_work_tree:", execSync('git rev-parse --is-inside-work-tree').toString().trim());
  console.log("status:", execSync('git status --short').toString().trim());
  console.log("diff stat:", execSync('git diff --stat').toString().trim());
  console.log("HEAD:", execSync('git rev-parse HEAD').toString().trim());
} catch (e) {
  console.error("Git error:", e.message);
}
