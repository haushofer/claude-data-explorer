# Data dictionary — example.csv

One row per participant (180 rows). A synthetic example dataset: a simple randomized study with a treatment and control group.

| Column | Description |
|---|---|
| `id` | Unique participant identifier |
| `group` | Randomized assignment: treatment or control |
| `age` | Participant age in years |
| `sex` | Self-reported sex (F/M) |
| `region` | Region of residence (North/South/East/West) |
| `baseline_score` | Outcome score measured at baseline (0-100) |
| `followup_score` | Outcome score measured at follow-up (0-100) |
| `outcome` | Change in score (follow-up minus baseline) |
| `satisfaction` | Self-reported satisfaction, 1 (low) to 5 (high) |
