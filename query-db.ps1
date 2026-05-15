Add-Type -Path "D:\workspace\hermes-desktop\node_modules\better-sqlite3\build\Release\better_sqlite3.node" -ErrorAction Stop
$db = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\bowell\AppData\Local\hermes-desktop\hermes.db;Version=3;")
$db.Open()

$cmd = $db.CreateCommand()
$cmd.CommandText = "SELECT id, name, status, created_at FROM projects ORDER BY created_at DESC LIMIT 10"
$reader = $cmd.ExecuteReader()
Write-Host "=== Recent Projects ==="
while ($reader.Read()) {
    Write-Host "ID: $($reader[0]) | Name: $($reader[1]) | Status: $($reader[2]) | Created: $([DateTimeOffset]::FromUnixTimeMilliseconds($reader[3]).DateTime)"
}
$reader.Close()

$cmd2 = $db.CreateCommand()
$cmd2.CommandText = "SELECT pt.id, pt.project_id, pt.title, pt.status, pt.created_at, p.name as project_name FROM project_tasks pt LEFT JOIN projects p ON pt.project_id = p.id ORDER BY pt.created_at DESC LIMIT 20"
$reader2 = $cmd2.ExecuteReader()
Write-Host "`n=== Recent Tasks ==="
while ($reader2.Read()) {
    Write-Host "Task: $($reader2[2]) | Project: $($reader2[5]) | Status: $($reader2[3])"
}
$reader2.Close()

$db.Close()
Write-Host "`nDone"