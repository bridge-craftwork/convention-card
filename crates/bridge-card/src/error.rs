use std::fmt;

/// Error loading or converting a card, or loading a card vocabulary.
///
/// `file` and `line` are set when the problem is in a vocabulary file
/// (`fields.toml`, `bbsa-map.toml`) and the place is known; the message
/// does not repeat them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub message: String,
    pub file: Option<String>,
    /// 1-based.
    pub line: Option<usize>,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match (&self.file, self.line) {
            (Some(file), Some(line)) => write!(f, "{file}:{line}: {}", self.message),
            (Some(file), None) => write!(f, "{file}: {}", self.message),
            _ => f.write_str(&self.message),
        }
    }
}

impl std::error::Error for Error {}

impl Error {
    pub(crate) fn new(msg: impl Into<String>) -> Self {
        Error {
            message: msg.into(),
            file: None,
            line: None,
        }
    }

    /// The same error, placed in `file` (kept if it already names one).
    pub(crate) fn in_file(mut self, file: &str) -> Self {
        self.file.get_or_insert_with(|| file.to_string());
        self
    }

    /// A TOML syntax error, with the line its span starts on.
    pub(crate) fn toml(e: &toml::de::Error, text: &str) -> Self {
        let line = e
            .span()
            .map(|s| text[..s.start.min(text.len())].matches('\n').count() + 1);
        Error {
            message: e.message().to_string(),
            file: None,
            line,
        }
    }
}
