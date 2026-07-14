#!/bin/bash
#SBATCH --job-name=viking_lpips
#SBATCH --partition=batch
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=4
#SBATCH --mem=24G
#SBATCH --time=24:00:00
#SBATCH --output=logs/train_lpips_%j.out
#SBATCH --error=logs/train_lpips_%j.err

# L1 + LPIPS — 1 GPU only. Explicit mem/cpus required on Wave (no soft limits).
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$HOME/viking-sparse}"
mkdir -p logs outputs runs

echo "host=$(hostname) job=$SLURM_JOB_ID start=$(date -Is)"
echo "partition=${SLURM_JOB_PARTITION:-?} gres=gpu:1 ntasks=1 cpus=4 mem=24G"
echo "SLURM_JOB_GPUS=${SLURM_JOB_GPUS:-unset}"
echo "CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-unset}"
echo "SLURM_CPUS_PER_TASK=${SLURM_CPUS_PER_TASK:-unset} SLURM_MEM_PER_NODE=${SLURM_MEM_PER_NODE:-unset}"

# shellcheck disable=SC1091
source ~/.bashrc 2>/dev/null || true
conda activate viking

python -u train.py \
  --source_dir ./screenshots \
  --target_samples 120000 \
  --sample_frac 0.10 \
  --perceptual_weight 0.1 \
  --perceptual_type lpips \
  --base_channels 64 \
  --epochs 30 \
  --batch_size 32 \
  --out_dir outputs/v2_sparse10_lpips \
  --log_dir runs/v2_sparse10_lpips \
  --save_every 5 \
  --tb_every 5

echo "done=$(date -Is)"
