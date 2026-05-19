fn main() {
    let git_dir = std::path::Path::new("hermes-agent-source/.git");
    let backup = std::path::Path::new(".git.hermes-agent.backup");
    let needs_restore = git_dir.exists() && !backup.exists();
    if needs_restore {
        std::fs::rename(git_dir, backup).ok();
    }
    tauri_build::build();
    if needs_restore {
        std::fs::rename(backup, git_dir).ok();
    }
}
