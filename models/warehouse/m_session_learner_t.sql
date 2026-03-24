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

with base as (

    select distinct
        op,
        session_id,
        user_role_id,
        score
    from {{ ref('m_session_learner') }}

),

flagged as (

    select
        session_id,
        user_role_id,
        max(case when op = 'D' then '1' else '0' end) as has_d_value
    from base
    group by session_id, user_role_id

)
select 
    session_id,
    user_role_id,
    has_d_value
from 
    flagged
where 
    has_d_value = '0'

