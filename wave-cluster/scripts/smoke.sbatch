#!/bin/bash
#SBATCH --job-name=viking_smoke
#SBATCH --partition=dev
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32G
#SBATCH --time=00:10:00
#SBATCH --output=logs/smoke_%j.out
#SBATCH --error=logs/smoke_%j.err

# Tiny run: confirm CUDA, data path, and one training step before spending a GPU-day.
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$HOME/viking-sparse}"
mkdir -p logs outputs runs

echo "host=$(hostname) job=$SLURM_JOB_ID start=$(date -Is)"
echo "SLURM_JOB_GPUS=${SLURM_JOB_GPUS:-unset}"
echo "CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-unset}"

# shellcheck disable=SC1091
source ~/.bashrc 2>/dev/null || true
conda activate viking

python - <<'PY'
import torch
print("torch", torch.__version__, "cuda", torch.cuda.is_available())
if torch.cuda.is_available():
    print("device", torch.cuda.get_device_name(0), "count", torch.cuda.device_count())
PY

python -u train.py \
  --source_dir ./screenshots \
  --target_samples 256 \
  --sample_frac 0.10 \
  --perceptual_weight 0 \
  --base_channels 64 \
  --epochs 1 \
  --batch_size 32 \
  --out_dir outputs/smoke \
  --log_dir runs/smoke \
  --save_every 1 \
  --tb_every 1

echo "done=$(date -Is)"
