# Chasket Rust Compiler

> Part of the [Chasket](https://chasket.dev) ecosystem.

A high-performance Rust implementation of the Chasket template-first Web Component compiler.

## Building

### Prerequisites

- Rust 1.70 or later
- Cargo

### Build Instructions

```bash
cd chasket-compiler-rust
cargo build --release
```

The compiled binary will be available at `target/release/chasket-compiler`.

## Usage

### Basic Compilation

```bash
chasket-compiler <input.csk>
```

Compiles a Chasket template file to JavaScript Web Component output.

### Output Options

```bash
chasket-compiler <input.csk> -o <output.js>
```

Specifies the output file path. If not provided, output is written to stdout.

### Batch Processing

```bash
chasket-compiler src/ -o dist/
```

Compiles all `.csk` files in the `src/` directory to the `dist/` directory.

## Development

### Running Tests

```bash
cargo test
```

### Running with Debug Output

```bash
cargo run -- <input.csk> --debug
```

## Integration with Node.js CLI

The Rust compiler can be invoked from the Node.js CLI as a faster alternative backend:

```bash
node chasket-cli/bin/chasket.js compile input.csk --use-rust
```

This allows projects to benefit from Rust's performance while maintaining compatibility with the JavaScript CLI.

## Performance

The Rust implementation provides:

- 10-50x faster compilation for large component libraries
- Lower memory footprint for batch processing
- Native support for parallel compilation of multiple files

## License

MIT
