//! Print a schema 2 card as schema 3, by a pack's migration.
//!
//!     cargo run -p bridge-card --example upgrade -- <pack directory> <card.json>...
//!
//! Each card is bare card_data at schema 2. The output is one JSON document
//! per line, in the order given. The JavaScript library's `toSchema3`
//! (js/schema3.js) is held to this output.

use bridge_card::pack::{Pack, Unset};
use serde_json::Value;
use std::path::Path;

fn main() {
    let mut args = std::env::args().skip(1);
    let dir = args
        .next()
        .expect("usage: upgrade <pack directory> <card.json>...");
    let pack = Pack::load(Path::new(&dir)).expect("the pack loads");
    for file in args {
        let text = std::fs::read_to_string(&file).expect("the card file reads");
        let card: Value = serde_json::from_str(&text).expect("the card is JSON");
        let Value::Object(mut top) = card else {
            panic!("{file}: not an object")
        };
        pack.upgrade_to_3(&mut top, &Unset::Played);
        println!("{}", Value::Object(top));
    }
}
