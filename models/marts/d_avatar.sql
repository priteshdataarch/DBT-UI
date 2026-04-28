{{ config(
    materialized = 'table',
    table_type = 'iceberg',
    format = 'parquet',
    write_compression = 'snappy',
    persist_docs = { "relation": true, "columns": true },
    meta = {
        "owner": "analytics",
        "pii": true
    }
) }}

select
    *
from {{ source('application_db', 'raw_avatar') }}
