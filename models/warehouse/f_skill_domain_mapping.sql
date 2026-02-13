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
   
    , row_number() over (partition by skill_id, domain_id order by operated_on desc, op desc) as row_number
     --date(start_date) as session_date
from {{ source('application_db', 'raw_skill_domain_mapping') }}
)

select *
from base
where row_number = 1 and (op <> 'D' OR op is null)
and archived = false