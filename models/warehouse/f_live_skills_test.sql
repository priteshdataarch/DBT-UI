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
    where event1skillid is not null

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
    where event2skillid is not null

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
    where event3skillid is not null

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
    where event4skillid is not null

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
    where event5skillid is not null
)

select unpivoted.mursionSessionId,
unpivoted.webportal,
unpivoted.finished, 
unpivoted.recordeddate,
unpivoted.generationType, 
unpivoted.score, 
unpivoted.strengthAssessmentId, 
unpivoted.opportunitiesAssessmentId, 
event_number, 
skill_id, 
skill_name, 
unpivoted.mindset_id,
msm.type as mindset_type
from unpivoted 
left join 
    {{ ref('m_skill_score_mindset')}} msm
on 
    unpivoted.mindset_id = msm.mindset_id
