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

-- CTE 1: Base user-client-role relationship
with user_client_role as (
    select
        users.id as user_id, 
        users.activation_date as user_activation_date,   
        client.id as client_id,
        client.name as client_name,
        client.archived as client_archived, 
        client.operated_by as client_operated_by,
        client_user_role.id as client_user_role_id,
        client_user_role.role as user_role
    from 
        {{ ref('d_users') }} users
    left join 
        {{ ref('m_user_client') }} user_client on users.id = user_client.id
    left join 
        {{ ref('d_client') }} client on client.id = user_client.client_id
    left join 
        {{ ref('m_client_user_role') }} client_user_role on client_user_role.user_id = users.id
),

-- CTE 2: User to team mapping (keep all users)
user_teams as (
    select distinct
        ucr.user_id,
        team_member.team_id,
        team.name as team_name
    from 
        user_client_role ucr
    left join
        {{ ref('m_team_member') }} team_member on ucr.client_user_role_id = team_member.user_role_id
    left join
        {{ ref('d_team') }} team on team.id = team_member.team_id
),

-- CTE 3: User/team to scenario mapping (keep users even if no scenario)
current_user_team_scenarios as (
    select distinct
        ut.user_id,
        ut.team_id,
        ut.team_name,
        scenario_team.scenario_id
    from 
        user_teams ut
    left join
        {{ ref('m_scenario_team') }} scenario_team on ut.team_id = scenario_team.team_id
),

-- CTE 4: Historical user-scenario pairs from sessions
historical_user_scenarios as (
    select distinct
        sessions.learner_id as user_id,
        sessions.scenario_id
    from 
        {{ ref('f_sessions_final') }} sessions
    where 
        sessions.learner_id is not null
        and sessions.scenario_id is not null
),

-- CTE 5: All user/team/scenario combinations (current + historical)
all_user_team_scenarios as (
    -- Current mapping
    select distinct
        cuts.user_id,
        cuts.team_id,
        cuts.team_name,
        cuts.scenario_id
    from 
        current_user_team_scenarios cuts

    union distinct

    -- Historical scenarios missing in current mapping
    select distinct
        hus.user_id,
        null as team_id,
        null as team_name,
        hus.scenario_id
    from 
        historical_user_scenarios hus
    left join
        current_user_team_scenarios cuts
        on hus.user_id = cuts.user_id
        and hus.scenario_id = cuts.scenario_id
    where
        cuts.user_id is null
),

base as (
select 
    coalesce(scenario_client.id, ucr.client_id) as client_id,
    aus.user_id,
    ucr.user_activation_date,
    coalesce(scenario_client.name, ucr.client_name) as client_name,
    coalesce(scenario_client.archived, ucr.client_archived) as client_archived, 
    coalesce(scenario_client.operated_by, ucr.client_operated_by) as client_operated_by,
    ucr.user_role,
    ucr.client_user_role_id,
    aus.team_id, 
    aus.team_name,
    aus.scenario_id,
    scenario.name as scenario_name,
    scenario.project_id as project_id,
    project.name as project_name,

    --aus.scenario_team_id,
    sessions.id as session_id,
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
    sessions.session_type
      --  scenario.project_id as scenario_project_id,
      --  scenario.client_id as scenario_client_id
from 
    all_user_team_scenarios aus
left join
    user_client_role ucr on aus.user_id = ucr.user_id
left join
    {{ ref('d_secenario') }} scenario on aus.scenario_id = scenario.id
left join 
    {{ ref('d_client') }} scenario_client on scenario.client_id = scenario_client.id  
left join 
    {{ ref('d_project') }} project on scenario.project_id = project.id
left join
    {{ ref('f_sessions_final') }} sessions 
    on sessions.learner_id = aus.user_id  
    and sessions.scenario_id = aus.scenario_id
where scenario_client.licensee_id = 'mursion'
)

select *
from base

union all

select 
    'd2f80bc4-6d31-4634-b4a3-338348ebf1dc' as client_id, 
    user_id,
    user_activation_date,
    client_name,
    client_archived,
    client_operated_by,
    user_role,
    client_user_role_id,
    team_id,
    team_name,
    scenario_id,
    scenario_name,
    project_id,
    project_name,
    session_id,
    status,
    actual_start_date,
    actual_end_date,
    start_date,
    end_date,
    billable,
    sub_type,
    late_canceled,
    final_session_sub_status,
    session_date,
    session_type
from base
where base.client_id = '55d98b8a-a265-4be5-aa95-e32eeeb4e5d9'


union all


select 
    '7d3c6a30-b724-4165-b40c-6301fd92f985' as client_id, 
    user_id,
    user_activation_date,
    client_name,
    client_archived,
    client_operated_by,
    user_role,
    client_user_role_id,
    team_id,
    team_name,
    scenario_id,
    scenario_name,
    project_id,
    project_name,
    session_id,
    status,
    actual_start_date,
    actual_end_date,
    start_date,
    end_date,
    billable,
    sub_type,
    late_canceled,
    final_session_sub_status,
    session_date,
    session_type
from base
where base.client_id = '55d98b8a-a265-4be5-aa95-e32eeeb4e5d9'