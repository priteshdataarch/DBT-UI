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

select 
       *
from 
    {{ ref('f_team_sessions_final')}} sf
left join 
    {{ ref('f_ondemand_skills')}} os
on      sf.session_id = os.sessionid and sf.session_type = 'ondemand'
left join 
    {{ ref('f_live_skills')}} ls
on      sf.session_id = ls.mursionsessionid and sf.session_type = 'live'
