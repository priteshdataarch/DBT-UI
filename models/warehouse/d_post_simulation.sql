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


-- Step 1: Deduplicate (Latest record per session)
with raw_tbl as (

    select *
    from {{ source('application_db', 'raw_post_simulation') }}

),

latest_record as (

    select *
    from (
        select
            row_number() over (
                partition by trim("POST_SIMULATION.mursionSessionId")
                order by date_parse(trim("POST_SIMULATION.recordedDate"), '%Y-%m-%d') desc
            ) as row_num,
            *
        from raw_tbl
    )
    where row_num = 1
      and length(trim("POST_SIMULATION.mursionSessionId")) > 0

),

-- Step 2: Parse JSON array (Athena syntax)
parsed_json as (

    select
        *,
        cast(
            json_parse("array_POST_SIMULATION.questions")
            as array(
                row(
                    questionId varchar,
                    questionText varchar,
                    answerText varchar,
                    selectedAnswerNumber varchar
                )
            )
        ) as questions_array
    from latest_record

),

-- Step 3: Explode questions
exploded as (

    select
        trim("POST_SIMULATION.mursionSessionId") as mursionsessionid,
        trim("POST_SIMULATION.userid") as userid,
        "POST_SIMULATION.webportal" as webportal,
        "POST_SIMULATION.finished" as finished,
        date_parse(trim("POST_SIMULATION.recordedDate"), '%Y-%m-%d') as recordeddate,
        q.questionId,
        regexp_replace(
            trim(q.questionText),
            '(<[^>]*>)|(&nbsp;)|(&rsquo;)|(&rdquo;)|(&ldquo;)|(&lsquo;)|(&ndash;)|(&hellip;)',
            ''
        ) as questionText,
        regexp_replace(
            trim(q.answerText),
            '(<[^>]*>)|(&nbsp;)|(&rsquo;)|(&rdquo;)|(&ldquo;)|(&lsquo;)|(&ndash;)|(&hellip;)',
            ''
        ) as answerText,
        trim(q.selectedAnswerNumber) as selectedAnswerNumber
    from parsed_json
    cross join unnest(questions_array) as t(q)
    where q.questionId in (
        'Q1','Q2','Q3_1','Q3_2','Q3_3','Q3_4','Q3_5',
        'Q4','Q5','Q6','Q7','Q8','Q9',
        'Q13','Q14','Q26','Q62',
        'Q17','Q18','Q19','Q20','Q21','Q22','Q23','Q24'
    )

),

-- Step 4: Pivot (Athena style using conditional aggregation)
pivoted as (

    select
        mursionsessionid,
        userid,
        webportal,
        finished,
        recordeddate,

        -- Q1
        max(case when questionId = 'Q1' then questionText end) as Q1_questionText,
        max(case when questionId = 'Q1' then answerText end) as Q1_answerText,
        max(case when questionId = 'Q1' then selectedAnswerNumber end) as Q1_selectedAnswerNumber,

        -- Q2
        max(case when questionId = 'Q2' then questionText end) as Q2_questionText,
        max(case when questionId = 'Q2' then answerText end) as Q2_answerText,
        max(case when questionId = 'Q2' then selectedAnswerNumber end) as Q2_selectedAnswerNumber,

        -- Q3_1
        max(case when questionId = 'Q3_1' then questionText end) as Q3_1_questionText,
        max(case when questionId = 'Q3_1' then answerText end) as Q3_1_answerText,
        max(case when questionId = 'Q3_1' then selectedAnswerNumber end) as Q3_1_selectedAnswerNumber,

        -- Q3_2
        max(case when questionId = 'Q3_2' then questionText end) as Q3_2_questionText,
        max(case when questionId = 'Q3_2' then answerText end) as Q3_2_answerText,
        max(case when questionId = 'Q3_2' then selectedAnswerNumber end) as Q3_2_selectedAnswerNumber,

        
         -- Q3_3
        max(case when questionId = 'Q3_3' then questionText end) as Q3_3_questionText,
        max(case when questionId = 'Q3_3' then answerText end) as Q3_3_answerText,
        max(case when questionId = 'Q3_3' then selectedAnswerNumber end) as Q3_3_selectedAnswerNumber,

         -- Q3_4
        max(case when questionId = 'Q3_4' then questionText end) as Q3_4_questionText,
        max(case when questionId = 'Q3_4' then answerText end) as Q3_4_answerText,
        max(case when questionId = 'Q3_4' then selectedAnswerNumber end) as Q3_4_selectedAnswerNumber,  

         -- Q3_5
        max(case when questionId = 'Q3_5' then questionText end) as Q3_5_questionText,
        max(case when questionId = 'Q3_5' then answerText end) as Q3_5_answerText,
        max(case when questionId = 'Q3_5' then selectedAnswerNumber end) as Q3_5_selectedAnswerNumber,
        
         -- Q4
        max(case when questionId = 'Q4' then questionText end) as Q4_questionText,
        max(case when questionId = 'Q4' then answerText end) as Q4_answerText,
        max(case when questionId = 'Q4' then selectedAnswerNumber end) as Q4_selectedAnswerNumber,
        
         -- Q5
        max(case when questionId = 'Q5' then questionText end) as Q5_questionText,
        max(case when questionId = 'Q5' then answerText end) as Q5_answerText,
        max(case when questionId = 'Q5' then selectedAnswerNumber end) as Q5_selectedAnswerNumber,
        
         -- Q6
        max(case when questionId = 'Q6' then questionText end) as Q6_questionText,
        max(case when questionId = 'Q6' then answerText end) as Q6_answerText,
        max(case when questionId = 'Q6' then selectedAnswerNumber end) as Q6_selectedAnswerNumber, 
        
         -- Q7
        max(case when questionId = 'Q7' then questionText end) as Q7_questionText,
        max(case when questionId = 'Q7' then answerText end) as Q7_answerText,
        max(case when questionId = 'Q7' then selectedAnswerNumber end) as Q7_selectedAnswerNumber, 
        
         -- Q8
        max(case when questionId = 'Q8' then questionText end) as Q8_questionText,
        max(case when questionId = 'Q8' then answerText end) as Q8_answerText,
        max(case when questionId = 'Q8' then selectedAnswerNumber end) as Q8_selectedAnswerNumber,
        
         -- Q9
        max(case when questionId = 'Q9' then questionText end) as Q9_questionText,
        max(case when questionId = 'Q9' then answerText end) as Q9_answerText,
        max(case when questionId = 'Q9' then selectedAnswerNumber end) as Q9_selectedAnswerNumber,
        
         -- Q13
        max(case when questionId = 'Q13' then questionText end) as Q13_questionText,
        max(case when questionId = 'Q13' then answerText end) as Q13_answerText,
        max(case when questionId = 'Q13' then selectedAnswerNumber end) as Q13_selectedAnswerNumber,
        
         -- Q14
        max(case when questionId = 'Q14' then questionText end) as Q14_questionText,
        max(case when questionId = 'Q14' then answerText end) as Q14_answerText,
        max(case when questionId = 'Q14' then selectedAnswerNumber end) as Q14_selectedAnswerNumber,
        
         -- Q17
        max(case when questionId = 'Q17' then questionText end) as Q17_questionText,
        max(case when questionId = 'Q17' then answerText end) as Q17_answerText,
        max(case when questionId = 'Q17' then selectedAnswerNumber end) as Q17_selectedAnswerNumber,
        
         -- Q18
        max(case when questionId = 'Q18' then questionText end) as Q18_questionText,
        max(case when questionId = 'Q18' then answerText end) as Q18_answerText,
        max(case when questionId = 'Q18' then selectedAnswerNumber end) as Q18_selectedAnswerNumber,
        
         -- Q19
        max(case when questionId = 'Q19' then questionText end) as Q19_questionText,
        max(case when questionId = 'Q19' then answerText end) as Q19_answerText,
        max(case when questionId = 'Q19' then selectedAnswerNumber end) as Q19_selectedAnswerNumber,
        
        -- Q20
        max(case when questionId = 'Q20' then questionText end) as Q20_questionText,
        max(case when questionId = 'Q20' then answerText end) as Q20_answerText,
        max(case when questionId = 'Q20' then selectedAnswerNumber end) as Q20_selectedAnswerNumber,
        
        -- Q21
        max(case when questionId = 'Q21' then questionText end) as Q21_questionText,
        max(case when questionId = 'Q21' then answerText end) as Q21_answerText,
        max(case when questionId = 'Q21' then selectedAnswerNumber end) as Q21_selectedAnswerNumber,

        -- Q22
        max(case when questionId = 'Q22' then questionText end) as Q22_questionText,
        max(case when questionId = 'Q22' then answerText end) as Q22_answerText,
        max(case when questionId = 'Q22' then selectedAnswerNumber end) as Q22_selectedAnswerNumber,

        -- Q23
        max(case when questionId = 'Q23' then questionText end) as Q23_questionText,
        max(case when questionId = 'Q23' then answerText end) as Q23_answerText,
        max(case when questionId = 'Q23' then selectedAnswerNumber end) as Q23_selectedAnswerNumber,

        -- Q24
        max(case when questionId = 'Q24' then questionText end) as Q24_questionText,
        max(case when questionId = 'Q24' then answerText end) as Q24_answerText,
        max(case when questionId = 'Q24' then selectedAnswerNumber end) as Q24_selectedAnswerNumber,
        
         -- Q62
        max(case when questionId = 'Q62' then questionText end) as Q62_questionText,
        max(case when questionId = 'Q62' then answerText end) as Q62_answerText,
        max(case when questionId = 'Q62' then selectedAnswerNumber end) as Q62_selectedAnswerNumber,
        
         -- Q26
        max(case when questionId = 'Q26' then questionText end) as Q26_questionText,
        max(case when questionId = 'Q26' then answerText end) as Q26_answerText,
        max(case when questionId = 'Q26' then selectedAnswerNumber end) as Q26_selectedAnswerNumber


    from exploded
    group by
        mursionsessionid,
        userid,
        webportal,
        finished,
        recordeddate

)

select * from pivoted
