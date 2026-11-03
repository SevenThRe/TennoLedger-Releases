use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
static NEXT: OnceLock<Mutex<Instant>> = OnceLock::new();
// One limiter for public pricing and existing account/order HTTP traffic.
pub fn wait() {
    let mut next = NEXT
        .get_or_init(|| Mutex::new(Instant::now()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if *next > now {
        std::thread::sleep(*next - now);
    }
    *next = Instant::now() + Duration::from_millis(510);
}
pub fn backoff(seconds: u64) {
    let mut next = NEXT
        .get_or_init(|| Mutex::new(Instant::now()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *next = (*next).max(Instant::now() + Duration::from_secs(seconds.min(3600)));
}
