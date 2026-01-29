

{{ config(
    materialized = 'view',
    
    format = 'parquet',
    write_compression = 'snappy',
    persist_docs = { "relation": true, "columns": true },
    meta = {
        "owner": "analytics",
        "pii": false
    }
) }}


select 
     users.user_id, 
    users.user_activation_date,
    users.user_department, 
    users.user_email, 
    users.user_first_name, 
    users.user_last_name, 
    users.user_location, 
    users.user_timezone_id, 
    users.user_title,
    users.user_lang, 
    users.user_onboarded,
    users.user_archive_date, 
    users.client_id,
    users.client_location,
    users.client_name,
    users.client_licensee_id, 
    users.client_timezone_id,
    users.client_archived, 
    users.client_operated_by,
    users.client_industry_id,
    users.client_industry_name,
    users.user_role, 
    users.user_role_id, 
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
