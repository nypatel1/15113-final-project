#!/bin/bash
#SBATCH --job-name=testmodel_lpips_r01_10
#SBATCH --partition=batch
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=4
#SBATCH --mem=24G
#SBATCH --time=24:00:00
#SBATCH --output=logs/train_lpips_rand_%j.out
#SBATCH --error=logs/train_lpips_rand_%j.err

# L1+LPIPS with sparsity randomized per sample in [1%, 10%].
# Do NOT pass --sample_frac (that overrides min/max).
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$HOME/testmodel}"
mkdir -p logs outputs runs

echo "host=$(hostname) job=$SLURM_JOB_ID start=$(date -Is)"
echo "partition=${SLURM_JOB_PARTITION:-?} gres=gpu:1 cpus=4 mem=24G"
echo "SLURM_JOB_GPUS=${SLURM_JOB_GPUS:-unset}"
echo "CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-unset}"

# shellcheck disable=SC1091
source "$PWD/.venv/bin/activate"

test -d ./data/crops_npz || {
  echo "ERROR: ./data/crops_npz missing — run precompute.sbatch first" >&2
  exit 1
}

python3 -u train.py \
  --precomputed_dir ./data/crops_npz \
  --sample_frac_min 0.01 \
  --sample_frac_max 0.10 \
  --perceptual_weight 0.1 \
  --perceptual_type lpips \
  --base_channels 64 \
  --epochs 30 \
  --batch_size 32 \
  --num_workers 4 \
  --out_dir outputs/v2_sparse01_10_lpips \
  --log_dir runs/v2_sparse01_10_lpips \
  --save_every 5 \
  --tb_every 5

echo "done=$(date -Is)"
