# TensorBoard on Wave (with sbatch training)

Training jobs write event files under `runs/` on the shared filesystem (`$HOME` → `/data0`). TensorBoard does **not** need a GPU and should **not** run inside the training sbatch script.

## While a job is running (or after)

**Terminal A — on the cluster (login node):**

```bash
ssh nypatel@wave.lan.cmu.edu
cd ~/viking-sparse
conda activate viking
tensorboard --logdir runs --host 127.0.0.1 --port 6006
```

**Terminal B — on your laptop:**

```bash
ssh -L 6006:127.0.0.1:6006 nypatel@wave.lan.cmu.edu
```

Open http://localhost:6006

## Expected run names

| Experiment | `--log_dir` |
|------------|-------------|
| Smoke | `runs/smoke` |
| L1 | `runs/v2_sparse10_l1` |
| LPIPS | `runs/v2_sparse10_lpips` |

Pointing `--logdir runs` shows all of them. Dashboards appear after the first TB write (`--tb_every 5` → every 5 epochs; smoke uses every epoch).

## Notes

- Keep TB bound to `127.0.0.1` — Wave is internet-facing; use the SSH tunnel.
- Logs from jobs on `b1` under `$HOME` are still readable on `b0`.
- Ctrl+C TB when finished; don’t leave it running for days.
