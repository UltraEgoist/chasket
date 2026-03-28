use std::env;
use std::fs;
use std::path::Path;
use std::process;

use chasket_compiler::{compile, CompileOptions, CompileTarget};

fn print_usage() {
    eprintln!("Chasket Compiler (Rust)");
    eprintln!();
    eprintln!("Usage:");
    eprintln!("  chasketc <input.csk> [options]");
    eprintln!();
    eprintln!("Options:");
    eprintln!("  -o, --output <file>   Output file (default: stdout)");
    eprintln!("  --target <js|ts>      Output target (default: js)");
    eprintln!("  --check               Type check only, no output");
    eprintln!("  -h, --help            Show this help");
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage();
        process::exit(1);
    }

    let mut input_file: Option<String> = None;
    let mut output_file: Option<String> = None;
    let mut target = CompileTarget::Js;
    let mut check_only = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-h" | "--help" => {
                print_usage();
                process::exit(0);
            }
            "-o" | "--output" => {
                i += 1;
                if i >= args.len() {
                    eprintln!("Error: --output requires a file path");
                    process::exit(1);
                }
                output_file = Some(args[i].clone());
            }
            "--target" => {
                i += 1;
                if i >= args.len() {
                    eprintln!("Error: --target requires a value (js or ts)");
                    process::exit(1);
                }
                target = match args[i].as_str() {
                    "ts" => CompileTarget::Ts,
                    "js" => CompileTarget::Js,
                    other => {
                        eprintln!("Error: unknown target '{}'", other);
                        process::exit(1);
                    }
                };
            }
            "--check" => {
                check_only = true;
            }
            _ => {
                if args[i].starts_with('-') {
                    eprintln!("Error: unknown option '{}'", args[i]);
                    process::exit(1);
                }
                input_file = Some(args[i].clone());
            }
        }
        i += 1;
    }

    let input_file = match input_file {
        Some(f) => f,
        None => {
            eprintln!("Error: no input file specified");
            process::exit(1);
        }
    };

    let source = match fs::read_to_string(&input_file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading '{}': {}", input_file, e);
            process::exit(1);
        }
    };

    let file_name = Path::new(&input_file)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| input_file.clone());

    let options = CompileOptions { target };
    let result = compile(&source, &file_name, Some(options));

    // Print diagnostics
    for diag in &result.diagnostics {
        let level_str = match diag.level {
            chasket_compiler::ast::DiagLevel::Error => "error",
            chasket_compiler::ast::DiagLevel::Warning => "warning",
            chasket_compiler::ast::DiagLevel::Hint => "hint",
        };
        let span_str = diag
            .span
            .as_ref()
            .map(|s| format!(":{}", s.line))
            .unwrap_or_default();
        eprintln!(
            "{}{}: [{}] {}",
            file_name, span_str, level_str, diag.message
        );
        if let Some(hint) = &diag.hint {
            eprintln!("  hint: {}", hint);
        }
    }

    if !result.success {
        process::exit(1);
    }

    if check_only {
        let errors = result
            .diagnostics
            .iter()
            .filter(|d| d.level == chasket_compiler::ast::DiagLevel::Error)
            .count();
        let warnings = result
            .diagnostics
            .iter()
            .filter(|d| d.level == chasket_compiler::ast::DiagLevel::Warning)
            .count();
        eprintln!(
            "{}: {} errors, {} warnings",
            file_name, errors, warnings
        );
        process::exit(0);
    }

    if let Some(output) = result.output {
        if let Some(out_path) = output_file {
            if let Err(e) = fs::write(&out_path, &output) {
                eprintln!("Error writing '{}': {}", out_path, e);
                process::exit(1);
            }
            eprintln!("Compiled {} -> {}", input_file, out_path);
        } else {
            print!("{}", output);
        }
    }
}
