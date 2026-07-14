# Wave cluster jobs — Viking sparse RGB reconstruction

Copy this folder into your model repo (`testmodel/`) on the cluster, or sync the scripts next to `train.py`.

## What to sync from your laptop

From your machine (`/Users/nikeshpatel/testmodel`):

```bash
# code + data only (~5.1 GB images). Skip local outputs/ and runs/.
rsync -avP --exclude outputs --exclude runs --exclude '__pycache__' --exclude '.git' \
  /Users/nikeshpatel/testmodel/ \
  nypatel@wave.lan.cmu.edu:~/viking-sparse/
```

On the cluster you want:

```
~/viking-sparse/
  train.py dataset.py model.py losses.py metrics.py eval.py ...
  requirements.txt
  screenshots/              # 942 PNGs — training only
  screenshots_heldout/      # 105 PNGs — final test only
  wave-cluster/             # these scripts (optional location)
```

**Never** point `--source_dir` at `screenshots_heldout` for training.

## One-time setup on Wave

```bash
ssh nypatel@wave.lan.cmu.edu
cd ~/viking-sparse

# Conda or venv — pick one. Example with conda:
conda create -n viking python=3.11 -y
conda activate viking
pip install -r requirements.txt

# Confirm CUDA sees a GPU only inside a job (login node may show all GPUs —
# still do not train on the login node without sbatch/slreserve).
```

Data lives under `$HOME` → `/data0`. ~5 GB is fine there for this project. No need to split across `/data1` unless you grow the dataset a lot.

## Run order (conscientious)

| Step | Partition | GPUs | Script |
|------|-----------|------|--------|
| Smoke test (~2 min) | `dev` | 1 | `scripts/smoke.sbatch` |
| L1 baseline (~30 epochs) | `batch` | 1 | `scripts/train_l1.sbatch` |
| L1 + LPIPS | `batch` | 1 | `scripts/train_lpips.sbatch` |
| Held-out eval | `batch` or `dev` | 1 | `scripts/eval_heldout.sbatch` |

One GPU each. Do not use `dev` for the full 30-epoch runs.

```bash
cd ~/viking-sparse
mkdir -p logs outputs runs

sbatch wave-cluster/scripts/smoke.sbatch          # verify first
sbatch wave-cluster/scripts/train_l1.sbatch       # after smoke looks good
sbatch wave-cluster/scripts/train_lpips.sbatch    # can queue behind L1
sbatch wave-cluster/scripts/eval_heldout.sbatch   # after checkpoints exist
```

Monitor:

```bash
squeue -u $USER
tail -f logs/train_l1_*.out
```

## TensorBoard

Training writes under `runs/`. On the **login node** (separate from the training job):

```bash
cd ~/viking-sparse
conda activate viking
tensorboard --logdir runs --host 127.0.0.1 --port 6006
```

On your laptop:

```bash
ssh -L 6006:127.0.0.1:6006 nypatel@wave.lan.cmu.edu
```

Open http://localhost:6006 — you should see `v2_sparse10_l1` / `v2_sparse10_lpips` once events exist.

## Resource notes (RTX PRO 6000)

- Default scripts: `--gres=gpu:1`, `--cpus-per-task=8`, `--mem=64G`, `--batch_size 32`
- If VRAM allows and GPU util is low, try `--batch_size 64` in the sbatch script
- Weekdays 9am–5pm: `batch` may queue with reason `QOSGrpGRES` (14/16 GPUs for batch). Overnight/weekend often starts faster
- Respect `$CUDA_VISIBLE_DEVICES` — scripts never hardcode GPU IDs
- Cancel leftovers: `scancel <jobid>`

## Eval must match training width

Both train scripts use `--base_channels 64`. Eval uses the same. Do not load a width-64 checkpoint with `--base_channels 32`.
