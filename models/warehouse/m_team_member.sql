
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
   
    row_number() over (partition by team_id, user_role_id order by op asc) as row_number

from {{ source('application_db', 'raw_team_member') }}
)

select *
from base
where row_number = 1 and op <> 'D'

