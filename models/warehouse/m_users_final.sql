
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
    coalesce(scenario.scenario_custom_name,scenario.scenario_name) as scenario_name,
    project.id as project_id,
    project.name as project_name,
    
    
    --st.scenario_id,
    scenario_team.team_id as scenario_team_id
    
    --s.name as scenario_name
from 
    {{ ref('d_users') }} users
left join 
    {{ ref('m_user_client') }} client_user on users.id = client_user.user_id
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
left join
    {{ ref('d_secenario') }} scenario on scenario_team.scenario_id = scenario.id
left join
    {{ ref('d_project') }} project on scenario.project_id = project.id
group by 1,2,3,4,5,6,7,8,9,10,11,12,13,14
)