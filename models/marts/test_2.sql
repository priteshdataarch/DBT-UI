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

with
d_users as (
    select * from {{ ref('d_users') }}
)

select
    *
from d_users
