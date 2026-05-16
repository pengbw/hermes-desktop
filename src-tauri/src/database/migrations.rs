use sqlx::SqlitePool;

pub async fn run_migrations(_pool: &SqlitePool) -> Result<(), sqlx::Error> {
    Ok(())
}
