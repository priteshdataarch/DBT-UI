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
lc.session_id as confidence_session_id,
ts.session_type,
ts.status,
ts.start_date,
lc.pre_conf_question_id as preconfidencequestionid,
lc.pre_conf_question_text as preconfidencequestion,
lc.pre_conf_answer_text as preconfidenceanswer,
lc.pre_conf_selected_answer_number as preconfidencescore,
lc.post_conf_question_id as postconfidencequestionid,
lc.post_conf_question_text as postconfidencequestion,
lc.post_conf_answer_text as postconfidenceanswer,
lc.post_conf_selected_answer_number as postconfidencescore,
ROW_NUMBER() OVER (PARTITION BY ts.scenario_id,ts.client_user_role_id ORDER BY ts.start_date ASC) as Attempt
from {{ ref('f_team_sessions_final') }} ts
inner join {{ ref('d_learner_confidence') }} lc on ts.session_id=lc.session_id