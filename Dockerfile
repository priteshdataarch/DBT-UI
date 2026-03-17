FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DBT_PROFILES_DIR=/app \
    AWS_SDK_LOAD_CONFIG=1 \
    AWS_CONFIG_FILE=/root/.aws/config \
    AWS_SHARED_CREDENTIALS_FILE=/root/.aws/credentials

WORKDIR /app

# Install dbt-athena adapter and dbt-core.
RUN pip install --no-cache-dir dbt-athena-community

# Copy full dbt project into the image.
COPY . /app

# Prepare default location for mounted AWS auth files.
RUN mkdir -p /root/.aws && chmod 700 /root/.aws

# Install dbt packages only if a packages.yml exists.
RUN if [ -f packages.yml ]; then dbt deps; fi

# No default CMD — pass the dbt command explicitly at runtime.
# Examples:
#   docker run ... dbt run
#   docker run ... dbt run --select my_model
#   docker run ... sh -c "dbt seed && dbt run"
CMD ["dbt", "--help"]
