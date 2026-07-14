#!/bin/bash
#SBATCH --job-name=testmodel_smoke
#SBATCH --partition=dev
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=2
#SBATCH --mem=16G
#SBATCH --time=00:10:00
#SBATCH --output=logs/smoke_%j.out
#SBATCH --error=logs/smoke_%j.err

# Tiny run: confirm CUDA + data. ALWAYS set --mem/--cpus-per-task explicitly
# (omitting --mem on Wave can request ~1.5TB and drain/hang a node).
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$HOME/testmodel}"
mkdir -p logs outputs runs

echo "host=$(hostname) job=$SLURM_JOB_ID start=$(date -Is)"
echo "partition=${SLURM_JOB_PARTITION:-?} gres=gpu:1 ntasks=1 cpus=2 mem=16G"
echo "SLURM_JOB_GPUS=${SLURM_JOB_GPUS:-unset}"
echo "CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-unset}"
echo "SLURM_CPUS_PER_TASK=${SLURM_CPUS_PER_TASK:-unset} SLURM_MEM_PER_NODE=${SLURM_MEM_PER_NODE:-unset}"

# shellcheck disable=SC1091
source ~/.bashrc 2>/dev/null || true
conda activate testmodel

python - <<'PY'
import torch
print("torch", torch.__version__, "cuda", torch.cuda.is_available())
if torch.cuda.is_available():
    print("device", torch.cuda.get_device_name(0), "count", torch.cuda.device_count())
    assert torch.cuda.device_count() == 1, "expected exactly 1 visible GPU"
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
