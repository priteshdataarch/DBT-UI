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
        sf.client_id,
        sf.user_id,
        sf.user_activation_date,
        sf.client_name,
        sf.client_archived,
        sf.client_operated_by,
        sf.user_role,
        sf.client_user_role_id,
        sf.team_id,
        sf.team_name,
        sf.scenario_id,
        sf.scenario_name,
        sf.customized_scenario_name,
        sf.project_id,
        sf.project_name,
        sf.session_id,
        sf.status,
        sf.actual_start_date,
        sf.actual_end_date,
        sf.start_date,
        sf.end_date,
        sf.billable,
        sf.sub_type,
        sf.late_canceled,
        sf.final_session_sub_status,
        sf.session_date,
        sf.session_type,
        coalesce(os.skill, ls.skill_name) as skill,
        coalesce(os.skill_score, ls.skill_score) as skill_score,
        coalesce(os.SessionScore, ls.score) as SessionScore,
        row_number() over(partition by sf.client_id, sf.user_id, sf.scenario_id, coalesce(os.skill, ls.skill_name), sf.session_type order by sf.start_date asc) as attempt,
        --ls.webportal,
        --ls.finished,
        --ls.recordeddate,
       -- ls.generationType,
        --ls.score,
        ls.event_number,
        e.events_sequence,
        ls.skill_id,
        e.skill_id as event_skill_id,
        --ls.skill_name,
        --ls.building_block_type,
        --ls.level,
        --ls.domain_id,
        --ls.mindset_id,
        ls.skill_name as domain,
        bb.title,
        ls.mindset_type,
        ls.old_skill_name,
        row_number() over(partition by sf.client_user_role_id, coalesce(os.skill, bb.title) order by sf.start_date asc) as CompetencyAttempt

        
from 
    {{ ref('f_team_sessions_final')}} sf
left join 
    {{ ref('f_ondemand_skills')}} os
on      sf.session_id = os.sessionid and sf.session_type = 'ondemand'
left join 
    {{ ref('f_live_skills')}} ls
on      sf.session_id = ls.mursionsessionid and sf.session_type = 'live'
left join 
    {{ref('d_events')}} e on sf.scenario_id = e.scenario_id  and ls.event_number = e.events_sequence and e.archived=false
left join
    {{ ref('f_building_blocks') }} bb on e.skill_id = bb.id
    

where sf.user_role='learner'
and sf.scenario_generation_type = 1
ORDER BY sf.session_id ASC