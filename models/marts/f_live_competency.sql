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
        ls.event_number,
        ls.CompetencyID,
        ls.skill_name as skill,
        ls.skill_score as skill_score,
        ls.score as SessionScore,
        ROW_NUMBER() OVER (PARTITION BY  sf.scenario_name,sf.client_user_role_id ,ls.skill_name ORDER BY sf.start_date ASC) as CompetencyAttempt,
        --ls.webportal,
        --ls.finished,
        --ls.recordeddate,
       -- ls.generationType,
        --ls.score,
        --ls.event_number,
       -- ls.skill_id,
        --ls.skill_name,
        --ls.building_block_type,
        --ls.level,
        --ls.domain_id,
        --ls.mindset_id,
        ls.mindset_type,
        sc.generation_type as scenario_generation_type,
        sc.licensee_id as scenario_licensee_id,
        e.events_sequence
from 
    {{ ref('f_team_sessions_final')}} sf
left join 
    {{ ref('f_live_skills')}} ls
on      sf.session_id = ls.mursionsessionid and sf.session_type = 'live'
left join 
    {{ ref('d_scenario')}} sc on sf.scenario_id = sc.id
left join 
    {{ ref('d_events')}} e on sc.id = e.scenario_id  and ls.event_number = e.events_sequence and e.archived=false
left join 
    {{ ref('f_building_blocks')}} bb on e.skill_id = bb.id and bb.archived = false
where sf.session_type = 'live' and sf.status = 'COMPLETED' and sc.generation_type = 1

