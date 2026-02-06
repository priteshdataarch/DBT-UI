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


Select 
       sc.*,
       scg.op,
       scg.goal_index,
       scg.goal,
       scg.row_number      
from
    {{ ref('f_team_sessions_final')}} sc
left join 
    {{ ref('d_scenario_goals')}} scg
on sc.scenario_id = scg.scenario_id