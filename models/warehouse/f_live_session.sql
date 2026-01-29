
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

 /* partitioned_by = ['session_date'],*/
with base as (
select 
    *,
   
    row_number() over (partition by id order by modify_revision desc) as row_number, 
     date(start_date) as session_date
from {{ source('application_db', 'raw_session') }}
)

select *
from base
where row_number = 1



