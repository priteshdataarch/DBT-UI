
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
   ,
    row_number() over (partition by id order by ended_At desc, started_at desc, created_At desc) as row_number
     --date(start_date) as session_date
from {{ source('application_db', 'raw_ondemand_session') }}
)

select *
from base
where row_number = 1