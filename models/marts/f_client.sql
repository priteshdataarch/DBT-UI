{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet'
) }}

select
    -- TODO: add your columns
    *
from {{ source('source_name', 'table_name') }}
