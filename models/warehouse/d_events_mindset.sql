
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
        row_number() over (partition by id order by version desc) as row_number
    from {{ source('application_db', 'raw_events_mindset') }}
)

select 
    id, 
    mindset_id, 
    REGEXP_REPLACE(TRIM(events_mindset_definition), '(<[^>]*>)|(&nbsp;)|(&rsquo;)|(&rdquo;)|(&ldquo;)|(&lsquo;)|(&ndash;)|(&hellip;)', '') as events_mindset_definition, 
    version, archived, events_id 
from base 
where row_number = 1

