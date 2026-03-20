import os
import sys
import shutil
import argparse
import subprocess
import datetime
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent.resolve()
ROOT_DIR = SCRIPT_DIR.parent.parent.resolve()


def run_command(cmd, cwd=None, env=None, shell=False):
    """Runs a shell command and raises error if it fails."""
    cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd

    try:
        subprocess.run(
            cmd,
            cwd=cwd,
            env=env,
            check=True,
            shell=shell,
        )
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {cmd_str}")
        sys.exit(1)


def main():
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')

    parser = argparse.ArgumentParser(
        description="Run experiments with a name and optional benchmark type.")
    parser.add_argument(
        "name", help="A name for this experiment")
    parser.add_argument(
        "--type",
        choices=["discovery", "conformance", "all"],
        default="all",
        help="Type of benchmark to run (default: all)"
    )
    parser.add_argument(
        "--iterations", type=int, default=20,
        help="Number of iterations per log (default: 20)"
    )
    parser.add_argument(
        "--timeout", type=int, default=90000,
        help="Timeout per step in milliseconds (default: 90000)"
    )
    parser.add_argument(
        "--no-save-models", action="store_true",
        help="Skip saving output models (XML/SVG)"
    )
    parser.add_argument(
        "--no-snapshot", action="store_true",
        help="Skip source code snapshot"
    )
    parser.add_argument(
        "--no-save-image", action="store_true",
        help="Skip saving the Docker image as a .tar archive"
    )
    parser.add_argument(
        "--no-analyze", action="store_true",
        help="Skip running analysis after the benchmark"
    )
    args = parser.parse_args()

    name = args.name
    benchmark_type = args.type
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")

    exp_dir_name = f"{timestamp}_{name}"
    exp_path = SCRIPT_DIR.parent / "experiments" / exp_dir_name
    traces_path = exp_path / "traces"

    print(f"\nRunning experiment: {name}")

    print(f"Creating output directory: {exp_path}")
    traces_path.mkdir(parents=True, exist_ok=True)

    if not args.no_snapshot:
        print("Trying to snapshot source code with git...")
        archive_path = exp_path / "source_code.zip"

        try:
            # This zips exactly what is committed in git, ignoring untracked files
            run_command(
                ["git", "archive", "--format=zip",
                    f"--output={archive_path}", "HEAD"],
                cwd=ROOT_DIR
            )
        except Exception:
            print("Snapshot failed. Trying to snapshot source code manually...")

            # This is fallback and does not include bench or test_models, i.e., less rigorous
            shutil.make_archive(
                str(exp_path / "source_code"),
                'zip',
                ROOT_DIR,
                base_dir=".",
                ignore=shutil.ignore_patterns(
                    '.git', '.vscode', '.github', 'bench', 'test_models', 'node_modules', 'dist')
            )

    # Docker image
    image_name = f"dcr-bench:{name.lower()}"
    dockerfile_path = SCRIPT_DIR.parent / "docker" / "Dockerfile.app"

    print(f"Building Docker image: {image_name}...")
    run_command(
        ["docker", "build", "-t", image_name, "-f", str(dockerfile_path), "."],
        cwd=ROOT_DIR
    )

    if not args.no_save_image:
        print("Saving Docker image...")
        run_command(
            ["docker", "save", "-o",
                str(exp_path / "docker_image.tar"), image_name],
            cwd=ROOT_DIR
        )

    # Run benchmark with Playwright in isolation with Docker
    print("Running experiment in container...")

    compose_file = SCRIPT_DIR.parent / "docker" / "docker-compose.yml"

    env = os.environ.copy()
    env["EXP_OUTPUT_DIR"] = f"/app/bench/experiments/{exp_dir_name}"
    env["NAME"] = name
    env["BENCH_TYPE"] = benchmark_type
    env["BENCH_ITERATIONS"] = str(args.iterations)
    env["BENCH_TIMEOUT"] = str(args.timeout)
    env["BENCH_SAVE_MODELS"] = "false" if args.no_save_models else "true"

    run_command(
        ["docker-compose", "-f",
            str(compose_file), "up", "--abort-on-container-exit", "--build"],
        cwd=SCRIPT_DIR.parent / "docker",
        env=env
    )

    if not args.no_analyze:
        print(f"Running analysis for {exp_path}...")
        analysis_script = SCRIPT_DIR / "analyze.py"
        run_command(["uv", "run", "--with", "pandas",
                    str(analysis_script), str(exp_path)])

    print(f"\nExperiment Complete!")
    print(f"Artifacts: {exp_path}")


if __name__ == "__main__":
    main()
