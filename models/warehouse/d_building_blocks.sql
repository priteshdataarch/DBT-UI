
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
from {{ source('application_db', 'raw_building_blocks') }}
)

select 
    id, 
    REGEXP_REPLACE(trim(title),'(<[^>]*>)|(&nbsp;)|(&rsquo;)|(&rdquo;)|(&ldquo;)|(&lsquo;)|(&ndash;)|(&hellip;)', '') as title, 
    REGEXP_REPLACE(trim(description),'(<[^>]*>)|(&nbsp;)|(&rsquo;)|(&rdquo;)|(&ldquo;)|(&lsquo;)|(&ndash;)|(&hellip;)', '') as description, 
    building_block_type,
    type,
    level,
    licensee_id,
    version 
from base bb
where row_number = 1