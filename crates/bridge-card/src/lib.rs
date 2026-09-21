//! Convention card schema and `.bbsa` import.
//!
//! The card records partnership agreements ("we play Smolen", "1NT is 15-17"),
//! addressed by dotted paths such as `notrump.transfers.jacoby`. It does not
//! define what bids mean; that lives in the `conventions/` rule files.
//!
//! Every field a card can hold is declared once in `data/fields.toml` (the
//! [`Registry`]). A [`Card`] is a set of `path = value` pairs, read from and
//! written to the nested JSON used by the Bridge-Classroom card editor.
//! See docs/DESIGN.md, "The convention card".

pub mod bbsa;
mod card;
mod error;
mod registry;
pub mod schema;

pub use card::{Card, CardMetadata, LoadReport};
pub use error::Error;
pub use registry::{registry, FieldDef, FieldKind, Registry, Value};
