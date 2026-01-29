
{{ config(
    materialized = 'view',
   
    format = 'parquet',
    write_compression = 'snappy',
    persist_docs = { "relation": true, "columns": true },
    meta = {
        "owner": "analytics",
        "pii": false
    }
) }}
/* this has issue with cdc capture from the source*/

with base as (
select 
    *
from {{ source('application_db', 'raw_ondemand_session_event') }}
)

select *
from base