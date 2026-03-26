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
ts.client_name,
ts.user_id,ps.userid,
ts.client_user_role_id, 
ts.project_id,
ts.scenario_id,
ts.project_name,
ts.scenario_name,
ts.session_id, ps.mursionsessionid,ts.session_type,
ts.status,
ts.start_date,
ROW_NUMBER() OVER (PARTITION BY ts.scenario_id,ts.client_user_role_id ORDER BY ts.start_date ASC) as Attempt,
ps.Q4_answerText as confidenceAnswer ,
ps.Q4_selectedAnswerNumber as confidenceScore
from {{ ref('f_team_sessions_final') }} ts
inner join {{ ref('d_post_simulation') }} ps on ts.session_id=ps.mursionsessionid and ts.user_id=ps.userid
left join {{ ref('d_scenario') }} sc on ts.scenario_id=sc.id
where ts.status='COMPLETED' and sc.licensee_id='mursion' 
order by 1,2,3,4,6,ts.start_date asc
