#[path = "../price_engine.rs"]
mod price_engine;
#[path = "../wm_rate.rs"]
mod wm_rate;
use std::{
    io::Write,
    path::PathBuf,
    time::{Duration, Instant},
};
fn main() -> Result<(), String> {
    let start = Instant::now();
    let args: Vec<String> = std::env::args().collect();
    let out = PathBuf::from(
        args.get(1)
            .ok_or("usage: price-probe OUTPUT_DIR [seconds] [--offline]")?,
    );
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let seconds = args
        .get(2)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1800);
    let service = price_engine::PriceEngine::open(&out.join("prices.sqlite3"))?;
    let offline = args.iter().any(|s| s == "--offline");
    if !offline {
        service.start();
    }
    let mut history = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(out.join("coverage.jsonl"))
        .map_err(|e| e.to_string())?;
    let mut last = Instant::now() - Duration::from_secs(10);
    loop {
        let snapshot = service.snapshot()?;
        if last.elapsed() >= Duration::from_secs(10) {
            let observation = serde_json::json!({"at":snapshot["fetchedAt"],"elapsedMs":start.elapsed().as_millis(),"coverage":snapshot["coverage"]});
            println!("{observation}");
            writeln!(history, "{observation}").map_err(|e| e.to_string())?;
            std::fs::write(
                out.join("snapshot.json"),
                serde_json::to_vec(&snapshot).unwrap(),
            )
            .map_err(|e| e.to_string())?;
            last = Instant::now();
        }
        if start.elapsed() >= Duration::from_secs(seconds) {
            service.stop();
            std::fs::write(
                out.join("snapshot.json"),
                serde_json::to_vec(&snapshot).unwrap(),
            )
            .map_err(|e| e.to_string())?;
            println!("Final {}", snapshot["coverage"]);
            return if snapshot["coverage"]["complete"] == true {
                Ok(())
            } else {
                Err("Fresh coverage incomplete; inspect per-item errors".into())
            };
        }
        std::thread::sleep(Duration::from_secs(1));
    }
}
