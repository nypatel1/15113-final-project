#!/bin/bash
#SBATCH --job-name=viking_eval
#SBATCH --partition=batch
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32G
#SBATCH --time=02:00:00
#SBATCH --output=logs/eval_heldout_%j.out
#SBATCH --error=logs/eval_heldout_%j.err

# Held-out full-image eval — advisor step 3. Never used for training.
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$HOME/viking-sparse}"
mkdir -p logs outputs

echo "host=$(hostname) job=$SLURM_JOB_ID start=$(date -Is)"
echo "SLURM_JOB_GPUS=${SLURM_JOB_GPUS:-unset}"
echo "CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-unset}"

# shellcheck disable=SC1091
source ~/.bashrc 2>/dev/null || true
conda activate viking

python -u eval.py \
  --model outputs/v2_sparse10_l1/model_final.pt \
  --source_dir ./screenshots_heldout \
  --mode full \
  --sample_frac 0.10 \
  --base_channels 64 \
  --out_path outputs/heldout_l1.png

python -u eval.py \
  --model outputs/v2_sparse10_lpips/model_final.pt \
  --source_dir ./screenshots_heldout \
  --mode full \
  --sample_frac 0.10 \
  --base_channels 64 \
  --out_path outputs/heldout_lpips.png

echo "done=$(date -Is)"
