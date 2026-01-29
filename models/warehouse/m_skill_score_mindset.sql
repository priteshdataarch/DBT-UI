
{{ config(
    materialized = 'view',
   
   
) }}


select 
    events_mindset.id as events_mindset_id, events_mindset.mindset_id, building_blocks.type
from 
    {{ ref('d_events_mindset')}} events_mindset
inner join
    {{ ref('d_building_blocks')}} building_blocks
on
    events_mindset.mindset_id = building_blocks.id
