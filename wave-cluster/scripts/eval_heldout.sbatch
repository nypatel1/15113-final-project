#!/bin/bash
#SBATCH --job-name=testmodel_eval
#SBATCH --partition=batch
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=2
#SBATCH --mem=16G
#SBATCH --time=01:00:00
#SBATCH --output=logs/eval_heldout_%j.out
#SBATCH --error=logs/eval_heldout_%j.err

# Held-out full-image eval. 1 GPU, small CPU/RAM footprint.
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$HOME/testmodel}"
mkdir -p logs outputs

echo "host=$(hostname) job=$SLURM_JOB_ID start=$(date -Is)"
echo "partition=${SLURM_JOB_PARTITION:-?} gres=gpu:1 ntasks=1 cpus=2 mem=16G"
echo "SLURM_JOB_GPUS=${SLURM_JOB_GPUS:-unset}"
echo "CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-unset}"
echo "SLURM_CPUS_PER_TASK=${SLURM_CPUS_PER_TASK:-unset} SLURM_MEM_PER_NODE=${SLURM_MEM_PER_NODE:-unset}"

# shellcheck disable=SC1091
source ~/.bashrc 2>/dev/null || true
conda activate testmodel

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
