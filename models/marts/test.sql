{{ config(
    materialized = 'table'
) }}

with
d_users as (
    select * from {{ ref('d_users') }}
)

select
    *
from d_users