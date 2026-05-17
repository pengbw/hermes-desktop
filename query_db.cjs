const init = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await init();
  const buf = fs.readFileSync('C:\\Users\\bowell\\AppData\\Local\\hermes-desktop\\hermes.db');
  const db = new SQL.Database(buf);

  const projectId = '7e4d7fcd-a12e-468a-ad9c-fad4aa9b5a73';

  console.log("=== file_name 重复扩展名样例 ===");
  let r = db.exec(`SELECT file_name, file_ext, file_path FROM project_file_records WHERE project_id = '${projectId}' AND file_name LIKE '%.md.md' LIMIT 5`);
  if (r.length > 0) {
    r[0].values.forEach(row => console.log(`  fileName=${row[0]} | ext=${row[1]} | path=${row[2]}`));
  }

  console.log("\n=== file_name 正常样例 ===");
  r = db.exec(`SELECT file_name, file_ext, file_path FROM project_file_records WHERE project_id = '${projectId}' AND role_id = 'builtin_software_dev_pm' LIMIT 5`);
  if (r.length > 0) {
    r[0].values.forEach(row => console.log(`  fileName=${row[0]} | ext=${row[1]} | path=${row[2]}`));
  }

  console.log("\n=== node_modules 文件数量 ===");
  r = db.exec(`SELECT COUNT(*) FROM project_file_records WHERE project_id = '${projectId}' AND file_path LIKE '%node_modules%'`);
  if (r.length > 0) {
    console.log(`  ${r[0].values[0][0]} 条`);
  }

  console.log("\n=== 非 node_modules 文件数量 ===");
  r = db.exec(`SELECT COUNT(*) FROM project_file_records WHERE project_id = '${projectId}' AND file_path NOT LIKE '%node_modules%'`);
  if (r.length > 0) {
    console.log(`  ${r[0].values[0][0]} 条`);
  }

  console.log("\n=== QA 角色非 node_modules 文件样例 ===");
  r = db.exec(`SELECT file_name, file_ext, file_path FROM project_file_records WHERE project_id = '${projectId}' AND role_id = 'builtin_software_dev_qa' AND file_path NOT LIKE '%node_modules%' LIMIT 10`);
  if (r.length > 0) {
    r[0].values.forEach(row => console.log(`  fileName=${row[0]} | ext=${row[1]} | path=${String(row[2]).substring(0, 80)}`));
  }

  db.close();
}

main().catch(e => console.error(e));
