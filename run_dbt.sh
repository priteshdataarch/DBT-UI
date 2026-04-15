# #!/bin/bash

# # Load shell
# source ~/.zshrc

# # Go to project
# cd /Users/pritesh/work/mursion1/dbt_athena || exit

# # Activate virtual environment
# source vdbt/bin/activate   # or .venv/bin/activate

# # Load .env variables
# set -a
# source .env
# set +a

# # Run dbt
# dbt run >> /Users/pritesh/work/mursion1/dbt_athena/dbt.log 2>&1



#!/bin/bash

echo "===== JOB STARTED at $(date) ====="

# Go to project
cd /Users/pritesh/work/mursion1/dbt_athena || { echo "❌ CD FAILED"; exit 1; }

echo "✅ Changed directory"

# Activate venv
source vdbt/bin/activate || { echo "❌ vdbt FAILED"; exit 1; }

echo "✅ vdbt activated"

# Load .env
set -a
source .env || { echo "❌ ENV FAILED"; exit 1; }
set +a
echo "✅ .env loaded"

# Run dbt
echo "🚀 Running dbt..."
dbt run

# Check exit status
if [ $? -eq 0 ]; then
  echo "✅ DBT RUN SUCCESS"
else
  echo "❌ DBT RUN FAILED"
fi

echo "===== JOB ENDED at $(date) ====="
echo ""