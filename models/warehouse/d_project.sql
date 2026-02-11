
{{ config(
    materialized = 'table',
    
    format = 'parquet',
    write_compression = 'snappy',
    persist_docs = { "relation": true, "columns": true },
    meta = {
        "owner": "analytics",
        "pii": false
    }
) }}


with base as (
select 
    *,
   
    row_number() over (partition by id order by modify_revision desc) as row_number
from {{ source('application_db', 'raw_project') }}
)

select *
from base
where row_number = 1 and archived = false