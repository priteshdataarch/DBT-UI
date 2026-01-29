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
   
    , row_number() over (partition by scenario_id, team_id order by op asc) as row_number
     --date(start_date) as session_date
from {{ source('application_db', 'raw_scenario_team') }}
)

select *
from base
where row_number = 1 and op <> 'D'