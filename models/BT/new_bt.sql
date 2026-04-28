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
f_bt as (
    select * from {{ ref('f_bt') }}
)

select
    *
from f_bt
