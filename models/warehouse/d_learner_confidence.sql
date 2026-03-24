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



with base as (
select 
    op,

    _id as id,

    "session_learner_report.sessionid" as session_id,

    "session_learner_report.simfeedback.questionid" as simfeedback_question_id,
    "session_learner_report.simfeedback.questiontext" as simfeedback_question_text,
    "session_learner_report.simfeedback.answertext" as simfeedback_answer_text,
    "session_learner_report.simfeedback.selectedanswernumber" as simfeedback_selected_answer_number,

    "array_session_learner_report.strategies" as strategies,

    "session_learner_report.presimulationconfidence" as pre_simulation_confidence,

    "session_learner_report.presimulationconfidence.questionid" as pre_conf_question_id,
    "session_learner_report.presimulationconfidence.questiontext" as pre_conf_question_text,
    "session_learner_report.presimulationconfidence.answertext" as pre_conf_answer_text,
    "session_learner_report.presimulationconfidence.selectedanswernumber" as pre_conf_selected_answer_number,

    "session_learner_report.postsimulationconfidence.questionid" as post_conf_question_id,
    "session_learner_report.postsimulationconfidence.questiontext" as post_conf_question_text,
    "session_learner_report.postsimulationconfidence.answertext" as post_conf_answer_text,
    "session_learner_report.postsimulationconfidence.selectedanswernumber" as post_conf_selected_answer_number,

    oid__id as oid_id,
    row_number() over (partition by "session_learner_report.sessionid" order by op desc) as row_number

from {{ source('application_db', 'raw_session_learner_report') }}
)

select *
from base
where row_number = 1