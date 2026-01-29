{{ config(
    materialized = 'table',
    enabled = false,
    format = 'parquet',
    write_compression = 'snappy',
    persist_docs = { "relation": true, "columns": true },
    meta = {
        "owner": "analytics",
        "pii": false
    }
) }}


with base as (
    select 
        ls.id as live_session_id,
        ls.start_date,
        ls.end_date,
        ls.scenario_id,
        ls.status,
        ls.billable,
        ls.sub_type,
        ls.session_date

    from 
        {{ ref('f_live_session') }} ls 
    left join
        {{ ref('m_session_learner')}} sl
    on 
        ls.id = sl.session_id
    left join
        {{ ref('m_client_user_role')}} cur 
    on 
        cur.id = sl.user_role_id 
    left join
        {{ ref('d_users')}} users 
    on 
        cur.user_id = users.id
    left join 
        {{ ref('d_secenario')}} scenario 
    on 
        ls.scenario_id = scenario.id
    left join
        {{ ref('m_scenario_team')}} scenario_team 
    on 
        scenario.id = scenario_team.scenario_id
    left join
        {{ ref('f_team')}} team 
    on 
        scenario_team.team_id = team.id
    left join
        {{ ref('d_client')}} client 
    on 
        scenario.client_id = client.id
)
select 
* from base 