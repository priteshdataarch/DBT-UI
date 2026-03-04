# DevOps Setup Guide — dbt Athena CI/CD

This guide covers everything needed to get the pipeline running end-to-end.

---

## How it works

```
Developer pushes to master
        │
        ▼
GitHub Action (build-and-push.yml)
  → builds Docker image
  → pushes to ECR with :latest tag
        │
        ▼
Kubernetes CronJob (daily 9 AM EST)
  → pulls :latest image from ECR
  → runs: dbt seed && dbt run
```

---

## Prerequisites

- AWS CLI configured with admin access
- `kubectl` connected to the target cluster
- GitHub admin access to the repo (to add secrets)

---

## Step 1 — Create the ECR repository

```bash
aws ecr create-repository \
  --repository-name mersion-dbt-athena \
  --region us-west-2
```

Note the **registry URI** from the output — it looks like:
`<AWS_ACCOUNT_ID>.dkr.ecr.us-west-2.amazonaws.com/mersion-dbt-athena`

---

## Step 2 — Add ECR push permission to existing IAM user

We are reusing the existing IAM user **`mursion_analytics_dbt`** which already has Athena and S3 access.
The only additional permission needed is ECR push access so GitHub Actions can push the Docker image.

```bash
aws iam attach-user-policy \
  --user-name mursion_analytics_dbt \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
```

Then generate a new access key for this user (or reuse existing keys if you already have them):

```bash
aws iam create-access-key --user-name mursion_analytics_dbt
```

Save the `AccessKeyId` and `SecretAccessKey` — you'll use them in Steps 3 and 4.

---

## Step 3 — Add GitHub Actions secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | AccessKeyId from `mursion_analytics_dbt` (Step 2) |
| `AWS_SECRET_ACCESS_KEY` | SecretAccessKey from `mursion_analytics_dbt` (Step 2) |

Once added, every push to `master` will automatically build and push a new Docker image to ECR.

---

## Step 4 — Create Kubernetes secrets

These allow the CronJob pod to authenticate with AWS at runtime.

```bash
# AWS credentials for dbt to connect to Athena (using mursion_analytics_dbt keys)
kubectl create secret generic dbt-aws-credentials \
  --from-literal=aws_access_key_id=<AccessKeyId_from_mursion_analytics_dbt> \
  --from-literal=aws_secret_access_key=<SecretAccessKey_from_mursion_analytics_dbt> \
  --namespace default
```

Create the ECR image pull secret so Kubernetes can pull the image:

```bash
# Get a temporary ECR login token (valid 12 hours)
aws ecr get-login-password --region us-west-2 | \
kubectl create secret docker-registry ecr-pull-secret \
  --docker-server=<AWS_ACCOUNT_ID>.dkr.ecr.us-west-2.amazonaws.com \
  --docker-username=AWS \
  --docker-password-stdin \
  --namespace default
```

> **Note:** ECR tokens expire every 12 hours. For a long-term solution use
> [ECR Credential Helper](https://github.com/awslabs/amazon-ecr-credential-helper)
> or an IRSA (IAM Role for Service Account) if the cluster is EKS.

---

## Step 5 — Update the image URI in the CronJob manifest

Edit `k8s/dbt-cronjob.yml` and replace the placeholder with your real account ID:

```
image: <AWS_ACCOUNT_ID>.dkr.ecr.us-west-2.amazonaws.com/mersion-dbt-athena:latest
```

Example:
```
image: 123456789012.dkr.ecr.us-west-2.amazonaws.com/mersion-dbt-athena:latest
```

---

## Step 6 — Deploy the CronJob

```bash
kubectl apply -f k8s/dbt-cronjob.yml
```

Verify it was created:

```bash
kubectl get cronjob dbt-run
```

---

## Step 7 — Trigger a manual test run

Don't wait for the schedule — fire it immediately to verify everything works:

```bash
kubectl create job dbt-manual-test --from=cronjob/dbt-run
```

Watch the logs:

```bash
# Get the pod name
kubectl get pods -l job-name=dbt-manual-test

# Stream logs
kubectl logs -f <pod-name>
```

Expected output at the end:
```
Completed successfully
Done. PASS=X WARN=0 ERROR=0 SKIP=0 TOTAL=X
```

---

## Schedule reference

The CronJob is set to `"0 14 * * *"` (UTC) which equals:

| Timezone | Time |
|---|---|
| EST (UTC-5) | 9:00 AM |
| CST (UTC-6) | 8:00 AM |
| PST (UTC-8) | 6:00 AM |

To change the time, edit the `schedule` field in `k8s/dbt-cronjob.yml`.

---

## Troubleshooting

| Problem | Command |
|---|---|
| See CronJob history | `kubectl get jobs` |
| See failed pod logs | `kubectl logs <pod-name> --previous` |
| Check CronJob events | `kubectl describe cronjob dbt-run` |
| Manually re-run | `kubectl create job dbt-rerun-$(date +%s) --from=cronjob/dbt-run` |
| ECR pull failing | Re-run Step 4 to refresh the token |
