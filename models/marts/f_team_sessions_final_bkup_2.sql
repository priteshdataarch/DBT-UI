

{{ config(
    materialized = 'table',
    
    format = 'parquet',
    write_compression = 'snappy',
    persist_docs = { "relation": true, "columns": true },
    meta = {
        "owner": "analytics",
        "pii": false
    },

    enabled = false
) }}

with team as (
select


    client.id as client_id,
    users.id as user_id, 
    users.activation_date as user_activation_date,   
    --client.client_location,
    client.name as client_name,
    --client.licensee_id as client_licensee_id, 
    --client.timezone_id as client_timezone_id,
    client.archived as client_archived, 
    client.operated_by as client_operated_by,
    --client.industry_id as client_industry_id,
    client_user_role.role as user_role, 
    --client_user_role.id as user_role_id,
    --cur.id as client_user_role_id,
    team_member.team_id,
    --tm.user_role_id,
    --t.id as team_id,
    team.name as team_name,
    scenario.id as scenario_id,
    --coalesce(scenario.name_customized,scenario.name) as scenario_name,
   -- project.id as project_id,
   -- project.name as project_name,
    
    
    --st.scenario_id,
    scenario_team.team_id as scenario_team_id
    
    --s.name as scenario_name
from 
    {{ ref('d_users') }} users
left join 
    {{ ref('m_user_client') }} client_user on users.id = client_user.id
left join 
    {{ ref('d_client') }} client on client.id = client_user.client_id
left join 
    {{ ref('m_client_user_role') }} client_user_role on client_user_role.user_id = users.id
left join
    {{ ref('m_team_member') }} team_member on client_user_role.id = team_member.user_role_id
left join
    {{ ref('d_team') }} team on team.id = team_member.team_id
left join
    {{ ref('m_scenario_team') }} scenario_team on team.id = scenario_team.team_id
--left join
 --   {{ ref('d_secenario') }} scenario on scenario_team.scenario_id = scenario.id
--left join
 --   {{ ref('d_project') }} project on scenario.project_id = project.id
group by 1,2,3,4,5,6,7,8,9,10,11
) 
, team_scenario as (
    select 
        distinct 
            scenario_id,
            user_id 
        from 
            team 
), 
old_team_sessions as (
    select 
        
    from 
    {{ ref('f_sessions_final')}} sessions 
    left join 
        team_scenario on sessions.scenario_id = team_scenario.scenario_id and sessions.learner_id = team_scenario.user_id
    where team_scenario.scenario_id is null
)
select 
    team.client_id,
    team.user_id,
    team.user_activation_date,
  --  team.client_location,
    team.client_name,
  --  team.client_licensee_id, 
  --  team.client_timezone_id,
    team.client_archived, 
    team.client_operated_by,
  --  team.client_industry_id,
    team.user_role, 
    --team.user_role_id, 
    team.team_id, 
    team.team_name,
    team.scenario_id,
    team.scenario_name,
    team.project_id,
    team.project_name,
    team.scenario_team_id,
    sessions.id as session_id,
    --sessions.scenario_id, 
    sessions.status, 
    sessions.actual_start_date, 
    sessions.actual_end_date, 
    sessions.start_date,
    sessions.end_date,
    sessions.billable, 
    sessions.sub_type, 
    sessions.late_canceled, 
    sessions.final_session_sub_status, 
    sessions.session_date, 
   -- sessions.learner_id, 
    sessions.session_type,
    --coalesce(sessions.scenario_custom_name,sessions.scenario_name) as scenario_name, 
    --sessions.scenario_custom_name,
    sessions.scenario_project_id,
    sessions.scenario_client_id
    --sessions.project_name
    --sessions.client_name
    --sessions.learner_id 
    
from 
    team
-- left join 
--     {{ ref('m_scenario_team')}} scenario_team 
-- on 
--     scenario_team.team_id = team.team_id
left join
    {{ ref('f_sessions_final')}} sessions 
on 
    sessions.learner_id = team.user_id  and sessions.scenario_id = team.scenario_id



