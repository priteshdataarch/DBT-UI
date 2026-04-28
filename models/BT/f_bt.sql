{{ config(
    materialized = 'table',
    table_type = 'iceberg',
    format = 'parquet',
    write_compression = 'snappy',
    persist_docs = { "relation": true, "columns": true },
    meta = {
        "owner": "analytics",
        "pii": false
    }
) }}

select
    *
from {{ source('snowfale', 'users') }}
