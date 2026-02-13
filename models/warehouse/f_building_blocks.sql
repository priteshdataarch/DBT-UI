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
/* this has issue with cdc capture from the source*/

with base as (
select 
    *
   
    , row_number() over (partition by id order by  version desc ,op desc) as row_number
     
from {{ source('application_db', 'raw_building_blocks') }} 
)

select *
from base
where row_number = 1
and archived = false