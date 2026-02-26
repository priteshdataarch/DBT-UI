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
   
    row_number() over (partition by scenario_id, goal_index order by op desc) as row_number

from {{ source('application_db', 'raw_scenario_goals') }}
)

select *
from base
where row_number = 1 and (op <> 'D' OR op is null)