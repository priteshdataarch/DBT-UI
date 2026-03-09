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

    -- this has issue with cdc capture from the source

    SELECT DISTINCT
        l.skill_id as skill_id,
        dm.domain_id as domain_id,
        l.skill_name as skill_name,
        bb.title as domain_name
    FROM 
        {{ ref('f_live_skills') }} AS l
    LEFT JOIN 
        {{ ref('f_skill_domain_mapping') }} AS dm ON l.skill_id = dm.skill_id
    LEFT JOIN 
        {{ ref('f_building_blocks') }} AS bb ON dm.domain_id = bb.id