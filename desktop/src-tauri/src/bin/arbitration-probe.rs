//! Offline parser replay. No app database or game writes.
#[path = "../arbitration_run.rs"]
mod arbitration_run;
use std::io::Read;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let path = args
        .get(1)
        .ok_or("usage: arbitration-probe INPUT.log OUTPUT.json")?;
    let out = args.get(2).ok_or("missing OUTPUT.json")?;
    let mut parser = arbitration_run::Parser::new("offline-replay", path);
    let mut file = std::fs::File::open(path)?;
    let mut buffer = [0u8; 65536];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        parser.feed(&buffer[..n]);
    }
    parser.eof();
    for run in &parser.finished {
        println!(
            "{} {} {} waves={} drones={} rewardCycles={:?} missionSeconds={:?}",
            run.id,
            run.node_id,
            run.status,
            run.waves_completed,
            run.drone_spawns,
            run.reward_cycles,
            run.duration()
        );
    }
    std::fs::write(out, serde_json::to_vec_pretty(&parser.finished)?)?;
    Ok(())
}
