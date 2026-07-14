# Wave cluster jobs — testmodel sparse RGB reconstruction

Copy this folder into your model repo (`testmodel/`) on the cluster, or sync the scripts next to `train.py`.

## Critical: always set `--mem` and `--cpus-per-task`

Wave does **not** bill or hard-cap bad requests. Omitting `--mem` can default to something like **~1.5TB RAM + 1 CPU**, which can drain a node or hang forever (this already happened with a hello-world job).

Every script here sets **all** of these explicitly:

| Flag | Value in these scripts | Why |
|------|------------------------|-----|
| `--gres=gpu:1` | exactly 1 | never more |
| `--nodes=1` | 1 | single node |
| `--ntasks=1` | 1 | one process |
| `--cpus-per-task` | 2–4 | small dataloader footprint |
| `--mem` | 16G / 24G | host RAM; never omit |
| `--partition` | `dev` or `batch` | GPU jobs; use `cpu` only for CPU-only work |

After every submit, verify immediately:

```bash
JOB=$(sbatch --parsable wave-cluster/scripts/smoke.sbatch)
bash wave-cluster/scripts/verify_job.sh "$JOB"
# If mem/GPUs look wrong: scancel $JOB
```

Or by hand:

```bash
scontrol show job <jobid> | tr ' ' '\n' | grep -E 'Partition|NumCPUs|MinMemory|TRES|Gres|TimeLimit'
```

## What to sync from your laptop

```bash
rsync -avP --exclude outputs --exclude runs --exclude '__pycache__' --exclude '.git' \
  /Users/nikeshpatel/testmodel/ \
  nypatel@wave.lan.cmu.edu:~/testmodel/

rsync -avP wave-cluster/ nypatel@wave.lan.cmu.edu:~/testmodel/wave-cluster/
```

On the cluster:

```
~/testmodel/
  train.py dataset.py model.py losses.py metrics.py eval.py ...
  requirements.txt
  screenshots/              # 942 PNGs — training only
  screenshots_heldout/      # 105 PNGs — final test only
  wave-cluster/
```

**Never** point `--source_dir` at `screenshots_heldout` for training.

## One-time setup on Wave

```bash
ssh nypatel@wave.lan.cmu.edu
cd ~/testmodel

# No system conda on Wave — install uv in $HOME, then a project venv
curl -LsSf https://astral.sh/uv/install.sh | sh
source "$HOME/.local/bin/env"
uv venv --python 3.11 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

Create `.venv` **on the cluster** only. Do not rsync a Mac `.venv`.

## Run order (minimal resources)

| Step | Partition | GPUs | CPUs | RAM | Script |
|------|-----------|------|------|-----|--------|
| Smoke (~10 min) | `dev` | 1 | 2 | 16G | `scripts/smoke.sbatch` |
| L1 baseline | `batch` | 1 | 4 | 24G | `scripts/train_l1.sbatch` |
| L1 + LPIPS | `batch` | 1 | 4 | 24G | `scripts/train_lpips.sbatch` |
| Held-out eval | `batch` | 1 | 2 | 16G | `scripts/eval_heldout.sbatch` |

```bash
cd ~/testmodel
mkdir -p logs outputs runs

JOB=$(sbatch --parsable wave-cluster/scripts/smoke.sbatch)
bash wave-cluster/scripts/verify_job.sh "$JOB"
# wait for smoke to finish and look good, then:

JOB=$(sbatch --parsable wave-cluster/scripts/train_l1.sbatch)
bash wave-cluster/scripts/verify_job.sh "$JOB"

JOB=$(sbatch --parsable wave-cluster/scripts/train_lpips.sbatch)
bash wave-cluster/scripts/verify_job.sh "$JOB"
```

Do **not** use `dev` for the full 30-epoch runs. Do **not** use the `cpu` partition for these GPU jobs.

Monitor:

```bash
squeue -u $USER
tail -f logs/smoke_*.out
tail -f logs/train_l1_*.out
```

Cancel immediately if something is wrong:

```bash
scancel <jobid>
```

## TensorBoard

On the login node (no GPU, not inside the training job):

```bash
cd ~/testmodel
source .venv/bin/activate
tensorboard --logdir runs --host 127.0.0.1 --port 6006
```

Laptop:

```bash
ssh -L 6006:127.0.0.1:6006 nypatel@wave.lan.cmu.edu
```

→ http://localhost:6006

## Resource rules of thumb

- **Always** set `--mem` and `--cpus-per-task` — Wave will not stop a bad request
- **Exactly** `--gres=gpu:1` for these jobs
- Partitions: `dev` = short/interactive; `batch` = unattended GPU training; `cpu` = CPU-only
- Weekdays 9–5: `batch` may show `QOSGrpGRES` (14/16 GPUs for batch) — wait, don’t inflate the request
- Respect `$CUDA_VISIBLE_DEVICES`; never hardcode GPU IDs
- If the job OOMs on host RAM, bump `--mem` to `32G` — not to hundreds of GB

## Eval must match training width

Train + eval use `--base_channels 64`. Do not mix with old width-32 checkpoints.
