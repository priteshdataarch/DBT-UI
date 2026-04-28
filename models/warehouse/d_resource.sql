{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet'
) }}

select
    *
from {{ source('application_db', 'raw_resource') }}
