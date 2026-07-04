use std::cmp::Ordering;

fn extract_chunks(s: &str) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut is_digit = false;

    for c in s.chars() {
        if c.is_ascii_digit() {
            if !is_digit {
                if !current.is_empty() {
                    chunks.push(Chunk::String(current.clone()));
                    current.clear();
                }
                is_digit = true;
            }
            current.push(c);
        } else {
            if is_digit {
                if !current.is_empty() {
                    let num = current.parse::<u64>().unwrap_or(0);
                    chunks.push(Chunk::Number(num));
                    current.clear();
                }
                is_digit = false;
            }
            current.push(c);
        }
    }

    if !current.is_empty() {
        if is_digit {
            let num = current.parse::<u64>().unwrap_or(0);
            chunks.push(Chunk::Number(num));
        } else {
            chunks.push(Chunk::String(current));
        }
    }

    chunks
}

#[derive(Debug, PartialEq, Eq)]
enum Chunk {
    String(String),
    Number(u64),
}

impl PartialOrd for Chunk {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Chunk {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            (Chunk::String(a), Chunk::String(b)) => a.cmp(b),
            (Chunk::Number(a), Chunk::Number(b)) => a.cmp(b),
            (Chunk::String(_), Chunk::Number(_)) => Ordering::Greater,
            (Chunk::Number(_), Chunk::String(_)) => Ordering::Less,
        }
    }
}

pub fn natural_compare(a: &str, b: &str) -> Ordering {
    let chunks_a = extract_chunks(a);
    let chunks_b = extract_chunks(b);
    chunks_a.cmp(&chunks_b)
}

pub fn natural_sort(strings: &mut [String]) {
    strings.sort_by(|a, b| natural_compare(a, b));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_natural_sort() {
        let mut files = vec![
            "Episode 10.mkv".to_string(),
            "Episode 2.mkv".to_string(),
            "Episode 1.mkv".to_string(),
        ];
        natural_sort(&mut files);
        assert_eq!(
            files,
            vec!["Episode 1.mkv", "Episode 2.mkv", "Episode 10.mkv"]
        );
    }
}
