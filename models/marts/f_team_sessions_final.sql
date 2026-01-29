

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

with team as (
select 
    
    users.client_id,
    users.user_id,
    users.user_activation_date,
    --users.client_location,
    users.client_name,
   -- users.client_licensee_id, 
   -- users.client_timezone_id,
    users.client_archived, 
    users.client_operated_by,
  --  users.client_industry_id,
  --  users.client_industry_name,
    users.user_role, 
    --users.user_role_id, 
    team_member.team_id, 
    team.name as team_name
from 
    {{ ref('d_users_final')}} users 

left join
    {{ ref('m_team_member')}} team_member 
on 
    team_member.user_role_id = users.user_role_id
left join
    {{ ref('d_team')}} team 
on 
    team_member.team_id = team.id
group by 1,2,3,4,5,6,7,8,9
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
  --  team.client_industry_name,
    team.user_role, 
    --team.user_role_id, 
    team.team_id, 
    team.team_name,
    sessions.id as session_id,
    sessions.scenario_id, 
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
    coalesce(sessions.scenario_custom_name,sessions.scenario_name) as scenario_name, 
    --sessions.scenario_custom_name,
    sessions.scenario_project_id,
    sessions.scenario_client_id,
    sessions.project_name
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
    sessions.learner_id = team.user_id 


-- select 
--     sessions.id as session_id,
--     sessions.scenario_id, 
--     sessions.status, 
--     sessions.actual_start_date, 
--     sessions.actual_end_date, 
--     sessions.start_date,
--     sessions.end_date,
--     sessions.billable, 
--     sessions.sub_type, 
--     sessions.session_date,
--     users.user_id as learner_id,
--     sessions.session_type,
--     sessions.scenario_name,
--     sessions.scenario_custom_name,
--     sessions.scenario_project_id,
--     sessions.scenario_client_id,
--     sessions.project_name,
--     sessions.client_name,
--     team_detail.name as team_name,
--     users.user_activation_date
-- from 
    
--     {{ ref('f_sessions_final')}} sessions 
-- left join 
--     {{ ref('m_scenario_team')}} team 
-- on 
--     sessions.scenario_id = team.scenario_id
-- left join 
--     {{ ref('d_team')}} team_detail 
-- on 
--     team.team_id = team_detail.id
-- right join 
--     {{ ref('d_users_final')}} users 
-- on 
--     sessions.learner_id = users.user_id
