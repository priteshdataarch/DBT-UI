

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
    from {{ source('application_db', 'raw_scenario_bank_event_scoring') }}
)

select 
    id, 
    scenario_id, 
    REGEXP_REPLACE(trim(synopsis),'(<[^>]*>)|(&nbsp;)|(&rsquo;)|(&rdquo;)|(&ldquo;)|(&lsquo;)|(&ndash;)|(&hellip;)', '') as synopsis, 
    min_passing_score,
    event_count,
    passing_score_percentage,  
    REGEXP_REPLACE(trim(opportunity_development),'(<[^>]*>)|(&nbsp;)|(&rsquo;)|(&rdquo;)|(&ldquo;)|(&lsquo;)|(&ndash;)|(&hellip;)', '') as opportunity_development, 
    REGEXP_REPLACE(trim(successful_assessment),'(<[^>]*>)|(&nbsp;)|(&rsquo;)|(&rdquo;)|(&ldquo;)|(&lsquo;)|(&ndash;)|(&hellip;)', '') as successful_assessment,
     origin_id,
     version 
from base
where row_number = 1