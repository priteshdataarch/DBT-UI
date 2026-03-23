
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

with 
live_sesisons as (
    select 
        ls.id,
        ls.scenario_id, 
        ls.status, 
        ls.actual_start_date, 
        ls.actual_end_date, 
        ls.start_date,
        ls.end_date,
        ls.billable, 
        ls.sub_type, 
        ls.late_canceled, 
        ls.final_session_sub_status, 
        ls.session_date, 
        cur.user_id as learner_id,
        lsk.score
    from 
        {{ ref('f_live_session')}} ls 
    left join
        {{ ref('m_session_learner')}} sl
    on
        sl.session_id = ls.id
    left join
        {{ ref('m_client_user_role')}} cur
    on
        cur.id = sl.user_role_id and cur.role = 'learner'
    left join 
        (select mursionSessionId, max(score) as score from {{ ref('f_live_skills')}} lsk group by mursionSessionId) lsk
    on
        ls.id = lsk.mursionsessionid

)
, ondemand_sessions as (
    select 
        os.id,
        scenario_id, 
        case when completed  = 1  then 'COMPLETED' when started_at is not null then  'IN_PROGRESS' else  'PENDING' end as status, 
        started_at, 
        ended_At, 
        started_at as start_date,
        ended_At as end_date,
        null,
        null,
        null, 
        null, 
        created_at,
        learner_id,
        ss.score 
    from 
        {{ ref('f_ondemand_session')}} os 
    left join 
        {{ ref('f_session_score')}} ss
    on
        ss.sessionid = os.id
) 
, merged_sessions as (
    select 'live' as session_type, * from live_sesisons
    union all
    select 'ondemand' as session_type, * from ondemand_sessions
)

select 
        ms.id,
        ms.scenario_id, 
        ms.status, 
        ms.actual_start_date, 
        ms.actual_end_date, 
        ms.start_date,
        ms.end_date,
        ms.billable, 
        ms.sub_type, 
        ms.late_canceled, 
        ms.final_session_sub_status, 
        ms.session_date, 
        ms.learner_id, 
        ms.session_type,
        scenario.name as scenario_name, 
        scenario.name_customized as scenario_custom_name,
        scenario.project_id as scenario_project_id,
        scenario.client_id as scenario_client_id,
        project.name as project_name,
        client.name as client_name
from
     merged_sessions ms 
left join 
    {{ ref('d_secenario')}} scenario 
on 
    ms.scenario_id = scenario.id
left join 
    {{ ref('d_project')}} project 
on 
    scenario.project_id = project.id
left join 
    {{ ref('d_client')}} client 
on 
    scenario.client_id = client.id
