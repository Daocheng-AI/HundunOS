use criterion::{black_box, criterion_group, criterion_main, Criterion};
use skill_validator::*;

fn bench_validate_skill_name(c: &mut Criterion) {
    let valid_names = vec![
        "my-skill",
        "skill-with-many-parts-and-numbers-123",
        "a",
        "very-long-skill-name-that-has-many-parts-for-testing",
    ];
    
    c.bench_function("validate_skill_name/valid", |b| {
        b.iter(|| {
            for name in &valid_names {
                validate_skill_name(black_box(name)).unwrap();
            }
        })
    });
    
    let invalid_names = vec![
        "My-Skill",
        "-skill",
        "skill-",
        "skill--name",
        "skill_name",
    ];
    
    c.bench_function("validate_skill_name/invalid", |b| {
        b.iter(|| {
            for name in &invalid_names {
                let _ = validate_skill_name(black_box(name));
            }
        })
    });
}

fn bench_parse_skill_md(c: &mut Criterion) {
    let content = r#"---
name: my-skill
version: 1.0.0
description: A test skill with a longer description to test parsing performance
author: Test Author
license: MIT
tags: [test, demo, benchmark, performance, rust]
metadata:
  key1: value1
  key2: value2
---

# Skill Body

This is a longer body content that tests how the parser handles
multi-line content. It includes:

- Item 1
- Item 2
- Item 3

## Section

More content here.

```javascript
console.log("Hello, World!");
```
"#;
    
    c.bench_function("parse_skill_md", |b| {
        b.iter(|| parse_skill_md(black_box(content)).unwrap())
    });
}

fn bench_validate_skill_def(c: &mut Criterion) {
    let def = serde_json::json!({
        "name": "my-skill",
        "version": "1.0.0",
        "description": "A test skill",
        "triggers": ["test", "demo", "benchmark"],
        "tools": ["tool1", "tool2", "tool3"],
        "system_prompt": "You are a helpful assistant that can do many things.",
        "metadata": {
            "key1": "value1",
            "key2": "value2"
        }
    });
    
    c.bench_function("validate_skill_def", |b| {
        b.iter(|| validate_skill_def(black_box(&def)))
    });
}

criterion_group!(
    benches,
    bench_validate_skill_name,
    bench_parse_skill_md,
    bench_validate_skill_def,
);

criterion_main!(benches);
