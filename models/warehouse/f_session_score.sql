
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
    id, 
    createdat,
    updatedat,
    deletedat,
    sessionid,
    score, 
    --reasoning, 
    goaldescription,
    --prompttext,
    userid, 
    clientid,
    --rawscore,
    row_number() over (partition by id order by createdat, updatedat desc) as row_number
from {{ source('application_db', 'raw_session_score') }}
)

select *
from base
where row_number = 1