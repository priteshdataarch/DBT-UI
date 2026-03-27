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

-- 1️⃣ Deduplicate: keep latest survey per session
with 
    base as (
        select 
            *,
            row_number() over (PARTITION BY trim("SIM_FEEDBACK.mursionSessionId") 
             ORDER BY  date_parse("SIM_FEEDBACK.recordedDate", '%Y-%m-%d') DESC, op DESC) as row_number
        from
             {{ source('application_db', 'raw_sim_feedback') }}
    ),

-- 2️⃣ Parse JSON array
    parsed AS (

        SELECT
            trim("SIM_FEEDBACK.mursionSessionId") AS mursionsessionid,
            "SIM_FEEDBACK.webportal"              AS webportal,
            "SIM_FEEDBACK.finished"               AS finished,
            CAST(
                date_parse(trim("SIM_FEEDBACK.recordedDate"), '%Y-%m-%d')
                AS date
            )                                     AS recordeddate,
            "SIM_FEEDBACK.generationType"         AS generationType,
            "SIM_FEEDBACK.score"                  AS score,
            "SIM_FEEDBACK.strengthassessmentid"   AS strengthAssessmentId,
            "SIM_FEEDBACK.opportunitiesassessmentid"
                                                AS opportunitiesAssessmentId,

            "SIM_FEEDBACK.event1skillid"           AS event1skillid,
            "SIM_FEEDBACK.event1skillname"         AS event1skillname,
            "SIM_FEEDBACK.event2skillid"           AS event2skillid,
            "SIM_FEEDBACK.event2skillname"         AS event2skillname,
            "SIM_FEEDBACK.event3skillid"           AS event3skillid,
            "SIM_FEEDBACK.event3skillname"         AS event3skillname,
            "SIM_FEEDBACK.event4skillid"           AS event4skillid,
            "SIM_FEEDBACK.event4skillname"         AS event4skillname,
            "SIM_FEEDBACK.event5skillid"           AS event5skillid,
            "SIM_FEEDBACK.event5skillname"         AS event5skillname,

            "SIM_FEEDBACK.selectedevent1mindsetid" AS selectedevent1mindsetid,
            "SIM_FEEDBACK.selectedevent2mindsetid" AS selectedevent2mindsetid,
            "SIM_FEEDBACK.selectedevent3mindsetid" AS selectedevent3mindsetid,
            "SIM_FEEDBACK.selectedevent4mindsetid" AS selectedevent4mindsetid,
            "SIM_FEEDBACK.selectedevent5mindsetid" AS selectedevent5mindsetid

            

        FROM 
            base
        where  
            row_number = 1
            AND length(trim("SIM_FEEDBACK.mursionSessionId")) > 0
    )
,
unpivoted as (
    select 
        mursionsessionid,
        webportal,
        finished,
        recordeddate,
        generationType,
        score,
        strengthAssessmentId,
        opportunitiesAssessmentId,
        1 as event_number,
        event1skillid as skill_id,
        TRIM(REGEXP_REPLACE(event1skillname, '</?p[^>]*>', '')) as skill_name,
        selectedevent1mindsetid as mindset_id
    from parsed
    where event1skillid is not null and trim(event1skillid) <> ''

    union all

    select 
        mursionsessionid,
        webportal,
        finished,
        recordeddate,
        generationType,
        score,
        strengthAssessmentId,
        opportunitiesAssessmentId,
        2 as event_number,
        event2skillid as skill_id,
        TRIM(REGEXP_REPLACE(event2skillname, '</?p[^>]*>', '')) as skill_name,
        selectedevent2mindsetid as mindset_id
    from parsed
    where event2skillid is not null and trim(event2skillid) <> ''

    union all

    select 
        mursionsessionid,
        webportal,
        finished,
        recordeddate,
        generationType,
        score,
        strengthAssessmentId,
        opportunitiesAssessmentId,
        3 as event_number,
        event3skillid as skill_id,
        TRIM(REGEXP_REPLACE(event3skillname, '</?p[^>]*>', '')) as skill_name,
        selectedevent3mindsetid as mindset_id
    from parsed
    where event3skillid is not null and trim(event3skillid) <> ''

    union all

    select 
        mursionsessionid,
        webportal,
        finished,
        recordeddate,
        generationType,
        score,
        strengthAssessmentId,
        opportunitiesAssessmentId,
        4 as event_number,
        event4skillid as skill_id,
        TRIM(REGEXP_REPLACE(event4skillname, '</?p[^>]*>', '')) as skill_name,
        selectedevent4mindsetid as mindset_id
    from parsed
    where event4skillid is not null and trim(event4skillid) <> ''

    union all

    select 
        mursionsessionid,
        webportal,
        finished,
        recordeddate,
        generationType,
        score,
        strengthAssessmentId,
        opportunitiesAssessmentId,
        5 as event_number,
        event5skillid as skill_id,
        TRIM(REGEXP_REPLACE(event5skillname, '</?p[^>]*>', '')) as skill_name,
        selectedevent5mindsetid as mindset_id
    from parsed
    where event5skillid is not null and trim(event5skillid) <> ''
)

select unpivoted.mursionSessionId,
unpivoted.webportal,
unpivoted.finished, 
unpivoted.recordeddate,
unpivoted.generationType, 
CASE 
    WHEN unpivoted.score >= 3 THEN 1
    WHEN unpivoted.score IS NULL THEN NULL
    ELSE 0
END AS score,
unpivoted.strengthAssessmentId, 
unpivoted.opportunitiesAssessmentId, 
event_number, 
unpivoted.skill_id as skill_id, 
unpivoted.skill_name as old_skill_name,
bb1.id as CompetencyID,
bb.title as skill_name,
bb.building_block_type,
bb.level,
dm.domain_id, 
unpivoted.mindset_id,
--msm.type as mindset_type,
bb1.title as mindset_score,
bb1.type as mindset_type, 
CASE
    WHEN bb1.title IS NULL
        THEN 1 --'1 - Novice'
    WHEN bb1.title NOT IN ('Strong', 'Competent', 'Emerging', 'Novice')
         AND bb1.type = 'Positive'
        THEN 3 --'3 - Competent'
    WHEN bb1.title NOT IN ('Strong', 'Competent', 'Emerging', 'Novice')
         AND bb1.type = 'Derailing'
        THEN 1 --'1 - Novice'
    WHEN bb1.title = 'Strong'
        THEN 4 --'4 - Strong'
    WHEN bb1.title = 'Competent'
        THEN 3 --'3 - Competent'
    WHEN bb1.title = 'Emerging'
        THEN 2 --'2 - Emerging'
    WHEN bb1.title = 'Novice'
        THEN 1 --'1 - Novice'
    ELSE 0 --bb1.title
END as skill_score 
from unpivoted 
left join 
    {{ ref('m_skill_score_mindset')}} msm
on 
    unpivoted.mindset_id = msm.mindset_id
LEFT JOIN 
        {{ ref('f_skill_domain_mapping') }} AS dm ON unpivoted.skill_id = dm.skill_id
LEFT JOIN 
        {{ ref('f_building_blocks') }} AS bb ON dm.domain_id = bb.id
left join 
        {{ ref('f_events_mindset') }} AS em ON em.id = unpivoted.mindset_id
left join 
        {{ ref('f_building_blocks') }} AS bb1 ON em.mindset_id = bb1.id
