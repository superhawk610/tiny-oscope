#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::ops::{RangeInclusive, Rem};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::State;

// values are read in as f32 in the closed range [0, 1],
// where 0 represents 0V and 1 represents MAX_VOLT V
const MAX_VOLT: f32 = 5.0;

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(Ticker::new()))
        .manage(Mutex::new(ReadHistory::new(0.5)))
        .invoke_handler(tauri::generate_handler![analog_read, stats])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

struct Ticker(u8);

impl Ticker {
    fn new() -> Self {
        Self(0)
    }

    fn tick(&mut self) {
        self.0 = self.0.wrapping_add(1);
    }

    fn value(&self) -> u8 {
        self.0
    }
}

const HISTORY_SIZE: usize = 1_000;

struct ReadHistory {
    head: usize,
    data: [f32; HISTORY_SIZE],
    average: f32,
    max: f32,
    min: f32,
    peaked_at: Option<Instant>,
    frequency: f32,
    wavelength: Option<Duration>,
}

impl ReadHistory {
    fn new(default_value: f32) -> Self {
        Self {
            head: 0,
            data: [default_value; HISTORY_SIZE],
            average: default_value,
            max: default_value,
            min: default_value,
            peaked_at: None,
            frequency: 0.0,
            wavelength: None,
        }
    }

    fn push(&mut self, n: f32) {
        let old = self.data[self.head];
        self.data[self.head] = n;
        self.average -= old / self.data.len() as f32;
        self.average += n / self.data.len() as f32;
        self.head = (self.head + 1).rem(self.data.len());

        // instead of just tracking ticks between min/max,
        // this should record time elapsed in order to determine Hz;
        // additionally, this needs to track wavelength, or distance
        // between one max to the next max (or min to min)

        self.max = self.max.max(n);
        self.min = self.min.min(n);

        // ignore local max/min within 5% margin of error (chosen arbitrarily)
        let amplitude = (self.max - self.min) / 2.0;
        let err_margin = amplitude * 0.05;

        if self.max - n > err_margin {
            // we're outside of a peak
            if self.peaked_at.is_none() {
                // we've just left the peak
                self.peaked_at = Some(Instant::now());
            }
        } else if let Some(peaked_at) = self.peaked_at.take() {
            // we've just entered a peak, completing a wave
            let wavelength = Instant::now().duration_since(peaked_at);
            self.wavelength = Some(wavelength);
            self.frequency = 1.0 / wavelength.as_secs_f32();
            self.peaked_at = None;
        }
    }

    /// The amplitude, in volts.
    fn amplitude(&self) -> f32 {
        (self.max - self.min) / 2.0 * MAX_VOLT
    }

    /// The frequency, in Hz.
    fn frequency(&self) -> f32 {
        self.frequency
    }

    /// The wavelength, in seconds.
    fn wavelength(&self) -> f32 {
        self.wavelength.map(|d| d.as_secs_f32()).unwrap_or(0.0)
    }
}

#[tauri::command]
fn analog_read(hist: State<Mutex<ReadHistory>>, ticker: State<Mutex<Ticker>>) -> f32 {
    let mut hist = hist.lock().unwrap();
    let mut ticker = ticker.lock().unwrap();
    ticker.tick();
    let t = ((ticker.value() as f32 / 7.0).sin() + 1.0) / 2.0;
    let v = lerp(0.2..=0.8, t);

    hist.push(v);

    v
}

#[derive(serde::Serialize)]
struct Stats {
    amplitude: f32,
    frequency: f32,
    wavelength: f32,
}

#[tauri::command]
fn stats(hist: State<Mutex<ReadHistory>>) -> Stats {
    let hist = hist.lock().unwrap();
    Stats {
        amplitude: hist.amplitude(),
        frequency: hist.frequency(),
        wavelength: hist.wavelength(),
    }
}

#[inline]
fn lerp(range: RangeInclusive<f32>, t: f32) -> f32 {
    range.start() + (range.end() - range.start()) * t
}
