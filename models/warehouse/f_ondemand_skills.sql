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


WITH
    ranked AS (
        SELECT 
            score.sessionid,
            ss.skill,
            ss.score AS skill_score,
            --ss.reasoning,
            score.score as SessionScore, 
            --score.reasoning as SessionScorereasoning,
            ROW_NUMBER() OVER (PARTITION BY score.sessionid ORDER BY ss.skill) AS rn
        FROM
            {{ ref('f_skill_score')}} ss
        left join
            {{ ref('f_session_score')}} score
        ON 
            ss.sessionscoreid = score.id
)

SELECT 
  *

FROM ranked
