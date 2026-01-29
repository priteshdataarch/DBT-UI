

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
    users.id as user_id, 
    users.activation_date as user_activation_date,
    users.departament as user_department, 
    users.email as user_email, 
    users.first_name as user_first_name, 
    users.last_name as user_last_name, 
    users.location as user_location, 
    users.timezone_id as user_timezone_id, 
    users.title as user_title,
    users.lang as user_lang, 
    users.onboarded as user_onboarded,
    users.archive_date as user_archive_date, 
    client.id as client_id,
    client.location as client_location,
    client.name as client_name,
    client.licensee_id as client_licensee_id, 
    client.timezone_id as client_timezone_id,
    client.archived as client_archived, 
    client.operated_by as client_operated_by,
    client.industry_id as client_industry_id,
    industry.name as client_industry_name,
    client_user_role.role as user_role, 
    client_user_role.id as user_role_id
from 
    {{ ref('d_users')}} users 
left join
    {{ ref('m_user_client')}} client_user 
on 
    client_user.id = users.id
left join
    {{ ref('d_client')}} client 
on 
    client_user.client_id = client.id
left join
    {{ ref('d_industry')}} industry 
on 
    client.industry_id = industry.id
left join 
    {{ ref('m_client_user_role')}} client_user_role 
on 
    client_user_role.user_id = users.id
where 
    client_user_role.role = 'learner'