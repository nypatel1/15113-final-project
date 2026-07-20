#!/bin/bash
# Verify a job's allocated resources right after sbatch.
# Usage: ./wave-cluster/scripts/verify_job.sh <jobid>
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <jobid>" >&2
  exit 1
fi

JOBID="$1"
echo "=== Job $JOBID allocation ==="
scontrol show job "$JOBID" | tr ' ' '\n' | grep -E '^(JobId|JobName|Partition|JobState|NumNodes|NumCPUs|MinCPUsNode|MinMemoryNode|MemPerNode|TRES|ReqTRES|AllocTRES|Gres|TresPerNode|TimeLimit|Reason)=' || \
  scontrol show job "$JOBID"

echo
echo "Sanity checks (fail = bad request):"
scontrol show job "$JOBID" > /tmp/wave_job_"$JOBID".txt

# Flag absurd memory (>= 256G) or missing mem, or >1 GPU
if grep -Eiq 'mem[=:]?[0-9]+(\.[0-9]+)?[tT]|mem[=:]?[2-9][0-9]{2,}G|mem[=:]?[0-9]{4,}M' /tmp/wave_job_"$JOBID".txt; then
  echo "WARNING: memory request looks huge — cancel with: scancel $JOBID"
fi
if grep -Eiq 'gres/gpu[=:][2-9]|gpu[=:][2-9]' /tmp/wave_job_"$JOBID".txt; then
  echo "WARNING: more than 1 GPU requested — cancel with: scancel $JOBID"
fi

echo "Done. If anything looks off: scancel $JOBID"
