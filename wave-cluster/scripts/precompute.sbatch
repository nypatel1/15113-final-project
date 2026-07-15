#!/bin/bash
#SBATCH --job-name=testmodel_precompute
#SBATCH --partition=cpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=02:00:00
#SBATCH --output=logs/precompute_%j.out
#SBATCH --error=logs/precompute_%j.err

# CPU-only: build 64x64 .npz crop shards. No GPU.
# Always set --mem/--cpus-per-task explicitly on Wave.
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$HOME/testmodel}"
mkdir -p logs data/crops_npz

echo "host=$(hostname) job=$SLURM_JOB_ID start=$(date -Is)"
echo "partition=${SLURM_JOB_PARTITION:-?} ntasks=1 cpus=4 mem=16G (no gpu)"

# shellcheck disable=SC1091
source "$PWD/.venv/bin/activate"

python3 -u precompute_crops.py \
  --source_dir ./screenshots \
  --target_samples 120000 \
  --out_dir ./data/crops_npz \
  --overwrite

echo "done=$(date -Is)"
du -sh ./data/crops_npz
ls ./data/crops_npz | head
