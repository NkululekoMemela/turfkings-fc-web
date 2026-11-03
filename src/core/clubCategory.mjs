export function clubCategory(club){if(club?.clubType!=='company')return 'community';return club.companyStatus==='active'&&typeof club.companyId==='string'&&club.companyId?'company':'unavailable';}
export function clubsInCategory(clubs,category){return (Array.isArray(clubs)?clubs:[]).filter(c=>c&&clubCategory(c)===category);}
