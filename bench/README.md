# Bench

Benchmarking suite for measuring the performance of DCR.js's Process Discovery and Conformance Checking engines. Runs in Docker for isolation and reproducibility.

## Prerequisites

- **Node.js** (v24+) and **npm** (v11+)
- **Python** (v3.9+) with [uv](https://github.com/astral-sh/uv)
- **Docker Engine** and **Docker Compose**

## Structure

```
bench/
├── bin/               # Scripts (download, run, analyze)
├── datasets/
│   ├── logs/          # XES event logs (downloaded, not in git)
│   └── models/        # DCR XML models for conformance checking
├── docker/            # Dockerfile and docker-compose
├── experiments/       # Output from benchmark runs
└── runner/            # Playwright benchmark runner (TypeScript)
```

## 1. Download Datasets

The XES log files are too large for git. Use the download script to fetch them from 4TU.ResearchData and Kaggle:

```bash
uv run --with requests,tqdm bin/download.py
```

Dataset #02 (Sepsis Cases) requires Kaggle credentials:

```bash
uv run --with requests,tqdm bin/download.py --kaggle-username YOUR_USER --kaggle-key YOUR_KEY
```

### Dataset Manifest

| ID  | Name                              | Source | Size (Approx) |
| :-- | :-------------------------------- | :----- | :------------ |
| 01  | Artificial Event Log (0% Noise)   | 4TU    | 192 MB        |
| 02  | Sepsis Cases                      | Kaggle | 5.4 MB        |
| 03  | BPI Challenge 2020                | 4TU    | 15 MB         |
| 04  | BPI Challenge 2013                | 4TU    | 39 MB         |
| 05  | Synthetic Review Example          | 4TU    | 69 MB         |
| 06  | BPI Challenge 2012                | 4TU    | 74 MB         |
| 07  | BPI Challenge 2017                | 4TU    | 109 MB        |
| 08  | Hospital Billing                  | 4TU    | 174 MB        |
| 09  | Large Bank Transaction (No Noise) | 4TU    | 162 MB        |
| 10  | Road Traffic Fine Management      | 4TU    | 185 MB        |
| 11  | BPI Challenge 2019                | 4TU    | 728 MB        |

All datasets are used under their respective Open Access licenses (CC-BY 4.0).

> **Note:** For Conformance Checking, logs and models are paired by index, so `01 Log.xes` matches `01 Model.xml`.

## 2. Run Benchmarks

```bash
uv run bin/run.py <name> [options]
```

### Options

| Flag               | Description                                  | Default |
| :----------------- | :------------------------------------------- | :------ |
| `--type`           | `discovery`, `conformance`, or `all`         | `all`   |
| `--iterations N`   | Number of iterations per log                 | `20`    |
| `--timeout N`      | Timeout per step in ms                       | `90000` |
| `--top-variants N` | Top variants to filter for Process Discovery | `100`   |
| `--no-save-models` | Skip downloading output models (XML/SVG)     | off     |
| `--no-snapshot`    | Skip source code snapshot                    | off     |
| `--no-save-image`  | Skip saving the Docker image as `.tar`       | off     |
| `--no-analyze`     | Skip running analysis after the benchmark    | off     |

### Examples

```bash
uv run bin/run.py my-experiment
# or 5 iterations, discovery only, no archival
uv run bin/run.py my-experiment --type discovery --iterations 5 --no-snapshot --no-save-image --no-analyze
```

### What it does

1. Creates an experiment directory under `experiments/`
2. Optionally snapshots the source code
3. Builds a Docker image for the app
4. Runs the Playwright benchmark inside Docker
5. Optionally runs analysis on the collected traces

## 3. Analyze Results

Analysis runs automatically unless `--no-analyze` is used. To run it manually:

```bash
uv run --with pandas bin/analyze.py <experiment_dir>
```

This produces:

- `runs.csv` - per-iteration, per-step timing and memory metrics
- `summaries.csv` - aggregated statistics (mean, std, min, max, median)
