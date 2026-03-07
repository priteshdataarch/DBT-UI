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
ts.client_name,
ts.user_id,
ts.client_user_role_id, 
ts.project_id,
ts.scenario_id,
ts.project_name,
ts.scenario_name,
ts.session_id,
lc."session_learner_report.sessionid" as session_learner_id,
ts.session_type,
ts.status,
ts.start_date,
lc.
"session_learner_report.presimulationconfidence.questionid" as preconfidencequestionid,
lc."session_learner_report.presimulationconfidence.questiontext" as preconfidencequestion,
lc."session_learner_report.presimulationconfidence.answertext" as preconfidenceanswer,
lc."session_learner_report.presimulationconfidence.selectedanswernumber" as preconfidencescore,
lc.
"session_learner_report.postsimulationconfidence.questionid" as postconfidencequestionid,
lc."session_learner_report.postsimulationconfidence.questiontext" as postconfidencequestion,
lc."session_learner_report.postsimulationconfidence.answertext" as postconfidenceanswer,
lc."session_learner_report.postsimulationconfidence.selectedanswernumber" as postconfidencescore,
ROW_NUMBER() OVER (PARTITION BY ts.scenario_id,ts.client_user_role_id ORDER BY ts.start_date ASC) as Attempt
from {{ ref('f_team_sessions_final') }} ts
inner join {{ ref('d_learner_confidence') }} lc on ts.session_id=lc."session_learner_report.sessionid"