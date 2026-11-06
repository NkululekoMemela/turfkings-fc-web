export const visibleFieldMatchEvents = (events = []) => events.filter(event => !['defensive_block', 'clean_sheet'].includes(String(event?.type || '').toLowerCase()));
